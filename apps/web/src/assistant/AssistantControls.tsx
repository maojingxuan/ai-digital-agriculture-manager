import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { phaseLabels, useAssistant } from "./assistantContext";
import type { AvatarAction } from "../components/avatarActions";
export function AssistantControls() {
  const assistant = useAssistant();
  const { debugAction } = assistant;
  useEffect(() => () => debugAction(null), [debugAction]);
  return (
    <>
      <div className="avatar-summary">
        <div className="avatar-title-row">
          <h2>小墨</h2>
          <span className="engine-badge">
            <Sparkles size={13} />
            多模态协同
          </span>
        </div>
        <p
          className={`assistant-status phase-${assistant.task.phase}`}
          role="status"
        >
          <span />
          {phaseLabels[assistant.task.phase]}
        </p>
        <p className="assistant-caption">{assistant.task.detail}</p>
      </div>
      {import.meta.env.DEV && (
        <details
          className="assistant-debug"
          onToggle={(event) => {
            if (!event.currentTarget.open) assistant.debugAction(null);
          }}
        >
          <summary>开发调试</summary>
          <div className="avatar-action-controls">
            {(
              [
                "Idle",
                "Wave",
                "Listening",
                "Thinking",
                "Talking",
              ] as AvatarAction[]
            ).map((action) => (
              <button
                key={action}
                className="avatar-action"
                onClick={() => assistant.debugAction(action)}
              >
                {action}
              </button>
            ))}
            <button
              className="avatar-action"
              onClick={() => assistant.debugAction(null)}
            >
              恢复自动
            </button>
          </div>
        </details>
      )}
    </>
  );
}
