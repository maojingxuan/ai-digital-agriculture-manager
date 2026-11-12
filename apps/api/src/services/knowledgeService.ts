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

export type ListDocumentsParams = {
  page?: number;
  pageSize?: number;
  category?: string;
  search?: string;
  /** 入库日期起（YYYY-MM-DD，含当天，按东八区） */
  dateFrom?: string;
  /** 入库日期止（YYYY-MM-DD，含当天，按东八区） */
  dateTo?: string;
  /** 知识来源类型：seed 系统预置 / manual 手动录入 / upload 文件上传 */
  sourceType?: string;
  /** 来源机构关键词（匹配 metadata.source，如"农业农村部"） */
  source?: string;
  /** 排序：newest 最新在前（默认）/ oldest 最早在前 */
  sortBy?: "newest" | "oldest";
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

  async listDocuments(params: ListDocumentsParams = {}) {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));

    const where: Prisma.KnowledgeDocumentWhereInput = {};
    if (params.category) {
      where.category = params.category;
    }
    if (params.search?.trim()) {
      const keyword = params.search.trim();
      where.OR = [
        { title: { contains: keyword } },
        { category: { contains: keyword } },
        { fileName: { contains: keyword } }
      ];
    }
    // 高级检索：入库时间范围（YYYY-MM-DD，含当天，按东八区）
    const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(params.dateFrom ?? "") ? params.dateFrom! : undefined;
    const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(params.dateTo ?? "") ? params.dateTo! : undefined;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(`${dateFrom}T00:00:00+08:00`);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(`${dateTo}T23:59:59.999+08:00`);
      }
    }
    // 高级检索：来源类型（seed / manual / upload）
    if (params.sourceType) {
      where.sourceType = params.sourceType;
    }
    // 高级检索：来源机构关键词（匹配文档 metadata.source 字段）
    if (params.source?.trim()) {
      where.metadata = {
        path: "source",
        string_contains: params.source.trim()
      };
    }

    const [items, total, totalChunks, categoryRows] = await this.prisma.$transaction([
      this.prisma.knowledgeDocument.findMany({
        where,
        orderBy: {
          createdAt: params.sortBy === "oldest" ? "asc" : "desc"
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              chunks: true
            }
          }
        }
      }),
      this.prisma.knowledgeDocument.count({ where }),
      this.prisma.knowledgeChunk.count(),
      this.prisma.knowledgeDocument.groupBy({
        by: ["category"],
        _count: {
          _all: true
        },
        orderBy: {
          category: "asc"
        }
      })
    ]);

    return {
      items,
      total,
      totalChunks,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      categories: categoryRows.map((row) => ({
        category: row.category,
        count: (row._count as { _all?: number } | undefined)?._all ?? 0
      }))
    };
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
