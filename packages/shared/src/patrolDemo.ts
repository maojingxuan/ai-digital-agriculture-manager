export type DemoScenarioId = "normal" | "high-humidity";
export type DemoStepId =
  "observe" | "environment" | "vision" | "knowledge" | "advice" | "save";
export type DemoRunStatus =
  "running" | "paused" | "cancelled" | "failed" | "complete";
export interface DemoScenario {
  id: DemoScenarioId;
  name: string;
  plotName: string;
  humidity: number;
  temperature: number;
  soilMoisture: number;
  imageUrl: string;
  imageSource: string;
  visualFinding: string;
}
export interface DemoKnowledgeSource {
  id: string;
  title: string;
  url: string;
  reviewedAt: string;
  content: string;
  tags: string[];
  score?: number;
}
export interface DemoEnvironmentEvidence {
  humidity: number;
  threshold: number;
  temperature: number;
  soilMoisture: number;
  risk: boolean;
  source: "simulation";
  explanation: string;
}
export interface DemoVisualEvidence {
  mode: "illustrative-preset";
  imageUrl: string;
  source: string;
  finding: string;
  notice: string;
}
export interface DemoStep {
  id: DemoStepId;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  detail: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}
export interface DemoReview {
  id: string;
  title: string;
  checklist: string[];
  status: "open" | "resolved";
  resolvedAt?: string;
}
export interface DemoReportEvidence {
  version: "patrol-demo-v1";
  runId: string;
  scenarioName: string;
  environment: DemoEnvironmentEvidence;
  visual: DemoVisualEvidence;
  sources: DemoKnowledgeSource[];
  recommendations: string[];
  review: DemoReview;
  notice: string;
}
export interface DemoRun {
  id: string;
  userId: string;
  scenario: DemoScenario;
  humidity: number;
  threshold: number;
  status: DemoRunStatus;
  steps: DemoStep[];
  currentStep: number;
  caption: string;
  createdAt: string;
  updatedAt: string;
  nextAdvanceAt?: string;
  presentationRemainingMs?: number;
  error?: string;
  environment?: DemoEnvironmentEvidence;
  visual?: DemoVisualEvidence;
  sources?: DemoKnowledgeSource[];
  recommendations?: string[];
  reportId?: string;
  review?: DemoReview;
}
export interface StartDemoInput {
  scenarioId: DemoScenarioId;
  humidity: number;
  threshold: number;
  requestKey: string;
}
export type DemoCommand = "pause" | "resume" | "cancel" | "retry";

export const demoStepTitles: Record<DemoStepId, string> = {
  observe: "读取仿真环境",
  environment: "判断环境风险",
  vision: "查看叶片演示",
  knowledge: "检索本地知识",
  advice: "整理建议与复核",
  save: "保存巡田报告",
};
