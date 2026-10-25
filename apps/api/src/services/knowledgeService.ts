import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { embeddingService, EmbeddingService } from "./embeddingService.js";

export type CreateKnowledgeInput = {
  title: string;
  category: string;
  sourceType?: string;
  fileName?: string;
  content: string;
  metadata?: Prisma.InputJsonObject;
};

export type UploadedKnowledgeFile = {
  path: string;
  originalname: string;
  mimetype?: string;
};

export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly embeddings: EmbeddingService = embeddingService
  ) {}

  async createKnowledge(input: CreateKnowledgeInput) {
    const content = this.normalizeText(input.content);
    if (!content) {
      throw new Error("知识内容不能为空。");
    }

    const chunks = this.splitText(content);
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    return this.prisma.knowledgeDocument.create({
      data: {
        title: input.title,
        category: input.category,
        sourceType: input.sourceType ?? "manual",
        fileName: input.fileName,
        contentHash,
        metadata: input.metadata,
        chunks: {
          create: chunks.map((chunk, index) => ({
            chunkIndex: index,
            title: `${input.title} #${index + 1}`,
            content: chunk,
            tokenCount: this.estimateTokenCount(chunk),
            embedding: this.embeddings.createEmbedding(`${input.title}\n${input.category}\n${chunk}`)
          }))
        }
      },
      include: {
        chunks: true
      }
    });
  }

  async createKnowledgeFromUpload(file: UploadedKnowledgeFile, category: string, title?: string) {
    const content = await this.parseFile(file);
    return this.createKnowledge({
      title: title || path.parse(file.originalname).name,
      category,
      sourceType: "upload",
      fileName: file.originalname,
      content,
      metadata: {
        mimetype: file.mimetype
      }
    });
  }

  async listDocuments() {
    return this.prisma.knowledgeDocument.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        _count: {
          select: {
            chunks: true
          }
        }
      }
    });
  }

  async getDocument(id: string) {
    return this.prisma.knowledgeDocument.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: {
            chunkIndex: "asc"
          }
        }
      }
    });
  }

  async deleteDocument(id: string) {
    await this.prisma.knowledgeChunk.deleteMany({
      where: { documentId: id }
    });
    return this.prisma.knowledgeDocument.delete({
      where: { id }
    });
  }

  private normalizeText(content: string) {
    return content.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  private splitText(content: string, maxLength = 520, overlap = 80) {
    const paragraphs = content
      .split(/\n{2,}|(?<=[。！？；])/)
      .map((item) => item.trim())
      .filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    for (const paragraph of paragraphs) {
      if (`${current}${paragraph}`.length > maxLength && current) {
        chunks.push(current.trim());
        current = current.slice(Math.max(0, current.length - overlap));
      }
      current = `${current}${current ? "\n" : ""}${paragraph}`;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.length > 0 ? chunks : [content.slice(0, maxLength)];
  }

  private estimateTokenCount(content: string) {
    const chineseChars = content.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
    const words = content.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
    return Math.ceil(chineseChars * 0.7 + words);
  }

  private async parseFile(file: UploadedKnowledgeFile) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (![".txt", ".md", ".markdown", ".csv"].includes(extension)) {
      throw new Error("MVP阶段仅支持 txt、md、markdown、csv 文档解析。");
    }

    return fs.readFile(file.path, "utf8");
  }
}
