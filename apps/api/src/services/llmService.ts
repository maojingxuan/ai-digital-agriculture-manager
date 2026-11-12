import "../config/env.js";
import fs from "node:fs";
import path from "node:path";
import { resolveApiPath } from "../config/paths.js";

export type LlmProvider = "deepseek" | "ollama";
const selectionPath = resolveApiPath(undefined, "data/llm-provider.json");

function initialProvider(selectionPath: string): LlmProvider {
  try {
    const saved = JSON.parse(fs.readFileSync(selectionPath, "utf8")) as { provider?: string };
    if (saved.provider === "deepseek" || saved.provider === "ollama") return saved.provider;
  } catch { /* 首次启动没有保存过选择 */ }
  const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "deepseek" || configured === "ollama") return configured;
  return /localhost|127\.0\.0\.1|11434/i.test(process.env.LLM_BASE_URL ?? "") ? "ollama" : "deepseek";
}

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GroundedAnswerInput = {
  query: string;
  chunks: Array<{
    index: number;
    title: string;
    category: string;
    content: string;
  }>;
  envContext?: string;
};

export class LlmService {
  private selectedProvider: LlmProvider;

  constructor(private readonly selectionFile = selectionPath) {
    this.selectedProvider = initialProvider(selectionFile);
  }

  private profile(provider: LlmProvider) {
    const legacyUrl = process.env.LLM_BASE_URL?.trim() ?? "";
    const legacyIsLocal = /localhost|127\.0\.0\.1|11434/i.test(legacyUrl);
    return provider === "ollama"
      ? {
          provider: "本地 Ollama",
          baseUrl: (process.env.OLLAMA_BASE_URL?.trim() || (legacyIsLocal ? legacyUrl : "") || "http://127.0.0.1:11434/v1").replace(/\/+$/, ""),
          model: process.env.OLLAMA_MODEL?.trim() || (legacyIsLocal ? process.env.LLM_MODEL?.trim() : "") || "qwen2.5:7b",
          apiKey: ""
        }
      : {
          provider: "DeepSeek",
          baseUrl: (process.env.DEEPSEEK_BASE_URL?.trim() || (!legacyIsLocal ? legacyUrl : "") || "https://api.deepseek.com/v1").replace(/\/+$/, ""),
          model: process.env.DEEPSEEK_MODEL?.trim() || (!legacyIsLocal ? process.env.LLM_MODEL?.trim() : "") || "deepseek-chat",
          apiKey: process.env.DEEPSEEK_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || ""
        };
  }

  setProvider(provider: LlmProvider): void {
    fs.mkdirSync(path.dirname(this.selectionFile), { recursive: true });
    const temporaryPath = `${this.selectionFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ provider }), "utf8");
    fs.renameSync(temporaryPath, this.selectionFile);
    this.selectedProvider = provider;
  }

  isConfigured(): boolean {
    return this.selectedProvider === "ollama" || Boolean(this.profile("deepseek").apiKey);
  }

  getProviderName(): string {
    return this.profile(this.selectedProvider).provider;
  }

  getStatus() {
    const active = this.profile(this.selectedProvider);
    return {
      configured: this.isConfigured(),
      provider: active.provider,
      model: active.model,
      baseUrl: active.baseUrl,
      activeProvider: this.selectedProvider,
      options: (["ollama", "deepseek"] as const).map((id) => {
        const profile = this.profile(id);
        return { id, name: profile.provider, model: profile.model, configured: id === "ollama" || Boolean(profile.apiKey) };
      })
    };
  }

  async chat(messages: LlmMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const provider = this.selectedProvider;
    const profile = this.profile(provider);
    if (provider === "deepseek" && !profile.apiKey) {
      throw new Error("未配置 DeepSeek API Key，无法调用大模型。");
    }

    const endpoint = `${profile.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider === "ollama" ? 120000 : 20000);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (profile.apiKey) {
        headers["Authorization"] = `Bearer ${profile.apiKey}`;
      }

      const body = {
        model: profile.model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1200
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`大模型接口调用失败 [HTTP ${response.status}]: ${errorText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("大模型返回内容为空。");
      }

      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateGroundedAnswer(input: GroundedAnswerInput): Promise<{
    ok: boolean;
    answer: string;
    model: string;
    error?: string;
  }> {
    const active = this.profile(this.selectedProvider);
    if (!this.isConfigured()) {
      return {
        ok: false,
        answer: "",
        model: active.model,
        error: "未配置 DeepSeek API Key"
      };
    }

    const systemPrompt = [
      "你是一位专业、经验丰富、严谨耐心的【AI数字农业管家】，精通温室大棚种植、农作物病虫害精准鉴别与水肥环境调控。",
      "【回答准则】：",
      "1. 务必严格依据提供的【检索参考资料】为农户作答。参考资料包含事实特征与管理要点。",
      "2. 严禁编造未经证实的农药成分、病原体或结论。如果资料中未提及某种具体防治药剂，请坦率告知农户并建议联系当地植保站农技人员。",
      "3. 回答应针对农户提到的具体作物（玉米、叶菜或番茄），绝不可混淆作物品种。",
      "4. 若提供了温室实时环境（如高湿、高温），请结合环境指标综合分析病害诱因并给出通风或控水实操建议。",
      "5. 语言表达通俗自然、重点分明（使用分点列出），态度亲和务实。",
      "6. 回答末尾请自然引用参考资料的标题标号，如：参考来源：[1] 资料名称。"
    ].join("\n");

    const contextText = input.chunks
      .map((c) => `--- 资料 [${c.index}] 《${c.title}》（分类：${c.category}）---\n${c.content}`)
      .join("\n\n");

    const userPrompt = [
      `【农户提问】：${input.query}`,
      input.envContext ? `【当前大棚环境监测数据】：\n${input.envContext}` : "",
      "【知识库权威参考资料】：",
      contextText,
      "",
      "请根据以上参考资料，给出全面、严谨、有针对性的农技解答："
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const answer = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        { temperature: 0.35 }
      );

      return {
        ok: true,
        answer,
        model: `${active.provider} (${active.model})`
      };
    } catch (error) {
      return {
        ok: false,
        answer: "",
        model: active.model,
        error: error instanceof Error ? error.message : "大模型请求异常"
      };
    }
  }
}

export const llmService = new LlmService();
