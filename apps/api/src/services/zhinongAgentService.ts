import type { Prisma, PrismaClient } from "@prisma/client";
import { AgentToolRegistry, type ToolCall, type ToolName, type ToolResult } from "./agentTools.js";

export type ZhinongAgentRequest = {
  message: string;
  userId?: string;
  userRole?: "admin" | "user";
  conversationId?: string;
  confirmExecution?: boolean;
  imageUrl?: string;
};

export class AgentAuthorizationError extends Error {}

type Intent =
  | "greenhouse_status"
  | "sensor_history"
  | "crop_image_diagnosis"
  | "agriculture_knowledge"
  | "patrol_report"
  | "weather"
  | "product_query"
  | "device_control"
  | "warning_query"
  | "sales_query"
  | "irrigation_decision"
  | "unknown";

type AgentDecision = {
  intent: Intent;
  needsData: boolean;
  needsVision: boolean;
  needsKnowledge: boolean;
  involvesDeviceControl: boolean;
  needsUserConfirmation: boolean;
  reasoning: string;
  toolCalls: ToolCall[];
};

type ExecutedToolCall = ToolCall & {
  result: ToolResult;
};

const defaultUserName = "示范农场管理员";

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function greenhouseIdFromText(text: string) {
  return includesAny(text, ["2号", "制种"]) ? "demo-gh-2" : "demo-gh-1";
}

function cropFromText(text: string) {
  if (text.includes("玉米")) return "玉米";
  if (text.includes("水稻")) return "水稻";
  return "玉米";
}

function requestedSensors(text: string) {
  const sensors: string[] = [];
  if (text.includes("温度")) sensors.push("temperature");
  if (text.includes("湿度")) sensors.push("humidity", "soil_moisture");
  if (text.includes("土壤")) sensors.push("soil_moisture");
  if (text.includes("光照")) sensors.push("light");
  if (text.toLowerCase().includes("co2")) sensors.push("co2");
  if (text.includes("水箱") || text.includes("水位")) sensors.push("water_level");
  return sensors.length > 0 ? Array.from(new Set(sensors)) : undefined;
}

