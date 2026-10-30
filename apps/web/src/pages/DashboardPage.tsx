import { Link } from "react-router-dom";
import { ArrowUpRight, Leaf, LineChart, Stethoscope } from "lucide-react";
import { AssistantChat } from "../assistant/AssistantChat";
import { AssistantControls } from "../assistant/AssistantControls";

export function DashboardPage() {

  return (
    <section className="page assistant-workspace">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            1号玉米示范田 · 数字化管控中心
          </div>
          <h1>与小墨一起，精准守护每株玉米</h1>
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
        <section className="xiaomo-main-slot">
          <div id="assistant-stage-slot" aria-hidden="true" />
          <AssistantControls />
        </section>

        <div className="workspace-assistant-right">
          <AssistantChat />
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
      </div>
    </section>
  );
}
