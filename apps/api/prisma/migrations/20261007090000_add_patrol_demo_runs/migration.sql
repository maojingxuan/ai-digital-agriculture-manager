CREATE TABLE "patrol_demo_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "patrol_demo_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "patrol_demo_runs_user_id_request_key_key" ON "patrol_demo_runs"("user_id", "request_key");
CREATE INDEX "patrol_demo_runs_user_id_created_at_idx" ON "patrol_demo_runs"("user_id", "created_at");
