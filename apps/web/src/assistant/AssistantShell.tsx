import {
  lazy,
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, Maximize2, Minus, X } from "lucide-react";
import { AssistantChat } from "./AssistantChat";
import { phaseLabels, useAssistant } from "./assistantContext";
const XiaoMoAvatar = lazy(() => import("../components/XiaoMoAvatar"));
const pageLabels: Record<string, string> = {
  "/data": "农业数据",
  "/diagnosis": "作物问诊",
  "/patrol": "AI 巡田",
  "/knowledge": "知识库",
  "/products": "农产品",
  "/records": "历史记录",
  "/devices": "设备管理",
  "/settings": "系统设置",
};
export function AssistantShell() {
  const { pathname } = useLocation();
  const assistant = useAssistant();
  const home = pathname === "/";
  const [stageRect, setStageRect] = useState<CSSProperties | null>(null);
  const companionRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const startDrag = (event: ReactPointerEvent) => {
    if (home) return;
    const target = event.target as HTMLElement;
    if (target.closest(".assistant-chat")) return;
    if (target.closest("button, a, input, textarea, label, select")) return;
    const el = companionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    el.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag.current || !companionRef.current) return;
    setDragPos({
      x: event.clientX - drag.current.x,
      y: event.clientY - drag.current.y,
    });
  };
  const endDrag = () => {
    drag.current = null;
  };
  const expanded = !home && assistant.companionMode === "expanded";
  const hidden = !home && assistant.companionMode === "hidden";
  // Track the dashboard slot without reparenting the canvas or reloading GLB.
  useLayoutEffect(() => {
    if (!home) return;
    const slot = document.getElementById("assistant-stage-slot");
    if (!slot) return;
    let frame = 0;
    const measure = () => {
      const rect = slot.getBoundingClientRect();
      setStageRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(slot);
    observer.observe(document.documentElement);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [home]);
  return (
    <>
      <aside
        ref={companionRef}
        className={`assistant-shell ${home ? "assistant-home" : "assistant-companion"} ${expanded ? "is-expanded" : ""} ${hidden ? "is-hidden" : ""}`}
        style={
          home
            ? (stageRect ?? { visibility: "hidden" })
            : dragPos
              ? { left: dragPos.x, top: dragPos.y, right: "auto", bottom: "auto" }
              : undefined
        }
        aria-label="小墨数字人"
        aria-hidden={hidden || undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="assistant-shell-heading" hidden={home}>
          <span>
            <i className={assistant.busy ? "is-busy" : ""} />
            小墨 · {pageLabels[pathname] ?? "随行助手"}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label={expanded ? "收起对话" : "展开对话"}
              aria-expanded={expanded}
              onClick={() =>
                assistant.setCompanionMode(expanded ? "compact" : "expanded")
              }
            >
              {expanded ? <Minus size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              className="icon-button"
              aria-label="隐藏小墨"
              onClick={() => assistant.setCompanionMode("hidden")}
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="assistant-viewport">
          <Suspense
            fallback={
              <div className="xiaomo-loading">正在准备小墨…</div>
            }
          >
            <XiaoMoAvatar
              action={assistant.action}
              cameraPreset="full"
              cameraRevision={assistant.cameraRevision}
              reducedMotion={assistant.reducedMotion}
              active={!hidden}
            />
          </Suspense>
          <div className="assistant-stage-tag">
            {home ? "小墨 · 虚拟农艺专家" : phaseLabels[assistant.task.phase]}
          </div>
        </div>
        {!home && (
          <div className="assistant-companion-caption">
            <span title={assistant.task.detail}>{assistant.task.detail}</span>
            {!expanded && (
              <button onClick={() => assistant.setCompanionMode("expanded")}>
                与我对话
              </button>
            )}
            {expanded && (
              <Link to={assistant.patrolActive ? "/patrol" : "/"}>
                {assistant.patrolActive ? "查看巡田" : "回到主舞台"}
              </Link>
            )}
          </div>
        )}
        {expanded && (
          <>
            <AssistantChat compact />
            <label className="assistant-floating-motion">
              <input
                type="checkbox"
                checked={assistant.reducedMotion}
                onChange={(event) =>
                  assistant.setReducedMotion(event.target.checked)
                }
              />
              减弱动画
            </label>
          </>
        )}
      </aside>
      {hidden && (
        <button
          className="assistant-launcher"
          onClick={() => assistant.setCompanionMode("compact")}
          aria-label="显示小墨"
        >
          <Bot size={22} />
          <span>小墨{assistant.busy ? " · 分析中" : ""}</span>
        </button>
      )}
    </>
  );
}
