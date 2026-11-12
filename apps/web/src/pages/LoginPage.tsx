import { useState } from "react";
import { Leaf, LockKeyhole, UserPlus, LogIn, ShieldAlert } from "lucide-react";
import { useAuth } from "../auth/authContext";

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [adminCode, setAdminCode] = useState("");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (mode === "register") {
      if (!name.trim()) {
        setError("请输入您的姓名或昵称。");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致，请核对。");
        return;
      }
      if (password.length < 8) {
        setError("密码长度至少为 8 位。");
        return;
      }
      if (role === "admin" && !adminCode.trim()) {
        setError("注册管理员账号需要填写管理员邀请码。");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(identifier, password, rememberPassword);
      } else {
        await register(name, identifier, password, role, adminCode);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "操作失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  function handleSwitchMode(targetMode: "login" | "register") {
    setMode(targetMode);
    setError("");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-logo"><Leaf size={28} /></span>
          <div>
            <div className="context-tag">
              <span className="live-indicator-dot" />
              <span>智慧温室实验室 · 测控平台</span>
            </div>
            <h1>{mode === "login" ? "登录农业管家" : "注册新账号"}</h1>
          </div>
        </div>
        <p className="muted">
          {mode === "login"
            ? "登录您的管家账号，访问问诊、巡田、产品和数据中心。"
            : "创建专属账号，即刻开启 AI 数字农业管家服务。"}
        </p>

        <div className="login-tabs" role="tablist">
          <button
            type="button"
            className={`login-tab-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => handleSwitchMode("login")}
          >
            <LogIn size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            账号登录
          </button>
          <button
            type="button"
            className={`login-tab-btn ${mode === "register" ? "active" : ""}`}
            onClick={() => handleSwitchMode("register")}
          >
            <UserPlus size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            免费注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === "register" && (
            <div className="register-role-selector">
              <span className="role-selector-label">注册账号类型</span>
              <div className="role-options">
                <label className={`role-option-card ${role === "user" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="accountRole"
                    value="user"
                    checked={role === "user"}
                    onChange={() => setRole("user")}
                  />
                  <div>
                    <strong>普通农户</strong>
                    <small>日常巡田、病害问诊与生产管理</small>
                  </div>
                </label>
                <label className={`role-option-card ${role === "admin" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="accountRole"
                    value="admin"
                    checked={role === "admin"}
                    onChange={() => setRole("admin")}
                  />
                  <div>
                    <strong>农场管理员</strong>
                    <small>大棚设备控制、知识库维护与全域审计</small>
                  </div>
                </label>
              </div>
            </div>
          )}

          {mode === "register" && role === "admin" && (
            <label className="admin-code-field">
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#8c6014" }}>
                <ShieldAlert size={15} />
                管理员授权邀请码
              </span>
              <input
                type="password"
                value={adminCode}
                onChange={(event) => setAdminCode(event.target.value)}
                placeholder="请输入管理员安全邀请码"
                autoComplete="off"
                required
              />
              <span className="field-hint">
                说明：管理员拥有设备反控及知识库维护等高权限，需使用部署人员安全保管的邀请码注册。
              </span>
            </label>
          )}

          {mode === "register" && (
            <label>
              姓名 / 昵称
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：张农艺师"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            邮箱或手机号
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="例如：user@example.com 或 13800000000"
              autoComplete="username"
              required
            />
          </label>

          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码（至少 8 位）"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>

          {mode === "register" && (
            <label>
              确认密码
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="请再次输入相同密码"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}

          {mode === "login" && (
            <label className="login-remember-option">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(event) => setRememberPassword(event.target.checked)}
              />
              <span>
                <strong>记住密码</strong>
                <small>在此设备上保持登录 30 天，不保存明文密码</small>
              </span>
            </label>
          )}

          {error && <div className="message-banner error" role="alert">{error}</div>}

          <button className="primary-button" disabled={loading} style={{ marginTop: 6 }}>
            {mode === "login" ? <LockKeyhole size={18} /> : <UserPlus size={18} />}
            {loading ? "正在处理..." : mode === "login" ? "安全登录" : `注册为${role === "admin" ? "管理员" : "农户"}并登录`}
          </button>
        </form>

        <div className="login-footer-switch">
          {mode === "login" ? (
            <span>
              还没有账号？
              <button type="button" className="link-button" onClick={() => handleSwitchMode("register")}>
                立即免费注册
              </button>
            </span>
          ) : (
            <span>
              已有账号？
              <button type="button" className="link-button" onClick={() => handleSwitchMode("login")}>
                直接登录
              </button>
            </span>
          )}
        </div>

      </section>
    </main>
  );
}
