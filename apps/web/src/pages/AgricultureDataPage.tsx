import { useEffect, useMemo, useState } from "react";
import type {
  AgricultureMetric,
  EnvironmentDashboard,
  GreenhouseStatus,
  GreenhouseSummary,
  SensorHistorySeries,
  SensorType
} from "@agri/shared";
import { Activity, CloudSun, Droplets, Gauge, Plus, RefreshCcw, Sun, Thermometer, Trash2, Waves, Wind } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../auth/authContext";

const metricIcons: Record<SensorType, typeof Thermometer> = {
  temperature: Thermometer,
  humidity: Droplets,
  soil_moisture: Waves,
  light: Sun,
  co2: Wind,
  water_level: Gauge
};

const statusText: Record<GreenhouseStatus, string> = {
  optimal: "环境优秀",
  attention: "需要关注",
  warning: "存在风险"
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

// 异常时间：今天/昨天只显示时分，更早显示月日+时分
function formatAnomalyTime(value: string) {
  const d = new Date(value);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hm = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(d);
  if (sameDay) return `今天 ${hm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `昨天 ${hm}`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

// 折线图时间：显示 月-日 时:分（如 10-29 14:45）
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function trendText(metric: AgricultureMetric) {
  if (metric.trend === "up") return "上升";
  if (metric.trend === "down") return "下降";
  return "平稳";
}

function pickSeries(history: SensorHistorySeries[], sensorType: SensorType) {
  return history.find((series) => series.sensorType === sensorType);
}

function MiniLineChart({ series, tone }: { series?: SensorHistorySeries; tone: "warm" | "cool" }) {
  const points = useMemo(() => series?.points ?? [], [series]);
  const path = useMemo(() => {
    if (points.length === 0) return "";

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;

    return points
      .map((point, index) => {
        const x = (index / Math.max(1, points.length - 1)) * 100;
        const y = 72 - ((point.value - min) / spread) * 56;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points]);

  if (!series) {
    return <div className="empty-chart">等待数据</div>;
  }

  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 78" preserveAspectRatio="none" role="img" aria-label={`${series.label}曲线`}>
        <defs>
          <linearGradient id={`stroke-${tone}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={tone === "warm" ? "#d97736" : "#268a56"} />
            <stop offset="100%" stopColor={tone === "warm" ? "#b85820" : "#143d30"} />
          </linearGradient>
        </defs>
        <path className="chart-grid" d="M 0 18 H 100 M 0 42 H 100 M 0 66 H 100" />
        <path className="chart-line" d={path} stroke={`url(#stroke-${tone})`} />
      </svg>
      <div className="chart-axis">
        <span>{points[0] ? formatDateTime(points[0].timestamp) : "--"}</span>
        <span>{points.at(-1) ? formatDateTime(points.at(-1)!.timestamp) : "--"}</span>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: AgricultureMetric }) {
  const Icon = metricIcons[metric.key];

  return (
    <article className={`env-metric-card ${metric.status}`}>
      <div className="env-metric-top">
        <span className="env-metric-icon">
          <Icon size={19} />
        </span>
        <span className="env-metric-status">{metric.status}</span>
      </div>
      <span className="env-metric-label">{metric.label}</span>
      <strong>
        {metric.value}
        <small>{metric.unit}</small>
      </strong>
      <div className="env-metric-foot">
        <span>{trendText(metric)}</span>
        <span>{formatTime(metric.timestamp)}</span>
      </div>
    </article>
  );
}

