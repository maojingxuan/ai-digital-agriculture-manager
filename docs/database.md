# 数据库设计

MVP 数据库使用 SQLite + Prisma。SQLite 便于本地演示和快速迁移，后续可以迁移到 PostgreSQL 或 MySQL。

## 核心关系

- `User` 拥有大棚、农产品、问诊记录、巡田记录、Agent会话和Agent行为日志。
- `Greenhouse` 是农业数据的空间主体，关联传感器、传感器数据、作物、设备、预警和巡田记录。
- `Sensor` 描述传感器元信息，`SensorData` 记录按时间变化的指标数据。
- `Crop` 属于某个大棚，可关联病害诊断、巡田记录和农产品。
- `DiseaseDiagnosis` 保存AI问诊结果，可产生预警，并可被Agent行为日志引用。
- `PatrolRecord` 保存AI巡田报告，可产生预警，并可被Agent行为日志引用。
- `Product` 保存农产品信息，`ProductTrace` 保存种植、检测、采摘等溯源事件。
- `Device` 属于大棚，`DeviceCommand` 保存对设备下发的控制命令。
- `AgentConversation` 保存一次数字人会话，`AgentActionLog` 保存Agent决策链路。
- `KnowledgeDocument` 保存农业专业资料，`KnowledgeChunk` 保存切分后的知识片段与向量，`KnowledgeRetrievalLog` 保存每次检索结果和回答日志。

问诊、巡田和农产品接口均直接读写以上 Prisma 模型。服务重启后记录仍保留；问诊的标注图、模型名称、检测框、知识引用和视觉错误也随诊断结果一并保存。农产品表单中的溯源信息写入 `ProductTrace`。

## 重点审计字段

### SensorData

`SensorData` 必须记录以下字段：

- `greenhouse_id`
- `sensor_type`
- `value`
- `unit`
- `timestamp`

### DeviceCommand

`DeviceCommand` 必须记录以下字段：

- `device_id`
- `command`
- `parameters`
- `operator`
- `execution_status`
- `created_at`
- `executed_at`

### AgentActionLog

`AgentActionLog` 用于展示“AI为什么做出这个决定”，必须记录：

- 用户请求：`user_request`
- Agent判断：`agent_reasoning`
- 调用的Tool：`tool_name`
- Tool参数：`tool_parameters`
- Tool返回结果：`tool_result`
- 最终回复：`final_reply`
- 时间：`created_at`
- 执行状态：`execution_status`

## 索引策略

- 所有外键字段建立索引。
- 高频查询字段建立索引：状态、类型、时间。
- `SensorData` 建立复合索引：`greenhouse_id + sensor_type + timestamp`。
- `AgentActionLog` 建立工具名、执行状态、时间和关联对象索引，便于审计追踪。

## 本地命令

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run test:models
npm run test:persistence
```

开发新迁移时可在 API workspace 中使用：

```bash
npm run db:migrate:dev -w apps/api
```

## Demo传感器环境

Task 04 已提供第一阶段模拟传感器系统，不接真实硬件。Demo 包含两个大棚：

- `demo-gh-1`：1号番茄智慧大棚
- `demo-gh-2`：2号草莓育苗大棚

模拟指标：

- 空气温度：`temperature`
- 空气湿度：`humidity`
- 土壤湿度：`soil_moisture`
- 光照强度：`light`
- CO2：`co2`
- 水箱水位：`water_level`

数据生成具备昼夜变化、温湿度趋势、缓慢天气周期和偶发异常，不是完全随机。

环境数据接口：

- `GET /api/greenhouses`
- `GET /api/sensors?greenhouseId=demo-gh-1`
- `GET /api/sensor-data/realtime?greenhouseId=demo-gh-1`
- `GET /api/sensor-data/history?greenhouseId=demo-gh-1&hours=24`
- `GET /api/sensor-data/anomalies?greenhouseId=demo-gh-1&hours=24`
- `GET /api/dashboard/environment?greenhouseId=demo-gh-1`

## 农业知识库

Task 05 已实现独立知识库能力，不依赖 Agent 内部逻辑。处理链路：

```text
文档上传 -> 文本解析 -> 文本切分 -> Embedding -> 向量存储 -> 检索 -> RAG回答 -> 检索日志
```

MVP 阶段使用本地确定性 Embedding，并将向量存储在 SQLite JSON 字段中。后续可以替换为真实 Embedding API 和专用向量数据库。

知识库服务：

- `KnowledgeService`：负责新增知识、文档解析、文本切分和入库。
- `EmbeddingService`：负责文本向量化和相似度计算。
- `RetrievalService`：负责知识检索、RAG回答、引用来源和检索日志。

知识库接口：

- `GET /api/knowledge/documents`
- `POST /api/knowledge/documents`
- `POST /api/knowledge/upload`
- `GET /api/knowledge/search?query=番茄叶片斑点`
- `POST /api/knowledge/answer`
- `GET /api/knowledge/retrieval-logs`

回答策略：

- 命中可靠知识片段时，只基于检索结果生成回答，并返回引用来源。
- 未命中可靠知识片段时，返回拒答，不编造农业专业结论。
- 问题或资料涉及农药、施药、药剂、安全间隔期、残留等内容时，自动增加风险提示。
- 每次 RAG 回答都会写入 `knowledge_retrieval_logs`，记录 query、topK、minScore、检索结果、回答、安全提示、状态和时间。
