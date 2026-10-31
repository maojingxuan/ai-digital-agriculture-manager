# AI 数字农业管家系统（小墨）

> 以 AI 数字人「小墨」为统一交互入口的智能农业管理系统，连接农业知识问答、农业数据、计算机视觉问诊、AI 巡田和农产品销售文案生成能力。

本项目目前处于 **MVP 基础框架 + 数字人打磨阶段**：先跑通「数字人工作台 → 农业数据 → AI 问诊 → AI 巡田 → 农产品管理」的产品闭环，再逐步把模拟能力替换为真实能力。当前已完成前两阶段打磨（全局数字人、可控仿真巡田），详见文末「开发进度」。

> 当前系统主题聚焦**玉米**：全站背景为玉米田园风，数字人首页标注「1号玉米示范田 · 数字化管控中心」，图片问诊使用玉米 11 类病害识别模型。

---

## 一、项目简介

- **定位**：面向农业场景的一体化智能管家，用 AI 数字人作为统一的、有陪伴感的交互入口。
- **数字人「小墨」**：桌宠式 2D 数字人（PNG 帧动画），透明、无边框、无背景展示，支持待机（呼吸）、眨眼、跳跃（打招呼）、摇晃（思考）、挤压（讲话）五套动画片段；在首页主舞台展示，在其他页面以可拖拽、可展开 / 收起 / 隐藏的悬浮助手陪伴，对话与任务跨页面连续保留。
- **产品闭环**：从环境数据感知 → 病虫害问诊 → 自主巡田 → 知识检索 → 生成建议与报告，再到农产品管理，全流程串联。
- **MVP 原则**：核心能力当前以模拟数据 / 占位服务跑通流程，每一层都保留清晰的「替换点」，后续可平滑替换为真实 IoT 数据、真实视觉模型与工具调用式 Agent。

---

## 二、核心功能模块

| 模块 | 页面 / 入口 | 功能说明 |
| --- | --- | --- |
| **AI 数字人工作台** | 首页 `/` | 小墨桌宠数字人主舞台 + 对话窗 + 「环境遥测 / 叶部问诊」入口卡片；全站玉米背景 |
| **AI 农业问诊** | `/diagnosis` | 上传作物叶片图片，YOLO 模型做病虫害识别，结合知识库返回诊断与建议 |
| **AI 巡田** | `/patrol` | 农业数据联动闭环：按大棚读取实时监测 → 分析叶片 → 检索知识 → 生成建议与报告，支持暂停 / 继续 / 取消 / 复位 |
| **农业数据** | `/data` | 大棚、传感器与环境数据中心 Dashboard，展示温度、湿度等环境指标与历史走势 |
| **农产品管理** | `/products` | 农产品信息维护、销售文案生成与批量删除 |
| **历史记录** | `/records` | 问诊记录、巡田报告与人工复核结果的持久化查看 |
| **系统设置** | `/settings` | 账号密码修改、数字人语音回答开关 |
| **设备管理** | `/devices` | 设备查看与管理员控制（含操作审计） |
| **知识库** | `/knowledge` | 农业知识上传、检索与 RAG 问答 |

> 图片识别当前使用**玉米 11 类病害模型** `corn_disease_best.pt`（类别见「Python 环境配置」一节）；后续训练目标、语音与真实硬件接入计划见 `plan.md` / `todo.md`。

---

## 三、技术架构

### 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vite + React 19 + TypeScript + React Router |
| 后端 | Node.js + Express 5 + TypeScript |
| 数据库 | Prisma ORM + SQLite |
| 数字人 | 2D 帧动画「小墨」（`public/xiaomo/` PNG，XiaoMoAvatar 组件） |
| AI 能力 | Ultralytics YOLO（玉米 11 类图片识别）、LLM 服务（可切换 DeepSeek / 通义千问 / 硅基流动 / 智谱 / 本地 Ollama） |
| 语音 | 后端离线语音合成（SherpaTTS + VITS 中文模型，`/api/tts`）+ 前端浏览器 speechSynthesis 播报 |
| 视觉背景 | 全站玉米田园背景图（`public/backgrounds/corn-bg.jpg`，CSS 变量 `--site-bg`） |
| 数据阶段 | MVP 使用模拟数据，后续替换为 IoT、真实视觉模型与 Agent 工具调用 |

