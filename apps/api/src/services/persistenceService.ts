import type {
  DiseaseDiagnosis,
  PatrolRecord,
  Prisma,
  PrismaClient,
  Product as PrismaProduct,
  ProductTrace
} from "@prisma/client";
import type { DiagnosisRecord, GreenhouseSummary, PatrolReport, Product, RiskLevel, VideoDiagnosisRecord, VideoKeyFrame, YoloDetection } from "@agri/shared";
import { getComprehensiveStatus } from "./sensorSimulator.js";
import { signMediaUrl } from "./mediaAuth.js";

export interface CreateProductInput {
  name: string;
  category: string;
  origin: string;
  harvestTime?: string;
  cultivationMethod?: string;
  traceabilityInfo?: string;
}

export interface CreatePatrolInput {
  id: string;
  plotName: string;
  cropName: string;
  imageUrl?: string;
  growthStatus: string;
  anomalies: string[];
  environmentRisk: string;
  suggestion: string;
  conclusion: string;
  createdAt: string;
}

type ProductWithTraces = PrismaProduct & { traces: ProductTrace[] };

const optionalText = (value: string | null | undefined) => value ?? undefined;

const toRiskLevel = (value: string): RiskLevel => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
};

const toStringArray = (value: Prisma.JsonValue | null): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
};

const toDetections = (value: Prisma.JsonValue | null): YoloDetection[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value as unknown as YoloDetection[];
};

const toKeyFrames = (value: Prisma.JsonValue | null): VideoKeyFrame[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  // 帧图 URL 同样签发短期签名
  return (value as unknown as VideoKeyFrame[]).map((frame) => ({
    ...frame,
    imageUrl: signMediaUrl(frame.imageUrl)
  }));
};

const mapDiagnosis = (
  record: DiseaseDiagnosis,
): DiagnosisRecord & Partial<VideoDiagnosisRecord> => ({
  id: record.id,
  cropType: record.cropType,
  symptomDescription: optionalText(record.symptomDescription),
  imageUrl: signMediaUrl(record.imageUrl),
  annotatedImageUrl: signMediaUrl(record.annotatedImageUrl),
  suspectedDisease: record.suspectedDisease,
  confidence: record.confidence,
  riskLevel: toRiskLevel(record.riskLevel),
  analysis: record.analysis,
  suggestion: record.suggestion,
  modelName: optionalText(record.modelName),
  detections: toDetections(record.detections),
  ragReferences: toStringArray(record.ragReferences),
  visionError: optionalText(record.visionError),
  sourceType: record.sourceType === "video" ? "video" : undefined,
  videoUrl: signMediaUrl(record.videoUrl),
  framesAnalyzed: record.framesAnalyzed ?? undefined,
  frameCount: record.frameCount ?? undefined,
  keyFrames: toKeyFrames(record.keyFrames),
  createdAt: record.createdAt.toISOString()
});

const mapPatrol = (record: PatrolRecord): PatrolReport => ({
  id: record.id,
  plotName: record.plotName,
  cropName: record.cropName,
  imageUrl: signMediaUrl(record.imageUrl),
  growthStatus: record.growthStatus,
  anomalies: toStringArray(record.anomalies) ?? [],
  environmentRisk: record.environmentRisk,
  suggestion: record.suggestion,
  conclusion: record.conclusion,
  createdAt: record.createdAt.toISOString()
});

const mapProduct = (record: ProductWithTraces): Product => ({
  id: record.id,
  name: record.name,
  category: record.category,
  imageUrl: signMediaUrl(record.imageUrl),
  origin: record.origin,
  harvestTime: record.harvestTime?.toISOString(),
  cultivationMethod: optionalText(record.cultivationMethod),
  traceabilityInfo: record.traces.map((trace) => trace.content).join("\n") || undefined,
  description: optionalText(record.description),
  avatarScript: optionalText(record.avatarScript),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString()
});

export class PersistenceService {
  constructor(private readonly prisma: PrismaClient) {}

