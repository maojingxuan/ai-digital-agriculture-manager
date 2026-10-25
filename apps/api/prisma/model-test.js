import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const modelCounts = {
    user: await prisma.user.count(),
    greenhouse: await prisma.greenhouse.count(),
    sensor: await prisma.sensor.count(),
    sensorData: await prisma.sensorData.count(),
    crop: await prisma.crop.count(),
    diseaseDiagnosis: await prisma.diseaseDiagnosis.count(),
    patrolRecord: await prisma.patrolRecord.count(),
    warning: await prisma.warning.count(),
    product: await prisma.product.count(),
    productTrace: await prisma.productTrace.count(),
    device: await prisma.device.count(),
    deviceCommand: await prisma.deviceCommand.count(),
    agentConversation: await prisma.agentConversation.count(),
    agentActionLog: await prisma.agentActionLog.count(),
    knowledgeDocument: await prisma.knowledgeDocument.count(),
    knowledgeChunk: await prisma.knowledgeChunk.count()
  };

  for (const [modelName, count] of Object.entries(modelCounts)) {
    assert.ok(count > 0, `${modelName} should have seed data`);
  }

  const user = await prisma.user.findFirstOrThrow({
    include: {
      greenhouses: true,
      products: {
        include: {
          traces: true
        }
      },
      agentConversations: {
        include: {
          actionLogs: true
        }
      }
    }
  });

  assert.ok(user.greenhouses.length > 0, "User should own at least one greenhouse");
  assert.ok(user.products.length > 0, "User should own at least one product");
  assert.ok(user.products[0].traces.length > 0, "Product should have trace records");
  assert.ok(user.agentConversations[0].actionLogs.length > 0, "Conversation should have action logs");

  const greenhouse = user.greenhouses[0];
  const sensorData = await prisma.sensorData.findFirstOrThrow({
    where: {
      greenhouseId: greenhouse.id,
      sensorType: "humidity"
    },
    orderBy: {
      timestamp: "desc"
    }
  });

  assert.equal(sensorData.greenhouseId, greenhouse.id);
  assert.equal(sensorData.sensorType, "humidity");
  assert.equal(sensorData.unit, "%");
  assert.equal(typeof sensorData.value, "number");
  assert.ok(sensorData.timestamp instanceof Date);

  const deviceCommand = await prisma.deviceCommand.findFirstOrThrow({
    include: {
      device: true,
      operatorUser: true
    }
  });

  assert.ok(deviceCommand.deviceId);
  assert.ok(deviceCommand.command);
  assert.ok(deviceCommand.parameters);
  assert.ok(deviceCommand.operator);
  assert.ok(deviceCommand.executionStatus);
  assert.ok(deviceCommand.createdAt instanceof Date);
  assert.ok(deviceCommand.executedAt instanceof Date);
  assert.ok(deviceCommand.device.greenhouseId);
  assert.equal(deviceCommand.operatorUser?.id, user.id);

  const actionLog = await prisma.agentActionLog.findFirstOrThrow({
    include: {
      user: true,
      conversation: true,
      diagnosis: true,
      patrolRecord: true,
      deviceCommand: true
    }
  });

  assert.ok(actionLog.userRequest);
  assert.ok(actionLog.agentReasoning);
  assert.ok(actionLog.toolName);
  assert.ok(actionLog.toolParameters);
  assert.ok(actionLog.toolResult);
  assert.ok(actionLog.finalReply);
  assert.equal(actionLog.executionStatus, "success");
  assert.ok(actionLog.createdAt instanceof Date);
  assert.equal(actionLog.user.id, user.id);
  assert.ok(actionLog.conversation);
  assert.ok(actionLog.diagnosis);
  assert.ok(actionLog.patrolRecord);
  assert.ok(actionLog.deviceCommand);

  console.log("Core model tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
