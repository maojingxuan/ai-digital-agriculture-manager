import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KnowledgeService } from "./dist/services/knowledgeService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const service = new KnowledgeService(prisma);

const DOCS_DIR = path.resolve(__dirname, "../../docs/knowledge");

// 待入库文档（文件名 -> 分类）
const files = [
  { file: "设施蔬菜优质高产栽培技术.md", category: "蔬菜栽培" },
  { file: "土壤改良与科学施肥技术.md", category: "土壤肥料" },
  { file: "农药科学安全使用规范.md", category: "农药安全" },
  { file: "果蔬采后贮藏保鲜与冷链技术.md", category: "农产品知识" },
  { file: "粮油作物高产栽培与科学施肥技术.md", category: "粮油作物" }
];

async function main() {
  let created = 0;
  for (const { file, category } of files) {
    const filePath = path.join(DOCS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`[SKIP] 文件不存在: ${file}`);
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const title = file.replace(/\.md$/, "");
    // 查重：按标题检查是否已入库
    const exist = await prisma.knowledgeDocument.findFirst({ where: { title } });
    if (exist) {
      console.log(`[SKIP] 已存在: ${title} (id=${exist.id})`);
      continue;
    }
    const doc = await service.createKnowledge({
      title,
      category,
      sourceType: "manual",
      content,
      metadata: { source: "农业农村部/全国农技中心等官方文档整理" }
    });
    created++;
    console.log(`[OK] ${title} -> id=${doc.id}, chunks=${doc.chunks.length}, category=${category}`);
  }
  const total = await prisma.knowledgeDocument.count();
  const chunkTotal = await prisma.knowledgeChunk.count();
  console.log(`DONE created=${created} totalDocs=${total} totalChunks=${chunkTotal}`);
}

main()
  .catch((e) => {
    console.error("ERROR", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
