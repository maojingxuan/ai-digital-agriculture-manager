import { NavLink, Route, Routes } from "react-router-dom";
import { modules } from "@agri/shared";
import {
  BookOpen,
  Bot,
  ClipboardList,
  Cpu,
  Leaf,
  LineChart,
  Package,
  Settings,
  Sprout,
  Stethoscope,
  LogOut,
} from "lucide-react";
import { AgricultureDataPage } from "./pages/AgricultureDataPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DiagnosisPage } from "./pages/DiagnosisPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { PatrolPage } from "./pages/PatrolPage";
import { ProductsPage } from "./pages/ProductsPage";
import { RecordsPage } from "./pages/RecordsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DevicesPage } from "./pages/DevicesPage";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./auth/authContext";
import { AssistantProvider } from "./assistant/AssistantProvider";
import { AssistantShell } from "./assistant/AssistantShell";

const iconMap = {
  workspace: Bot,
  knowledge: BookOpen,
  diagnosis: Stethoscope,
  patrol: Sprout,
  data: LineChart,
  devices: Cpu,
  products: Package,
  records: ClipboardList,
  settings: Settings,
};

function App() {
  const { user, loading, logout } = useAuth();
  if (loading) return <main className="auth-loading">正在验证登录状态...</main>;
  if (!user) return <LoginPage />;

  return (
    <AssistantProvider key={user.id}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon">
              <Leaf size={22} />
            </div>
            <div>
              <strong>AI数字农业管家</strong>
              <span>农小贝 · 数字农业管家</span>
            </div>
          </div>
          <nav className="nav-list">
            {modules.map((item) => {
              const Icon = iconMap[item.key];
              return (
                <NavLink className="nav-item" to={item.path} key={item.key}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="sidebar-account">
            <div>
              <strong>{user.name}</strong>
              <span className={`role-badge ${user.role}`}>
                {user.role === "admin" ? "管理员" : "普通用户"}
              </span>
            </div>
            <button className="logout-button" onClick={logout} title="退出登录">
              <LogOut size={17} />
              退出
            </button>
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/diagnosis" element={<DiagnosisPage />} />
            <Route path="/patrol" element={<PatrolPage />} />
            <Route path="/data" element={<AgricultureDataPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <AssistantShell />
      </div>
    </AssistantProvider>
  );
}

export default App;
