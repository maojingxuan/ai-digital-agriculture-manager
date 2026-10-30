import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Pause, RotateCcw, Square, ClipboardCheck } from "lucide-react";
import { useAssistant } from "../assistant/assistantContext";
import { PatrolEvidence } from "./PatrolEvidence";

const statusNames = {
  running: "巡田进行中",
  paused: "巡田已暂停",
  cancelled: "巡田已取消",
  failed: "需要重试",
  complete: "报告已保存",
};
const greenhouseStatusText = {
  optimal: "环境优秀",
  attention: "需要关注",
  warning: "存在风险",
};
export function PatrolDemoPanel({ compact = false }: { compact?: boolean }) {
  const assistant = useAssistant();
  const demo = assistant.patrol;
  const { run } = demo;
  const [clock, setClock] = useState(Date.now());
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run?.status]);
  const active = Boolean(
    run && !["complete", "cancelled"].includes(run.status),
  );
  const current = run?.steps[run.currentStep];
  const remaining = run?.nextAdvanceAt
    ? Math.max(0, Math.ceil((Date.parse(run.nextAdvanceAt) - clock) / 1000))
    : 0;
  return (
    <section
      className={`demo-panel ${compact ? "demo-panel-compact" : ""}`}
      aria-label="自主仿真巡田"
    >
      <div className="demo-heading">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>智能巡检引擎 · 农业数据联动</span>
          </div>
          <h2>小墨自主巡田</h2>
        </div>
        <div className="demo-meta-badges">
          <span className="badge-source">AGR-DATA-LIVE</span>
          <span className="badge-status">可交互</span>
        </div>
      </div>
      <div className="demo-instrument-bar">
        <span className="instrument-chip">环境源: 农业数据中心 · 大棚实时监测</span>
        <span className="instrument-chip">视觉: 监测状态对应叶片演示</span>
        <span className="instrument-chip">知识库: 玉米病虫害图谱</span>
      </div>
      {!run && (
        <>
          <div
            className="demo-scenarios"
            role="group"
            aria-label="选择巡检大棚"
          >
            {demo.greenhouses.map((greenhouse) => (
              <button
                key={greenhouse.id}
                aria-pressed={demo.greenhouseId === greenhouse.id}
                onClick={() => demo.chooseGreenhouse(greenhouse.id)}
                disabled={demo.operating || assistant.busy}
              >
                <strong>{greenhouse.name}</strong>
                <small>
                  {greenhouse.location ? `${greenhouse.location} · ` : ""}
                  {greenhouseStatusText[greenhouse.status]}
                </small>
              </button>
            ))}
          </div>
          <div className="demo-inputs">
            <label>
              预警阈值 (%)
              <input
                type="number"
                min="70"
                max="95"
                value={demo.threshold}
                onChange={(event) =>
                  demo.setThreshold(Number(event.target.value))
                }
                disabled={demo.operating || assistant.busy}
              />
            </label>
          </div>
          <p className="demo-help">
            湿度、温度与土壤湿度读取所选大棚的实时监测数据（农业环境数据中心），无需手动输入。巡检全流程约 60
            秒，各步骤严格对应农艺证据链与结构化复核项。
          </p>
        </>
      )}
      <div className="demo-actions">
        {!run && (
          <button
            className="primary-button"
            onClick={() => void demo.start()}
            disabled={
              demo.loading ||
              demo.operating ||
              assistant.busy ||
              !demo.greenhouses.length ||
              !demo.greenhouseId ||
              demo.threshold < 70 ||
              demo.threshold > 95
            }
          >
            <Play size={16} />
            {demo.loading
              ? "正在同步…"
              : demo.operating
                ? "正在启动…"
                : "开始自主巡田"}
          </button>
        )}
        {run?.status === "running" && (
          <button
            className="secondary-button"
            disabled={demo.operating}
            onClick={() => void demo.command("pause")}
          >
            <Pause size={16} />
            暂停巡田
          </button>
        )}
        {run?.status === "paused" && (
          <button
            className="primary-button"
            disabled={demo.operating}
            onClick={() => void demo.command("resume")}
          >
            <Play size={16} />
            继续巡田
          </button>
        )}
        {run?.status === "failed" && (
          <button
            className="primary-button"
            disabled={demo.operating}
            onClick={() => void demo.command("retry")}
          >
            <RotateCcw size={16} />
            重试失败步骤
          </button>
        )}
        {active && (
          <button
            className="secondary-button"
            disabled={demo.operating}
            onClick={() => void demo.command("cancel")}
          >
            <Square size={16} />
            取消巡田
          </button>
        )}
        {run && !active && (
          <button
            className="secondary-button"
            disabled={demo.operating}
            onClick={() => {
              demo.reset();
              setConfirmed(false);
            }}
          >
            <RotateCcw size={16} />
            复位选择
          </button>
        )}
        <button
          className="demo-sync"
          disabled={demo.operating || demo.loading}
          onClick={() => void demo.refresh()}
        >
          同步任务状态
        </button>
      </div>
      {(demo.error || demo.pollError) && (
        <p className="demo-error" role="alert">
          {demo.error ||
            `${demo.pollError}。本地服务可能仍在执行；先同步状态，不要重复启动。`}
        </p>
      )}
      {run && (
        <>
          <div className={`demo-live status-${run.status}`} role="status">
            <strong>{statusNames[run.status]}</strong>
            <p>{run.caption}</p>
            {run.status === "running" &&
              current?.status === "completed" &&
              run.nextAdvanceAt && (
                <small>
                  本步骤已完成，正在展示证据；约 {remaining} 秒后进入下一步。
                </small>
              )}
            <small>
              场景：{run.scenario.name} · 湿度 {run.humidity}% · 阈值{" "}
              {run.threshold}%
            </small>
          </div>
          <ol className="demo-steps">
            {run.steps.map((step, index) => (
              <li
                key={step.id}
                className={`step-${step.status}`}
                aria-current={index === run.currentStep ? "step" : undefined}
              >
                <span>{step.status === "completed" ? "✓" : index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>
                    {step.status === "pending"
                      ? "等待执行"
                      : step.status === "running"
                        ? "本地步骤执行中"
                        : step.status === "failed"
                          ? "执行失败"
                          : `已完成 · 执行 ${step.durationMs ?? 0} ms`}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <PatrolEvidence evidence={run} />
          {run.status === "complete" && (
            <section className="demo-proof demo-completion">
              <h3>
                <ClipboardCheck size={18} />
                报告与复核任务已保存
              </h3>
              <small>报告编号：{run.reportId}</small>
              <Link to="/records">前往历史记录查看完整报告</Link>
              {run.review && (
                <>
                  <p>{run.review.title}</p>
                  <ul>
                    {run.review.checklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {run.review.status === "resolved" ? (
                    <p>人工复核已标记完成。</p>
                  ) : (
                    <>
                      <label className="demo-confirm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(event) =>
                            setConfirmed(event.target.checked)
                          }
                        />
                        我已逐项完成人工复核；不是仅看完演示。
                      </label>
                      <button
                        className="secondary-button"
                        disabled={!confirmed || demo.operating}
                        onClick={() => void demo.completeReview()}
                      >
                        标记复核完成
                      </button>
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
      {!run && !demo.loading && (
        <div className="demo-ready">
          <span>01 → 06</span>
          <p>
            环境读取 → 风险判断 → 叶片演示 → 知识检索 → 建议与复核 → 报告保存
          </p>
          <small>只提供管理方向，不生成未经复核的用药处方或设备指令。</small>
        </div>
      )}
    </section>
  );
}
