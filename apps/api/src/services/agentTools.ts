import type { PrismaClient } from "@prisma/client";
import type { SensorType } from "@agri/shared";
import {
  getAnomalies,
  getHistory,
  getRealtimeSnapshot,
} from "./sensorSimulator.js";
import { RetrievalService } from "./retrievalService.js";

export type ToolName =
  | "query_greenhouse_data"
  | "query_sensor_history"
  | "diagnose_crop_image"
  | "search_agriculture_knowledge"
  | "generate_patrol_report"
  | "query_weather"
  | "query_product"
  | "control_device"
  | "query_warning"
  | "query_sales_data";

export type ToolCall = {
  name: ToolName;
  parameters: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  data: unknown;
  message?: string;
};

const sensorTypes: SensorType[] = [
  "temperature",
  "humidity",
  "soil_moisture",
  "light",
  "co2",
  "water_level",
];

function pickGreenhouseId(text?: string) {
  if (text?.includes("2号") || text?.includes("草莓")) return "demo-gh-2";
  return "demo-gh-1";
}

function normalizeDeviceType(commandText: string) {
  if (commandText.includes("风机") || commandText.includes("通风"))
    return "ventilation";
  if (
    commandText.includes("水泵") ||
    commandText.includes("灌溉") ||
    commandText.includes("浇水")
  )
    return "irrigation";
  if (commandText.includes("补光") || commandText.includes("灯"))
    return "lighting";
  return "device";
}

function normalizeDeviceCommand(commandText: string) {
  const action =
    commandText.includes("关闭") || commandText.includes("关掉")
      ? "close"
      : "open";
  const deviceType = normalizeDeviceType(commandText);
  return `${action}_${deviceType}`;
}

