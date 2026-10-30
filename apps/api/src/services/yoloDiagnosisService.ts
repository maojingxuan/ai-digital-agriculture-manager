import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { DiagnosisRecord, YoloDetection } from "@agri/shared";
import type { RetrievalService } from "./retrievalService.js";
import type { LlmService } from "./llmService.js";
import {
  resolveApiPath,
  projectRootDir,
  yoloModelPath,
  yoloScriptPath,
} from "../config/paths.js";

const execFileAsync = promisify(execFile);

type PythonCommand = {
  executable: string;
  prefixArgs: string[];
};

function pythonsInEnvironment(environmentPath: string): string[] {
  const root = path.isAbsolute(environmentPath)
    ? path.normalize(environmentPath)
    : path.resolve(projectRootDir, environmentPath);
  return process.platform === "win32"
    ? [path.join(root, "Scripts", "python.exe"), path.join(root, "python.exe")]
    : [path.join(root, "bin", "python")];
}

export interface YoloRawOutput {
  success: boolean;
  detected: boolean;
  modelName: string;
  detectionsCount: number;
  detections: YoloDetection[];
  topDisease: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  annotatedSaved: boolean;
  annotatedPath?: string;
  error?: string;
}

export class YoloDiagnosisService {
  private readonly scriptPath: string;
  private readonly modelPath: string;
  private readonly configDir: string;
  private pythonCommand?: Promise<PythonCommand>;

  constructor(
    private readonly retrievalService?: RetrievalService,
    private readonly llm?: LlmService,
  ) {
    this.modelPath = process.env.YOLO_MODEL_PATH?.trim()
      ? resolveApiPath(
          process.env.YOLO_MODEL_PATH,
          "models/crop_disease_yolo11.pt",
        )
      : yoloModelPath;
    this.scriptPath = process.env.YOLO_SCRIPT_PATH?.trim()
      ? resolveApiPath(
          process.env.YOLO_SCRIPT_PATH,
          "scripts/yolo_inference.py",
        )
      : yoloScriptPath;
    this.configDir = resolveApiPath(
      process.env.YOLO_CONFIG_DIR,
      ".ultralytics",
    );
  }

  private async findPython(): Promise<PythonCommand> {
    const configured = process.env.PYTHON_EXEC?.trim();
    const configuredEnvironment = process.env.PYTHON_ENV_PATH?.trim();
    const candidates: PythonCommand[] = [];
    if (configured) candidates.push({ executable: configured, prefixArgs: [] });
    if (configuredEnvironment) {
      candidates.push(
        ...pythonsInEnvironment(configuredEnvironment).map((executable) => ({
          executable,
          prefixArgs: [],
        })),
      );
    }

    // Python 环境只从 .env 显式指定，不再自动探测系统或虚拟环境。
    // 支持 .venv、全局 Python、Conda 环境，配置方式详见 README「YOLO 图片识别」。
    if (!candidates.length) {
      throw new Error(
        "未配置 Python 环境。请在 .env 中设置 PYTHON_EXEC 或 PYTHON_ENV_PATH（支持 .venv、全局 Python、Conda 环境），详见 README「YOLO 图片识别」。",
      );
    }

    const uniqueCandidates = candidates.filter(
      (candidate, index) =>
        candidates.findIndex(
          (item) =>
            item.executable.toLowerCase() === candidate.executable.toLowerCase() &&
            item.prefixArgs.join("\0") === candidate.prefixArgs.join("\0"),
        ) === index,
    );

    for (const candidate of uniqueCandidates) {
      try {
        await execFileAsync(
          candidate.executable,
          [...candidate.prefixArgs, "--version"],
          {
            timeout: 5000,
            windowsHide: true,
          },
        );
        return candidate;
      } catch {
        // Try the next candidate configured in .env.
      }
    }

    throw new Error(
      `无法运行 .env 指定的 Python 环境（${configured ? `PYTHON_EXEC=${configured}` : ""}${configuredEnvironment ? ` PYTHON_ENV_PATH=${configuredEnvironment}` : ""}）。请检查路径是否正确（Windows 下虚拟环境解释器位于 <环境目录>\\Scripts\\python.exe）。`,
    );
  }

