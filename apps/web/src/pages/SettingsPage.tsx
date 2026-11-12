import { useState } from "react";
import { useAuth } from "../auth/authContext";
import { api } from "../services/api";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      setMessage(result.message);
      setTimeout(logout, 800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "密码修改失败。");
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>系统测控参数 · 用户与权限</span>
          </div>
          <h1>系统设置</h1>
        </div>
      </div>

      <section className="form-panel settings-panel">
        <div className="account-summary">
          <strong>{user?.name}</strong>
          <span>{user?.email ?? user?.phone}</span>
          <span className={`role-badge ${user?.role}`}>{user?.role === "admin" ? "管理员 · 最高权限" : "普通用户"}</span>
        </div>
        <label>
          农场名称
          <input defaultValue="智慧农业示范大棚" />
        </label>
        <label>
          默认作物
          <select defaultValue="玉米">
            <option>玉米</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" defaultChecked />
          启用数字人语音回答
        </label>
      </section>

      <form className="form-panel settings-panel" onSubmit={changePassword}>
        <h2>修改登录密码</h2>
        <label>当前密码<input type="password" minLength={8} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label>新密码<input type="password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
        {message && <div className="message-banner success">{message}</div>}
        <button className="primary-button">更新密码</button>
      </form>
    </section>
  );
}
