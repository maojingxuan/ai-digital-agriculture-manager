import type {
  AgricultureSnapshot,
  DiagnosisRecord,
  EnvironmentDashboard,
  GreenhouseSummary,
  PatrolReport,
  Product,
  SensorAnomaly,
  SensorHistorySeries,
  SensorSummary,
  KnowledgeChunkItem,
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  LlmStatus,
  AuthResponse,
  AuthUser,
  DeviceSummary,
  DeviceCommandSummary,
  DemoRun,
  DemoScenario,
  DemoCommand,
  StartDemoInput,
} from "@agri/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const authTokenKey = "agri_auth_token";

export const authToken = {
  get: () => localStorage.getItem(authTokenKey),
  set: (token: string) => localStorage.setItem(authTokenKey, token),
  clear: () => localStorage.removeItem(authTokenKey),
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const token = authToken.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (response.status === 401 && path !== "/auth/login") {
      authToken.clear();
      window.dispatchEvent(new Event("agri:unauthorized"));
    }
    throw new Error(body?.message ?? `请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  login: (identifier: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  register: (
    name: string,
    identifier: string,
    password: string,
    role?: "admin" | "user",
    adminCode?: string,
  ) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, identifier, password, role, adminCode }),
    }),
  getCurrentUser: () => request<AuthUser>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean; message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getAgricultureData: () =>
    request<AgricultureSnapshot>("/agriculture-data/current"),
  listGreenhouses: () => request<GreenhouseSummary[]>("/greenhouses"),
  listSensors: (greenhouseId: string) =>
    request<SensorSummary[]>(`/sensors?greenhouseId=${greenhouseId}`),
  getRealtimeSensorData: (greenhouseId: string) =>
    request<AgricultureSnapshot>(
      `/sensor-data/realtime?greenhouseId=${greenhouseId}`,
    ),
  getSensorHistory: (greenhouseId: string, hours = 24) =>
    request<SensorHistorySeries[]>(
      `/sensor-data/history?greenhouseId=${greenhouseId}&hours=${hours}`,
    ),
  getSensorAnomalies: (greenhouseId: string, hours = 24) =>
    request<SensorAnomaly[]>(
      `/sensor-data/anomalies?greenhouseId=${greenhouseId}&hours=${hours}`,
    ),
  getEnvironmentDashboard: (greenhouseId: string) =>
    request<EnvironmentDashboard>(
      `/dashboard/environment?greenhouseId=${greenhouseId}`,
    ),
  sendAgentMessage: (message: string, signal?: AbortSignal) =>
    request<{
      id: string;
      role: "assistant";
      content: string;
      createdAt: string;
    }>("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
      signal,
    }),
  createDiagnosis: (formData: FormData) =>
    request<DiagnosisRecord>("/diagnosis", {
      method: "POST",
      body: formData,
    }),
  listDiagnosis: () => request<DiagnosisRecord[]>("/diagnosis"),
  createPatrol: (formData: FormData) =>
    request<PatrolReport>("/patrols", {
      method: "POST",
      body: formData,
    }),
  listPatrols: () => request<PatrolReport[]>("/patrols"),
  getDemoScenarios: (signal?: AbortSignal) =>
    request<DemoScenario[]>("/patrol-demo/scenarios", { signal }),
  getCurrentDemo: (signal?: AbortSignal) =>
    request<DemoRun | null>("/patrol-demo/current", { signal }),
  getDemoRun: (id: string, signal?: AbortSignal) =>
    request<DemoRun>(`/patrol-demo/runs/${encodeURIComponent(id)}`, { signal }),
  startDemo: (payload: StartDemoInput, signal?: AbortSignal) =>
    request<DemoRun>("/patrol-demo/runs", {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    }),
  commandDemo: (id: string, command: DemoCommand, signal?: AbortSignal) =>
    request<DemoRun>(`/patrol-demo/runs/${encodeURIComponent(id)}/command`, {
      method: "POST",
      body: JSON.stringify({ command }),
      signal,
    }),
  reviewDemo: (id: string, signal?: AbortSignal) =>
    request<DemoRun>(`/patrol-demo/runs/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
      signal,
    }),
  listProducts: () => request<Product[]>("/products"),
  createProduct: (
    payload: Pick<
      Product,
      | "name"
      | "category"
      | "origin"
      | "harvestTime"
      | "cultivationMethod"
      | "traceabilityInfo"
    >,
  ) =>
    request<Product>("/products", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listDevices: () => request<DeviceSummary[]>("/devices"),
  listDeviceCommands: () => request<DeviceCommandSummary[]>("/device-commands"),
  controlDevice: (deviceId: string, command: string) =>
    request<DeviceCommandSummary>(`/devices/${deviceId}/commands`, {
      method: "POST",
      body: JSON.stringify({ command, confirmExecution: true }),
    }),
  listKnowledgeDocuments: () =>
    request<KnowledgeDocumentSummary[]>("/knowledge/documents"),
  getKnowledgeDocumentDetail: (id: string) =>
    request<KnowledgeDocumentSummary & { chunks: KnowledgeChunkItem[] }>(
      `/knowledge/documents/${id}`,
    ),
  uploadKnowledgeFile: (formData: FormData) =>
    request<KnowledgeDocumentSummary>("/knowledge/upload", {
      method: "POST",
      body: formData,
    }),
  createKnowledgeDocument: (payload: {
    title: string;
    category: string;
    content: string;
  }) =>
    request<KnowledgeDocumentSummary>("/knowledge/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteKnowledgeDocument: (id: string) =>
    request<{ success: boolean; message: string }>(
      `/knowledge/documents/${id}`,
      {
        method: "DELETE",
      },
    ),
  searchKnowledge: (query: string, topK = 5, minScore = 0.16) =>
    request<KnowledgeSearchResult[]>(
      `/knowledge/search?query=${encodeURIComponent(query)}&topK=${topK}&minScore=${minScore}`,
    ),
  getLlmStatus: (signal?: AbortSignal) =>
    request<LlmStatus>("/llm/status", { signal }),
};