  private async findCrop(name: string, greenhouseId?: string) {
    return this.prisma.crop.findFirst({
      where: {
        name,
        ...(greenhouseId ? { greenhouseId } : {})
      },
      orderBy: { createdAt: "asc" }
    });
  }

  private async findProductCrop(name: string, category: string) {
    const crops = await this.prisma.crop.findMany({ orderBy: { createdAt: "asc" } });
    return crops.find((crop) => name.includes(crop.name) || category.includes(crop.name));
  }

  async saveDiagnosis(
    record: DiagnosisRecord & Partial<VideoDiagnosisRecord>,
    userId: string,
  ): Promise<DiagnosisRecord> {
    const crop = await this.findCrop(record.cropType);
    const saved = await this.prisma.diseaseDiagnosis.create({
      data: {
        id: record.id,
        userId,
        cropId: crop?.id,
        cropType: record.cropType,
        imageUrl: record.imageUrl,
        annotatedImageUrl: record.annotatedImageUrl,
        symptomDescription: record.symptomDescription,
        suspectedDisease: record.suspectedDisease,
        confidence: record.confidence,
        riskLevel: record.riskLevel,
        analysis: record.analysis,
        suggestion: record.suggestion,
        modelName: record.modelName,
        detections: record.detections as unknown as Prisma.InputJsonValue | undefined,
        ragReferences: record.ragReferences as Prisma.InputJsonValue | undefined,
        visionError: record.visionError,
        sourceType: record.sourceType,
        videoUrl: record.videoUrl,
        framesAnalyzed: record.framesAnalyzed,
        frameCount: record.frameCount,
        keyFrames: record.keyFrames as unknown as Prisma.InputJsonValue | undefined,
        reviewRequired: Boolean(record.visionError) || record.confidence < 0.5,
        createdAt: new Date(record.createdAt)
      }
    });
    return mapDiagnosis(saved);
  }

