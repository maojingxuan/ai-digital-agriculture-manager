import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { RetrievalService } from "../dist/services/retrievalService.js";

const prisma = new PrismaClient();
const question = "番茄叶片出现黄褐色斑点应该检查什么？";

async function main() {
  const retrievalService = new RetrievalService(prisma);
  const response = await retrievalService.answer(question, {
    topK: 4,
    minScore: 0.16
  });

  assert.equal(response.reliable, true, "Knowledge base should return a reliable answer");
  assert.ok(response.sources.length > 0, "Answer should include source citations");
  assert.match(response.answer, /病斑|叶片|湿度|通风/, "Answer should be grounded in tomato disease knowledge");
  assert.match(response.answer, /引用来源/, "Answer should print citation labels");

  const latestLog = await prisma.knowledgeRetrievalLog.findFirstOrThrow({
    where: {
      query: question
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  assert.equal(latestLog.status, "success");
  assert.ok(Array.isArray(latestLog.results));
  assert.ok(latestLog.results.length > 0);

  const unknownResponse = await retrievalService.answer("量子计算芯片退火参数怎么设置？", {
    topK: 4,
    minScore: 0.28
  });

  assert.equal(unknownResponse.reliable, false, "Knowledge base should refuse unsupported conclusions");
  assert.match(unknownResponse.answer, /不能编造结论|没有检索到足够可靠/);

  console.log("Knowledge RAG test passed.");
  console.log(response.answer);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
