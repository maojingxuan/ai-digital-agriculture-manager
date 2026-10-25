import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AgricultureSnapshot } from "@agri/shared";
import { ArrowUpRight, Leaf, LineChart, Sprout, Stethoscope } from "lucide-react";
import { api } from "../services/api";
import { AssistantChat } from "../assistant/AssistantChat";
import { AssistantControls } from "../assistant/AssistantControls";
import { useAssistant } from "../assistant/assistantContext";
import { PatrolDemoPanel } from "../components/PatrolDemoPanel";

export function DashboardPage() {
  const [panel, setPanel] = useState<"patrol" | "chat">("patrol");
  const [snapshot, setSnapshot] = useState<AgricultureSnapshot | null>(null);
  const [dataError, setDataError] = useState(false);
  const { llmStatus } = useAssistant();

  useEffect(() => {
    let active = true;
    api
      .getAgricultureData()
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch(() => {
        if (active) setDataError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page assistant-workspace">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            1号番茄大棚 · 数字化管控中心
          </div>
          <h1>与农小贝一起，精准守护每株番茄</h1>
          <p className="workspace-intro">
            数字农业全域自主巡查与智能决策中枢 · 实时伴随与病理研判
          </p>
        </div>
        <span className="workspace-badge">
          <Leaf size={14} />
          管家在线
        </span>
      </div>

      <div className="dashboard-grid">
        <section className="avatar-panel assistant-main-panel">
          <div id="assistant-stage-slot" aria-hidden="true" />
          <AssistantControls />
        </section>

        <div className="workspace-assistant-right">
          <div
            className="workspace-panel-tabs"
            role="group"
            aria-label="工作台面板切换"
          >
            <button
              aria-pressed={panel === "patrol"}
              onClick={() => setPanel("patrol")}
            >
              自主巡田控制台
            </button>
            <button
              aria-pressed={panel === "chat"}
              onClick={() => setPanel("chat")}
            >
              智农随行对话
            </button>
          </div>
          {panel === "patrol" ? <PatrolDemoPanel compact /> : <AssistantChat />}
        </div>
      </div>

      <div className="workspace-links">
        <Link to="/data" className="action-tile">
          <div className="tile-icon">
            <LineChart size={18} />
          </div>
          <div>
            <strong>环境遥测</strong>
            <small>温湿度与土壤时序走势</small>
          </div>
          <ArrowUpRight size={18} className="tile-arrow" />
        </Link>
        <Link to="/diagnosis" className="action-tile">
          <div className="tile-icon">
            <Stethoscope size={18} />
          </div>
          <div>
            <strong>叶部问诊</strong>
            <small>病害照片检测与处方检索</small>
          </div>
          <ArrowUpRight size={18} className="tile-arrow" />
        </Link>
        <Link to="/patrol" className="action-tile">
          <div className="tile-icon">
            <Sprout size={18} />
          </div>
          <div>
            <strong>自主巡田</strong>
            <small>全流程巡查与闭环报告</small>
          </div>
          <ArrowUpRight size={18} className="tile-arrow" />
        </Link>
      </div>

      <div className="workspace-data-heading">
        <div className="heading-title-group">
          <h2>实时环境指标遥测</h2>
          <span className="data-source-pill">仿真基准流</span>
        </div>
        <div className="heading-meta">
          <span className="status-dot-sm" />
          <span>
            决策模型：
            {llmStatus?.configured
              ? llmStatus.provider
              : "本地专家规则与知识对齐"}
          </span>
        </div>
      </div>

      {dataError && (
        <p className="muted" role="status">
          环境遥测数据暂时离线，数字人伴随与历史诊断服务仍可正常使用。
        </p>
      )}

      <section className="metric-grid">
        {snapshot?.metrics.map((metric) => (
          <article className="metric-card" key={metric.key}>
            <span>{metric.label}</span>
            <strong>
              {metric.value}
              <span style={{ fontSize: "14px", fontWeight: 500, marginLeft: "3px", color: "var(--muted)" }}>
                {metric.unit}
              </span>
            </strong>
            <small className={`status ${metric.status}`}>
              {metric.suggestion}
            </small>
          </article>
        ))}
      </section>
    </section>
  );
}
