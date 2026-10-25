import { PrismaClient } from "@prisma/client";
import { PersistenceService } from "../dist/services/persistenceService.js";

const prisma = new PrismaClient();
const rollbackMarker = new Error("PERSISTENCE_TEST_ROLLBACK");

async function counts() {
  const [diagnoses, patrols, products] = await prisma.$transaction([
    prisma.diseaseDiagnosis.count(),
    prisma.patrolRecord.count(),
    prisma.product.count()
  ]);
  return { diagnoses, patrols, products };
}

async function main() {
  const before = await counts();
  const user = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    await prisma.$transaction(async (transaction) => {
      const service = new PersistenceService(transaction);
      const diagnosis = await service.saveDiagnosis({
        id: `test_diag_${suffix}`,
        cropType: "番茄",
        symptomDescription: "持久化测试",
        suspectedDisease: "测试病害",
        confidence: 0.86,
        riskLevel: "medium",
        analysis: "测试分析",
        suggestion: "测试建议",
        modelName: "test-model",
        detections: [],
        ragReferences: ["测试知识"],
        createdAt: new Date().toISOString()
      }, user.id);
      const patrol = await service.createPatrol({
        id: `test_patrol_${suffix}`,
        plotName: "1号番茄智慧大棚",
        cropName: "番茄",
        growthStatus: "测试长势",
        anomalies: ["测试异常"],
        environmentRisk: "测试风险",
        suggestion: "测试建议",
        conclusion: "测试结论",
        createdAt: new Date().toISOString()
      }, user.id);
      const product = await service.createProduct({
        name: `测试产品_${suffix}`,
        category: "番茄",
        origin: "测试基地",
        harvestTime: "2026-09-15",
        cultivationMethod: "测试种植",
        traceabilityInfo: "测试溯源"
      }, user.id);

      const [diagnoses, patrols, products] = await Promise.all([
        service.listDiagnoses(user.id, true),
        service.listPatrols(user.id, true),
        service.listProducts(user.id, true)
      ]);
      if (!diagnoses.some((item) => item.id === diagnosis.id && item.modelName === "test-model")) {
        throw new Error("问诊记录写入或读取失败。");
      }
      if (!patrols.some((item) => item.id === patrol.id && item.anomalies.includes("测试异常"))) {
        throw new Error("巡田记录写入或读取失败。");
      }
      if (!products.some((item) => item.id === product.id && item.traceabilityInfo === "测试溯源")) {
        throw new Error("农产品或溯源信息写入或读取失败。");
      }
      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) {
      throw error;
    }
  }

  const after = await counts();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("测试回滚失败，数据库记录数发生变化。");
  }
  console.log("问诊、巡田、农产品 Prisma 持久化测试通过，测试数据已回滚。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