  async runInference(
    imagePath: string,
    outputAnnotatedPath: string,
  ): Promise<YoloRawOutput> {
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`未找到 YOLO 农业模型权重: ${this.modelPath}`);
    }

    if (!fs.existsSync(this.scriptPath)) {
      throw new Error(`未找到 YOLO 推理脚本: ${this.scriptPath}`);
    }

    fs.mkdirSync(this.configDir, { recursive: true });

    this.pythonCommand ??= this.findPython();
    const python = await this.pythonCommand;

    const args = [
      this.scriptPath,
      "--image",
      imagePath,
      "--model",
      this.modelPath,
      "--output",
      outputAnnotatedPath,
      "--conf",
      "0.10",
    ];

    try {
      const { stdout, stderr } = await execFileAsync(
        python.executable,
        [...python.prefixArgs, ...args],
        {
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            YOLO_CONFIG_DIR: this.configDir,
          },
          timeout: 180000,
          windowsHide: true,
        },
      );

      const match = stdout.match(
        /__YOLO_RESULT_START__\s*([\s\S]*?)\s*__YOLO_RESULT_END__/,
      );
      if (!match || !match[1]) {
        throw new Error(`YOLO 脚本返回结果格式异常: ${stdout || stderr}`);
      }

      const parsed = JSON.parse(match[1]) as YoloRawOutput;
      if (!parsed.success) {
        throw new Error(parsed.error || "YOLO 推理执行失败");
      }

      return parsed;
    } catch (error) {
      const stdout =
        typeof error === "object" && error !== null && "stdout" in error
          ? String((error as { stdout?: unknown }).stdout ?? "")
          : "";
      const match = stdout.match(
        /__YOLO_RESULT_START__\s*([\s\S]*?)\s*__YOLO_RESULT_END__/,
      );
      if (match?.[1]) {
        try {
          const parsed = JSON.parse(match[1]) as YoloRawOutput;
          if (parsed.error) {
            throw new Error(`YOLO 推理失败：${parsed.error}`);
          }
        } catch (parsedError) {
          if (
            parsedError instanceof Error &&
            parsedError.message.startsWith("YOLO 推理失败：")
          ) {
            console.error("[YOLO Inference Error]", parsedError.message);
            throw parsedError;
          }
        }
      }

      console.error("[YOLO Inference Error]", error);
      throw error;
    }
  }

  async diagnose(options: {
    imageFile?: Express.Multer.File;
    cropType: string;
    symptomDescription?: string;
  }): Promise<DiagnosisRecord> {
    const { imageFile, cropType, symptomDescription } = options;
    const now = () => new Date().toISOString();
    const id = `diag_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    // 如果未上传图片，则基于文本进行知识库检索
    if (!imageFile) {
      return {
        id,
        cropType,
        symptomDescription,
        suspectedDisease: "待上传叶片图像",
        confidence: 0,
        riskLevel: "low",
        analysis:
          "未提供叶片图片，请上传清晰病叶或虫害照片以激活 YOLO 视觉模型诊断。",
        suggestion:
          "建议拍摄受害部位（叶片正反面、果实或茎基部），保持光线充足，以便模型精准提取病斑特征。",
        createdAt: now(),
      };
    }

    const uploadDir = path.dirname(imageFile.path);
    const annotatedFilename = `annotated_${imageFile.filename}.jpg`;
    const annotatedFullPath = path.join(uploadDir, annotatedFilename);

    let yoloResult: YoloRawOutput | null = null;
    let inferenceError = "";

    try {
      yoloResult = await this.runInference(imageFile.path, annotatedFullPath);
    } catch (err) {
      inferenceError = err instanceof Error ? err.message : String(err);
      console.warn(
        "[YoloDiagnosisService] Fallback to rule/text mode due to inference error:",
        inferenceError,
      );
    }

    const visionFailed = Boolean(inferenceError);
    const detected = yoloResult?.detected ?? false;
    const topDisease = visionFailed
      ? "YOLO 视觉模型运行失败"
      : (yoloResult?.topDisease ??
        (detected ? "未知病害" : "未见明显侵染病斑"));
    const confidence = yoloResult?.confidence ?? 0;
    const riskLevel =
      yoloResult?.riskLevel ??
      (symptomDescription?.includes("严重") ? "high" : "medium");
    const annotatedImageUrl = yoloResult?.annotatedSaved
      ? `/uploads/${annotatedFilename}`
      : undefined;

    // 联动 RAG 农业知识库
    let ragKnowledge = "";
    let ragReferences: string[] = [];
    if (this.retrievalService) {
      const queryText =
        `${cropType} ${topDisease} ${symptomDescription ?? ""}`.trim();
      const ragAnswer = await this.retrievalService.answer(queryText, {
        topK: 3,
        minScore: 0.16,
      });
      if (ragAnswer.reliable) {
        ragKnowledge = ragAnswer.answer;
        ragReferences = ragAnswer.results.map((c) => c.documentTitle);
      }
    }

    // 联动 LLM 生成专家级综合处方
    let analysis = "";
    let suggestion = "";

    if (this.llm?.isConfigured() && detected) {
      try {
        const prompt = `你是一名资深设施农业病虫害诊断专家。
【视觉检测结果】：
- 深度视觉模型：Ultralytics YOLOv11 农业视觉模型
- 检测目标作物：${cropType}
- 检出核心病害：${topDisease}（置信度：${(confidence * 100).toFixed(1)}%）
- 用户补充症状：${symptomDescription || "无"}
- 检出病斑数量：${yoloResult?.detectionsCount || 1} 处
${ragKnowledge ? `【农业知识库参考文献】：\n${ragKnowledge}` : ""}

请输出专业、结构化、分条理的农技问诊报告：
1. **【病害诊断与病因分析】**：明确指出病原体类型（真菌/细菌/病毒/害虫/生理障碍）与典型表型；
2. **【当前风险与环境诱因】**：分析大棚温湿度对该病害发展的影响；
3. **【科学防治处方】**：
   - 物理与农艺措施（通风、控水、摘除病叶等）；
   - 针对性药剂推荐（给出有效成分通用名，严禁杜撰，给出科学稀释倍数与安全间隔期）。
格式要求：Markdown 分段、加粗关键药剂与操作，行文严谨专业。`;

        const fullReply = await this.llm.chat([
          {
            role: "system",
            content: "你是专业的AI数字农业管家与作物病理专家。",
          },
          { role: "user", content: prompt },
        ]);

        const splitIndex =
          fullReply.indexOf("3.") !== -1
            ? fullReply.indexOf("3.")
            : fullReply.indexOf("【科学防治处方】");

        if (splitIndex !== -1) {
          analysis = fullReply.slice(0, splitIndex).trim();
          suggestion = fullReply.slice(splitIndex).trim();
        } else {
          analysis = fullReply;
          suggestion =
            "建议遵循绿色防控方针，优先物理降湿通风，严重时对症施药。";
        }
      } catch (llmErr) {
        console.warn(
          "[YoloDiagnosisService] LLM prescription failed, falling back:",
          llmErr,
        );
      }
    }

    // 兜底结构化生成（无大模型或调用超时）
    if (!analysis || !suggestion) {
      if (visionFailed) {
        analysis = `本次图片未完成 YOLO 视觉检测，不能据此判断作物是否健康。\n\n运行错误：${inferenceError}`;
        suggestion =
          "请检查 Python、Ultralytics 和模型运行环境，修复后重新上传图片诊断。";
      } else if (detected) {
        const topDet = yoloResult?.detections[0];
        analysis = `经 YOLO 视觉检测定位，在送检叶片上精准检出 **${topDisease}**（检测置信度：**${(confidence * 100).toFixed(1)}%**）。\n\n病害分类属于：**${topDet?.category ?? "侵染性病害"}**。\n病理特征说明：${topDet?.description ?? "病斑在叶面扩展，需密切留意扩散趋势。"}`;

        suggestion = `1. **隔离与清理**：立即摘除已发病的病叶、病果，带出棚外深埋或销毁，防止气流二次传播；\n2. **环境调控**：加强大棚通风排湿，傍晚停止喷灌，避免叶片表面形成凝露水膜；\n3. **对症施药**：建议选用对症保护性与治疗性杀菌剂交替喷施，注意叶片正反面均匀着药。`;
        if (ragKnowledge) {
          suggestion += `\n\n**知识库用药参考**：\n${ragKnowledge}`;
        }
      } else {
        analysis = `YOLO 深度视觉模型扫描完成，叶片整体长势稳定，未检出明显的溃疡斑点、霜霉病层或钻蛀性害虫（或病斑处于极早期微弱阶段）。`;
        suggestion = `建议继续保持大棚标准水肥管理，注意观察昼夜温差与叶面湿度变化；若后续叶片出现明显褪绿变黄斑块，可重新拍照复检。`;
      }
    }

    return {
      id,
      cropType,
      symptomDescription,
      imageUrl: `/uploads/${imageFile.filename}`,
      annotatedImageUrl,
      suspectedDisease: topDisease,
      confidence: Math.round(confidence * 1000) / 1000,
      riskLevel,
      analysis,
      suggestion,
      modelName: yoloResult?.modelName ?? "corn_disease_best.pt",
      detections: yoloResult?.detections ?? [],
      ragReferences,
      visionError: inferenceError || undefined,
      createdAt: now(),
    };
  }
}
