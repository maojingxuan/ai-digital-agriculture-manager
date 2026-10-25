-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'farmer',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "greenhouses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "area" REAL,
    "owner_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "greenhouses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greenhouse_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sensor_type" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "installed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sensors_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sensor_data" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greenhouse_id" TEXT NOT NULL,
    "sensor_type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sensor_data_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "crops" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greenhouse_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variety" TEXT,
    "growth_stage" TEXT,
    "planted_at" DATETIME,
    "expected_harvest_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'growing',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "crops_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "disease_diagnoses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "crop_id" TEXT,
    "crop_type" TEXT NOT NULL,
    "image_url" TEXT,
    "symptom_description" TEXT,
    "suspected_disease" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "risk_level" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "disease_diagnoses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "disease_diagnoses_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "patrol_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "greenhouse_id" TEXT NOT NULL,
    "crop_id" TEXT,
    "plot_name" TEXT NOT NULL,
    "crop_name" TEXT NOT NULL,
    "image_url" TEXT,
    "growth_status" TEXT NOT NULL,
    "anomalies" JSONB NOT NULL,
    "environment_risk" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patrol_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "patrol_records_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "patrol_records_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "warnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "greenhouse_id" TEXT NOT NULL,
    "diagnosis_id" TEXT,
    "patrol_record_id" TEXT,
    "warning_type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    CONSTRAINT "warnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "warnings_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "warnings_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "disease_diagnoses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "warnings_patrol_record_id_fkey" FOREIGN KEY ("patrol_record_id") REFERENCES "patrol_records" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "crop_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "image_url" TEXT,
    "origin" TEXT NOT NULL,
    "specification" TEXT,
    "price" REAL,
    "harvest_time" DATETIME,
    "cultivation_method" TEXT,
    "description" TEXT,
    "avatar_script" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "products_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_traces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "trace_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_traces_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greenhouse_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "last_online_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "devices_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "operator_user_id" TEXT,
    "command" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "operator" TEXT NOT NULL,
    "execution_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" DATETIME,
    CONSTRAINT "device_commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "device_commands_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_action_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "diagnosis_id" TEXT,
    "patrol_record_id" TEXT,
    "device_command_id" TEXT,
    "user_request" TEXT NOT NULL,
    "agent_reasoning" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "tool_parameters" JSONB NOT NULL,
    "tool_result" JSONB NOT NULL,
    "final_reply" TEXT NOT NULL,
    "execution_status" TEXT NOT NULL DEFAULT 'success',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_action_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_action_logs_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "disease_diagnoses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_action_logs_patrol_record_id_fkey" FOREIGN KEY ("patrol_record_id") REFERENCES "patrol_records" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_action_logs_device_command_id_fkey" FOREIGN KEY ("device_command_id") REFERENCES "device_commands" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "greenhouses_owner_id_idx" ON "greenhouses"("owner_id");

-- CreateIndex
CREATE INDEX "greenhouses_name_idx" ON "greenhouses"("name");

-- CreateIndex
CREATE INDEX "sensors_greenhouse_id_idx" ON "sensors"("greenhouse_id");

-- CreateIndex
CREATE INDEX "sensors_sensor_type_idx" ON "sensors"("sensor_type");

-- CreateIndex
CREATE INDEX "sensors_greenhouse_id_sensor_type_idx" ON "sensors"("greenhouse_id", "sensor_type");

-- CreateIndex
CREATE INDEX "sensor_data_greenhouse_id_idx" ON "sensor_data"("greenhouse_id");

-- CreateIndex
CREATE INDEX "sensor_data_sensor_type_idx" ON "sensor_data"("sensor_type");

-- CreateIndex
CREATE INDEX "sensor_data_timestamp_idx" ON "sensor_data"("timestamp");

-- CreateIndex
CREATE INDEX "sensor_data_greenhouse_id_sensor_type_timestamp_idx" ON "sensor_data"("greenhouse_id", "sensor_type", "timestamp");

-- CreateIndex
CREATE INDEX "crops_greenhouse_id_idx" ON "crops"("greenhouse_id");

-- CreateIndex
CREATE INDEX "crops_name_idx" ON "crops"("name");

-- CreateIndex
CREATE INDEX "crops_status_idx" ON "crops"("status");

-- CreateIndex
CREATE INDEX "disease_diagnoses_user_id_idx" ON "disease_diagnoses"("user_id");

