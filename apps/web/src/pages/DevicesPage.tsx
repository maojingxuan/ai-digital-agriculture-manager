import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeviceCommandSummary, DeviceSummary } from "@agri/shared";
import { Power, RefreshCcw, ShieldAlert } from "lucide-react";
import { useAuth } from "../auth/authContext";
import { api } from "../services/api";

const labels: Record<string, string> = {
  ventilation: "通风风机",
  irrigation: "灌溉水泵",
  lighting: "补光灯"
};

function formatTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function commandFor(deviceType: string, open: boolean) {
  return `${open ? "open" : "close"}_${deviceType}`;
}

export function DevicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [commands, setCommands] = useState<DeviceCommandSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setDevices(await api.listDevices());
    if (isAdmin) setCommands(await api.listDeviceCommands());
  }, [isAdmin]);

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "设备数据加载失败。"));
  }, [load]);

  const latestByDevice = useMemo(() => {
    const latest = new Map<string, DeviceCommandSummary>();
    for (const command of commands) {
      if (!latest.has(command.deviceId)) latest.set(command.deviceId, command);
    }
    return latest;
  }, [commands]);

  async function execute(device: DeviceSummary, open: boolean) {
    const action = open ? "开启" : "关闭";
    // 开启/关闭设备均无需二次确认，直接下发指令。
    setBusyId(device.id);
    setMessage("");
    try {
      const record = await api.controlDevice(device.id, commandFor(device.deviceType, open));
      setCommands((current) => [record, ...current]);
      setDevices((current) =>
        current.map((item) =>
          item.id === device.id
            ? {
                ...item,
                running: record.device.running,
                lastOpenedAt: open ? (record.executedAt ?? new Date().toISOString()) : item.lastOpenedAt
              }
            : item
        )
      );
      setMessage(`${device.name}已${action}，命令记录已保存。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "设备控制失败。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>温室自控网络 · 执行机构</span>
          </div>
          <h1>设备控制</h1>
        </div>
        <button className="icon-button" title="刷新" onClick={() => load()}><RefreshCcw size={18} /></button>
      </div>

      {!isAdmin && (
        <div className="permission-notice">
          <ShieldAlert size={20} />
          <span>普通用户可以查看设备状态，但只有管理员可以下发控制命令。</span>
        </div>
      )}
      {message && <div className="message-banner success">{message}</div>}

      <div className="device-grid">
        {devices.map((device) => {
          const latest = latestByDevice.get(device.id);
          return (
            <article className="metric-card device-card" key={device.id}>
              <div className="device-card-title">
                <span className="device-icon"><Power size={18} /></span>
                <div><strong>{device.name}</strong><small>{labels[device.deviceType] ?? device.deviceType}</small></div>
                <span className={`role-badge ${device.running ? "running" : "stopped"}`}>
                  {device.running ? "设备正在运行" : "已停止"}
                </span>
              </div>
              <p>{device.greenhouse.name}</p>
              <small>最近开启时间：{formatTime(device.lastOpenedAt)}</small>
              <small>最近命令：{latest?.command ?? "暂无记录"}</small>
              {isAdmin && (
                <div className="device-actions">
                  <button className="primary-button" disabled={busyId === device.id} onClick={() => execute(device, true)}>开启</button>
                  <button className="secondary-button" disabled={busyId === device.id} onClick={() => execute(device, false)}>关闭</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
