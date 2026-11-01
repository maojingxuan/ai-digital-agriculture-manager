-- 安全审计：登录/注册/改密等认证事件落库（修复"登录/注册事件无审计"中危项）
-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "user_id" TEXT,
    "ip_address" TEXT,
    "success" BOOLEAN NOT NULL,
    "detail" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "security_events_event_type_idx" ON "security_events"("event_type");
CREATE INDEX "security_events_identifier_idx" ON "security_events"("identifier");
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");
