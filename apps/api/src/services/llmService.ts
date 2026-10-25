import "../config/env.js";

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
  private get apiKey(): string {
    return process.env.LLM_API_KEY?.trim() ?? "";
  }

  private get baseUrl(): string {
    const raw = process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com/v1";
    return raw.replace(/\/+$/, "");
  }

  private get model(): string {
    return process.env.LLM_MODEL?.trim() || "deepseek-chat";
  }

  isConfigured(): boolean {
    if (this.baseUrl.includes("11434") || this.baseUrl.includes("localhost")) {
      return true;
    }
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  getProviderName(): string {
    const url = this.baseUrl.toLowerCase();
    if (url.includes("deepseek")) return "DeepSeek";
    if (url.includes("dashscope") || url.includes("aliyun")) return "通义千问 (Qwen)";
    if (url.includes("siliconflow")) return "硅基流动 (SiliconFlow)";
    if (url.includes("bigmodel") || url.includes("zhipu")) return "智谱 AI (GLM)";
    if (url.includes("moonshot")) return "月之暗面 (Kimi)";
    if (url.includes("11434") || url.includes("ollama")) return "本地 Ollama";
    return "自定义大模型";
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      provider: this.getProviderName(),
      model: this.model,
      baseUrl: this.baseUrl
    };
  }

  async chat(messages: LlmMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("未配置 LLM_API_KEY，无法调用大模型。");
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const body = {
        model: this.model,
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
    if (!this.isConfigured()) {
      return {
        ok: false,
        answer: "",
        model: this.model,
        error: "未配置 LLM_API_KEY"
      };
    }

    const systemPrompt = [
      "你是一位专业、经验丰富、严谨耐心的【AI数字农业管家】，精通温室大棚种植、农作物病虫害精准鉴别与水肥环境调控。",
      "【回答准则】：",
      "1. 务必严格依据提供的【检索参考资料】为农户作答。参考资料包含事实特征与管理要点。",
      "2. 严禁编造未经证实的农药成分、病原体或结论。如果资料中未提及某种具体防治药剂，请坦率告知农户并建议联系当地植保站农技人员。",
      "3. 回答应针对农户提到的具体作物（如黄瓜、番茄等），绝不可混淆作物品种。",
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
        model: `${this.getProviderName()} (${this.model})`
      };
    } catch (error) {
      return {
        ok: false,
        answer: "",
        model: this.model,
        error: error instanceof Error ? error.message : "大模型请求异常"
      };
    }
  }
}

export const llmService = new LlmService();
