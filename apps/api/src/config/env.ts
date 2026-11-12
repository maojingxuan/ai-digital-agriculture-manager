import fs from "node:fs";
import dotenv from "dotenv";
import { apiEnvPath, rootEnvPath } from "./paths.js";

// Paths are derived from this module rather than process.cwd(), so launching the
// API from the repository root, a workspace, or another directory behaves alike.
for (const envPath of [apiEnvPath, rootEnvPath]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
}
