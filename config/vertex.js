import fs from "fs";
import { VertexAI } from "@google-cloud/vertexai";
import { env } from "./env.js";

const KEY_PATH = "./gcp-key.json";

function ensureGcpKeyFile() {
  if (env.GOOGLE_CREDENTIALS_BASE64) {
    const decoded = Buffer.from(env.GOOGLE_CREDENTIALS_BASE64, "base64").toString("utf8");
    fs.writeFileSync(KEY_PATH, decoded);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_PATH;
  }

  if (!fs.existsSync(KEY_PATH)) {
    throw new Error("gcp-key.json not found. Set GOOGLE_CREDENTIALS_BASE64 or provide gcp-key.json");
  }
}

ensureGcpKeyFile();

const projectId = JSON.parse(fs.readFileSync(KEY_PATH, "utf8")).project_id;

export const vertexAI = new VertexAI({
  project: projectId,
  location: env.GCP_LOCATION,
});

export const TEXT_MODEL = "gemini-2.0-flash";
