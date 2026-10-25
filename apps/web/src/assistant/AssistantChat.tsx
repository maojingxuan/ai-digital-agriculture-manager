import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Square, Volume2, VolumeX } from "lucide-react";
import { useAssistant } from "./assistantContext";

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
      aria-label="与农小贝对话"
    >
      <div className="assistant-chat-heading">
        <div>
          <strong>与农小贝对话</strong>
          <small>跨页面保留当前对话</small>
        </div>
        <button
          className="icon-button"
          disabled={
            assistant.busy ||
            assistant.patrolActive ||
            !("speechSynthesis" in window)
          }
          onClick={assistant.speakLastReply}
          aria-label={
            assistant.speaking ? "停止浏览器播报" : "浏览器播报最近回答"
          }
          title="使用浏览器语音播报"
        >
          {assistant.speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </div>
      <div
        className="chat-list"
        ref={listRef}
        tabIndex={0}
        aria-label="对话记录"
      >
        {assistant.messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            {message.role === "assistant" ? (
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
          <button className="secondary-button" onClick={assistant.retryRequest}>
            重试
          </button>
        </div>
      )}
      {!compact && (
        <div className="quick-prompts">
          {[
            "今日环境怎么样？",
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
        <input
          aria-label="向农小贝提问"
          value={assistant.input}
          disabled={assistant.busy || assistant.patrolActive}
          onFocus={() => assistant.setListening(true)}
          onBlur={() => assistant.setListening(false)}
          onChange={(event) => assistant.setInput(event.target.value)}
          placeholder={
            assistant.patrolActive
              ? "请先完成或取消当前巡田"
              : assistant.busy
                ? "分析中，可切换页面…"
                : "输入农业问题…"
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