export function AgricultureDataPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [greenhouses, setGreenhouses] = useState<GreenhouseSummary[]>([]);
  const [selectedGreenhouseId, setSelectedGreenhouseId] = useState("");
  const [dashboard, setDashboard] = useState<EnvironmentDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLocation, setCreateLocation] = useState("");
  const [createArea, setCreateArea] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GreenhouseSummary | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.listGreenhouses().then((items) => {
      setGreenhouses(items);
      setSelectedGreenhouseId((current) => current || items[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    if (!selectedGreenhouseId) return;
    setLoading(true);
    api
      .getEnvironmentDashboard(selectedGreenhouseId)
      .then(setDashboard)
      .finally(() => setLoading(false));
  }, [selectedGreenhouseId]);

  async function handleRefresh() {
    if (!selectedGreenhouseId) return;
    setLoading(true);
    try {
      await api.getEnvironmentDashboard(selectedGreenhouseId).then(setDashboard);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) {
      window.alert("请输入大棚名称");
      return;
    }
    if (!createPassword) {
      window.alert("请输入管理员密码");
      return;
    }
    setCreating(true);
    try {
      await api.createGreenhouse({
        name: createName.trim(),
        location: createLocation.trim() || undefined,
        area: createArea ? Number(createArea) : undefined,
        adminPassword: createPassword,
      });
      const items = await api.listGreenhouses();
      setGreenhouses(items);
      const created = items[items.length - 1];
      if (created) setSelectedGreenhouseId(created.id);
      setShowCreate(false);
      setCreateName("");
      setCreateLocation("");
      setCreateArea("");
      setCreatePassword("");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletePassword) {
      window.alert("请输入管理员密码");
      return;
    }
    setDeleting(true);
    try {
      await api.deleteGreenhouse(deleteTarget!.id, deletePassword);
      const items = await api.listGreenhouses();
      setGreenhouses(items);
      if (selectedGreenhouseId === deleteTarget!.id) {
        setSelectedGreenhouseId(items[0]?.id ?? "");
      }
      setShowDelete(false);
      setDeleteTarget(null);
      setDeletePassword("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const temperatureSeries = pickSeries(dashboard?.history ?? [], "temperature");
  const humiditySeries = pickSeries(dashboard?.history ?? [], "humidity");
  const soilSeries = pickSeries(dashboard?.history ?? [], "soil_moisture");
  const lightSeries = pickSeries(dashboard?.history ?? [], "light");
  const status = dashboard?.greenhouse.status ?? "attention";

  return (
    <section className="page data-center">
      <div className="data-hero">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>环境监测中心 · 遥测分析阵列</span>
          </div>
          <h1>农业环境数据中心</h1>
          <p className="data-hero-caption">{dashboard?.realtime.summary ?? "正在连接模拟传感器网络。"}</p>
        </div>
      </div>

      <div className="greenhouse-selector">
        <div className="gs-head">
          <div>
            <div className="context-tag">
              <span className="live-indicator-dot" />
              <span>大棚概览</span>
            </div>
            <h2>选择监测大棚</h2>
          </div>
          <div className="gs-actions">
            <button
              className="secondary-button glass-button"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCcw size={17} />
              {loading ? "同步中" : "刷新"}
            </button>
            {isAdmin && (
              <button className="primary-button" onClick={() => setShowCreate(true)}>
                <Plus size={17} />
                新增大棚
              </button>
            )}
          </div>
        </div>
        <div className="gs-grid">
          {greenhouses.map((greenhouse) => (
            <div
              key={greenhouse.id}
              className={`gs-card ${greenhouse.id === selectedGreenhouseId ? "active" : ""} status-${greenhouse.status}`}
              onClick={() => setSelectedGreenhouseId(greenhouse.id)}
            >
              {isAdmin && (
                <button
                  className="gs-del"
                  title="删除大棚"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteTarget(greenhouse);
                    setDeletePassword("");
                    setShowDelete(true);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <CloudSun size={22} />
              <strong>{greenhouse.name}</strong>
              <span className="gs-badge">{statusText[greenhouse.status]}</span>
              {greenhouse.location && <small>{greenhouse.location}</small>}
            </div>
          ))}
        </div>
      </div>

      <section className="env-metric-grid">
        {dashboard?.realtime.metrics.map((metric) => <MetricCard metric={metric} key={metric.key} />)}
      </section>

      <section className="env-main-grid">
        <article className="env-chart-panel">
          <div className="panel-title">
            <div>
              <span>24小时趋势</span>
              <h2>温度曲线</h2>
            </div>
            <Activity size={19} />
          </div>
          <MiniLineChart series={temperatureSeries} tone="warm" />
        </article>

        <article className="env-chart-panel">
          <div className="panel-title">
            <div>
              <span>24小时趋势</span>
              <h2>空气湿度曲线</h2>
            </div>
            <Droplets size={19} />
          </div>
          <MiniLineChart series={humiditySeries} tone="cool" />
        </article>

        <article className="env-chart-panel">
          <div className="panel-title">
            <div>
              <span>24小时趋势</span>
              <h2>土壤湿度曲线</h2>
            </div>
            <Droplets size={19} />
          </div>
          <MiniLineChart series={soilSeries} tone="cool" />
        </article>

        <article className="env-chart-panel">
          <div className="panel-title">
            <div>
              <span>24小时趋势</span>
              <h2>光照强度曲线</h2>
            </div>
            <Sun size={19} />
          </div>
          <MiniLineChart series={lightSeries} tone="warm" />
        </article>
      </section>

      <section className="env-bottom-grid">
        <article className="env-status-panel">
          <h2>大棚状态</h2>
          <div className={`status-ring ${status}`}>
            <span>{statusText[status]}</span>
          </div>
          <p>
            {dashboard?.greenhouse.location} · {dashboard?.greenhouse.area}㎡
          </p>
        </article>

        <article className="env-list-panel">
          <h2>异常数据</h2>
          {dashboard?.anomalies.length ? (
            dashboard.anomalies.slice(0, 5).map((item) => (
              <div className={`anomaly-row ${item.level}`} key={item.id}>
                <span>{item.label}</span>
                <strong>
                  {item.value}
                  {item.unit}
                </strong>
                <time>{formatAnomalyTime(item.timestamp)}</time>
                <small>{item.message}</small>
              </div>
            ))
          ) : (
            <p>近24小时没有明显异常。</p>
          )}
        </article>

        <article className="env-list-panel">
          <h2>AI建议</h2>
          {(dashboard?.recommendations ?? []).map((item) => (
            <div className="recommendation-row" key={item.text}>
              <p>{item.text}</p>
              {item.time && <time>{formatDateTime(item.time)}</time>}
            </div>
          ))}
          {!dashboard?.recommendations?.length && <p>正在生成建议。</p>}
        </article>
      </section>

      {showCreate && (
        <div className="gs-modal-mask" onClick={() => setShowCreate(false)}>
          <div className="gs-modal" onClick={(event) => event.stopPropagation()}>
            <h3>新增大棚</h3>
            <label className="gs-field">
              <span>大棚名称 *</span>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="如：3号沃柑大棚"
                autoFocus
              />
            </label>
            <label className="gs-field">
              <span>所在位置</span>
              <input
                value={createLocation}
                onChange={(event) => setCreateLocation(event.target.value)}
                placeholder="如：示范基地C区"
              />
            </label>
            <label className="gs-field">
              <span>面积（㎡）</span>
              <input
                value={createArea}
                onChange={(event) => setCreateArea(event.target.value)}
                type="number"
                placeholder="可选"
              />
            </label>
            <label className="gs-field">
              <span>管理员密码 *</span>
              <input
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="请输入管理员密码确认"
              />
            </label>
            <div className="gs-modal-actions">
              <button className="secondary-button" onClick={() => setShowCreate(false)}>
                取消
              </button>
              <button className="primary-button" onClick={handleCreate} disabled={creating}>
                {creating ? "提交中" : "确认新增"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && deleteTarget && (
        <div className="gs-modal-mask" onClick={() => setShowDelete(false)}>
          <div className="gs-modal" onClick={(event) => event.stopPropagation()}>
            <h3>删除大棚</h3>
            <p className="gs-del-tip">确认删除「{deleteTarget.name}」吗？此操作不可恢复。</p>
            <label className="gs-field">
              <span>管理员密码 *</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="请输入管理员密码确认"
                autoFocus
              />
            </label>
            <div className="gs-modal-actions">
              <button className="secondary-button" onClick={() => setShowDelete(false)}>
                取消
              </button>
              <button className="primary-button gs-del-danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? "删除中" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
