// server/index.js
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import { VertexAI } from "@google-cloud/vertexai";
import sql from "mssql";

/* ======================================================
   1. Google Credentials (Vertex AI)
====================================================== */
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  const decoded = Buffer.from(
    process.env.GOOGLE_CREDENTIALS_BASE64,
    "base64"
  ).toString("utf8");
  fs.writeFileSync("gcp-key.json", decoded);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "./gcp-key.json";
}

const vertexAI = new VertexAI({
  project: JSON.parse(fs.readFileSync("gcp-key.json", "utf8")).project_id,
  location: process.env.GCP_LOCATION || "us-central1",
});

const TEXT_MODEL = "gemini-2.0-flash";

/* ======================================================
   2. MSSQL 설정
====================================================== */
const mssqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: "20.20.0.90",
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let mssqlPool;

async function getMssqlPool() {
  if (!mssqlPool) {
    mssqlPool = await sql.connect(mssqlConfig);
  }
  return mssqlPool;
}

async function saveChatHistory({
  sourceType,
  channelId,
  userId,
  question,
  answer,
}) {
  const pool = await getMssqlPool();

  await pool
    .request()
    .input("SourceType", sql.VarChar(20), sourceType)
    .input("ChannelID", sql.VarChar(50), channelId)
    .input("UserID", sql.VarChar(50), userId)
    .input("Question", sql.NVarChar(sql.MAX), question)
    .input("Answer", sql.NVarChar(sql.MAX), answer)
    .query(`
      INSERT INTO AIChatHistory
      (SourceType, ChannelID, UserID, Question, Answer)
      VALUES
      (@SourceType, @ChannelID, @UserID, @Question, @Answer)
    `);
}

/* ======================================================
   3. Vertex AI 호출 함수
====================================================== */
async function askAI(text) {
  const model = vertexAI.getGenerativeModel({
    model: TEXT_MODEL,
  });

  const result = await model.generateContent(text);
  return result.response.candidates[0].content.parts[0].text;
}

/* ======================================================
   4. Express 서버
====================================================== */
const app = express();
const port = process.env.PORT || 10000;

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

const server = app.listen(port, () => {
  console.log("🚀 Vertex Server started on port", port);
});

/* ======================================================
   5. WebSocket (기존 Vue 연동)
====================================================== */
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let history = [];

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());

    const model = vertexAI.getGenerativeModel({
      model: TEXT_MODEL,
    });

    history.push({ role: "user", parts: [{ text: msg.data }] });

    const result = await model.generateContentStream({
      contents: history,
    });

    let reply = "";

    for await (const chunk of result.stream) {
      const parts = chunk?.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (p.text) {
          ws.send(p.text);
          reply += p.text;
        }
      }
    }

    ws.send("[[END]]");
    history.push({ role: "model", parts: [{ text: reply }] });
  });
});

/* ======================================================
   6. Slack Signing Secret 검증
====================================================== */
function verifySlack(req) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true;

  const ts = req.headers["x-slack-request-timestamp"];
  const sig = req.headers["x-slack-signature"];
  if (!ts || !sig) return false;

  const base = `v0:${ts}:${req.rawBody}`;
  const hash =
    "v0=" +
    crypto.createHmac("sha256", secret).update(base).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(sig)
  );
}

/* ======================================================
   7. Slack Events Endpoint (핵심)
====================================================== */
app.post("/slack/events", async (req, res) => {
  if (!verifySlack(req)) return res.sendStatus(401);

  const body = req.body;

  // URL 검증
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  if (body.type === "event_callback") {
    const event = body.event;

    if (event.bot_id) return res.sendStatus(200);
    if (event.type !== "message" || !event.text)
      return res.sendStatus(200);

    const userText = event.text;

    const aiAnswer = await askAI(userText);

    // 🔹 MSSQL 저장
    await saveChatHistory({
      sourceType: "SLACK",
      channelId: event.channel,
      userId: event.user,
      question: userText,
      answer: aiAnswer,
    });

    // 🔹 Slack 응답
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: event.channel,
        text: aiAnswer,
      }),
    });

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

/* ======================================================
   8. 관리자 조회 API
====================================================== */
app.get("/admin/ai/history", async (req, res) => {
  const pool = await getMssqlPool();
  const result = await pool
    .request()
    .query(`
      SELECT TOP 100 *
      FROM AIChatHistory
      ORDER BY HistoryID DESC
    `);
  res.json(result.recordset);
});