export class ZhinongAgentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tools: AgentToolRegistry
  ) {}

  async handle(request: ZhinongAgentRequest) {
    const decision = this.plan(request);
    if (decision.involvesDeviceControl && request.userRole !== "admin") {
      throw new AgentAuthorizationError("设备控制仅限管理员执行。");
    }
    const user = await this.resolveUser(request.userId);
    const conversation = request.conversationId
      ? await this.prisma.agentConversation.findUnique({ where: { id: request.conversationId } })
      : await this.prisma.agentConversation.create({
          data: {
            userId: user.id,
            title: request.message.slice(0, 40),
            channel: "web"
          }
        });

    if (decision.needsUserConfirmation && !request.confirmExecution) {
      await this.logAction({
        userId: user.id,
        conversationId: conversation?.id,
        userRequest: request.message,
        decision,
        toolCall: decision.toolCalls[0],
        toolResult: {
          ok: false,
          data: {
            executionPlan: decision.toolCalls,
            confirmationRequired: true
          },
          message: "设备控制需要用户确认，未执行 Tool。"
        },
        executionStatus: "awaiting_confirmation"
      });

      return {
        agentName: "智农 Agent",
        conversationId: conversation?.id,
        intent: decision.intent,
        decision,
        toolCalls: [],
        requiresConfirmation: true,
        executionPlan: decision.toolCalls,
        finalReply: this.composeConfirmationReply(decision)
      };
    }

    const executedCalls: ExecutedToolCall[] = [];
    for (const toolCall of decision.toolCalls) {
      const result = await this.tools.execute({
        ...toolCall,
        parameters: {
          ...toolCall.parameters,
          operator: user.name,
          operatorUserId: user.id,
          userRequest: request.message
        }
      });

      executedCalls.push({ ...toolCall, result });
      await this.logAction({
        userId: user.id,
        conversationId: conversation?.id,
        userRequest: request.message,
        decision,
        toolCall,
        toolResult: result,
        executionStatus: result.ok ? "success" : "failed"
      });
    }

    return {
      agentName: "智农 Agent",
      conversationId: conversation?.id,
      intent: decision.intent,
      decision,
      toolCalls: executedCalls,
      requiresConfirmation: false,
      finalReply: this.composeFinalReply(request.message, decision, executedCalls)
    };
  }

  plan(request: ZhinongAgentRequest): AgentDecision {
    const text = request.message;
    const greenhouseId = greenhouseIdFromText(text);
    const baseParameters = { greenhouseId, userRequest: text };

    if (includesAny(text, ["打开", "关闭", "启动", "停止", "风机", "水泵", "补光灯", "设备控制"])) {
      return {
        intent: "device_control",
        needsData: false,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: true,
        needsUserConfirmation: true,
        reasoning: "用户请求涉及农业设备控制。按照安全策略，Agent只生成执行计划，必须等待用户确认后才能调用控制 Tool。",
        toolCalls: [
          {
            name: "control_device",
            parameters: baseParameters
          }
        ]
      };
    }

    if (includesAny(text, ["浇水", "灌溉", "需要水", "缺水"])) {
      return {
        intent: "irrigation_decision",
        needsData: true,
        needsVision: false,
        needsKnowledge: true,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问灌溉决策，需要同时查询实时环境、历史土壤湿度趋势和农业知识库。",
        toolCalls: [
          { name: "query_greenhouse_data", parameters: baseParameters },
          {
            name: "query_sensor_history",
            parameters: { ...baseParameters, hours: 24, sensorTypes: requestedSensors(text) ?? ["soil_moisture", "humidity"] }
          },
          { name: "search_agriculture_knowledge", parameters: { query: text, topK: 4, minScore: 0.16 } }
        ]
      };
    }

    if (includesAny(text, ["异常", "预警", "风险", "报警"])) {
      return {
        intent: "warning_query",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问农场异常，需要查询预警记录并结合当前环境数据。",
        toolCalls: [
          { name: "query_warning", parameters: baseParameters },
          { name: "query_greenhouse_data", parameters: baseParameters }
        ]
      };
    }

    if (includesAny(text, ["历史", "趋势", "曲线", "过去", "24小时"])) {
      return {
        intent: "sensor_history",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问历史趋势，需要调用传感器历史数据 Tool。",
        toolCalls: [
          {
            name: "query_sensor_history",
            parameters: { ...baseParameters, hours: 24, sensorTypes: requestedSensors(text) }
          }
        ]
      };
    }

    if (includesAny(text, ["大棚怎么样", "环境", "温度", "湿度", "光照", "水箱", "水位", "co2", "CO2"])) {
      return {
        intent: "greenhouse_status",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问大棚实时状态，需要调用环境数据 Tool。",
        toolCalls: [{ name: "query_greenhouse_data", parameters: baseParameters }]
      };
    }

    if (includesAny(text, ["看看", "叶子", "叶片", "图片", "病害识别", "问诊"]) || request.imageUrl) {
      return {
        intent: "crop_image_diagnosis",
        needsData: false,
        needsVision: true,
        needsKnowledge: true,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户请求作物图像问诊，需要视觉诊断 Tool，并用知识库补充解释。",
        toolCalls: [
          {
            name: "diagnose_crop_image",
            parameters: { cropType: cropFromText(text), imageUrl: request.imageUrl, symptomDescription: text }
          },
          {
            name: "search_agriculture_knowledge",
            parameters: { query: text, topK: 4, minScore: 0.16 }
          }
        ]
      };
    }

    if (includesAny(text, ["巡田", "巡检", "巡棚", "报告"])) {
      return {
        intent: "patrol_report",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户请求巡田报告，需要调用巡田报告生成 Tool。",
        toolCalls: [{ name: "generate_patrol_report", parameters: { ...baseParameters, cropName: cropFromText(text) } }]
      };
    }

    if (includesAny(text, ["天气", "下雨", "降温", "高温", "风"])) {
      return {
        intent: "weather",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问天气，需要调用天气查询 Tool。",
        toolCalls: [{ name: "query_weather", parameters: { location: "智慧农业示范基地", userRequest: text } }]
      };
    }

    if (includesAny(text, ["商品", "农产品", "介绍", "溯源", "玉米卖"])) {
      return {
        intent: "product_query",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问农产品，需要调用农产品查询 Tool。",
        toolCalls: [{ name: "query_product", parameters: { keyword: cropFromText(text), userRequest: text } }]
      };
    }

    if (includesAny(text, ["销售", "订单", "营收", "卖了多少"])) {
      return {
        intent: "sales_query",
        needsData: true,
        needsVision: false,
        needsKnowledge: false,
        involvesDeviceControl: false,
        needsUserConfirmation: false,
        reasoning: "用户询问销售表现，需要调用销售数据 Tool。",
        toolCalls: [{ name: "query_sales_data", parameters: { period: "today", userRequest: text } }]
      };
    }

    return {
      intent: "agriculture_knowledge",
      needsData: false,
      needsVision: false,
      needsKnowledge: true,
      involvesDeviceControl: false,
      needsUserConfirmation: false,
      reasoning: "用户提出农业知识问题，需要先检索农业知识库；无可靠资料时必须拒绝编造。",
      toolCalls: [{ name: "search_agriculture_knowledge", parameters: { query: text, topK: 5, minScore: 0.18 } }]
    };
  }

  private async resolveUser(userId?: string) {
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) return user;
    }

    return this.prisma.user.findFirstOrThrow({
      orderBy: {
        createdAt: "asc"
      }
    });
  }

  private composeConfirmationReply(decision: AgentDecision) {
    const plan = decision.toolCalls.map((call) => `${call.name}(${JSON.stringify(call.parameters)})`).join("，");
    return `我判断这是设备控制请求。为避免高风险操作，我不会直接执行。执行计划是：${plan}。请确认后再执行。`;
  }

  private composeFinalReply(userRequest: string, decision: AgentDecision, toolCalls: ExecutedToolCall[]) {
    if (toolCalls.length === 0) {
      return "我已完成意图判断，但没有执行任何 Tool。";
    }

    const failed = toolCalls.find((call) => !call.result.ok && call.name !== "search_agriculture_knowledge");
    if (failed) {
      return failed.result.message ?? "Tool 执行失败，请检查输入条件。";
    }

    if (decision.intent === "greenhouse_status") {
      const snapshot = toolCalls[0].result.data as {
        farmName: string;
        summary: string;
        metrics: Array<{ label: string; value: number; unit: string; status: string }>;
      };
      return `${snapshot.farmName}当前状态：${snapshot.metrics.map((item) => `${item.label}${item.value}${item.unit}(${item.status})`).join("，")}。${snapshot.summary}`;
    }

    if (decision.intent === "irrigation_decision") {
      const knowledgeCall = toolCalls.find((call) => call.name === "search_agriculture_knowledge");
      if (knowledgeCall?.result.message) {
        return knowledgeCall.result.message;
      }
      return `### 💧 灌溉决策建议\n\n综合实时环境与历史传感器趋势，是否浇水要重点结合土壤湿度、空气湿度与叶面潮湿时间判断。当前知识库暂未收录更细致的水肥方案。`;
    }

    if (decision.intent === "crop_image_diagnosis") {
      const diagnosis = toolCalls.find((call) => call.name === "diagnose_crop_image")?.result.data as
        | { suspectedDisease: string; riskLevel: string; suggestion: string }
        | undefined;
      const knowledge = toolCalls.find((call) => call.name === "search_agriculture_knowledge")?.result.message;

      if (knowledge && knowledge.trim()) {
        return knowledge;
      }

      return `### 🌾 初步问诊结果\n\n- **疑似病害**：${diagnosis?.suspectedDisease ?? "疑似叶部异常"}\n- **风险等级**：${diagnosis?.riskLevel ?? "中等风险 (medium)"}\n- **处置建议**：${diagnosis?.suggestion ?? "建议保持通风，补充清晰图片并联系农技人员复核。"}`;
    }

    if (decision.intent === "device_control") {
      return toolCalls[0].result.message ?? "设备控制命令已执行。";
    }

    if (decision.intent === "warning_query") {
      return "我已查询预警和环境异常。请重点查看未处理预警、湿度/CO2/水位等异常指标，并安排现场复核。";
    }

    const lastMessage = [...toolCalls].reverse().find((call) => call.result.message)?.result.message;
    if (lastMessage) return lastMessage;

    return `我已根据“${userRequest}”完成判断，并调用 ${toolCalls.map((call) => call.name).join("、")}。`;
  }

  private async logAction(input: {
    userId: string;
    conversationId?: string;
    userRequest: string;
    decision: AgentDecision;
    toolCall?: ToolCall;
    toolResult: ToolResult;
    executionStatus: string;
  }) {
    await this.prisma.agentActionLog.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        agentReasoning: JSON.stringify({
          intent: input.decision.intent,
          needsData: input.decision.needsData,
          needsVision: input.decision.needsVision,
          needsKnowledge: input.decision.needsKnowledge,
          involvesDeviceControl: input.decision.involvesDeviceControl,
          needsUserConfirmation: input.decision.needsUserConfirmation,
          reasoning: input.decision.reasoning
        }),
        toolName: input.toolCall?.name ?? "none",
        toolParameters: toJsonObject(input.toolCall?.parameters ?? {}),
        toolResult: toJsonObject(input.toolResult),
        finalReply: input.toolResult.message ?? "",
        executionStatus: input.executionStatus
      }
    });
  }
}