export class AgentToolRegistry {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly retrievalService: RetrievalService,
  ) {}

  listTools(): ToolName[] {
    return [
      "query_greenhouse_data",
      "query_sensor_history",
      "diagnose_crop_image",
      "search_agriculture_knowledge",
      "generate_patrol_report",
      "query_weather",
      "query_product",
      "control_device",
      "query_warning",
      "query_sales_data",
    ];
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    switch (call.name) {
      case "query_greenhouse_data":
        return this.queryGreenhouseData(call.parameters);
      case "query_sensor_history":
        return this.querySensorHistory(call.parameters);
      case "diagnose_crop_image":
        return this.diagnoseCropImage(call.parameters);
      case "search_agriculture_knowledge":
        return this.searchAgricultureKnowledge(call.parameters);
      case "generate_patrol_report":
        return this.generatePatrolReport(call.parameters);
      case "query_weather":
        return this.queryWeather(call.parameters);
      case "query_product":
        return this.queryProduct(call.parameters);
      case "control_device":
        return this.controlDevice(call.parameters);
      case "query_warning":
        return this.queryWarning(call.parameters);
      case "query_sales_data":
        return this.querySalesData(call.parameters);
    }
  }

  private async queryGreenhouseData(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const greenhouseId = String(
      parameters.greenhouseId ??
        pickGreenhouseId(String(parameters.userRequest ?? "")),
    );
    return {
      ok: true,
      data: getRealtimeSnapshot(greenhouseId),
    };
  }

  private async querySensorHistory(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const greenhouseId = String(
      parameters.greenhouseId ??
        pickGreenhouseId(String(parameters.userRequest ?? "")),
    );
    const hours = Number(parameters.hours ?? 24);
    const requestedSensorTypes = Array.isArray(parameters.sensorTypes)
      ? parameters.sensorTypes
      : sensorTypes;
    return {
      ok: true,
      data: getHistory(
        greenhouseId,
        Number.isFinite(hours) ? hours : 24,
      ).filter((series) => requestedSensorTypes.includes(series.sensorType)),
    };
  }

  private async diagnoseCropImage(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const cropType = String(parameters.cropType ?? "番茄");
    const symptom = String(
      parameters.symptomDescription ?? parameters.userRequest ?? "",
    );
    const riskLevel = /严重|大片|枯萎|扩散/.test(symptom) ? "high" : "medium";
    return {
      ok: true,
      data: {
        cropType,
        suspectedDisease: cropType.includes("番茄")
          ? "疑似番茄叶斑类病害"
          : "疑似叶部病害",
        confidence: 0.76,
        riskLevel,
        analysis:
          "MVP阶段使用模拟视觉诊断结果。建议结合叶片正反面、湿度、通风和扩散速度判断。",
        suggestion:
          "请补充清晰叶片图片并保留现场样本；如多株扩散，建议农技人员复核。",
      },
    };
  }

  private async searchAgricultureKnowledge(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const query = String(parameters.query ?? parameters.userRequest ?? "");
    const answer = await this.retrievalService.answer(query, {
      topK: Number(parameters.topK ?? 5),
      minScore: Number(parameters.minScore ?? 0.18),
    });
    return {
      ok: answer.reliable,
      data: answer,
      message: answer.answer,
    };
  }

  private async generatePatrolReport(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const greenhouseId = String(
      parameters.greenhouseId ??
        pickGreenhouseId(String(parameters.userRequest ?? "")),
    );
    const snapshot = getRealtimeSnapshot(greenhouseId);
    const anomalies = getAnomalies(greenhouseId, 12);
    return {
      ok: true,
      data: {
        greenhouseId,
        plotName: snapshot.farmName,
        cropName: String(
          parameters.cropName ??
            (greenhouseId === "demo-gh-2" ? "草莓" : "番茄"),
        ),
        growthStatus: anomalies.some((item) => item.level === "risk")
          ? "局部环境风险偏高"
          : "整体长势稳定",
        anomalies: anomalies
          .slice(0, 4)
          .map(
            (item) => `${item.label}${item.value}${item.unit}: ${item.message}`,
          ),
        environmentRisk: snapshot.summary,
        suggestion:
          "建议结合图片巡田结果复查异常区域，并记录通风、灌溉和病虫害观察结果。",
        conclusion:
          "本报告由智农 Agent 调用模拟巡田 Tool 生成，适合 MVP 演示。",
      },
    };
  }

  private async queryWeather(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const location = String(parameters.location ?? "智慧农业示范基地");
    return {
      ok: true,
      data: {
        location,
        date: new Date().toISOString(),
        condition: "多云转晴",
        temperatureRange: "22℃ - 31℃",
        humidity: "68% - 86%",
        wind: "东北风2级",
        farmingAdvice: "午后注意通风降湿，傍晚避免大水漫灌。",
      },
    };
  }

  private async queryProduct(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const keyword = String(parameters.keyword ?? parameters.userRequest ?? "");
    const products = await this.prisma.product.findMany({
      where: keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { category: { contains: keyword } },
              { origin: { contains: keyword } },
            ],
          }
        : undefined,
      include: {
        traces: true,
      },
      take: 5,
      orderBy: {
        createdAt: "desc",
      },
    });
    return {
      ok: products.length > 0,
      data: products,
      message: products.length > 0 ? undefined : "没有查询到匹配的农产品。",
    };
  }

  private async controlDevice(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const request = String(parameters.userRequest ?? parameters.command ?? "");
    const greenhouseKeyword =
      request.includes("2号") || request.includes("草莓") ? "2号" : "1号";
    const deviceType = String(
      parameters.deviceType ?? normalizeDeviceType(request),
    );
    const command = String(
      parameters.command ?? normalizeDeviceCommand(request),
    );
    const operator = String(parameters.operator ?? "示范农场管理员");

    const device = await this.prisma.device.findFirst({
      where: {
        deviceType,
        greenhouse: {
          name: {
            contains: greenhouseKeyword,
          },
        },
      },
      include: {
        greenhouse: true,
      },
    });

    if (!device) {
      return {
        ok: false,
        data: { deviceType, command },
        message: "未找到匹配的模拟设备，未执行控制命令。",
      };
    }

    const record = await this.prisma.deviceCommand.create({
      data: {
        deviceId: device.id,
        operatorUserId:
          typeof parameters.operatorUserId === "string"
            ? parameters.operatorUserId
            : undefined,
        command,
        parameters: {
          source: "zhinong_agent",
          requestedBy: operator,
          originalRequest: request,
          ...(typeof parameters.parameters === "object" &&
          parameters.parameters !== null
            ? parameters.parameters
            : {}),
        },
        operator,
        executionStatus: "success",
        executedAt: new Date(),
      },
      include: {
        device: {
          include: {
            greenhouse: true,
          },
        },
      },
    });

    return {
      ok: true,
      data: record,
      message: `已执行：${record.device.greenhouse.name} ${record.device.name} ${command}。`,
    };
  }

  private async queryWarning(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const greenhouseId = String(
      parameters.greenhouseId ??
        pickGreenhouseId(String(parameters.userRequest ?? "")),
    );
    const warnings = await this.prisma.warning.findMany({
      where: {
        status: "open",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });
    return {
      ok: true,
      data: {
        warnings,
        environmentAnomalies: getAnomalies(greenhouseId, 24).slice(0, 5),
      },
    };
  }

  private async querySalesData(
    parameters: Record<string, unknown>,
  ): Promise<ToolResult> {
    const products = await this.prisma.product.findMany({
      where: {
        status: "active",
      },
      take: 8,
      orderBy: {
        createdAt: "desc",
      },
    });
    const totalRevenue = products.reduce(
      (sum, product, index) => sum + (product.price ?? 29.9) * (18 + index * 3),
      0,
    );
    return {
      ok: true,
      data: {
        period: String(parameters.period ?? "today"),
        orderCount: 38,
        productCount: products.length,
        estimatedRevenue: Number(totalRevenue.toFixed(2)),
        topProducts: products.map((product, index) => ({
          id: product.id,
          name: product.name,
          salesVolume: 18 + index * 3,
          revenue: Number(
            ((product.price ?? 29.9) * (18 + index * 3)).toFixed(2),
          ),
        })),
      },
    };
  }
}
