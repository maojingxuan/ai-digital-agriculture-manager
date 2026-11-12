# AI 数字农业管家

> 一个以数字人「小墨」为统一交互入口，集农业环境监测、知识库、作物病害问诊、自主巡田、设备仿真控制、农产品管理和业务留痕于一体的全栈 MVP。

本 README 根据 **2026-11-02 当前工作区代码**整理，既是项目说明，也是从安装、配置到日常使用和维护的操作手册。项目中既有真实执行链路，也有为 MVP 演示保留的模拟能力；下文会明确标注二者边界。

## 目录

- [1. 项目介绍](#1-项目介绍)
- [2. 当前能力与边界](#2-当前能力与边界)
- [3. 技术架构](#3-技术架构)
- [4. 目录结构](#4-目录结构)
- [5. 环境要求](#5-环境要求)
- [6. 快速开始](#6-快速开始)
- [7. 环境变量配置](#7-环境变量配置)
- [8. YOLO、LLM 与语音配置](#8-yolollm-与语音配置)
- [9. 详细操作手册](#9-详细操作手册)
- [10. 权限说明](#10-权限说明)
- [11. 数据库与本地数据](#11-数据库与本地数据)
- [12. 常用开发命令](#12-常用开发命令)
- [13. API 概览](#13-api-概览)
- [14. 部署与安全](#14-部署与安全)
- [15. 常见问题](#15-常见问题)

---

## 1. 项目介绍

### 1.1 项目定位

本项目面向智慧农业演示、教学和 MVP 验证场景。用户登录后，可通过 2D 数字人「小墨」查询农业数据、检索农业知识、发起作物问诊、执行仿真巡田、查看设备与业务记录。

当前主题以 **玉米生产管理** 为主：

- 问诊模型资产为 `corn_disease_best.pt`，用于玉米病虫害图片与视频关键帧识别；
- 种子数据包含玉米示范田、传感器、设备、产品和农业知识；
- 数字人对话、知识库提示词和页面文案主要围绕玉米场景设计。

### 1.2 核心模块

| 模块 | 页面 | 当前能力 |
| --- | --- | --- |
| 数字人工作台 | `/` | 小墨帧动画、文字对话、语音输入、回答播报、跨页面会话状态 |
| 农业知识库 | `/knowledge` | 文档上传/录入、自动切片、本地向量化、分类与高级筛选、切片查看 |
| AI 农业问诊 | `/diagnosis` | 图片上传、摄像头拍照、视频录制、YOLO 检测、关键帧分析、知识库/LLM 联动 |
| AI 巡田 | `/patrol` | 农业数据联动的可暂停仿真流程、证据展示、报告保存、人工复核 |
| 农业数据 | `/data` | 大棚选择、实时指标、历史曲线、异常与建议；管理员可增删自定义大棚 |
| 设备控制 | `/devices` | 查看设备状态；管理员下发仿真开关命令并保存审计记录 |
| 农产品管理 | `/products` | 新建产品、调用当前 Ollama/DeepSeek 模型生成介绍与讲解词、保存溯源信息、批量删除 |
| 历史记录 | `/records` | 查看问诊记录、巡田证据和人工复核状态 |
| 系统设置 | `/settings` | 查看账号与角色、修改密码 |

### 1.3 主要特点

- npm Workspaces 管理前端、后端和共享类型；
- React 19 + Express 5 + Prisma + SQLite，适合本地快速启动；
- 登录、角色权限、用户数据隔离、设备命令与安全事件审计；
- 上传文件类型/大小限制及短期签名媒体 URL；
- 兼容 OpenAI Chat Completions 格式的 LLM 服务；
- 可选的本地 YOLO 与 sherpa-onnx 中文离线语音；
- 未配置 LLM 或 YOLO 时，非相关模块仍可运行。

---

## 2. 当前能力与边界

使用项目前请先区分真实能力和演示能力：

| 能力 | 实现状态 | 说明 |
| --- | --- | --- |
| 登录、注册、改密和角色鉴权 | 真实 | 账号保存在 SQLite，密码使用 scrypt 加盐哈希；普通会话令牌 8 小时有效，勾选“记住密码”后为 30 天 |
| 知识文档切片与检索 | 真实本地实现 | 使用 96 维确定性本地 Embedding 和余弦相似度，不是外部向量数据库 |
| LLM 农业回答 | 可选真实调用 | 配置兼容接口后调用真实模型；未配置时使用本地规则/检索结果组合 |
| 图片/视频病害识别 | 可选真实推理 | Python、Ultralytics、OpenCV 和模型路径正确时执行本地 YOLO |
| 农业传感器数据 | 模拟 | 数据由 `sensorSimulator.ts` 生成，包含昼夜趋势和异常，不连接真实 IoT |
| 自主巡田 | 可控仿真 | 读取模拟农业数据，视觉证据使用内置 SVG 预设，不执行真实巡田视觉推理 |
| 手动巡田上传 | 模拟报告 | 上传图片仅保存并生成固定结构报告，不应作为真实识别结论 |
| 设备控制 | 数据库仿真 | 修改数据库中的设备运行状态并记录命令，不控制真实风机、水泵或补光灯 |
| 天气与销售数据 Tool | 模拟 | Agent 返回演示数据，并非实时气象或真实订单数据 |
| 产品“AI 文案” | 可选真实调用 | 使用当前选中的 Ollama 或 DeepSeek 生成，校验后保存；模型不可用时提示错误，不保存模板文案 |
| 语音输入 | 浏览器能力 | 依赖 Chrome/Edge Web Speech API、浏览器权限和网络/系统支持 |
| 回答播报 | 本地优先、浏览器回退 | 优先请求后端 sherpa-onnx WAV，失败后使用浏览器 `speechSynthesis` |

> 问诊页虽然提供“沃柑、甘蔗、玉米”选项，但仓库当前附带的是玉米模型。非玉米图片的模型结论不具备可靠性。

---

## 3. 技术架构

### 3.1 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite 7、React Router 7、Lucide、React Markdown |
| 后端 | Node.js、Express 5、TypeScript、Zod、Multer |
| 数据层 | Prisma 6、SQLite |
| 共享层 | 独立 Workspace `@agri/shared`，维护前后端类型和巡田协议 |
| 视觉识别 | Python、Ultralytics YOLO、OpenCV、Pillow |
| 大模型 | OpenAI Chat Completions 兼容接口 |
| 语音 | Web Speech API；可选 sherpa-onnx + VITS 中文模型 |
| 数字人 | React 驱动的透明 PNG 帧动画 |

### 3.2 请求链路

```text
浏览器（React/Vite）
        │ Bearer Token
        ▼
Express API ── Prisma ── SQLite
    │   │          ├─ 用户/角色
    │   │          ├─ 问诊/巡田/产品
    │   │          ├─ 知识切片/检索日志
    │   │          └─ 设备/Agent/安全审计
    │   ├─ Python YOLO ── 本地模型权重
    │   ├─ sherpa-onnx ── 本地 VITS 模型
    │   └─ LLM 兼容接口（可选）
    └─ 模拟传感器与可控巡田服务
```

### 3.3 鉴权流程

`/api/health`、`/api/auth/login` 和 `/api/auth/register` 为公开接口。其他 `/api/*` 接口均经过 Bearer Token 校验，服务端会重新查询账号的真实角色，不信任前端传入的角色字段。

---

## 4. 目录结构

```text
新数字人系统/
├─ apps/
│  ├─ api/                         Express API
│  │  ├─ src/
│  │  │  ├─ config/               .env 与路径解析
│  │  │  ├─ middleware/           登录鉴权
│  │  │  ├─ routes/               仿真巡田路由
│  │  │  ├─ services/             Agent、知识库、YOLO、TTS、持久化等
│  │  │  └─ server.ts             服务入口与主要 API
│  │  ├─ prisma/                  Schema、迁移、种子与测试
│  │  ├─ scripts/                 YOLO/TTS Python 脚本
│  │  ├─ models/                  本地模型资产
│  │  └─ uploads/                 运行时上传文件（Git 忽略）
│  └─ web/                         React 前端
│     ├─ public/
│     │  ├─ xiaomo/               小墨帧动画
│     │  ├─ backgrounds/           页面背景
│     │  └─ demo/                  巡田演示叶片 SVG
│     └─ src/
│        ├─ assistant/             数字人状态、对话、语音、巡田联动
│        ├─ auth/                  登录状态
│        ├─ components/            数字人及巡田组件
│        ├─ pages/                 9 个业务页面
│        └─ services/api.ts        前端 API 客户端
├─ packages/shared/                前后端共享类型
├─ docs/                           架构、认证、数据库和阶段说明
├─ scripts/                        初始化、环境检查与集成测试脚本
├─ package.json                    根脚本与 Workspace 配置
├─ .env.example                    配置模板
└─ requirements-yolo.txt           YOLO Python 依赖
```

以下目录/文件属于本地运行产物，不应提交或交付：`node_modules/`、`dist/`、`.env`、`*.db*`、`uploads/`、`.ultralytics/`、`*.tsbuildinfo`。

---

## 5. 环境要求

### 必需

- Node.js `>=20.19 <25`，仓库 `.node-version` 推荐 **Node 22**；
- npm `>=10`；
- Windows、Linux 或 macOS 均可，项目路径支持中文和空格。

### 可选

- Python 3：本地 YOLO 和后端离线 TTS 使用；
- Chrome 或 Edge：摄像头、麦克风和 Web Speech API 兼容性较好；
- 可访问的 LLM 兼容接口或本地 Ollama。

检查版本：

```bash
node -v
npm -v
```

---

## 6. 快速开始

### 6.1 首次初始化

在项目根目录执行：

```bash
npm run setup
```

该脚本会依次：

1. 缺少 `.env` 时从 `.env.example` 创建；已有 `.env` 不覆盖；
2. 运行 `npm ci` 安装锁定版本依赖并重建 Workspace 链接；
3. 生成或保留长度不少于 32 位的 `AUTH_SECRET`；
4. 生成 Prisma Client；
5. 执行数据库迁移；
6. 空库写入演示数据；已有业务数据时跳过重置，只补齐演示账号权限。

> 不要直接复制其他电脑的 `node_modules`。移动项目或更换 Node.js 版本后，应重新执行 `npm run setup`。

### 6.2 检查环境

```bash
npm run doctor
```

检查项包括 Node/npm 版本、Workspace 链接、Prisma Schema、签名密钥、上传目录、端口和 Python/YOLO 环境。

### 6.3 启动

```bash
npm run dev
```

启动地址：

- 前端：<http://localhost:5173>
- 后端健康检查：<http://localhost:3001/api/health>

根命令会并行启动 API 和 Web。当前 API 的 `dev` 脚本是“先编译再运行”，**不会监听后端源码变化**；修改 `apps/api/src` 后需要重启 `npm run dev`。

### 6.4 演示账号

| 角色 | 账号 | 默认密码 |
| --- | --- | --- |
| 管理员 | `farmer@example.com` | `Admin@123456` |
| 普通用户 | `user@example.com` | `User@123456` |

默认密码来自种子脚本，只适合本地演示。首次登录后请进入“系统设置”修改。

---

## 7. 环境变量配置

后端配置文件优先级为 `apps/api/.env` → 根目录 `.env`；后加载的根配置不会覆盖 API 目录中已经存在的同名变量。Vite 的项目根目录是 `apps/web`，因此前端专用的 `VITE_*` 变量应写入 `apps/web/.env` 或在启动/构建进程中注入。本地开发不设置也能工作：前端会使用 `/api`，再由 Vite 代理到 3001 端口。

| 变量 | 示例/默认 | 用途 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 未设置时为 `/api` | 前端 API 根地址；写在 `apps/web/.env` 或构建环境中 |
| `API_PORT` | `3001` | 后端端口 |
| `UPLOAD_DIR` | `uploads` | 上传目录；相对路径以 `apps/api` 为基准 |
| `AUTH_SECRET` | 由 `npm run auth:init` 生成 | 登录令牌和媒体签名根密钥，至少 32 位 |
| `ADMIN_INVITE_CODE` | 由 `npm run auth:init` 生成 | 注册管理员时的一次性部署秘密，不在页面展示 |
| `SEED_ADMIN_PASSWORD` | 由 `npm run auth:init` 生成 | 演示管理员种子密码，仅保存在本机 `.env` |
| `SEED_USER_PASSWORD` | 由 `npm run auth:init` 生成 | 演示普通用户种子密码，仅保存在本机 `.env` |
| `PYTHON_EXEC` | `python` 或解释器绝对路径 | YOLO 和当前 TTS 服务使用的 Python |
| `PYTHON_ENV_PATH` | `.venv` | YOLO 可从虚拟环境目录定位解释器 |
| `YOLO_MODEL_PATH` | `models/corn_disease_best.pt` | 模型权重路径，相对 `apps/api` |
| `YOLO_SCRIPT_PATH` | `scripts/yolo_inference.py` | 图片推理脚本 |
| `YOLO_VIDEO_SCRIPT_PATH` | `scripts/yolo_video_diagnosis.py` | 视频推理脚本 |
| `YOLO_CONFIG_DIR` | `.ultralytics` | Ultralytics 本地配置目录 |
| `LLM_PROVIDER` | `deepseek` | 首次启动的默认模型；管理员选择会覆盖此值 |
| `DEEPSEEK_API_KEY` | 留空则 DeepSeek 不可用 | DeepSeek 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek 兼容接口 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 模型 |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | 本地 Ollama 兼容接口 |
| `OLLAMA_MODEL` | `qwen2.5:7b` | 本地模型名称 |
| `CORS_ALLOWED_ORIGINS` | 逗号分隔域名 | 追加浏览器跨域白名单 |
| `HTTPS_ENABLED` | `false` | 是否由 API 自己启用 HTTPS |
| `TLS_CERT_PATH` | PEM 证书路径 | 内置 HTTPS 证书 |
| `TLS_KEY_PATH` | PEM 私钥路径 | 内置 HTTPS 私钥 |

推荐的根目录 `.env` 关键配置：

```dotenv
API_PORT=3001
UPLOAD_DIR=uploads

AUTH_SECRET=
ADMIN_INVITE_CODE=
SEED_ADMIN_PASSWORD=
SEED_USER_PASSWORD=

PYTHON_EXEC=C:\Path\To\python.exe
YOLO_MODEL_PATH=models/corn_disease_best.pt

LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen2.5:7b
```

如需让前端绕过本地代理直连 API，可另建 `apps/web/.env`：

```dotenv
VITE_API_BASE_URL=http://localhost:3001/api
```

修改后端配置后应重启 API；修改 `VITE_*` 后应重启 Vite。

---

## 8. YOLO、LLM 与语音配置

### 8.1 YOLO 图片/视频识别

仓库当前实际存在的模型文件是：

```text
apps/api/models/corn_disease_best.pt
```

因此请在 `.env` 明确配置：

```dotenv
YOLO_MODEL_PATH=models/corn_disease_best.pt
```

> 当前代码默认回退名和 `doctor` 检查名仍是 `crop_disease_yolo11.pt`，而该文件不在当前仓库。若未显式设置上述变量，问诊推理会提示找不到模型；`doctor` 也可能继续报告旧默认文件缺失。这不影响 Node.js 基础模块启动。

指定 Python 的两种方式：

```dotenv
# 方式一：直接写解释器，最可靠
PYTHON_EXEC=C:\Users\你的用户名\miniconda3\envs\agri\python.exe

# 方式二：仅供 YOLO 从虚拟环境目录定位
PYTHON_ENV_PATH=.venv
```

安装依赖：

```bash
npm run setup:yolo
```

等价依赖位于 `requirements-yolo.txt`：Ultralytics、OpenCV、Pillow。图片推理超时为 180 秒；上传图片最大 10 MB，视频最大 50 MB。

### 8.2 LLM

同时配置 DeepSeek API 和本地 Ollama。管理员在「农业专业知识库」页面的「当前模型」下拉框切换，立即作用于知识问答、诊断和数字人 Agent；选择保存在 `apps/api/data/llm-provider.json`，重启 API 后保持不变。

在 `apps/api/.env`（或项目根目录 `.env`）设置：

```dotenv
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen2.5:7b
```

先启动 Ollama 并下载模型：

```powershell
ollama pull qwen2.5:7b
```

旧版 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 仍可用作兼容回退。DeepSeek 请求超时为 20 秒，Ollama 为 120 秒（便于 CPU 推理）。所选模型不可用时，知识问答和诊断仍会回退到本地规则与检索结果。

### 8.3 后端离线 TTS

当前 TTS 使用常驻 Python 子进程加载 sherpa-onnx VITS 模型，请准备：

```text
apps/api/models/tts-zh-ll/sherpa-onnx-vits-zh-ll/
├─ model.onnx
├─ tokens.txt
├─ lexicon.txt
└─ dict/...
```

安装依赖：

```bash
"C:\Path\To\python.exe" -m pip install sherpa-onnx
```

务必设置 `PYTHON_EXEC` 为可运行 sherpa-onnx 的解释器。当前 TTS 服务不读取 `PYTHON_ENV_PATH`，且源码中存在一个开发机绝对路径兜底；其他电脑不能依赖该兜底。

TTS 模型目录在 `.gitignore` 中，若复制源码到新电脑，需要单独携带或重新下载模型。服务启动后会后台预热；合成失败时前端自动尝试浏览器语音。

---

## 9. 详细操作手册

### 9.1 登录与注册

1. 打开 <http://localhost:5173>。
2. 可使用本机 `.env` 中初始化的演示账号密码登录，也可切换到“注册新账号”；页面不会展示任何密码。
3. 登录时可勾选“记住密码”在当前设备保持登录 30 天；系统只保存签名登录令牌，不在浏览器中保存明文密码。未勾选时，令牌仅保存在当前浏览器会话中。
4. 注册账号支持邮箱或中国大陆 11 位手机号，密码为 8～128 位。
5. 注册管理员需要 `.env` 中的 `ADMIN_INVITE_CODE`；未配置或不匹配时会被拒绝。
6. 同一 IP + 账号连续 5 次登录失败会锁定 15 分钟；该锁定存在后端内存中，服务重启后清空。

### 9.2 数字人工作台

登录后首页显示小墨主舞台和对话框。

- 在输入框中提问，或点击“1号玉米大棚环境怎么样？”等快捷问题；该演示问题会立即展示固定环境快照，不等待 Agent 或模型；
- 点击麦克风开始语音输入，说完后浏览器自动提交；需要浏览器支持并允许麦克风权限；
- 发送后 60 秒未完成会在前端超时，可点击重试；“停止”只终止等待，已经开始的后端写入不保证撤销；
- 顶部扬声器按钮控制回答自动播报，旁边按钮可手动播报/停止最近回答；
- 固定环境快照优先播放预生成语音，失败后回退浏览器语音；其他回答优先调用 `/api/tts`，失败后回退浏览器语音；
- 对话和当前任务在站内切换页面时保留，刷新页面或退出账号后重置；
- 在其他页面，小墨变为可拖动悬浮助手，可展开、收起、隐藏；隐藏后可从右下角入口恢复；
- 展开悬浮助手后可启用“减弱动画”。

小墨当前动画映射：待机为呼吸帧、思考为点头、讲话为张嘴、打招呼为挥手，并在待机时周期眨眼。开发模式首页提供手动动作调试。

### 9.3 农业知识库

普通用户可以浏览文档和切片；管理员可以新增和删除。

管理员上传文档：

1. 进入“农业专业知识库”。
2. 选择或拖入 `.txt`、`.md`、`.markdown`、`.csv` 文件，最大 10 MB。
3. 填写标题和分类并提交。
4. 后端读取文本、计算内容哈希、分块并写入本地向量。

管理员手动录入：填写标题、分类和正文后提交。重复内容会按服务端规则拒绝或去重。

文档列表支持：

- 关键词和分类筛选；
- 入库时间、来源类型、来源机构和排序等高级筛选；
- 查看每个文档的切片、估算 Token 数；
- 管理员删除文档及其切片。

知识问答主要通过小墨对话触发；Agent 会调用知识检索工具。可靠片段不足时系统应拒绝给出无依据结论，涉及农药和安全间隔期时会附加风险提示。

### 9.4 AI 农业问诊

#### 图片方式

1. 进入“AI 农业问诊”，作物类型建议选择“玉米”。
2. 上传 JPG/JPEG/PNG/WEBP/GIF/BMP，或授权摄像头后拍照。
3. 可填写症状描述，帮助知识检索和 LLM 综合分析。
4. 点击“启动 YOLO 智能诊断”。
5. 查看标注图、病害名称、置信度、风险等级、分析、处置建议和知识来源。

#### 视频方式

1. 在摄像头面板选择设备并授权。
2. 开始录制，拍摄光线充足、画面稳定的短视频。
3. 系统保存视频、抽取关键帧、逐帧 YOLO 检测并聚合结果。
4. 报告中可查看关键帧、标注图、原视频和跨帧结论。

支持 MP4、WebM、MOV、AVI、MPEG/MPG，最大 50 MB。结果会写入问诊历史。若报告显示 `visionError`，表示 YOLO 没有成功运行，不能把降级文案理解为模型确认。

### 9.5 AI 巡田

#### 小墨自主巡田（推荐的演示流程）

1. 选择大棚。
2. 设置空气湿度预警阈值，范围 70%～95%，默认 85%。
3. 点击“开始自主巡田”。
4. 流程依次执行：
   - 读取大棚监测数据；
   - 判断环境风险；
   - 查看与状态对应的叶片演示；
   - 检索本地知识；
   - 整理建议与人工复核项；
   - 保存巡田报告。
5. 运行中可暂停、继续或取消；失败后可重试当前步骤。
6. 页面状态不同步时先点“同步任务状态”，不要重复启动。
7. 完成后进入“历史记录”查看报告；逐项完成线下检查后，勾选确认并标记人工复核完成。

标准演示约 60 秒，其中包含每一步的证据展示时间。这里的传感器数据来自模拟器，叶片图是预设 SVG，流程不会下发设备指令，也不会生成未经人工核实的用药处方。

#### 手动上传巡检样本

页面底部折叠区是历史备用通道。填写地块、作物并上传图片后，后端保存图片并生成固定模板报告，不执行 YOLO；它只适合演示数据持久化。

### 9.6 农业环境数据中心

1. 在顶部选择大棚。
2. 查看实时温度、空气湿度、土壤湿度、光照等指标。
3. 查看温度、湿度、土壤湿度和光照历史曲线。
4. 查看大棚状态、异常数据和 AI 建议。

管理员还可以：

- 新增自定义大棚：填写名称，可选地点和面积，并输入当前管理员密码确认；
- 删除自定义大棚：再次输入管理员密码；系统内置大棚不能删除。

历史查询接口允许 1～720 小时范围：24 小时看板使用 5 分钟采样，较长时间范围会自动降采样；异常列表按 15 分钟聚合。当前值按 5 分钟时间桶生成，页面可见时每 5 分钟自动刷新，重新打开页面后立即同步。模拟器会联动灌溉、通风与夜间降温事件，并按自定义大棚 ID 生成稳定的独立曲线；这些数据仍是教学与演示数据，不等同于连接了真实硬件。

### 9.7 设备控制

- 普通用户只能查看设备状态；
- 管理员可开启/关闭通风、灌溉和补光设备；
- 服务端会校验命令与设备类型是否匹配；
- 每次成功命令都会保存操作人、参数、执行状态和时间。

当前控制只更新数据库状态。界面按钮会直接下发已确认命令，没有额外弹窗；请勿把它接到真实设备网关后直接用于生产。

### 9.8 农产品管理

1. 填写商品名称、品类和产地；采摘时间、种植方式、溯源信息可选。
2. 点击“AI生成商品描述并保存”。
3. 系统保存商品、模板化介绍文案和可选溯源事件。
4. 在列表勾选一个或多个商品，确认后批量删除。

普通用户只能看到和删除自己的商品；管理员可以查看和管理全部用户商品，并在此页切换 Ollama / DeepSeek 模型（与知识库共用选择）。保存时调用当前模型生成商品介绍和数字人讲解词。模型不可用或输出未通过资料校验时，表单内容保留，商品不会创建。

### 9.9 历史记录

- “问诊记录”显示作物、疑似病害和风险等级，点击“详细记录”查看完整分析；
- “巡田报告”可展开查看环境、视觉、知识来源、建议和人工复核状态；
- 普通用户只看到自己的记录，管理员看到全部记录；
- 上传媒体使用 15 分钟签名 URL，长时间停留后图片 403 时刷新页面即可重新签发。

### 9.10 系统设置

修改密码时输入当前密码和 8～128 位新密码。成功后约 0.8 秒自动退出，旧令牌立即失效，需要使用新密码重新登录。

当前页面中的“农场名称”“默认作物”和“启用数字人语音回答”是展示型控件，尚未持久化；实际回答自动播报请使用小墨对话框顶部的扬声器按钮。

---

## 10. 权限说明

| 操作 | 普通用户 | 管理员 |
| --- | --- | --- |
| 查看环境和设备 | 可以 | 可以 |
| 使用数字人和问诊 | 可以 | 可以 |
| 查看问诊/巡田/商品 | 仅自己的数据 | 全部用户数据 |
| 新建/删除自己的商品 | 可以 | 可以，并可管理全部商品 |
| 浏览知识文档与切片 | 可以 | 可以 |
| 上传、录入、删除知识 | 不可以 | 可以 |
| 新增/删除自定义大棚 | 不可以 | 可以，需再次验证密码 |
| 下发设备命令 | 不可以 | 可以 |
| 查看设备命令审计 | 不可以 | 可以 |
| 查看知识检索日志/安全事件 API | 不可以 | 可以 |

通过 Agent 控制设备同样检查管理员角色。涉及控制动作的 Agent 流程还保留确认参数和行为日志。

---

## 11. 数据库与本地数据

### 11.1 数据库位置

开发数据库通常位于：

```text
apps/api/prisma/dev.db
```

SQLite 文件及 WAL/Journal 已被 Git 忽略。

### 11.2 主要数据模型

- `User`：用户、角色、密码哈希；
- `Greenhouse`、`Sensor`、`SensorData`、`Crop`：大棚、传感器和作物；
- `DiseaseDiagnosis`、`PatrolRecord`、`PatrolDemoRun`、`Warning`：问诊、巡田和预警；
- `Product`、`ProductTrace`：农产品和溯源；
- `Device`、`DeviceCommand`：设备及命令审计；
- `AgentConversation`、`AgentActionLog`：Agent 会话和工具行为；
- `KnowledgeDocument`、`KnowledgeChunk`、`KnowledgeRetrievalLog`：知识库；
- `SecurityEvent`：登录、注册和改密安全审计。

### 11.3 数据库命令

```bash
npm run db:generate       # 生成 Prisma Client
npm run db:migrate        # 应用已有迁移
npm run db:seed           # 空库写入演示数据；非空库保护现有数据
npm run db:seed:reset     # 删除本地业务数据并重建演示数据，谨慎使用
```

开发新 Schema 后创建迁移：

```bash
npm run db:migrate:dev -w apps/api
```

### 11.4 备份

停止 API 后复制 `apps/api/prisma/dev.db` 即可备份业务数据；同时备份 `apps/api/uploads/` 才能保留上传媒体。恢复时保证数据库和上传目录来自同一时间点。

---

## 12. 常用开发命令

| 命令 | 作用 |
| --- | --- |
| `npm run setup` | 初始化 Node 依赖、密钥、Prisma、迁移和种子数据 |
| `npm run setup:yolo` | 在配置的 Python 环境安装 YOLO 依赖 |
| `npm run auth:init` | 生成/保留根 `.env` 中的 `AUTH_SECRET` |
| `npm run doctor` | 检查基础运行环境 |
| `npm run dev` | 启动 API 与 Web |
| `npm run build` | 构建共享包、API 和 Web |
| `npm run typecheck` | 全仓 TypeScript 检查 |
| `npm run lint` | 前端 ESLint |
| `npm run format` | Prettier 格式化全仓，可能改动大量文件 |
| `npm run test:models` | Prisma 核心模型测试 |
| `npm run test:knowledge` | 知识库检索测试 |
| `npm run test:agent` | Agent 工具与路由测试 |
| `npm run test:persistence` | 问诊、巡田和商品持久化测试 |
| `npm run test:auth` | 登录和权限测试 |
| `npm run test:patrol-demo` | 仿真巡田隔离集成测试 |

单独启动：

```bash
npm run dev -w apps/api
npm run dev -w apps/web
```

构建后启动 API：

```bash
npm run build
npm run start -w apps/api
```

---

## 13. API 概览

除标注“公开”外，均需 `Authorization: Bearer <token>`。

| 分组 | 方法与路径 | 说明 |
| --- | --- | --- |
| 系统 | `GET /api/health` | 健康检查，公开 |
| 认证 | `POST /api/auth/login` | 登录，公开 |
| 认证 | `POST /api/auth/register` | 注册，公开 |
| 认证 | `GET /api/auth/me` | 当前用户 |
| 认证 | `POST /api/auth/change-password` | 修改密码 |
| LLM | `GET /api/llm/status` | 配置状态，不返回 Key |
| 大棚 | `GET/POST /api/greenhouses` | 列表/管理员新增 |
| 大棚 | `DELETE /api/greenhouses/:id` | 管理员删除自定义大棚 |
| 传感器 | `GET /api/sensors` | 传感器列表 |
| 传感器 | `GET /api/sensor-data/realtime` | 实时快照 |
| 传感器 | `GET /api/sensor-data/history` | 历史序列 |
| 传感器 | `GET /api/sensor-data/anomalies` | 异常列表 |
| 传感器 | `GET /api/dashboard/environment` | 环境 Dashboard |
| 知识库 | `GET /api/knowledge/documents[/:id]` | 文档列表/详情 |
| 知识库 | `POST /api/knowledge/documents` | 管理员手动录入 |
| 知识库 | `POST /api/knowledge/upload` | 管理员上传文档 |
| 知识库 | `DELETE /api/knowledge/documents/:id` | 管理员删除 |
| 知识库 | `GET /api/knowledge/search` | 语义检索 |
| 知识库 | `POST /api/knowledge/answer` | RAG 回答 |
| 审计 | `GET /api/knowledge/retrieval-logs` | 管理员检索日志 |
| 审计 | `GET /api/security-events` | 管理员安全事件 |
| Agent | `GET /api/agent/tools` | 可用 Tool 列表 |
| Agent | `POST /api/agent/chat` | 小墨对话 |
| 设备 | `GET /api/devices` | 设备列表 |
| 设备 | `GET /api/device-commands` | 管理员命令日志 |
| 设备 | `POST /api/devices/:id/commands` | 管理员控制 |
| 问诊 | `POST/GET /api/diagnosis` | 图片问诊/历史 |
| 问诊 | `POST /api/diagnosis/video` | 视频关键帧问诊 |
| 巡田 | `POST/GET /api/patrols` | 手动模拟报告/历史 |
| 巡田 | `/api/patrol-demo/*` | 仿真任务启动、查询、命令和复核 |
| 商品 | `GET/POST/DELETE /api/products` | 商品列表、新增、批量删除 |
| 语音 | `POST /api/tts` | 文本合成 WAV，最多取前 500 字符 |

上传媒体通过 `/uploads/*` 或 `/api/uploads/*` 访问，必须携带后端签发的 `sig` 和 `exp` 查询参数。

---

## 14. 部署与安全

### 14.1 上线前必须修改

- 使用高强度 `AUTH_SECRET`，不要在不同环境共用；
- 运行 `npm run auth:init` 生成高强度管理员邀请码和种子密码，并妥善保管本机 `.env`；
- 不提交 `.env`、数据库、上传文件或 LLM Key；
- 为 SQLite 和上传目录配置定期备份；
- 将真实前端域名加入 `CORS_ALLOWED_ORIGINS`；
- 使用 HTTPS；
- 若连接真实设备，增加独立设备网关、二次确认、急停和权限审计，不能直接复用当前仿真控制。

### 14.2 HTTPS

推荐用 Nginx/Caddy 终止 TLS，将 `/api` 和 `/uploads` 反向代理到 `127.0.0.1:3001`，静态托管 `apps/web/dist`。

也可启用 API 内置 HTTPS：

```dotenv
HTTPS_ENABLED=true
TLS_CERT_PATH=/absolute/path/fullchain.pem
TLS_KEY_PATH=/absolute/path/private.key
```

证书或私钥缺失时服务会拒绝启动，不会静默退回 HTTP。

### 14.3 当前安全实现

- scrypt 密码哈希；
- HMAC-SHA256 签名令牌，普通会话 8 小时过期，勾选“记住密码”后 30 天过期；
- 修改密码后旧令牌失效；
- 角色鉴权与用户数据隔离；
- 登录失败临时锁定；
- 上传扩展名、MIME、文件数和大小限制；
- 媒体 URL HMAC 签名，默认 15 分钟有效；
- 登录、注册、改密事件落库，查询时清理 90 天前记录；
- 设备命令类型校验与操作日志。

SQLite、进程内登录限流和本地文件上传适合单机 MVP。多实例生产部署应迁移到 PostgreSQL/MySQL、Redis 限流/会话状态和对象存储。

---

## 15. 常见问题

### 网页能打开，但问诊提示找不到模型

确认 `.env` 包含：

```dotenv
PYTHON_EXEC=C:\Path\To\python.exe
YOLO_MODEL_PATH=models/corn_disease_best.pt
```

然后运行 `npm run setup:yolo` 并重启后端。当前仓库没有代码默认名 `crop_disease_yolo11.pt`。

### `npm run doctor` 仍提示 YOLO 模型缺失

当前检查脚本写死检查旧默认文件 `apps/api/models/crop_disease_yolo11.pt`。只要 `.env` 的 `YOLO_MODEL_PATH` 指向实际存在的 `corn_disease_best.pt`，运行时可以使用该模型；该提示属于检查脚本与现有资产命名不同步。

### 小墨没有声音

先检查对话框顶部自动播报按钮。若后端 TTS 不可用，浏览器会回退系统语音；仍无声音时检查浏览器自动播放权限、系统中文语音包和音量。离线 TTS 还需要正确的 `PYTHON_EXEC`、`sherpa-onnx` 和完整 VITS 模型目录。

### 麦克风按钮不可用

使用 Chrome/Edge，通过 `localhost` 或 HTTPS 访问，并允许麦克风权限。部分浏览器不提供 `SpeechRecognition`。

### 图片显示 403

上传媒体 URL 15 分钟后过期。刷新记录或页面获取新签名。不要把数据库中的 `/uploads/...` 原始路径直接当成公开链接。

### 修改后端代码后页面没有变化

当前 API 开发脚本不热重载。停止并重新运行 `npm run dev`。

### 数据库迁移失败或 Prisma Client 不匹配

```bash
npm run db:generate
npm run db:migrate
```

如果项目是从另一台电脑复制而来，删除复制来的 `node_modules` 后重新执行 `npm run setup`。

### 如何恢复干净演示数据

先备份数据库和上传目录，再运行：

```bash
npm run db:seed:reset
```

该命令会删除现有本地业务数据，不能撤销。

### 端口被占用

修改根 `.env` 中的 `API_PORT` 时，还要调整 `apps/web/vite.config.ts` 的代理目标，或在 `apps/web/.env` 同步设置 `VITE_API_BASE_URL`。前端端口在 `apps/web/vite.config.ts` 中为 5173。

---

更多实现细节见：

- `docs/architecture.md`：系统分层；
- `docs/authentication.md`：账号和权限；
- `docs/database.md`：数据模型和知识库；
- `docs/assistant-stage1.md`：数字人交互设计；
- `docs/assistant-stage2.md`：可控仿真巡田证据链。
