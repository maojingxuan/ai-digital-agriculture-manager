// Creates a fresh, isolated SQLite database from migration SQL; never loads .env
// and never opens or copies the user's business database.
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/default.js";
import { hashPassword } from "../apps/api/dist/services/authService.js";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export async function isolatedStore() {
  const directory = await mkdtemp(path.join(tmpdir(), "agri-stage2-"));
  const databasePath = path.join(directory, "test.db");
  const db = new DatabaseSync(databasePath);
  const migrations = path.join(projectRoot, "apps/api/prisma/migrations");
  for (const entry of (await readdir(migrations, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    db.exec(
      await readFile(
        path.join(migrations, entry.name, "migration.sql"),
        "utf8",
      ),
    );
  }
  db.close();
  const prisma = new PrismaClient({
    datasourceUrl: `file:${databasePath.replaceAll("\\", "/")}`,
  });
  const users = [
    {
      id: "stage2-admin",
      name: "隔离测试管理员",
      role: "admin",
      email: "farmer@example.com",
      password: "Admin@123456",
    },
    {
      id: "stage2-user",
      name: "隔离测试普通用户",
      role: "user",
      email: "user@example.com",
      password: "User@123456",
    },
  ];
  for (const { password, ...user } of users)
    await prisma.user.create({
      data: { ...user, passwordHash: hashPassword(password) },
    });
  return { prisma, users, databasePath };
}