### 目录结构

```
新数字人系统/
├─ apps/
│  ├─ api/                后端 API 服务（Express + Prisma + TypeScript）
│  │  ├─ src/             server.ts、auth、agent 工具注册与对话服务
│  │  │  └─ services/     agentTools.ts、ttsService.ts、zhinongAgentService.ts 等
│  │  ├─ models/          YOLO 权重（corn_disease_best.pt）、TTS 中文模型（tts-zh-ll/）
│  │  ├─ prisma/          schema、迁移、种子脚本与数据模型测试
│  │  ├─ scripts/         yolo_inference.py、sherpa_tts_once.py、yolo_video_diagnosis.py 等
│  │  └─ uploads/         上传图片与识别结果（不纳入版本管理）
│  └─ web/                前端管理台与数字人工作台（React + Vite）
│     ├─ public/          xiaomo/（小墨动画帧）、backgrounds/（全站背景）
│     └─ src/             pages/、components/、assistant/（数字人状态机）、auth/
├─ packages/
│  └─ shared/             前后端共享类型、枚举与模块路由常量
├─ docs/                  架构、鉴权、数据库、各阶段规格说明与截图
├─ scripts/               安装、环境检查、YOLO 依赖、阶段测试脚本
├─ .creative-design/      背景图生成任务记录（Brief 与设计脚本）
└─ plan.md / todo.md      阶段计划与执行清单
```

### 系统分层与权限边界

- **前端 `apps/web`**：数字人工作台、问诊、巡田、数据、商品、记录、设置、设备、知识库等页面。
- **后端 `apps/api`**：健康检查、认证（登录 / 注册 / 修改密码）、大棚与传感器数据、知识库、Agent 对话、设备控制、问诊、巡田、商品、离线语音合成等接口：

  | 分组 | 接口 |
  | --- | --- |
  | 系统 | `/api/health`、`/api/llm/status` |
  | 认证 | `/api/auth/login`、`/api/auth/register`、`/api/auth/me`、`/api/auth/change-password` |
  | 农业数据 | `/api/greenhouses`、`/api/sensors`、`/api/sensor-data/realtime|history|anomalies`、`/api/dashboard/environment`、`/api/agriculture-data/current` |
  | 知识库 | `/api/knowledge/documents`、`/api/knowledge/upload`、`/api/knowledge/search`、`/api/knowledge/answer`、`/api/knowledge/retrieval-logs` |
  | Agent | `/api/agent/tools`、`/api/agent/chat` |
  | 设备 | `/api/devices`、`/api/device-commands`、`/api/devices/:id/commands` |
  | 问诊 | `/api/diagnosis`（图片 / 视频）、`/api/patrols` |
  | 商品 | `/api/products` |
  | 语音 | `/api/tts`（POST 文本 → WAV） |

- **共享包 `packages/shared`**：前后端共同依赖的类型、枚举与常量（含导航模块路由）。
- **权限**：除健康检查和登录外，业务接口均校验签名登录凭证；**管理员**可维护知识库、控制设备并查看全量记录，**普通用户**只能维护 / 查看自己的记录、设备仅可查看。完整权限矩阵见 `docs/authentication.md`。

---

## 四、环境要求

- **Node.js** 20.19—24.x，推荐 22 LTS
- **npm** 10 或更高版本
- **Python 3**（可选）：YOLO 图片识别与离线语音合成需要；不配置时对应功能降级，其余功能正常

---

## 五、快速开始（首次运行）

### 1. 一键初始化（推荐）

