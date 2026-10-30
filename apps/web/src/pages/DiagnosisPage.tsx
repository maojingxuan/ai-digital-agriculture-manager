import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { DiagnosisRecord } from "@agri/shared";
import {
  UploadCloud,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  Layers,
  Cpu,
  ExternalLink,
} from "lucide-react";
import { api } from "../services/api";

export function DiagnosisPage() {
  const [result, setResult] = useState<DiagnosisRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showAnnotated, setShowAnnotated] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      if (selectedFile) {
        formData.set("image", selectedFile);
      }
      const record = await api.createDiagnosis(formData);
      setResult(record);
      setShowAnnotated(Boolean(record.annotatedImageUrl));
    } catch (error) {
      console.error("Diagnosis error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "诊断请求失败，请检查后端服务。",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page diagnosis-page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>表型病理诊断 · 机器视觉实验室</span>
          </div>
          <h1>AI农业问诊</h1>
        </div>
        <div className="header-meta-tags">
          <span className="engine-badge active">
            <Cpu size={13} />
            YOLOv11 深度视觉模型联机
          </span>
          <span className="engine-badge active">
            <Sparkles size={13} />
            沃柑 · 甘蔗 · 玉米病虫害检测
          </span>
        </div>
      </div>

      <div className="two-column diagnosis-layout">
        <form className="form-panel" onSubmit={handleSubmit}>
          <h2>上传病害样本</h2>

          <label>
            作物类型
            <select name="cropType" defaultValue="沃柑">
              <option value="沃柑">沃柑 (Wogan Mandarin)</option>
              <option value="甘蔗">甘蔗 (Sugarcane)</option>
              <option value="玉米">玉米 (Maize)</option>
            </select>
          </label>

          <label>
            上传作物叶片或果实照片
            <input
              ref={fileInputRef}
              name="image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              required
            />
          </label>

          {previewUrl && (
            <div className="image-preview-card">
              <div className="preview-header">
                <small>已选本地图片预览</small>
                {selectedFile && (
                  <small className="file-size">
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </small>
                )}
              </div>
              <img src={previewUrl} alt="待检测作物" className="preview-img" />
            </div>
          )}

          <label>
            补充表型与症状描述（可选）
            <textarea
              name="symptomDescription"
              rows={4}
              placeholder="例如：叶缘发焦、叶片发黄微卷、出现同心轮纹或暗绿色水渍状霉层..."
            />
          </label>

          <button className="primary-button" disabled={loading}>
            <UploadCloud size={18} />
            {loading ? "YOLO 视觉检测与大模型分析中..." : "启动 YOLO 智能诊断"}
          </button>
        </form>

        <section className="result-panel diagnosis-result-card">
          <div className="result-card-header">
            <h2>诊断研判报告</h2>
            {result && (
              <span className={`risk-badge risk-${result.riskLevel}`}>
                {result.riskLevel === "high" ? (
                  <AlertTriangle size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {result.riskLevel === "high"
                  ? "高风险病害"
                  : result.riskLevel === "medium"
                    ? "中度风险"
                    : "低风险/健康"}
              </span>
            )}
          </div>

          {result ? (
            <div className="result-content-body">
              {result.visionError && (
                <div className="message-banner error" role="alert">
                  <AlertTriangle size={16} />
                  <span>YOLO 未完成本次图片检测：{result.visionError}</span>
                </div>
              )}

              {/* 视觉标注与原图展示 */}
              {(result.annotatedImageUrl || result.imageUrl) && (
                <div className="vision-stage">
                  <div className="vision-stage-tabs">
                    <div className="vision-tabs-group">
                      <button
                        type="button"
                        className={`vision-tab-btn ${showAnnotated && result.annotatedImageUrl ? "active" : ""}`}
                        onClick={() => setShowAnnotated(true)}
                        disabled={!result.annotatedImageUrl}
                      >
                        <Eye size={14} />
                        YOLO 目标识别标注图
                      </button>
                      <button
                        type="button"
                        className={`vision-tab-btn ${!showAnnotated || !result.annotatedImageUrl ? "active" : ""}`}
                        onClick={() => setShowAnnotated(false)}
                      >
                        <ImageIcon size={14} />
                        原始图片
                      </button>
                    </div>

                    <a
                      href={
                        showAnnotated && result.annotatedImageUrl
                          ? result.annotatedImageUrl
                          : result.imageUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vision-zoom-link"
                      title="在新标签页中查看高清原图"
                    >
                      <ExternalLink size={13} />
                      全高清大图
                    </a>
                  </div>

                  <div className="vision-img-frame">
                    <img
                      src={
                        showAnnotated && result.annotatedImageUrl
                          ? result.annotatedImageUrl
                          : result.imageUrl
                      }
                      alt="诊断视觉图像"
                      className="annotated-main-img"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.triedFallback) {
                          target.dataset.triedFallback = "true";
                          if (target.src.includes("/uploads/")) {
                            target.src = target.src.replace(
                              "/uploads/",
                              "/api/uploads/",
                            );
                          }
                        }
                      }}
                    />
                    {result.annotatedImageUrl && showAnnotated && (
                      <div className="vision-overlay-tag">
                        <Layers size={13} />
                        已标定病斑 Bounding Box 区域
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 核心结论看板 */}
              <div className="diagnosis-summary-box">
                <div className="summary-left">
                  <span className="summary-label">疑似病害 / 侵染诊断</span>
                  <strong className="summary-disease">
                    {result.suspectedDisease}
                  </strong>
                </div>
                <div className="summary-right">
                  <span className="summary-label">视觉置信度</span>
                  <strong className="summary-confidence">
                    {(result.confidence * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>

              {/* 检出的病斑目标卡片 */}
              {result.detections && result.detections.length > 0 && (
                <div className="detections-container">
                  <h4>
                    <Layers size={15} /> 检出病斑与目标列表 (
                    {result.detections.length} 处)
                  </h4>
                  <div className="detection-chips">
                    {result.detections.map((det, idx) => (
                      <div className="detection-chip" key={idx}>
                        <div className="chip-top">
                          <span className="chip-name">{det.labelZh}</span>
                          <span className="chip-conf">
                            {(det.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <span className="chip-category">
                          {det.crop} · {det.category}
                        </span>
                        {det.description && (
                          <p className="chip-desc">{det.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 详细病理分析 */}
              <div className="diagnosis-block">
                <h4>
                  <Eye size={15} /> 病理分析与发病条件
                </h4>
                <div className="markdown-body">
                  <ReactMarkdown>{result.analysis}</ReactMarkdown>
                </div>
              </div>

              {/* 科学防治处方 */}
              <div className="diagnosis-block suggestion-block">
                <h4>
                  <Sparkles size={15} /> 专家防治处方与农艺调控
                </h4>
                <div className="markdown-body">
                  <ReactMarkdown>{result.suggestion}</ReactMarkdown>
                </div>
              </div>

              {/* 知识库引用 */}
              {result.ragReferences && result.ragReferences.length > 0 && (
                <div className="rag-citation-box">
                  <BookOpen size={14} />
                  <span>关联农业知识库文献：</span>
                  {result.ragReferences.map((refTitle, i) => (
                    <span className="rag-ref-pill" key={i}>
                      {refTitle}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="empty-diagnosis">
              <div className="empty-icon-circle">
                <UploadCloud size={32} />
              </div>
              <h3>请在左侧上传作物病叶照片</h3>
              <p>
                系统将自动调用本地 <strong>YOLOv11</strong>{" "}
                深度视觉模型进行像素级目标检测，并在病斑区域绘制高亮边界框，结合农技知识库与大模型生成专业防治处方。
              </p>

              <div className="feature-badges">
                <span>⚡ 毫秒级边缘视觉推理</span>
                <span>🎯 自动病斑轮廓/框线绘制</span>
                <span>💊 科学用药与稀释配比处方</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
