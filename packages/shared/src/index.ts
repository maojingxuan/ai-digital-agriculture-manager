export type RiskLevel = "low" | "medium" | "high";
export * from "./patrolDemo.js";
export type AppRole = "admin" | "user";

export interface AuthUser {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: AppRole;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
export type DataStatus = "normal" | "high" | "low" | "risk";
export type SensorType = "temperature" | "humidity" | "soil_moisture" | "light" | "co2" | "water_level";

export interface AgricultureMetric {
  key: SensorType;
  label: string;
  value: number;
  unit: string;
  status: DataStatus;
  suggestion: string;
  trend: "up" | "down" | "stable";
  timestamp: string;
}

export interface AgricultureSnapshot {
  greenhouseId: string;
  farmName: string;
  updatedAt: string;
  metrics: AgricultureMetric[];
  summary: string;
  status: GreenhouseStatus;
}

export interface GreenhouseSummary {
  id: string;
  name: string;
  location?: string;
  area?: number;
  status: GreenhouseStatus;
}

export interface SensorSummary {
  id: string;
  greenhouseId: string;
  name: string;
  sensorType: SensorType;
  unit: string;
  status: "online" | "offline" | "maintenance";
}

export interface SensorDataPoint {
  greenhouseId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: string;
  status: DataStatus;
}

export interface SensorHistorySeries {
  sensorType: SensorType;
  label: string;
  unit: string;
  points: SensorDataPoint[];
}

export interface SensorAnomaly {
  id: string;
  greenhouseId: string;
  greenhouseName: string;
  sensorType: SensorType;
  label: string;
  value: number;
  unit: string;
  level: Exclude<DataStatus, "normal">;
  message: string;
  timestamp: string;
}

export interface AiRecommendation {
  text: string;
  /** 建议提出时间：有异常时对应来源异常的时间，无异常时为生成时刻 */
  time: string;
}

export interface EnvironmentDashboard {
  greenhouse: GreenhouseSummary;
  realtime: AgricultureSnapshot;
  history: SensorHistorySeries[];
  anomalies: SensorAnomaly[];
  recommendations: AiRecommendation[];
}

export type GreenhouseStatus = "optimal" | "attention" | "warning";

export interface YoloDetection {
  classId: number;
  labelEn: string;
  labelZh: string;
  crop: string;
  category: string;
  riskLevel: RiskLevel;
  description: string;
  confidence: number;
  box: number[];
}

export interface DiagnosisRecord {
  id: string;
  cropType: string;
  symptomDescription?: string;
  imageUrl?: string;
  annotatedImageUrl?: string;
  suspectedDisease: string;
  confidence: number;
  riskLevel: RiskLevel;
  analysis: string;
  suggestion: string;
  modelName?: string;
  detections?: YoloDetection[];
  ragReferences?: string[];
  visionError?: string;
  createdAt: string;
}

/** 视频关键帧诊断：单个被抽取的关键帧及其逐帧检测摘要 */
export interface VideoKeyFrame {
  index: number;
  timeSec: number;
  imageUrl?: string;
  annotatedUrl?: string;
  detectionsCount: number;
  topDisease: string;
  confidence: number;
}

/** 视频关键帧诊断记录：摄像头拍摄的视频经过关键帧抽取 + YOLO 逐帧识别 */
export interface VideoDiagnosisRecord extends DiagnosisRecord {
  sourceType: "video";
  videoUrl?: string;
  framesAnalyzed?: number;
  frameCount?: number;
  keyFrames?: VideoKeyFrame[];
}

export interface PatrolReport {
  id: string;
  plotName: string;
  cropName: string;
  imageUrl?: string;
  growthStatus: string;
  anomalies: string[];
  environmentRisk: string;
  suggestion: string;
  conclusion: string;
  createdAt: string;
  demo?: import("./patrolDemo.js").DemoReportEvidence;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  origin: string;
  harvestTime?: string;
  cultivationMethod?: string;
  traceabilityInfo?: string;
  description?: string;
  avatarScript?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceSummary {
  id: string;
  greenhouseId: string;
  name: string;
  deviceType: string;
  status: string;
  lastOnlineAt?: string | null;
  running: boolean;
  lastOpenedAt?: string | null;
  greenhouse: { id: string; name: string };
}

export interface DeviceCommandSummary {
  id: string;
  deviceId: string;
  command: string;
  parameters: unknown;
  operator: string;
  executionStatus: string;
  createdAt: string;
  executedAt?: string | null;
  device: DeviceSummary;
  operatorUser?: { id: string; name: string; role: string } | null;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  category: string;
  sourceType: string;
  fileName?: string | null;
  contentHash: string;
  metadata?: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    chunks: number;
  };
}

export interface KnowledgeCategoryCount {
  category: string;
  count: number;
}

export interface KnowledgeDocumentPage {
  items: KnowledgeDocumentSummary[];
  total: number;
  totalChunks: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  categories: KnowledgeCategoryCount[];
}

export interface KnowledgeChunkItem {
  id: string;
  documentId: string;
  chunkIndex: number;
  title: string;
  content: string;
  tokenCount: number;
  createdAt: string;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  documentTitle: string;
  category: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  score: number;
}

export interface LlmStatus {
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
}

export const modules = [
  { key: "workspace", label: "数字人工作台", path: "/" },
  { key: "knowledge", label: "农业知识库", path: "/knowledge" },
  { key: "diagnosis", label: "AI农业问诊", path: "/diagnosis" },
  { key: "patrol", label: "AI巡田", path: "/patrol" },
  { key: "data", label: "农业数据", path: "/data" },
  { key: "devices", label: "设备控制", path: "/devices" },
  { key: "products", label: "农产品管理", path: "/products" },
  { key: "records", label: "历史记录", path: "/records" },
  { key: "settings", label: "系统设置", path: "/settings" }
] as const;
