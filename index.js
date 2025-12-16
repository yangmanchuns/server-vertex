// index.js
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import crypto from "crypto";
import express from "express";
import { WebSocketServer } from "ws";
import { VertexAI } from "@google-cloud/vertexai";

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
   2. Express Server
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
  console.log("🚀 Server started on port", port);
});

/* ======================================================
   3. Vertex AI Helper
====================================================== */
async function askAI(text) {
  const model = vertexAI.getGenerativeModel({
    model: TEXT_MODEL,
  });

  const result = await model.generateContent(text);
  return result.response.candidates[0].content.parts[0].text;
}

/* ======================================================
   4. Slack Signing Secret Verification
====================================================== */
function verifySlack(req) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // 테스트용

  const ts = req.headers["x-slack-request-timestamp"];
  const sig = req.headers["x-slack-signature"];
  if (!ts || !sig) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 60 * 5) return false;

  const base = `v0:${ts}:${req.rawBody}`;
  const hash =
    "v0=" +
    crypto.createHmac("sha256", secret).update(base).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(sig)
    );
  } catch {
    return false;
  }
}

/* ======================================================
   5. Slack Events Endpoint
====================================================== */
app.post("/slack/events", async (req, res) => {
  if (!verifySlack(req)) return res.sendStatus(401);

  const body = req.body;

  // URL Verification
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // Event Callback
  if (body.type === "event_callback") {
    const event = body.event;

    // bot 메시지 무시 (무한루프 방지)
    if (event.bot_id) return res.sendStatus(200);

    if (event.type === "message" && event.text) {
      const userText = event.text.trim();
      if (!userText) return res.sendStatus(200);

      const aiAnswer = await askAI(userText);

      // Slack 응답
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
    }

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

/* ======================================================
   6. WebSocket (Vue 연동)
====================================================== */
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔥 WebSocket connected");

  let history = [];

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      msg = { type: "text", data: raw.toString() };
    }

    const model = vertexAI.getGenerativeModel({
      model: TEXT_MODEL,
    });

    history.push({
      role: "user",
      parts: [{ text: msg.data }],
    });

    if (history.length > 20) history = history.slice(-20);

    try {
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

      history.push({
        role: "model",
        parts: [{ text: reply }],
      });
    } catch (e) {
      console.error("❌ Vertex Error:", e);
      ws.send("[[ERROR]]");
    }
  });
});