-- CreateIndex
CREATE INDEX "disease_diagnoses_crop_id_idx" ON "disease_diagnoses"("crop_id");

-- CreateIndex
CREATE INDEX "disease_diagnoses_risk_level_idx" ON "disease_diagnoses"("risk_level");

-- CreateIndex
CREATE INDEX "disease_diagnoses_created_at_idx" ON "disease_diagnoses"("created_at");

-- CreateIndex
CREATE INDEX "patrol_records_user_id_idx" ON "patrol_records"("user_id");

-- CreateIndex
CREATE INDEX "patrol_records_greenhouse_id_idx" ON "patrol_records"("greenhouse_id");

-- CreateIndex
CREATE INDEX "patrol_records_crop_id_idx" ON "patrol_records"("crop_id");

-- CreateIndex
CREATE INDEX "patrol_records_created_at_idx" ON "patrol_records"("created_at");

-- CreateIndex
CREATE INDEX "warnings_user_id_idx" ON "warnings"("user_id");

-- CreateIndex
CREATE INDEX "warnings_greenhouse_id_idx" ON "warnings"("greenhouse_id");

-- CreateIndex
CREATE INDEX "warnings_diagnosis_id_idx" ON "warnings"("diagnosis_id");

-- CreateIndex
CREATE INDEX "warnings_patrol_record_id_idx" ON "warnings"("patrol_record_id");

-- CreateIndex
CREATE INDEX "warnings_level_idx" ON "warnings"("level");

-- CreateIndex
CREATE INDEX "warnings_status_idx" ON "warnings"("status");

-- CreateIndex
CREATE INDEX "warnings_created_at_idx" ON "warnings"("created_at");

-- CreateIndex
CREATE INDEX "products_owner_id_idx" ON "products"("owner_id");

-- CreateIndex
CREATE INDEX "products_crop_id_idx" ON "products"("crop_id");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- CreateIndex
CREATE INDEX "product_traces_product_id_idx" ON "product_traces"("product_id");

-- CreateIndex
CREATE INDEX "product_traces_trace_type_idx" ON "product_traces"("trace_type");

-- CreateIndex
CREATE INDEX "product_traces_occurred_at_idx" ON "product_traces"("occurred_at");

-- CreateIndex
CREATE INDEX "devices_greenhouse_id_idx" ON "devices"("greenhouse_id");

-- CreateIndex
CREATE INDEX "devices_device_type_idx" ON "devices"("device_type");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE INDEX "device_commands_device_id_idx" ON "device_commands"("device_id");

-- CreateIndex
CREATE INDEX "device_commands_operator_user_id_idx" ON "device_commands"("operator_user_id");

-- CreateIndex
CREATE INDEX "device_commands_command_idx" ON "device_commands"("command");

-- CreateIndex
CREATE INDEX "device_commands_operator_idx" ON "device_commands"("operator");

-- CreateIndex
CREATE INDEX "device_commands_execution_status_idx" ON "device_commands"("execution_status");

-- CreateIndex
CREATE INDEX "device_commands_created_at_idx" ON "device_commands"("created_at");

-- CreateIndex
CREATE INDEX "agent_conversations_user_id_idx" ON "agent_conversations"("user_id");

-- CreateIndex
CREATE INDEX "agent_conversations_channel_idx" ON "agent_conversations"("channel");

-- CreateIndex
CREATE INDEX "agent_conversations_started_at_idx" ON "agent_conversations"("started_at");

-- CreateIndex
CREATE INDEX "agent_action_logs_user_id_idx" ON "agent_action_logs"("user_id");

-- CreateIndex
CREATE INDEX "agent_action_logs_conversation_id_idx" ON "agent_action_logs"("conversation_id");

-- CreateIndex
CREATE INDEX "agent_action_logs_diagnosis_id_idx" ON "agent_action_logs"("diagnosis_id");

-- CreateIndex
CREATE INDEX "agent_action_logs_patrol_record_id_idx" ON "agent_action_logs"("patrol_record_id");

-- CreateIndex
CREATE INDEX "agent_action_logs_device_command_id_idx" ON "agent_action_logs"("device_command_id");

-- CreateIndex
CREATE INDEX "agent_action_logs_tool_name_idx" ON "agent_action_logs"("tool_name");

-- CreateIndex
CREATE INDEX "agent_action_logs_execution_status_idx" ON "agent_action_logs"("execution_status");

-- CreateIndex
CREATE INDEX "agent_action_logs_created_at_idx" ON "agent_action_logs"("created_at");