  async listDiagnoses(userId: string, isAdmin: boolean): Promise<DiagnosisRecord[]> {
    const records = await this.prisma.diseaseDiagnosis.findMany({
      where: isAdmin ? undefined : { userId },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return records.map(mapDiagnosis);
  }

  async createPatrol(input: CreatePatrolInput, userId: string): Promise<PatrolReport> {
    const namedGreenhouse = await this.prisma.greenhouse.findFirst({
      where: { name: input.plotName },
      orderBy: { createdAt: "asc" }
    });
    const cropGreenhouse = namedGreenhouse ? undefined : await this.prisma.greenhouse.findFirst({
      where: { crops: { some: { name: input.cropName } } },
      orderBy: { createdAt: "asc" }
    });
    const greenhouse = namedGreenhouse ?? cropGreenhouse ?? await this.prisma.greenhouse.findFirst({
      orderBy: { createdAt: "asc" }
    });
    if (!greenhouse) {
      throw new Error("数据库中没有地块，请先运行 npm run db:seed 初始化种子数据。");
    }
    const crop = await this.findCrop(input.cropName, greenhouse.id);
    const saved = await this.prisma.patrolRecord.create({
      data: {
        id: input.id,
        userId,
        greenhouseId: greenhouse.id,
        cropId: crop?.id,
        plotName: input.plotName,
        cropName: input.cropName,
        imageUrl: input.imageUrl,
        growthStatus: input.growthStatus,
        anomalies: input.anomalies,
        environmentRisk: input.environmentRisk,
        suggestion: input.suggestion,
        conclusion: input.conclusion,
        createdAt: new Date(input.createdAt)
      }
    });
    return mapPatrol(saved);
  }

  async listPatrols(userId: string, isAdmin: boolean): Promise<PatrolReport[]> {
    const records = await this.prisma.patrolRecord.findMany({
      where: isAdmin ? undefined : { userId },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return records.map(mapPatrol);
  }

  async createProduct(input: CreateProductInput, ownerId: string): Promise<Product> {
    const crop = await this.findProductCrop(input.name, input.category);
    const harvestTime = input.harvestTime ? new Date(input.harvestTime) : undefined;
    if (harvestTime && Number.isNaN(harvestTime.getTime())) {
      throw new Error("采收时间格式无效，请重新填写。");
    }
    const description = `这款${input.name}来自${input.origin}，采用${input.cultivationMethod ?? "标准化"}种植管理，适合作为高品质农产品进行展示和销售。`;
    const avatarScript = `大家好，我是AI数字农业管家。现在为你介绍${input.name}，它来自${input.origin}，品质稳定，溯源信息清晰。`;
    const saved = await this.prisma.product.create({
      data: {
        ownerId,
        cropId: crop?.id,
        name: input.name,
        category: input.category,
        origin: input.origin,
        harvestTime,
        cultivationMethod: input.cultivationMethod,
        description,
        avatarScript,
        status: "active",
        traces: input.traceabilityInfo ? {
          create: {
            traceType: "manual",
            title: "溯源信息",
            content: input.traceabilityInfo,
            occurredAt: harvestTime ?? new Date()
          }
        } : undefined
      },
      include: { traces: { orderBy: { occurredAt: "asc" } } }
    });
    return mapProduct(saved);
  }

  async listProducts(ownerId: string, isAdmin: boolean): Promise<Product[]> {
    const records = await this.prisma.product.findMany({
      where: isAdmin ? undefined : { ownerId },
      include: { traces: { orderBy: { occurredAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return records.map(mapProduct);
  }

  async deleteProducts(ids: string[], ownerId: string, isAdmin: boolean): Promise<number> {
    const productWhere = {
      id: { in: ids },
      ...(isAdmin ? {} : { ownerId })
    };
    // 先删除关联的溯源记录，避免外键约束冲突
    await this.prisma.productTrace.deleteMany({
      where: {
        productId: { in: ids },
        ...(isAdmin ? {} : { product: { ownerId } })
      }
    });
    const result = await this.prisma.product.deleteMany({ where: productWhere });
    return result.count;
  }

  async listGreenhouses(): Promise<GreenhouseSummary[]> {
    const rows = await this.prisma.greenhouse.findMany({
      where: { id: { not: { startsWith: "simulation-" } } },
      select: { id: true, name: true, location: true, area: true },
      orderBy: { createdAt: "asc" }
    });
    return rows.map((greenhouse) => ({
      id: greenhouse.id,
      name: greenhouse.name,
      location: greenhouse.location ?? undefined,
      area: greenhouse.area ?? undefined,
      status: getComprehensiveStatus(greenhouse.id)
    }));
  }

  async createGreenhouse(
    input: { name: string; location?: string; area?: number },
    ownerId: string
  ): Promise<GreenhouseSummary> {
    const created = await this.prisma.greenhouse.create({
      data: {
        name: input.name,
        location: input.location ?? null,
        area: input.area ?? null,
        ownerId
      }
    });
    return {
      id: created.id,
      name: created.name,
      location: created.location ?? undefined,
      area: created.area ?? undefined,
      status: getComprehensiveStatus(created.id)
    };
  }

  async deleteGreenhouse(id: string): Promise<boolean> {
    try {
      await this.prisma.$transaction([
        this.prisma.deviceCommand.deleteMany({
          where: { device: { greenhouseId: id } }
        }),
        this.prisma.device.deleteMany({ where: { greenhouseId: id } }),
        this.prisma.sensorData.deleteMany({ where: { greenhouseId: id } }),
        this.prisma.sensor.deleteMany({ where: { greenhouseId: id } }),
        this.prisma.crop.deleteMany({ where: { greenhouseId: id } }),
        this.prisma.warning.deleteMany({ where: { greenhouseId: id } }),
        this.prisma.patrolRecord.deleteMany({ where: { greenhouseId: id } }),
        this.prisma.greenhouse.delete({ where: { id } })
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
