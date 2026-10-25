import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMessage, LlmStatus } from "@agri/shared";
import { api } from "../services/api";
import type { AvatarAction } from "../components/avatarActions";
import {
  AssistantContext,
  type AssistantTask,
  type CameraPreset,
  type CompanionMode,
} from "./assistantContext";
import { usePatrolDemo } from "./usePatrolDemo";

const initialTask: AssistantTask = {
  title: "农小贝已就绪",
  phase: "idle",
  detail: "陪你查看农业数据、分析叶片与整理巡田报告。",
};
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const patrol = usePatrolDemo();
  const patrolActive = Boolean(
    patrol.run && !["complete", "cancelled"].includes(patrol.run.status),
  );
  const patrolActiveRef = useRef(false);
  patrolActiveRef.current = patrolActive;
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      createdAt: new Date().toISOString(),
      content:
        "你好，我是农小贝。无论你在查看农业数据、作物问诊还是巡田报告，我都会陪在你身边。你想先了解什么？",
    },
  ]);
  const [input, setInput] = useState("");
  const [task, setTask] = useState(initialTask);
  const restingTaskRef = useRef<AssistantTask>(initialTask);
  const [busy, setBusy] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [camera, setCamera] = useState<CameraPreset>("full");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [companionMode, setCompanionMode] = useState<CompanionMode>("compact");
  const [speaking, setSpeaking] = useState(false);
  const [overrideAction, debugAction] = useState<AvatarAction | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef("");
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    api
      .getLlmStatus(controller.signal)
      .then(setLlmStatus)
      .catch(() => undefined);
    return () => {
      mountedRef.current = false;
      controller.abort();
      requestRef.current?.abort();
      requestRef.current = null;
      if (speechRef.current) {
        speechRef.current = null;
        window.speechSynthesis?.cancel();
      }
    };
  }, []);
  const selectCamera = useCallback((value: CameraPreset) => {
    setCamera(value);
    setCameraRevision((current) => current + 1);
  }, []);
  const stopSpeech = useCallback(() => {
    speechRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  const sendMessage = useCallback(
    async (content = input) => {
      const text = content.trim();
      if (!text || requestRef.current || patrolActiveRef.current) return;
      stopSpeech();
      debugAction(null);
      const controller = new AbortController();
      requestRef.current = controller;
      lastQuestionRef.current = text;
      setInput("");
      setBusy(true);
      setTask({
        title: text,
        phase: "analyzing",
        detail: "正在处理你的问题，切换页面不会中断。",
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          createdAt: new Date().toISOString(),
        },
      ]);
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 60000);
      try {
        const reply = await api.sendAgentMessage(text, controller.signal);
        if (!mountedRef.current || requestRef.current !== controller) return;
        setMessages((current) => [...current, reply]);
        setTask({
          title: text,
          phase: "complete",
          detail: "回答已准备好，可以继续追问。",
        });
      } catch (error) {
        if (!mountedRef.current || requestRef.current !== controller) return;
        const detail = timedOut
          ? "等待回复超时，请稍后重试。"
          : error instanceof Error
            ? error.message
            : "服务暂时不可用，请重试。";
        setTask({ title: text, phase: "error", detail });
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `这次未能完成回答：${detail}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        window.clearTimeout(timeout);
        if (mountedRef.current && requestRef.current === controller) {
          requestRef.current = null;
          setBusy(false);
        }
      }
    },
    [input, stopSpeech],
  );
  const cancelRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setTask({
      title: "已停止等待回复",
      phase: "idle",
      detail: "问题已保留。已发送到服务器的操作可能仍在处理，请查看相关记录。",
    });
  }, []);
  const setListening = useCallback((value: boolean) => {
    if (requestRef.current || patrolActiveRef.current) return;
    setTask((current) => {
      if (value && (current.phase === "idle" || current.phase === "complete")) {
        restingTaskRef.current = current;
        return {
          title: "请告诉我你的问题",
          phase: "listening",
          detail: "在输入框中输入，按 Enter 发送。",
        };
      }
      return !value && current.phase === "listening"
        ? restingTaskRef.current
        : current;
    });
  }, []);
  const speakLastReply = useCallback(() => {
    if (
      !("speechSynthesis" in window) ||
      requestRef.current ||
      patrolActiveRef.current
    )
      return;
    if (speechRef.current) {
      stopSpeech();
      return;
    }
    const text = [...messages]
      .reverse()
      .find((message) => message.role === "assistant")?.content;
    if (!text) return;
    const speech = new SpeechSynthesisUtterance(text.replace(/[#*_`>]/g, ""));
    speech.lang = "zh-CN";
    speech.onstart = () => {
      if (speechRef.current === speech) setSpeaking(true);
    };
    const finish = () => {
      if (speechRef.current !== speech || !mountedRef.current) return;
      speechRef.current = null;
      setSpeaking(false);
    };
    speech.onend = finish;
    speech.onerror = finish;
    speechRef.current = speech;
    window.speechSynthesis.speak(speech);
  }, [messages, stopSpeech]);
  const run = patrol.run;
  const stepId = run?.steps[run.currentStep]?.id;
  const patrolPhase =
    run?.status === "failed"
      ? "error"
      : run?.status === "paused"
        ? "paused"
        : stepId === "observe"
          ? "patrolling"
          : stepId === "environment" && run?.environment?.risk
            ? "warning"
            : stepId === "vision"
              ? "diagnosing"
              : stepId === "advice" || stepId === "save"
                ? "reporting"
                : "analyzing";
  const displayTask: AssistantTask =
    patrolActive && run
      ? {
          title: `仿真巡田 · ${run.scenario.name}`,
          phase: patrolPhase,
          detail: run.caption,
        }
      : task;
  const narratedReport = useRef<string | null>(null);
  useEffect(() => {
    if (
      run?.status !== "complete" ||
      !run.reportId ||
      narratedReport.current === run.reportId
    )
      return;
    narratedReport.current = run.reportId;
    setMessages((current) => [
      ...current,
      {
        id: run.reportId!,
        role: "assistant",
        content: `仿真巡田报告已保存。${run.environment?.explanation ?? ""}\n\n视觉结果为演示预设，不是真实诊断。请到历史记录查看证据并完成人工复核。`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTask({
      title: "仿真巡田完成",
      phase: "complete",
      detail: "报告与人工复核任务已保存，可在历史记录查看。",
    });
  }, [run]);
  useEffect(() => {
    if (!patrolActive) return;
    stopSpeech();
    debugAction(null);
    selectCamera(
      stepId === "vision" || stepId === "environment" ? "portrait" : "full",
    );
  }, [patrolActive, stepId, selectCamera, stopSpeech]);
  const action: AvatarAction =
    overrideAction ??
    (speaking
      ? "Talking"
      : busy ||
          (patrolActive && run?.status === "running" && stepId !== "observe")
        ? "Thinking"
        : task.phase === "listening"
          ? "Listening"
          : "Idle");
  return (
    <AssistantContext.Provider
      value={{
        messages,
        input,
        setInput,
        task: displayTask,
        busy,
        patrolActive,
        patrol,
        action,
        llmStatus,
        reducedMotion,
        setReducedMotion,
        camera,
        cameraRevision,
        selectCamera,
        companionMode,
        setCompanionMode,
        sendMessage,
        cancelRequest,
        retryRequest: () => {
          void sendMessage(lastQuestionRef.current);
        },
        setListening,
        speaking,
        speakLastReply,
        debugAction,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}
