import { useEffect, useMemo, useState } from "react";
import type {
  AgricultureMetric,
  EnvironmentDashboard,
  GreenhouseStatus,
  GreenhouseSummary,
  SensorHistorySeries,
  SensorType
} from "@agri/shared";
import { Activity, CloudSun, Droplets, Gauge, RefreshCcw, Sun, Thermometer, Waves, Wind } from "lucide-react";
import { api } from "../services/api";

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
        <span>{points[0] ? formatTime(points[0].timestamp) : "--"}</span>
        <span>{points.at(-1) ? formatTime(points.at(-1)!.timestamp) : "--"}</span>
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
  const [greenhouses, setGreenhouses] = useState<GreenhouseSummary[]>([]);
  const [selectedGreenhouseId, setSelectedGreenhouseId] = useState("");
  const [dashboard, setDashboard] = useState<EnvironmentDashboard | null>(null);
  const [loading, setLoading] = useState(false);

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

  const temperatureSeries = pickSeries(dashboard?.history ?? [], "temperature");
  const humiditySeries = pickSeries(dashboard?.history ?? [], "humidity");
  const soilMetric = dashboard?.realtime.metrics.find((metric) => metric.key === "soil_moisture");
  const lightMetric = dashboard?.realtime.metrics.find((metric) => metric.key === "light");
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
        <div className={`greenhouse-orbit ${status}`}>
          <CloudSun size={32} />
          <strong>{statusText[status]}</strong>
          <span>{dashboard?.greenhouse.name ?? "智慧大棚"}</span>
        </div>
      </div>

      <div className="data-toolbar">
        <div className="greenhouse-tabs">
          {greenhouses.map((greenhouse) => (
            <button
              className={greenhouse.id === selectedGreenhouseId ? "active" : ""}
              key={greenhouse.id}
              onClick={() => setSelectedGreenhouseId(greenhouse.id)}
            >
              {greenhouse.name}
            </button>
          ))}
        </div>
        <button
          className="secondary-button glass-button"
          onClick={() => selectedGreenhouseId && api.getEnvironmentDashboard(selectedGreenhouseId).then(setDashboard)}
          disabled={loading}
        >
          <RefreshCcw size={17} />
          {loading ? "同步中" : "刷新"}
        </button>
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
              <h2>湿度曲线</h2>
            </div>
            <Droplets size={19} />
          </div>
          <MiniLineChart series={humiditySeries} tone="cool" />
        </article>

        <article className="env-focus-panel">
          <span>土壤湿度</span>
          <strong>{soilMetric ? `${soilMetric.value}${soilMetric.unit}` : "--"}</strong>
          <div className="level-bar">
            <i style={{ width: `${soilMetric?.value ?? 0}%` }} />
          </div>
          <p>{soilMetric?.suggestion ?? "等待数据。"}</p>
        </article>

        <article className="env-focus-panel">
          <span>光照强度</span>
          <strong>{lightMetric ? `${lightMetric.value}${lightMetric.unit}` : "--"}</strong>
          <div className="light-ramp">
            <i style={{ width: `${Math.min(100, ((lightMetric?.value ?? 0) / 62000) * 100)}%` }} />
          </div>
          <p>{lightMetric?.suggestion ?? "等待数据。"}</p>
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
                <small>{item.message}</small>
              </div>
            ))
          ) : (
            <p>近24小时没有明显异常。</p>
          )}
        </article>

        <article className="env-list-panel">
          <h2>AI建议</h2>
          {(dashboard?.recommendations ?? ["正在生成建议。"]).map((item) => (
            <div className="recommendation-row" key={item}>
              {item}
            </div>
          ))}
        </article>
      </section>
    </section>
  );
}
