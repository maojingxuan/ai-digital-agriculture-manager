import { PrismaClient } from "@prisma/client";
import { embeddingService, EmbeddingService, majorCrops } from "./embeddingService.js";
import { llmService, LlmService } from "./llmService.js";

type RetrievalOptions = {
  topK?: number;
  minScore?: number;
  envContext?: string;
};

type SearchResult = {
  chunkId: string;
  documentId: string;
  title: string;
  documentTitle: string;
  category: string;
  content: string;
  score: number;
};

const safetyKeywords = ["农药", "施药", "用药", "喷药", "药剂", "杀菌剂", "杀虫剂", "安全间隔期", "中毒", "残留"];

export class RetrievalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly embeddings: EmbeddingService = embeddingService,
    private readonly llm: LlmService = llmService
  ) {}

  private detectCrops(text: string): string[] {
    return majorCrops.filter((crop) => text.includes(crop));
  }

  private detectChunkCrop(text: string): string | null {
    for (const crop of majorCrops) {
      if (text.includes(crop)) return crop;
    }
    return null;
  }

  async search(query: string, options: RetrievalOptions = {}) {
    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? 0.18;
    const queryEmbedding = this.embeddings.createEmbedding(query);
    const queryTerms = this.searchTerms(query);
    const queryCrops = this.detectCrops(query);

    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        document: {
          status: "active"
        }
      },
      include: {
        document: true
      }
    });

    return chunks
      .map((chunk) => {
        const fullChunkText = `${chunk.document.title}\n${chunk.document.category}\n${chunk.content}`;
        const embedding = Array.isArray(chunk.embedding) ? (chunk.embedding as number[]) : [];
        const lexicalScore = this.lexicalScore(queryTerms, fullChunkText);
        const vectorScore = this.embeddings.similarity(queryEmbedding, embedding);

        let baseScore = vectorScore * 0.70 + lexicalScore * 0.30;
        const chunkCrop = this.detectChunkCrop(fullChunkText);

        // 作物消歧与精准过滤机制
        if (queryCrops.length > 0) {
          if (chunkCrop && queryCrops.includes(chunkCrop)) {
            // 同作物文档给予权重提振
            baseScore *= 1.35;
          } else if (chunkCrop && !queryCrops.includes(chunkCrop)) {
            // 互斥作物文档施加强力抑制惩罚，杜绝“问黄瓜命中番茄”
            baseScore *= 0.15;
          }
        }

        const finalScore = Number(Math.min(1, baseScore).toFixed(6));

        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          title: chunk.title,
          documentTitle: chunk.document.title,
          category: chunk.document.category,
          content: chunk.content,
          score: finalScore
        };
      })
      .filter((result) => result.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  async answer(query: string, options: RetrievalOptions = {}) {
    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? 0.18;
    const results = await this.search(query, { topK, minScore });
    const safetyNotice = this.requiresSafetyNotice(query, results)
      ? "涉及农药施用或病虫防治时，必须严格执行农药标签说明与安全间隔期，注意个人防护；AI建议不能替代植保专家的现场实地复核。"
      : undefined;

    // 未检索到可靠知识时，坚决拒答防胡编
    if (results.length === 0) {
      const refusal = "知识库中没有检索到足够可靠的农业专业资料，因此系统不能编造结论。建议补充病害叶片清晰照片，或在知识库中上传该作物的专属管护规范。";
      await this.logRetrieval(query, topK, minScore, results, refusal, safetyNotice, "no_reliable_answer");
      return {
        answer: refusal,
        reliable: false,
        sources: [],
        safetyNotice,
        results
      };
    }

    const sources = results.map((result, index) => ({
      index: index + 1,
      documentId: result.documentId,
      chunkId: result.chunkId,
      title: result.documentTitle,
      category: result.category,
      score: result.score
    }));

    // 优先尝试真实大模型生成解答
    if (this.llm.isConfigured()) {
      const llmResponse = await this.llm.generateGroundedAnswer({
        query,
        chunks: results.map((r, i) => ({
          index: i + 1,
          title: r.documentTitle,
          category: r.category,
          content: r.content
        })),
        envContext: options.envContext
      });

      if (llmResponse.ok && llmResponse.answer) {
        await this.logRetrieval(query, topK, minScore, results, llmResponse.answer, safetyNotice, "success");
        return {
          answer: llmResponse.answer,
          reliable: true,
          sources,
          safetyNotice,
          results,
          llmModel: llmResponse.model
        };
      }
    }

    // 优雅降级：若大模型未配置或网络异常，走高质量本地规则组装
    const fallbackAnswer = this.composeFallbackAnswer(query, results, safetyNotice);
    await this.logRetrieval(query, topK, minScore, results, fallbackAnswer, safetyNotice, "success");

    return {
      answer: fallbackAnswer,
      reliable: true,
      sources,
      safetyNotice,
      results,
      llmModel: "本地离线规则引擎（可在.env配置LLM_API_KEY升级为真实大模型）"
    };
  }

  async listLogs(limit = 20) {
    return this.prisma.knowledgeRetrievalLog.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });
  }

  private composeFallbackAnswer(query: string, results: SearchResult[], safetyNotice?: string) {
    const primaryResult = results[0];
    const context = results.map((r) => r.content).join("\n");
    const detectedCrops = this.detectCrops(query);
    const cropPrefix = detectedCrops.length > 0 ? `针对【${detectedCrops.join("、")}】：` : "";

    const keyPoints: string[] = [];
    if (/病斑|斑点|水浸|黄褐色|枯萎/.test(context)) {
      keyPoints.push("重点观察叶片正反面病斑的轮廓（如多角形或同心轮纹）、边缘是否有水浸状扩展迹象。");
    }
    if (/霉层|霉菌|白粉|粉状/.test(context)) {
      keyPoints.push("注意叶背是否有白色、灰黑色霉层或粉状物生成，这通常是真菌性病害的关键识别指征。");
    }
    if (/湿度|通风|结露|滴水/.test(context)) {
      keyPoints.push("温室连续相对湿度高或叶片长时间结露会大幅加速病害蔓延，应优先开启风机通风降湿。");
    }
    if (/灌溉|浇水|积水|根部/.test(context)) {
      keyPoints.push("避免大水漫灌导致根系透气不良，宜采用滴灌并减少傍晚浇水频次。");
    }

    const lead = `${cropPrefix}根据知识库权威资料《${primaryResult.documentTitle}》，诊断与管理要点如下：`;
    const body =
      keyPoints.length > 0
        ? keyPoints.map((item, i) => `${i + 1}. ${item}`).join("\n")
        : "1. 记录发病范围与扩散趋势，加强大棚温湿度监测并控制叶面结露。";
    const conclusion =
      "如需更精准的用药方案，请在 .env 中配置真实大模型 API Key，系统将结合实时环境生成专家级详细处方。";
    const sourceLine = `引用来源：${results.map((r, i) => `[${i + 1}] ${r.documentTitle}`).join("；")}`;

    return [lead, body, conclusion, safetyNotice, sourceLine].filter(Boolean).join("\n\n");
  }

  private requiresSafetyNotice(query: string, results: SearchResult[]) {
    const text = `${query}\n${results.map((r) => r.content).join("\n")}`;
    return safetyKeywords.some((keyword) => text.includes(keyword));
  }

  private searchTerms(text: string) {
    const normalized = text.toLowerCase();
    const terms = new Set<string>();
    for (const crop of majorCrops) {
      if (normalized.includes(crop)) terms.add(crop);
    }
    for (const token of normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,4}/g) ?? []) {
      terms.add(token);
    }
    return [...terms];
  }

  private lexicalScore(queryTerms: string[], text: string) {
    if (queryTerms.length === 0) return 0;
    const normalized = text.toLowerCase();
    let matches = 0;
    for (const term of queryTerms) {
      if (normalized.includes(term)) matches += 1;
    }
    return matches / queryTerms.length;
  }

  private async logRetrieval(
    query: string,
    topK: number,
    minScore: number,
    results: SearchResult[],
    answer: string,
    safetyNotice: string | undefined,
    status: string
  ) {
    await this.prisma.knowledgeRetrievalLog.create({
      data: {
        query,
        topK,
        minScore,
        results: results.map((result) => ({
          chunkId: result.chunkId,
          documentId: result.documentId,
          title: result.documentTitle,
          category: result.category,
          score: result.score,
          excerpt: result.content.slice(0, 180)
        })),
        answer,
        safetyNotice,
        status
      }
    });
  }
}
