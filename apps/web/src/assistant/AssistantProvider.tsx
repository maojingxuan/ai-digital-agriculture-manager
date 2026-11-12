import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMessage, LlmStatus } from "@agri/shared";
import { api } from "../services/api";
import { LocalMicRecorder } from "./micRecorder";
import type { AvatarAction } from "../components/avatarActions";
import {
  AssistantContext,
  type AssistantTask,
  type CameraPreset,
  type CompanionMode,
} from "./assistantContext";
import {
  demoGreenhouseAnswer,
  matchesDemoGreenhouseQuestion,
} from "./demoAnswers";
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

function getMicFailure(error: string): { title: string; detail: string } {
  switch (error) {
    case "not-allowed":
      return {
        title: "麦克风权限被拒绝",
        detail: "语音输入失败：请在浏览器地址栏中允许使用麦克风，然后重试。",
      };
    case "service-not-allowed":
      return {
        title: "语音识别服务不可用",
        detail: "语音输入失败：浏览器禁止使用语音识别服务，请检查网站权限或更换 Chrome / Edge。",
      };
    case "audio-capture":
      return {
        title: "未检测到麦克风",
        detail: "语音输入失败：请连接并启用麦克风，确认系统没有禁止浏览器使用它。",
      };
    case "no-speech":
      return {
        title: "没有识别到声音",
        detail: "语音输入失败：没有检测到清晰语音，请靠近麦克风后重试。",
      };
    case "network":
      return {
        title: "语音识别网络异常",
        detail: "语音输入失败：浏览器无法连接语音识别服务，请检查网络后重试，或改用文字输入。",
      };
    case "language-not-supported":
      return {
        title: "不支持中文语音识别",
        detail: "语音输入失败：当前浏览器不支持中文识别，请更换最新版 Chrome / Edge。",
      };
    case "startup-timeout":
      return {
        title: "麦克风启动超时",
        detail: "语音输入失败：麦克风长时间没有响应，请检查权限和设备后重试。",
      };
    case "asr-model-missing":
      return {
        title: "离线语音模型未就绪",
        detail: "语音识别失败：本地识别模型还没有准备好，请稍后重试或联系管理员。",
      };
    case "asr-failed":
      return {
        title: "语音识别失败",
        detail: "语音识别失败：录音已完成但识别出错，请重新点击麦克风再说一遍，或改用文字输入。",
      };
    case "start-failed":
      return {
        title: "麦克风启动失败",
        detail: "语音输入失败：无法启动麦克风，请关闭其他正在录音的应用后重试。",
      };
    case "stop-failed":
      return {
        title: "语音输入异常中断",
        detail: "语音输入失败：未能完成本次识别，请重新点击麦克风后再试。",
      };
    case "unsupported":
      return {
        title: "当前浏览器不支持语音输入",
        detail: "语音输入失败：请使用最新版 Chrome / Edge，或改用文字输入。",
      };
    default:
      return {
        title: "语音输入未启动",
        detail: `语音输入失败（${error}），请检查麦克风和浏览器权限后重试。`,
      };
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
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
  );
  const [overrideAction, debugAction] = useState<AvatarAction | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef("");
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const speakSeqRef = useRef(0);
  // 本地录音器（离线 ASR：getUserMedia → WAV → 后端识别）
  const micRecorderRef = useRef<LocalMicRecorder | null>(null);
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
      // 释放麦克风：卸载时不能留着录音设备
      micRecorderRef.current?.abort();
      micRecorderRef.current = null;
      if (speechRef.current) {
        speechRef.current = null;
        window.speechSynthesis?.cancel();
      }
      speechRequestRef.current?.abort();
      speechRequestRef.current = null;
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);
  const selectCamera = useCallback((value: CameraPreset) => {
    setCamera(value);
    setCameraRevision((current) => current + 1);
  }, []);
  const stopSpeech = useCallback(() => {
    speakSeqRef.current++;
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    speechRef.current = null;
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeaking(false);
  }, []);
  const speakText = useCallback(
    (rawText: string, preferBrowserVoice = false) => {
      const text = rawText.replace(/[#*_`>]/g, "").trim();
      if (!text) return;
      stopSpeech();
      const seq = ++speakSeqRef.current;

      // 固定演示回答优先使用浏览器本地语音，省去后端模型合成时间。
      if (preferBrowserVoice && "speechSynthesis" in window) {
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = "zh-CN";
        speech.rate = 1.08;
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voiceName
          ? voices.find((voice) => voice.name === voiceName)
          : voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"));
        if (selectedVoice) {
          speech.voice = selectedVoice;
          speech.lang = selectedVoice.lang || "zh-CN";
        }
        const finishBrowserSpeech = () => {
          if (seq !== speakSeqRef.current || !mountedRef.current) return;
          speechRef.current = null;
          setSpeaking(false);
        };
        speech.onend = finishBrowserSpeech;
        speech.onerror = finishBrowserSpeech;
        speechRef.current = speech;
        setSpeaking(true);
        window.speechSynthesis.speak(speech);
        return;
      }

      const controller = new AbortController();
      speechRequestRef.current = controller;

      // “正在合成”也属于播报状态，避免用户在首段音频返回前重复点击。
      setSpeaking(true);

      // 按句子切分；播放当前句时预取下一句，缩短句间等待。
      const sentences = text
        .split(/(?<=[。！？!?；;\n])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (sentences.length === 0) {
        speechRequestRef.current = null;
        setSpeaking(false);
        return;
      }

      let idx = 0;
      type SynthesisResult =
        { ok: true; blob: Blob } | { ok: false; error: unknown };
      const loadSentence = async (
        sentence: string,
      ): Promise<SynthesisResult> => {
        try {
          return {
            ok: true,
            blob: await api.synthesizeSpeech(sentence, controller.signal),
          };
        } catch (error) {
          return { ok: false, error };
        }
      };
      let prefetched: Promise<SynthesisResult> | null = loadSentence(
        sentences[0],
      );

      const finish = () => {
        if (seq !== speakSeqRef.current) return;
        speechRequestRef.current = null;
        speechRef.current = null;
        audioRef.current = null;
        setSpeaking(false);
      };

      const fallbackSpeak = (fallbackText: string) => {
        if (
          seq !== speakSeqRef.current ||
          !mountedRef.current ||
          controller.signal.aborted
        )
          return;
        if (!("speechSynthesis" in window)) {
          finish();
          return;
        }
        const speech = new SpeechSynthesisUtterance(fallbackText);
        speech.lang = "zh-CN";
        speech.rate = 1.05;
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voiceName
          ? voices.find((voice) => voice.name === voiceName)
          : undefined;
        if (selectedVoice) {
          speech.voice = selectedVoice;
          speech.lang = selectedVoice.lang || "zh-CN";
        }
        speech.onend = finish;
        speech.onerror = finish;
        speechRef.current = speech;
        window.speechSynthesis.speak(speech);
      };

      const playNext = async () => {
        if (seq !== speakSeqRef.current || !mountedRef.current) return;
        if (idx >= sentences.length) {
          finish();
          return;
        }
        const currentIndex = idx;
        const result = await prefetched!;
        if (
          seq !== speakSeqRef.current ||
          !mountedRef.current ||
          controller.signal.aborted
        )
          return;

        if (!result.ok) {
          fallbackSpeak(sentences.slice(currentIndex).join(""));
          return;
        }

        idx = currentIndex + 1;
        prefetched =
          idx < sentences.length ? loadSentence(sentences[idx]) : null;

        const url = URL.createObjectURL(result.blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audioUrlRef.current = url;

        const releaseAudio = () => {
          if (audioRef.current === audio) audioRef.current = null;
          if (audioUrlRef.current === url) audioUrlRef.current = null;
          URL.revokeObjectURL(url);
        };
        audio.onended = () => {
          if (seq !== speakSeqRef.current) return;
          releaseAudio();
          void playNext();
        };
        audio.onerror = () => {
          if (seq !== speakSeqRef.current) return;
          releaseAudio();
          fallbackSpeak(sentences.slice(currentIndex).join(""));
        };
        try {
          await audio.play();
        } catch {
          if (seq !== speakSeqRef.current) return;
          releaseAudio();
          fallbackSpeak(sentences.slice(currentIndex).join(""));
        }
      };

      void playNext();
    },
    [stopSpeech, voiceName],
  );
  const playDemoSpeech = useCallback(() => {
    stopSpeech();
    const seq = ++speakSeqRef.current;
    const audio = new Audio("/demo/greenhouse-status-answer.wav");
    audioRef.current = audio;

    const releaseAudio = () => {
      if (audioRef.current === audio) audioRef.current = null;
    };
    audio.onended = () => {
      if (seq !== speakSeqRef.current) return;
      releaseAudio();
      setSpeaking(false);
    };
    const fallbackToBrowser = () => {
      if (seq !== speakSeqRef.current) return;
      releaseAudio();
      speakText(demoGreenhouseAnswer.speech, true);
    };
    audio.onerror = fallbackToBrowser;
    setSpeaking(true);
    void audio.play().catch(fallbackToBrowser);
  }, [speakText, stopSpeech]);
  const sendMessage = useCallback(
    async (content = input) => {
      const text = content.trim();
      if (!text || requestRef.current || patrolActiveRef.current) return;
      stopSpeech();
      debugAction(null);
      lastQuestionRef.current = text;
      setInput("");

      if (matchesDemoGreenhouseQuestion(text)) {
        const createdAt = new Date().toISOString();
        const reply: AgentMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: demoGreenhouseAnswer.content,
          createdAt,
          presentation: demoGreenhouseAnswer.presentation,
        };
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
            createdAt,
          },
          reply,
        ]);
        setTask({
          title: "1号玉米大棚环境状态",
          phase: "complete",
          detail: "演示快照已立即展示；其他问题仍会查询实时数据。",
        });
        if (autoSpeakRef.current) {
          playDemoSpeech();
        }
        return;
      }

      const controller = new AbortController();
      requestRef.current = controller;
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
        setTask({
          title: text,
          phase: "error",
          detail,
          retryAction: "request",
        });
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
    [input, playDemoSpeech, stopSpeech, speakText],
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
    if (requestRef.current || patrolActiveRef.current) return;
    // 合成中、后端 WAV 播放中或浏览器 TTS 播放中都视为同一次播报。
    if (
      speaking ||
      speechRequestRef.current ||
      audioRef.current ||
      speechRef.current
    ) {
      stopSpeech();
      return;
    }
    const latestReply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!latestReply?.content) return;
    if (latestReply.presentation === "demo-greenhouse-status") {
      playDemoSpeech();
      return;
    }
    speakText(latestReply.content);
  }, [messages, playDemoSpeech, speaking, stopSpeech, speakText]);
  const toggleAutoSpeak = useCallback(() => {
    const next = !autoSpeakRef.current;
    autoSpeakRef.current = next;
    setAutoSpeak(next);
    if (!next) stopSpeech();
  }, [stopSpeech]);
  const reportMicFailure = useCallback((error: string) => {
    const failure = getMicFailure(error);
    setMicListening(false);
    setTask({
      ...failure,
      phase: "error",
      retryAction: error === "unsupported" ? undefined : "microphone",
    });
  }, []);

  /**
   * 结束录音 → 本地识别 → 自动提交。
   * 用 ref 做去重，避免「用户点击停止」和「静音自动停止」同时触发发两条消息。
   */
  const finishMic = useCallback(
    async (reason: "manual" | "auto" | "no-speech") => {
      const recorder = micRecorderRef.current;
      if (!recorder) return;
      micRecorderRef.current = null;
      setMicListening(false);

      // 还在等待麦克风权限时又被点了一下：静默取消，不报"没识别到声音"
      if (!recorder.isActive()) {
        recorder.abort();
        setTask(restingTaskRef.current);
        return;
      }

      if (reason === "no-speech") {
        recorder.abort();
        reportMicFailure("no-speech");
        return;
      }

      const { blob, hadSpeech } = await recorder.stop();
      if (!blob || !hadSpeech) {
        reportMicFailure("no-speech");
        return;
      }

      if (mountedRef.current) {
        setTask({
          title: "正在识别语音…",
          phase: "analyzing",
          detail: "录音完成，正在本地离线识别。",
        });
      }

      try {
        const text = await api.recognizeSpeech(blob);
        if (!mountedRef.current) return;
        if (!text) {
          reportMicFailure("no-speech");
          return;
        }
        setTask(restingTaskRef.current);
        void sendMessage(text);
      } catch (error) {
        if (!mountedRef.current) return;
        const message = error instanceof Error ? error.message : "";
        reportMicFailure(
          message.includes("模型") ? "asr-model-missing"
            : message.includes("失败") ? "asr-failed"
              : "asr-failed",
        );
      }
    },
    [reportMicFailure, sendMessage],
  );

  const stopMicListening = useCallback(() => {
    void finishMic("manual");
  }, [finishMic]);

  const startMicListening = useCallback(() => {
    if (requestRef.current || patrolActiveRef.current) return;
    if (!micSupported) {
      reportMicFailure("unsupported");
      return;
    }
    // 已经在录音 → 再点一次就是结束
    if (micRecorderRef.current) {
      void finishMic("manual");
      return;
    }
    stopSpeech();
    setTask((current) => {
      if (current.retryAction !== "microphone") {
        restingTaskRef.current = current;
      }
      return {
        title: "正在启动语音输入…",
        phase: "listening",
        detail: "正在请求麦克风权限，请稍候。",
      };
    });

    const recorder = new LocalMicRecorder();
    micRecorderRef.current = recorder;

    recorder
      .start({
        silenceToStopMs: 1500,
        maxDurationMs: 60000,
        noSpeechTimeoutMs: 8000,
        onAutoStop: (reason) => {
          // 回调可能在录音线程里触发，用微任务挪出来，避免重入 stop()
          window.setTimeout(() => {
            if (micRecorderRef.current !== recorder) return;
            void finishMic(reason === "no-speech" ? "no-speech" : "auto");
          }, 0);
        },
      })
      .then(() => {
        if (!mountedRef.current || micRecorderRef.current !== recorder) {
          recorder.abort();
          return;
        }
        setMicListening(true);
        setTask({
          title: "正在聆听…",
          phase: "listening",
          detail: "请说出你的农业问题，说完会自动识别发送；也可再点一次麦克风提前结束。",
        });
      })
      .catch((error: unknown) => {
        if (micRecorderRef.current === recorder) {
          micRecorderRef.current = null;
        }
        recorder.abort();
        const name = error instanceof Error ? error.name : "";
        reportMicFailure(
          name === "NotAllowedError" || name === "SecurityError"
            ? "not-allowed"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "audio-capture"
              : name === "NotReadableError"
                ? "audio-capture"
                : "start-failed",
        );
      });
  }, [finishMic, micSupported, reportMicFailure, stopSpeech]);
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
