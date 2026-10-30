import { createContext, useContext } from "react";
import type { AgentMessage, LlmStatus } from "@agri/shared";
import type { AvatarAction } from "../components/avatarActions";
import type { usePatrolDemo } from "./usePatrolDemo";

export type AssistantPhase =
  | "idle"
  | "listening"
  | "patrolling"
  | "paused"
  | "analyzing"
  | "warning"
  | "diagnosing"
  | "reporting"
  | "complete"
  | "error";
export type CameraPreset = "full" | "portrait" | "close";
export type CompanionMode = "compact" | "expanded" | "hidden";
export type AssistantTask = {
  title: string;
  phase: AssistantPhase;
  detail: string;
};
export const phaseLabels: Record<AssistantPhase, string> = {
  idle: "随时为你服务",
  listening: "正在倾听",
  patrolling: "正在巡田",
  paused: "巡田已暂停",
  analyzing: "正在分析",
  warning: "发现风险",
  diagnosing: "正在问诊",
  reporting: "整理报告",
  complete: "分析完成",
  error: "需要重试",
};
export type AssistantContextValue = {
  messages: AgentMessage[];
  input: string;
  setInput: (value: string) => void;
  task: AssistantTask;
  busy: boolean;
  patrolActive: boolean;
  patrol: ReturnType<typeof usePatrolDemo>;
  action: AvatarAction;
  llmStatus: LlmStatus | null;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  camera: CameraPreset;
  cameraRevision: number;
  selectCamera: (value: CameraPreset) => void;
  companionMode: CompanionMode;
  setCompanionMode: (value: CompanionMode) => void;
  sendMessage: (content?: string) => Promise<void>;
  cancelRequest: () => void;
  retryRequest: () => void;
  setListening: (value: boolean) => void;
  speaking: boolean;
  speakLastReply: () => void;
  micSupported: boolean;
  micListening: boolean;
  startMicListening: () => void;
  stopMicListening: () => void;
  autoSpeak: boolean;
  toggleAutoSpeak: () => void;
  voiceName: string;
  setVoiceName: (name: string) => void;
  availableVoices: SpeechSynthesisVoice[];
  debugAction: (action: AvatarAction | null) => void;
};
export const AssistantContext = createContext<AssistantContextValue | null>(
  null,
);
export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("小墨助手尚未初始化");
  return context;
}