项目可放在任意磁盘和目录（支持中文及空格路径）。**新电脑或移动 / 复制项目后，不要复用旧的 `node_modules`，在项目根目录运行：**

```
npm run setup
```

该命令会：保留已有 `.env`（缺失时从 `.env.example` 创建）→ 安装依赖 → 重建 Workspace 链接 → 生成 Prisma Client → 执行数据库迁移 → 空库写入种子数据。已有数据时跳过种子写入，**不会清空业务数据**。

### 2. 检查环境

```
npm run doctor
```

可查看 Node/npm 版本、Workspace 链接、密钥、上传目录、端口占用及 Python/YOLO 环境是否就绪。

### 3. 配置 Python（YOLO 与语音合成）

先在 `.env` 配置 Python 环境（见下一节），再运行：

```
npm run setup:yolo
```

### 4. 启动前后端

```
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

### 5. 登录

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 管理员 | `farmer@example.com` | `Admin@123456` |
| 普通用户 | `user@example.com` | `User@123456` |

> 默认密码仅用于本地演示，首次登录后请在「系统设置」中修改。

---

## 六、Python 环境配置（YOLO 识别 + 离线语音）

系统**不再自动探测** Python 环境，必须由你在 `.env` 中手动指定一种（任选其一）：

**方式一：使用项目 `.venv` 虚拟环境**（目录可填绝对路径，或相对项目根目录的路径）

```
PYTHON_ENV_PATH=.venv
```

**方式二：使用电脑上已安装的全局 Python**（填解释器路径，或填 PATH 中的命令名 `python`）

```
PYTHON_EXEC=python
```

**方式三：使用 Conda 管理的 Python 环境**（填该环境内 `python.exe` 的绝对路径）

```
PYTHON_EXEC=C:\Users\<你的用户名>\miniconda3\envs\<环境名>\python.exe
```

说明：

- `PYTHON_ENV_PATH` 填**环境目录**，程序会自动在其中定位 Windows 的 `Scripts/python.exe`、Conda 环境根的 `python.exe`，或 Linux/macOS 的 `bin/python`。
- `PYTHON_EXEC` 直接填**解释器文件路径**，最精确，适合任意环境（全局 Python、`.venv`、Conda 等）。
- 两个变量都不配置时，图片识别与离线语音合成会降级，但网站仍可正常启动。
- 执行 `npm run doctor` 可查看当前生效的解释器及来源。

**YOLO 图片识别**：Ultralytics 的运行配置保存在 `apps/api/.ultralytics`，不依赖当前用户的 AppData 权限，并会在首次检查或推理时自动创建。

- 检测模型放在 `apps/api/models/`，当前生效为**玉米 11 类病害模型** `corn_disease_best.pt`（类别：大斑病、褐斑病、锈病、黑穗病、霜霉病、草地贪夜蛾幼虫、灰斑病、健康、条纹矮缩病、玉米螟、玉米螟幼虫）。如需切换模型，在 `.env` 设置 `YOLO_MODEL_PATH`（相对 `apps/api` 或绝对路径），重启后端生效。

**离线语音合成（TTS）**：后端 `/api/tts` 通过 sherpa-onnx 合成中文语音：

- 依赖所选 Python 环境安装 `sherpa-onnx` 包（`pip install sherpa-onnx`）。
- VITS 中文模型位于 `apps/api/models/tts-zh-ll/sherpa-onnx-vits-zh-ll/`（`model.onnx` + `tokens.txt` + `lexicon.txt`）。
- 合成入口脚本 `apps/api/scripts/sherpa_tts_once.py`；模型每次加载约 2—3 秒，完全离线、无外部依赖。
- 未安装依赖或模型缺失时，`/api/tts` 返回 500，前端自动回退浏览器自带语音播报。

---

## 七、使用指南（操作说明）

### 1. 数字人工作台（首页）

- **主舞台**：登录后首页即可看到小墨（2D 帧动画），透明、无边框展示；左侧为对话窗，可直接与「虚拟农艺专家」小墨对话。
- **动作联动**：小墨动作由业务状态自动驱动——收到提问切到「思考」（摇晃），收到回复播放「讲话」（挤压）并短暂待机（呼吸）；待机时周期眨眼。开发模式下主舞台下方「开发调试」区可手动切换动作（Idle / Wave / Listening / Thinking / Talking / 恢复自动）。
- **语音回答**：在「系统设置」开启「启用数字人语音回答」后，收到回复时自动播报（优先后端离线合成 WAV，失败回退浏览器自带语音）。
- **入口卡片**：主舞台下方提供「环境遥测」（→ 农业数据）与「叶部问诊」（→ 问诊页）两个快捷入口。
- **全站背景**：全站使用玉米田园背景图（叠加 84% 浅色蒙层），左侧导航与内容卡片保持白色不透明以保证可读性。
- **悬浮陪伴**：进入其他页面时小墨变为悬浮助手，可**拖拽位置**，支持**展开 / 收起 / 隐藏**对话；悬浮窗内可勾选「减弱动画」降低帧动画频率；对话与任务在页面间切换时连续保留。

### 2. AI 巡田（自主演示）

标准演示约 **60～90 秒**，流程为：读取环境 → 分析叶片 → 检索知识 → 生成建议 → 保存报告 → 人工复核。

- 在「AI 巡田」页启动巡田，**先选择目标大棚**；环境数据（湿度、温度、土壤湿度）读取农业数据模块（农业环境数据中心）中该大棚的实时监测数据，预警阈值可调。
- 支持**暂停 / 继续 / 取消 / 重新开始 / 复位选择**；重复启动不会并发创建多份任务，重试保存不重复写入报告。
- 全程展示实时证据面板（环境、视觉、知识来源）与小墨字幕 / 动作联动。
- 报告与人工复核结果持久化，可在「历史记录」再次打开查看详情。
- 主流程不依赖外部大模型或设备；断网时本地前后端仍可运行，失败时显示具体失败阶段并可重试。

### 3. AI 农业问诊

在问诊页上传作物叶片图片（支持图片与视频），系统调用 YOLO 模型（玉米 11 类）识别并返回诊断结果与农业建议；识别结果与知识库回答会关联到数字人助手。当前识别为真实推理链路（基于 `.env` 配置的 Python 环境），演示样例与真实结果在界面中有明确区分。

### 4. 其他页面

- **农业数据**：大棚管理、传感器列表与环境指标 Dashboard（实时、历史、异常）。
- **农产品管理**：维护农产品（名称 / 品类 / 产地 / 溯源信息）并生成销售文案，支持批量删除。
- **历史记录 / 设备 / 知识库**：按角色权限查看、维护与操作；知识库支持文档上传、全文检索与 RAG 问答。

---

## 八、数据库与测试

### 数据库操作

```
npm run db:generate   # 生成 Prisma Client
npm run db:migrate    # 应用数据库迁移
npm run db:seed       # 空库时写入基础测试数据
npm run db:seed:reset # 清空本地业务数据并恢复演示数据（谨慎）
```

本地 SQLite 数据库位于 `apps/api/prisma/dev.db`，用于开发运行，不纳入版本管理。

### 测试命令

| 命令 | 说明 |
| --- | --- |
| `npm run test:models` | 验证核心数据模型 |
| `npm run test:auth` | 验证登录、角色权限与设备控制鉴权 |
| `npm run test:knowledge` | 验证农业知识库 RAG |
| `npm run test:agent` | 验证 Agent 对话 |
| `npm run test:persistence` | 验证持久化 |
| `npm run test:patrol-demo` | 验证巡田仿真主流程（隔离库、禁外部 fetch） |

### 工程检查

```
npm run typecheck   # 全仓类型检查
npm run lint        # 前端代码规范
npm run build       # 全仓构建
```

---

## 九、开发进度（数字人打磨计划）

整体按 6 个阶段推进，完整计划见 `plan.md`，执行清单见 `todo.md`。

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 阶段 1 | 全局小墨数字人、跨页面连续对话、单实例渲染 | ✅ 完成 |
| 阶段 2 | 可控仿真巡田闭环（高湿→叶片分析→知识检索→报告） | ✅ 完成 |
| 阶段 3 | 模型资产升级、口型 / 表情 / 表演 | ⬜ 下一步 |
| 阶段 4 | 番茄五分类模型训练与验证 | ⬜ 未开始 |
| 阶段 5 | 真实诊断与全系统联动 | ⬜ 未开始 |
| 阶段 6 | 视觉精修与交付验收 | ⬜ 未开始 |

**已随阶段交付的增量能力**：小墨 2D 桌宠素材接入、后端离线 TTS 服务（`/api/tts`）、玉米 11 类病害模型替换、全站玉米背景图。

**后续目标（本轮不阻塞）**：语音输入（ASR）、豆包声音与动态合成、音素驱动口型、真实大棚 IoT 接入、更多作物与多叶片检测。详细阶段规格见 `docs/assistant-stage1.md`、`docs/assistant-stage2.md`。

---

## 十、源码包说明（交付 / 迁移）

本目录用于继续开发，也可整理成可移植源码包。复制或交付项目时**不要包含**：

- 根目录及各 Workspace 下的 `node_modules`；
- `dist`、`.vite`、`*.tsbuildinfo` 等构建产物；
- `apps/api/prisma/*.db*` 本地数据库文件；
- `apps/api/uploads` 中的上传图片和识别结果；
- `apps/api/.ultralytics` 本机 YOLO 配置缓存；
- `.env` 和 `apps/api/.env` 中的本机密钥与私有配置。

**应保留**：`.env.example`、`package-lock.json`、Prisma 迁移与种子脚本、`requirements-yolo.txt`、YOLO 权重（`corn_disease_best.pt`）、TTS 中文模型（`apps/api/models/tts-zh-ll/`）、网页使用的数字人素材（`public/xiaomo/`、`public/backgrounds/`）。

接收方解压后运行 `npm run setup` 即可重新安装依赖并创建干净数据库；需要图片识别与离线语音时，按上文「Python 环境配置」在 `.env` 指定自己的 Python 环境（并安装 `sherpa-onnx`）后再运行 `npm run setup:yolo`。

---

## 十一、替换 YOLO 模型

当前生效模型位于 `apps/api/models/corn_disease_best.pt`（玉米 11 类）。自行训练新模型后，可覆盖该文件；若使用不同文件名，通过 `YOLO_MODEL_PATH` 指定相对于 `apps/api` 的路径。推理入口位于 `apps/api/scripts/yolo_inference.py`，新模型的类别名称和输出格式应继续与后端诊断接口兼容。

---

## 十二、常见问题

**Q：为什么网页能启动但图片问诊提示未配置 Python？**

A：YOLO 识别需要你在 `.env` 中手动指定 Python 环境（`.venv` / 全局 / Conda 均可），详见「Python 环境配置」。不配置时仅图片识别降级，其余功能正常。

**Q：数字人语音回答没有声音？**

A：先在「系统设置」开启「启用数字人语音回答」。后端离线合成需要 Python 环境安装 `sherpa-onnx` 且模型目录 `apps/api/models/tts-zh-ll/` 完整；任一项缺失时前端会自动回退浏览器自带语音，仍可播报。

**Q：复制到新电脑后需要做什么？**

A：不复制 `node_modules`、`dist`、`.db` 和 `.env`，在新目录运行 `npm run setup`，需要图片识别与离线语音时再配置 Python 并运行 `npm run setup:yolo`。

**Q：语音播报为什么口型不同步？**

A：当前播报为语音合成 + 简单动作联动，口型逐字同步属后续阶段（音素驱动口型）目标。
