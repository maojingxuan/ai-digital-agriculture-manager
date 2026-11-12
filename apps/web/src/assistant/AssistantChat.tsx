import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  CloudSun,
  Droplets,
  Gauge,
  Lightbulb,
  Mic,
  MicOff,
  Send,
  Square,
  Thermometer,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { useAssistant } from "./assistantContext";

const demoMetrics = [
  { label: "空气温度", value: "21.4℃", status: "正常", icon: Thermometer },
  { label: "空气湿度", value: "86%", status: "偏高", icon: Droplets, warning: true },
  { label: "土壤湿度", value: "50%", status: "正常", icon: Waves },
  { label: "光照强度", value: "1200 lux", status: "正常", icon: Lightbulb },
  { label: "CO₂", value: "561 ppm", status: "正常", icon: CloudSun },
  { label: "水箱水位", value: "54%", status: "正常", icon: Gauge },
];

function DemoGreenhouseStatusCard() {
  return (
    <article className="demo-status-card" aria-label="1号玉米大棚固定演示快照">
      <header>
        <div>
          <span className="demo-status-eyebrow">演示模式 · 固定快照</span>
          <strong>1号玉米大棚</strong>
          <small>环境状态总览</small>
        </div>
        <span className="demo-status-overall">5 项正常</span>
      </header>
      <div className="demo-status-metrics">
        {demoMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              className={`demo-status-metric ${metric.warning ? "is-warning" : ""}`}
              key={metric.label}
            >
              <Icon size={18} aria-hidden="true" />
              <span>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </span>
              <em>{metric.status}</em>
            </div>
          );
        })}
      </div>
      <div className="demo-status-warning">
        <AlertTriangle size={19} aria-hidden="true" />
        <span>
          <strong>1 项指标需要关注：空气湿度 86%</strong>
          <small>建议短时通风排湿，暂缓喷淋，并持续观察湿度变化。</small>
        </span>
      </div>
    </article>
  );
}

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const assistant = useAssistant();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list)
      list.scrollTo({
        top: list.scrollHeight,
        behavior: assistant.reducedMotion ? "instant" : "smooth",
      });
  }, [assistant.messages, assistant.busy, assistant.reducedMotion]);
  return (
    <section
      className={`chat-panel assistant-chat ${compact ? "assistant-chat-compact" : ""} ${assistant.reducedMotion ? "is-reduced-motion" : ""}`}
      aria-label="与小墨对话"
    >
      <div className="assistant-chat-heading">
        <div>
          <strong>与小墨对话</strong>
          <small>跨页面保留当前对话</small>
        </div>
        <div className="assistant-chat-heading-actions">
          <button
            className={`icon-button ${assistant.autoSpeak ? "is-on" : ""}`}
            onClick={assistant.toggleAutoSpeak}
            aria-label={
              assistant.autoSpeak ? "关闭回答自动播报" : "开启回答自动播报"
            }
            title={
              assistant.autoSpeak
                ? "回答后自动念出（已开启）"
                : "回答后自动念出（已关闭）"
            }
          >
            {assistant.autoSpeak ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            className="icon-button"
            disabled={assistant.busy || assistant.patrolActive}
            onClick={assistant.speakLastReply}
            aria-label={assistant.speaking ? "停止语音播报" : "播报最近回答"}
            title={assistant.speaking ? "停止语音播报" : "播报最近回答"}
          >
            {assistant.speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </div>
      <div
        className="chat-list"
        ref={listRef}
        tabIndex={0}
        aria-label="对话记录"
      >
        {assistant.messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            {message.presentation === "demo-greenhouse-status" ? (
              <DemoGreenhouseStatusCard />
            ) : message.role === "assistant" ? (
              <div className="markdown-body">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            ) : (
              message.content
            )}
          </div>
        ))}
        {assistant.busy && (
          <div className="message assistant loading-message" role="status">
            <span className="typing-indicator" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>正在分析…</span>
          </div>
        )}
      </div>
      {assistant.task.phase === "error" && (
        <div className="assistant-retry" role="alert">
          <span>{assistant.task.detail}</span>
          {assistant.task.retryAction && (
            <button
              className="secondary-button"
              onClick={
                assistant.task.retryAction === "microphone"
                  ? assistant.startMicListening
                  : assistant.retryRequest
              }
            >
              {assistant.task.retryAction === "microphone"
                ? "重试语音输入"
                : "重试"}
            </button>
          )}
        </div>
      )}
      {!compact && (
        <div className="quick-prompts">
          {[
            "1号玉米大棚环境怎么样？",
            "帮我做作物问诊",
            "生成巡田报告",
            "介绍我的农产品",
          ].map((prompt) => (
            <button
              key={prompt}
              disabled={assistant.busy || assistant.patrolActive}
              onClick={() => void assistant.sendMessage(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-input assistant-input"
        onSubmit={(event) => {
          event.preventDefault();
          void assistant.sendMessage();
        }}
      >
        <button
          type="button"
          className={`primary-icon-button mic-button ${assistant.micListening ? "is-recording" : ""}`}
          disabled={assistant.busy || assistant.patrolActive}
          onClick={() => {
            if (assistant.micListening) assistant.stopMicListening();
            else assistant.startMicListening();
          }}
          aria-label={assistant.micListening ? "停止语音输入" : "点击开始语音输入"}
          title={
            assistant.micSupported
              ? assistant.micListening
                ? "正在聆听，点击停止"
                : "点击说话，说完自动发送"
              : "当前浏览器不支持语音识别，请使用 Chrome / Edge"
          }
        >
          {assistant.micListening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <input
          aria-label="向小墨提问"
          value={assistant.input}
          disabled={assistant.busy || assistant.patrolActive || assistant.micListening}
          onFocus={() => assistant.setListening(true)}
          onBlur={() => assistant.setListening(false)}
          onChange={(event) => assistant.setInput(event.target.value)}
          placeholder={
            assistant.micListening
              ? "正在聆听…"
              : assistant.patrolActive
                ? "请先完成或取消当前巡田"
                : assistant.busy
                  ? "分析中，可切换页面…"
                  : "输入或点击麦克风提问…"
          }
        />
        {assistant.busy ? (
          <button
            type="button"
            className="primary-icon-button"
            aria-label="停止等待回复"
            title="停止等待回复"
            onClick={assistant.cancelRequest}
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            className="primary-icon-button"
            aria-label="发送问题"
            title="发送"
            disabled={!assistant.input.trim() || assistant.patrolActive}
          >
            <Send size={18} />
          </button>
        )}
      </form>
      {assistant.patrolActive && (
        <p className="assistant-patrol-chat-note">
          仿真巡田任务进行中，可到巡田页暂停、继续或取消。
        </p>
      )}
    </section>
  );
}
