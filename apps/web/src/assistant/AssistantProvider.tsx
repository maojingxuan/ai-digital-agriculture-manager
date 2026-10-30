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

// ---- Web Speech API (Chrome/Edge 自带) 类型声明 ----
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  length: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

const initialTask: AssistantTask = {
  title: "小墨已就绪",
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
        "你好，我是小墨。无论你在查看农业数据、作物问诊还是巡田报告，我都会陪在你身边。你想先了解什么？",
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
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [micListening, setMicListening] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const micSupported = Boolean(
    typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition),
  );
  const [overrideAction, debugAction] = useState<AvatarAction | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef("");
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakSeqRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micFinalRef = useRef("");
  const inputRef = useRef("");
  inputRef.current = input;
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    api
      .getLlmStatus(controller.signal)
      .then(setLlmStatus)
      .catch(() => undefined);
    // 加载系统语音列表（中文优先）
    const loadVoices = () => {
      const all = window.speechSynthesis?.getVoices() ?? [];
      const zh = all.filter((v) => v.lang.toLowerCase().startsWith("zh"));
      setAvailableVoices(zh.length > 0 ? zh : all);
      setVoiceName((current) => {
        if (current && all.some((v) => v.name === current)) return current;
        // 默认选第一个中文女声
        const preferred =
          zh.find((v) => /female|女|xiaoxiao|xiaoyi|yunjian|huihui|tingting/i.test(v.name)) ??
          zh[0] ??
          all[0];
        return preferred?.name ?? "";
      });
    };
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => {
      mountedRef.current = false;
      controller.abort();
      requestRef.current?.abort();
      requestRef.current = null;
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onplay = null;
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    speechRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  // 回退：浏览器本地 TTS
  const speakLocal = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window)) return;
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = "zh-CN";
      speech.rate = 1.05;
      const allVoices = window.speechSynthesis.getVoices();
      const chosen = voiceName
        ? allVoices.find((v) => v.name === voiceName)
        : undefined;
      if (chosen) {
        speech.voice = chosen;
        speech.lang = chosen.lang || "zh-CN";
      }
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
    },
    [voiceName],
  );
  const speakText = useCallback(
    async (rawText: string) => {
      if (!rawText.trim()) return;
      stopSpeech();
      const seq = ++speakSeqRef.current;
      const text = rawText.replace(/[#*_`>]/g, "");
      // 1) 优先走豆包 TTS
      try {
        const blob = await api.synthesizeSpeech(text);
        // 期间如果又有新的播报请求，丢弃这次过期的结果
        if (!mountedRef.current || speakSeqRef.current !== seq) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.loop = false;
        audioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        const finish = () => {
          if (audioRef.current !== audio) return;
          audioRef.current = null;
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onended = finish;
        audio.onerror = finish;
        await audio.play();
        return;
      } catch {
        // 2) 豆包失败，回退浏览器本地 TTS
        if (!mountedRef.current || speakSeqRef.current !== seq) return;
        speakLocal(text);
      }
    },
    [stopSpeech, speakLocal],
  );
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
        // 回答回来后自动播报（数字人念出来）
        if (autoSpeakRef.current && reply.content) {
          speakText(reply.content);
        }
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
    [input, stopSpeech, speakText],
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
    speakText(text);
  }, [messages, stopSpeech, speakText]);
  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((value) => {
      const next = !value;
      if (!next) stopSpeech();
      return next;
    });
  }, [stopSpeech]);
  const stopMicListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setMicListening(false);
  }, []);
  const startMicListening = useCallback(() => {
    const Ctor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor || requestRef.current || patrolActiveRef.current) return;
    stopSpeech();
    if (recognitionRef.current) {
      stopMicListening();
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    micFinalRef.current = inputRef.current;
    recognition.onstart = () => {
      if (!mountedRef.current) return;
      setMicListening(true);
      setTask((current) => {
        restingTaskRef.current = current;
        return {
          title: "正在聆听…",
          phase: "listening",
          detail: "请说出你的农业问题，说完再点一下麦克风结束。",
        };
      });
    };
    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) micFinalRef.current += final;
      // 实时把识别文本回显到输入框
      setInput(micFinalRef.current + interim);
    };
    recognition.onerror = (event) => {
      if (!mountedRef.current) return;
      setMicListening(false);
      const reason =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "麦克风权限被拒绝，请在地址栏允许后重试。"
          : event.error === "no-speech"
            ? "没有检测到语音，请靠近麦克风再试。"
            : event.error === "network"
              ? "浏览器在线语音识别服务在当前网络下不可用（Chromium 内核浏览器默认走 Google 识别服务，国内网络通常连不上）。建议：1) 换用最新版 Chrome 并配置可访问 Google 的网络；2) 或直接在输入框打字提问。数字人语音播报不受影响。"
              : event.error === "audio-capture"
                ? "未检测到麦克风设备，请检查麦克风是否插入。"
                : `语音识别出错：${event.error}。`;
      setTask({
        title: "语音输入未启动",
        phase: "error",
        detail: reason,
      });
    };
    recognition.onend = () => {
      if (!mountedRef.current) return;
      recognitionRef.current = null;
      setMicListening(false);
      // 如果已经在 onerror 里设了 error 状态，不要覆盖回 idle
      setTask((current) =>
        current.phase === "listening" ? restingTaskRef.current : current,
      );
      const text = (micFinalRef.current + "").trim();
      micFinalRef.current = "";
      if (text) {
        void sendMessage(text);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setMicListening(false);
    }
  }, [sendMessage, stopMicListening, stopSpeech]);
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
          title: `AI巡田 · ${run.scenario.name}`,
          phase: patrolPhase,
          detail: run.caption,
        }
      : task;
  const narratedReport = useRef<string | null>(null);
  const prevRunStatus = useRef<string | null>(null);
  useEffect(() => {
    const wasRunning = prevRunStatus.current === "running";
    prevRunStatus.current = run?.status ?? null;
    if (
      run?.status !== "complete" ||
      !run.reportId ||
      narratedReport.current === run.reportId ||
      !wasRunning
    )
      return;
    narratedReport.current = run.reportId;
    setMessages((current) => [
      ...current,
      {
        id: run.reportId!,
        role: "assistant",
        content: `巡田报告已保存。${run.environment?.explanation ?? ""}\n\n环境数据来自农业环境数据中心，视觉结果为演示预设，不是真实诊断。请到历史记录查看证据并完成人工复核。`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTask({
      title: "巡田完成",
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
        micSupported,
        micListening,
        startMicListening,
        stopMicListening,
        autoSpeak,
        toggleAutoSpeak,
        voiceName,
        setVoiceName,
        availableVoices,
        debugAction,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}
