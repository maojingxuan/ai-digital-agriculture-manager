import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  DiagnosisRecord,
  VideoDiagnosisRecord,
} from "@agri/shared";
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
  Camera,
  Video as VideoIcon,
  Square,
  Play,
  Film,
  RefreshCcw,
} from "lucide-react";
import { api } from "../services/api";

type CameraState = "idle" | "requesting" | "ready" | "denied" | "unsupported";

function DiagnosisCameraPanel(props: {
  formRef: React.RefObject<HTMLFormElement | null>;
  onPhotoCapture: (file: File) => void;
  onVideoCapture: (file: File) => void;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const { formRef, onPhotoCapture, onVideoCapture, onBusyChange, onError } =
    props;
  const [camState, setCamState] = useState<CameraState>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function readFormValue(name: string): string | undefined {
    const form = formRef.current;
    if (!form) return undefined;
    const element = form.elements.namedItem(name);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    return undefined;
  }

  async function startCamera(deviceIdToUse?: string): Promise<boolean> {
    if (recording) stopRecording();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("unsupported");
      return false;
    }
    setCamState("requesting");
    try {
      stopStream();
      const constraints: MediaStreamConstraints = {
        video: deviceIdToUse
          ? { deviceId: { exact: deviceIdToUse }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamState("ready");
      // 授权后再枚举设备，才能拿到外接摄像头的 label
      const list = await navigator.mediaDevices
        .enumerateDevices()
        .catch(() => [] as MediaDeviceInfo[]);
      setDevices(list.filter((d) => d.kind === "videoinput"));
      return true;
    } catch (err) {
      stopStream();
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamState("denied");
      } else if (name === "NotFoundError") {
        setCamState("unsupported");
      } else {
        setCamState("denied");
        onError(
          err instanceof Error
            ? `摄像头启动失败：${err.message}`
            : "摄像头启动失败，请检查设备是否被占用。",
        );
      }
      return false;
    }
  }

  function stopCamera() {
    if (recording) stopRecording();
    stopStream();
    setCamState("idle");
  }

  /** 未开启摄像头时点拍照/录像，先自动开启摄像头再执行动作 */
  async function withCamera(action: () => void) {
    if (camState === "ready") {
      action();
      return;
    }
    if (camState === "requesting") {
      return;
    }
    // 静默自动开启：界面通过 badge「正在启动...」反馈，失败时 startCamera 内部会提示
    const ok = await startCamera(deviceId);
    if (ok) action();
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      onError("摄像头画面尚未就绪，请稍候再试。");
      return;
    }
    onBusyChange(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onBusyChange(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onBusyChange(false);
          onError("拍照失败，无法生成图像。");
          return;
        }
        const file = new File([blob], `camera_${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onBusyChange(false);
        onPhotoCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recording) return;
    if (typeof MediaRecorder === "undefined") {
      onError("当前浏览器不支持视频录制（需要 MediaRecorder）。");
      return;
    }
    chunksRef.current = [];
    let mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      onError("当前浏览器不支持 WebM 视频录制，请更换 Chrome/Edge 浏览器。");
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "video/webm",
      });
      const file = new File([blob], `camera_${Date.now()}.webm`, {
        type: blob.type,
      });
      onBusyChange(true);
      onVideoCapture(file);
    };
    recorder.start(1000);
    setRecording(true);
    setRecordSeconds(0);
    timerRef.current = window.setInterval(
      () => setRecordSeconds((s) => s + 1),
      1000,
    );
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      stopStream();
    };
  }, []);

  const cameraReady = camState === "ready" || camState === "requesting";

  return (
    <div className="camera-panel">
      <div className="camera-panel-header">
        <h2>
          <Camera size={18} />
          摄像头实拍诊断
        </h2>
        <span className={`camera-badge ${camState === "ready" ? "on" : ""}`}>
          {camState === "ready"
            ? "摄像头已就绪"
            : camState === "requesting"
              ? "正在启动..."
              : camState === "denied"
                ? "权限被拒绝"
                : camState === "unsupported"
                  ? "未检测到摄像头"
                  : "支持外接 USB 摄像头"}
        </span>
      </div>

      <div className="camera-preview-wrap">
        {cameraReady ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="camera-preview-video"
          />
        ) : (
          <div className="camera-placeholder">
            <VideoIcon size={30} />
            <span>
              {camState === "denied"
                ? "摄像头权限被拒绝，请在浏览器地址栏重新授权"
                : camState === "unsupported"
                  ? "未找到可用摄像头，请连接 USB 外接摄像头后重试"
                  : "点击「打开摄像头」开始实拍诊断"}
            </span>
          </div>
        )}
        {recording && (
          <div className="rec-indicator">
            <span className="rec-dot" />
            REC {recordSeconds}s
          </div>
        )}
      </div>

      {camState === "denied" && (
        <div className="message-banner error" role="alert">
          <AlertTriangle size={15} />
          <span>
            未获得摄像头权限。请在浏览器地址栏的权限提示中允许摄像头访问，或检查摄像头是否被其他程序占用。
          </span>
        </div>
      )}

      <div className="camera-controls">
        <button
          type="button"
          className="camera-btn primary"
          onClick={() =>
            camState === "ready" ? stopCamera() : void startCamera(deviceId)
          }
          disabled={camState === "requesting"}
        >
          {camState === "ready" ? (
            <>
              <Square size={14} />
              关闭摄像头
            </>
          ) : (
            <>
              <Play size={14} />
              打开摄像头
            </>
          )}
        </button>

        {cameraReady && devices.length > 0 && (
          <select
            className="camera-device-select"
            value={deviceId}
            onChange={(event) => {
              const next = event.target.value;
              setDeviceId(next);
              void startCamera(next);
            }}
            title="切换摄像头（含外接 USB 摄像头）"
          >
            <option value="">系统默认摄像头</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "外接摄像头"}
              </option>
            ))}
          </select>
        )}

        <div className="camera-actions">
          <button
            type="button"
            className="camera-btn"
            onClick={() => void withCamera(capturePhoto)}
            disabled={camState === "requesting"}
            title="拍摄当前画面并直接进行 YOLO 诊断"
          >
            <Camera size={14} />
            拍照诊断
          </button>
          <button
            type="button"
            className={`camera-btn ${recording ? "recording" : ""}`}
            onClick={() => {
              if (recording) {
                stopRecording();
              } else {
                void withCamera(startRecording);
              }
            }}
            disabled={camState === "requesting" && !recording}
            title="录制 5~10 秒作物视频，自动截取关键帧诊断"
          >
            {recording ? (
              <>
                <Square size={14} />
                停止录像
              </>
            ) : (
              <>
                <VideoIcon size={14} />
                录像诊断
              </>
            )}
          </button>
        </div>
      </div>

      <p className="camera-tip">
        <RefreshCcw size={12} />
        拍摄时保持光线充足、画面平稳，对准病叶正反面或茎秆；视频自动均匀抽帧 + 场景变化加权提取关键帧。
      </p>
      <small className="camera-note">
        作物类型与症状描述沿用上方表单，可直接修改。
      </small>
    </div>
  );
}

export function DiagnosisPage() {
  const [result, setResult] = useState<DiagnosisRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showAnnotated, setShowAnnotated] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraCaptured, setCameraCaptured] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const videoResult =
    result && (result as VideoDiagnosisRecord).sourceType === "video"
      ? (result as VideoDiagnosisRecord)
      : null;

  function setSelectedPreview(file: File, fromCamera: boolean) {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCameraCaptured(fromCamera);
    setResult(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedPreview(file, false);
    }
  }

  function readFormValue(name: string): string | undefined {
    const form = formRef.current;
    if (!form) return undefined;
    const element = form.elements.namedItem(name);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element.value;
    }
    return undefined;
  }

  async function runDiagnosis(
    kind: "photo" | "video",
    file: File,
  ): Promise<void> {
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("cropType", readFormValue("cropType") ?? "玉米");
      const symptom = readFormValue("symptomDescription");
      if (symptom) formData.set("symptomDescription", symptom);
      formData.set(kind === "photo" ? "image" : "video", file);
      const record =
        kind === "photo"
          ? await api.createDiagnosis(formData)
          : await api.diagnoseVideo(formData);
      setResult(record);
      setShowAnnotated(Boolean(record.annotatedImageUrl));
      if (kind === "photo") {
        setPreviewUrl(null);
        setSelectedFile(null);
        setCameraCaptured(false);
      }
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFile) {
      await runDiagnosis("photo", selectedFile);
      return;
    }
    alert("请先选择或拍摄一张作物照片。");
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
            玉米 11 类病虫害检测 · 支持照片/视频
          </span>
        </div>
      </div>

      <div className="two-column diagnosis-layout">
        <div className="diagnosis-left-col">
          <DiagnosisCameraPanel
            formRef={formRef}
            onPhotoCapture={(file) => setSelectedPreview(file, true)}
            onVideoCapture={(file) => void runDiagnosis("video", file)}
            onBusyChange={setLoading}
            onError={(message) =>
              alert(
                message ||
                  "摄像头操作失败，请检查权限与设备状态。",
              )
            }
          />

          <form className="form-panel" ref={formRef} onSubmit={handleSubmit}>
            <h2>上传病害样本</h2>

            <label>
              作物类型
              <select name="cropType" defaultValue="玉米">
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
              />
            </label>

            {previewUrl && (
              <div className="image-preview-card">
                <div className="preview-header">
                  <small>
                    {cameraCaptured ? "已拍摄照片预览" : "已选本地图片预览"}
                  </small>
                  {selectedFile && (
                    <small className="file-size">
                      {(selectedFile.size / 1024).toFixed(0)} KB
                    </small>
                  )}
                </div>
                <img
                  src={previewUrl}
                  alt="待检测作物"
                  className="preview-img"
                />
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
              {loading
                ? "YOLO 视觉检测与大模型分析中..."
                : "启动 YOLO 智能诊断"}
            </button>
          </form>
        </div>

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
                  <span>YOLO 未完成本次检测：{result.visionError}</span>
                </div>
              )}

              {/* 视频关键帧抽帧分析 */}
              {videoResult && videoResult.keyFrames && videoResult.keyFrames.length > 0 && (
                <div className="video-keyframes-section">
                  <div className="keyframes-header">
                    <h4>
                      <Film size={15} /> 视频关键帧抽帧分析
                    </h4>
                    <a
                      href={videoResult.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vision-zoom-link"
                      title="在新标签页查看原始视频"
                    >
                      <ExternalLink size={13} />
                      查看原始视频
                    </a>
                  </div>
                  <p className="keyframes-summary">
                    从视频中自动抽取{" "}
                    <strong>{videoResult.keyFrames.length}</strong> 个关键帧
                    {videoResult.frameCount
                      ? `（视频总帧数 ${videoResult.frameCount}）`
                      : ""}
                    ，逐帧完成 YOLO 目标识别并按病害类别跨帧聚合。
                  </p>
                  <div className="keyframes-grid">
                    {videoResult.keyFrames.map((keyFrame, index) => (
                      <div className="keyframe-card" key={index}>
                        <div className="keyframe-img-wrap">
                          <img
                            src={keyFrame.annotatedUrl ?? keyFrame.imageUrl}
                            alt={`关键帧 ${index + 1}`}
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (
                                !target.dataset.triedFallback &&
                                target.src.includes("/uploads/")
                              ) {
                                target.dataset.triedFallback = "true";
                                target.src = target.src.replace(
                                  "/uploads/",
                                  "/api/uploads/",
                                );
                              }
                            }}
                          />
                          {keyFrame.annotatedUrl && (
                            <span className="keyframe-badge">
                              <Layers size={11} />
                              YOLO 标注
                            </span>
                          )}
                        </div>
                        <div className="keyframe-meta">
                          <span className="keyframe-time">
                            第 {index + 1} 帧 · t={keyFrame.timeSec}s
                          </span>
                          <span className="keyframe-disease">
                            {keyFrame.topDisease}
                          </span>
                          <span className="keyframe-conf">
                            {(keyFrame.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
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
                        原始画面
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
                      title="在新标签页中查看高清大图"
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
                  <span className="summary-label">
                    {videoResult ? "视频关键帧聚合诊断" : "疑似病害 / 侵染诊断"}
                  </span>
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
              <h3>请上传、拍摄或录制作物病叶照片/视频</h3>
              <p>
                系统将自动调用本地 <strong>YOLOv11</strong>{" "}
                深度视觉模型进行像素级目标检测，并在病斑区域绘制高亮边界框；视频会自动截取关键帧逐帧识别，结合农技知识库与大模型生成专业防治处方。
              </p>

              <div className="feature-badges">
                <span>⚡ 毫秒级边缘视觉推理</span>
                <span>🎥 视频关键帧抽帧识别</span>
                <span>💊 科学用药与稀释配比处方</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
