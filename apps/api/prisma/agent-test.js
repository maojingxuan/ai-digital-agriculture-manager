import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { AgentToolRegistry } from "../dist/services/agentTools.js";
import { RetrievalService } from "../dist/services/retrievalService.js";
import { ZhinongAgentService } from "../dist/services/zhinongAgentService.js";

const prisma = new PrismaClient();
let testDb = prisma;
let testAuth;

async function runCase(agent, title, request, expectation) {
  const beforeLogs = await testDb.agentActionLog.count();
  const response = await agent.handle({ ...request, ...testAuth });
  const afterLogs = await testDb.agentActionLog.count();

  assert.equal(
    response.intent,
    expectation.intent,
    `${title}: intent mismatch`,
  );
  assert.equal(
    response.requiresConfirmation,
    expectation.requiresConfirmation ?? false,
    `${title}: confirmation mismatch`,
  );

  for (const toolName of expectation.tools ?? []) {
    const names = response.requiresConfirmation
      ? response.executionPlan.map((call) => call.name)
      : response.toolCalls.map((call) => call.name);
    assert.ok(names.includes(toolName), `${title}: expected tool ${toolName}`);
  }

  if (expectation.logIncrease !== undefined) {
    assert.equal(
      afterLogs - beforeLogs,
      expectation.logIncrease,
      `${title}: action log count mismatch`,
    );
  } else {
    assert.ok(afterLogs > beforeLogs, `${title}: action log should be created`);
  }

  if (expectation.replyIncludes) {
    assert.match(
      response.finalReply,
      expectation.replyIncludes,
      `${title}: final reply mismatch`,
    );
  }

  return response;
}

async function runSuite() {
  const admin = await testDb.user.findFirstOrThrow({ where: { role: "admin" } });
  testAuth = { userId: admin.id, userRole: "admin" };
  const retrievalService = new RetrievalService(testDb);
  const tools = new AgentToolRegistry(testDb, retrievalService);
  const agent = new ZhinongAgentService(testDb, tools);

  assert.deepEqual(tools.listTools(), [
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
  ]);

  await runCase(
    agent,
    "实时大棚状态",
    { message: "现在大棚怎么样？" },
    {
      intent: "greenhouse_status",
      tools: ["query_greenhouse_data"],
      logIncrease: 1,
      replyIncludes: /当前状态/,
    },
  );

  await runCase(
    agent,
    "历史湿度趋势",
    { message: "过去24小时湿度趋势怎么样？" },
    {
      intent: "sensor_history",
      tools: ["query_sensor_history"],
      logIncrease: 1,
    },
  );

  await runCase(
    agent,
    "作物图片问诊",
    { message: "帮我看看番茄叶子。", imageUrl: "/uploads/demo-leaf.jpg" },
    {
      intent: "crop_image_diagnosis",
      tools: ["diagnose_crop_image", "search_agriculture_knowledge"],
      logIncrease: 2,
      replyIncludes: /初步问诊结果|知识库|诊断与管理要点/,
    },
  );

  await runCase(
    agent,
    "农业知识问答",
    { message: "番茄叶斑病应该检查什么？" },
    {
      intent: "agriculture_knowledge",
      tools: ["search_agriculture_knowledge"],
      logIncrease: 1,
      replyIncludes: /引用来源|不能编造/,
    },
  );

  await runCase(
    agent,
    "浇水决策",
    { message: "今天需要浇水吗？" },
    {
      intent: "irrigation_decision",
      tools: [
        "query_greenhouse_data",
        "query_sensor_history",
        "search_agriculture_knowledge",
      ],
      logIncrease: 3,
      replyIncludes: /实时环境|历史传感器|不能编造|知识库/,
    },
  );

  const beforeCommands = await testDb.deviceCommand.count();
  const planResponse = await runCase(
    agent,
    "设备控制确认前",
    { message: "打开2号大棚风机。" },
    {
      intent: "device_control",
      tools: ["control_device"],
      requiresConfirmation: true,
      logIncrease: 1,
      replyIncludes: /请确认/,
    },
  );
  const afterPlanCommands = await testDb.deviceCommand.count();
  assert.equal(
    afterPlanCommands,
    beforeCommands,
    "Device command should not execute before confirmation",
  );
  assert.equal(planResponse.executionPlan[0].name, "control_device");

  await runCase(
    agent,
    "设备控制确认后",
    { message: "打开2号大棚风机。", confirmExecution: true },
    {
      intent: "device_control",
      tools: ["control_device"],
      logIncrease: 1,
      replyIncludes: /已执行/,
    },
  );
  const afterExecuteCommands = await testDb.deviceCommand.count();
  assert.equal(
    afterExecuteCommands,
    beforeCommands + 1,
    "Device command should execute after confirmation",
  );

  await assert.rejects(
    agent.handle({
      message: "打开1号大棚风机。",
      userId: admin.id,
      userRole: "user",
      confirmExecution: true
    }),
    /仅限管理员/,
    "Regular users must not execute device controls"
  );

  await runCase(
    agent,
    "异常预警查询",
    { message: "今天农场有什么异常？" },
    {
      intent: "warning_query",
      tools: ["query_warning", "query_greenhouse_data"],
      logIncrease: 2,
      replyIncludes: /预警|异常/,
    },
  );

  await runCase(
    agent,
    "天气查询",
    { message: "今天大棚天气适合通风吗？" },
    {
      intent: "weather",
      tools: ["query_weather"],
      logIncrease: 1,
      replyIncludes: /多云转晴|天气/,
    },
  );

  await runCase(
    agent,
    "农产品查询",
    { message: "介绍一下番茄农产品和溯源。" },
    {
      intent: "product_query",
      tools: ["query_product"],
      logIncrease: 1,
    },
  );

  await runCase(
    agent,
    "销售数据查询",
    { message: "今天销售数据怎么样？" },
    {
      intent: "sales_query",
      tools: ["query_sales_data"],
      logIncrease: 1,
    },
  );

  const latestControlLog = await testDb.agentActionLog.findFirstOrThrow({
    where: {
      toolName: "control_device",
      executionStatus: "awaiting_confirmation",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert.match(latestControlLog.agentReasoning, /needsUserConfirmation/);
  assert.match(latestControlLog.userRequest, /打开2号大棚风机/);
  assert.ok(latestControlLog.toolParameters);
  assert.ok(latestControlLog.toolResult);

  console.log("Zhinong Agent tests passed.");
}

async function main() {
  const before = await prisma.$transaction([
    prisma.agentConversation.count(),
    prisma.agentActionLog.count(),
    prisma.deviceCommand.count(),
    prisma.knowledgeRetrievalLog.count()
  ]);
  const rollbackMarker = new Error("AGENT_TEST_ROLLBACK");
  try {
    await prisma.$transaction(
      async (transaction) => {
        testDb = transaction;
        await runSuite();
        throw rollbackMarker;
      },
      { timeout: 30000 }
    );
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  } finally {
    testDb = prisma;
  }
  const after = await prisma.$transaction([
    prisma.agentConversation.count(),
    prisma.agentActionLog.count(),
    prisma.deviceCommand.count(),
    prisma.knowledgeRetrievalLog.count()
  ]);
  assert.deepEqual(after, before, "Agent test data must roll back");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
