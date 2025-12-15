// server/index.js
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import { WebSocketServer } from "ws";
import { VertexAI } from "@google-cloud/vertexai";
import sql from "mssql";

// 환경변수에서 키 로딩
// let keyJson;

// if (process.env.GOOGLE_CREDENTIALS_BASE64) {
//   const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, "base64").toString("utf-8");
//   keyJson = JSON.parse(decoded);
// } else {
//   keyJson = JSON.parse(fs.readFileSync("./vertex-key.json", "utf-8"));
// }

const mssqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: "20.20.0.90",
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: false,          // 내부망
    trustServerCertificate: true
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000
  }
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
  answer
}) {
  const pool = await getMssqlPool();

  await pool.request()
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

const aiAnswer = await askAI(userText);

// 🔹 MSSQL 히스토리 저장
await saveChatHistory({
  sourceType: "SLACK",
  channelId: event.channel,
  userId: event.user,
  question: userText,
  answer: aiAnswer
});

// 🔹 Slack 응답
await fetch("https://slack.com/api/chat.postMessage", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
  },
  body: JSON.stringify({
    channel: event.channel,
    text: aiAnswer,
  }),
});

app.get("/admin/ai/history", async (req, res) => {
  const pool = await getMssqlPool();

  const result = await pool.request()
    .query(`
      SELECT TOP 100 *
      FROM AIChatHistory
      ORDER BY HistoryID DESC
    `);

  res.json(result.recordset);
});


if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8');
  fs.writeFileSync('gcp-key.json', decoded);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = './gcp-key.json';
}

// --------------------------------------------
// 🔑 GOOGLE_CREDENTIALS 환경변수(JSON) 파싱
// --------------------------------------------
// let keyJson;

// if (process.env.GOOGLE_CREDENTIALS) {
//   // 🔹 Render 배포환경: 환경변수에서 JSON 파싱
//   keyJson = JSON.parse(process.env.GOOGLE_CREDENTIALS);
// } else {
//   // 🔹 로컬 개발환경: vertex-key.json 파일에서 읽기
//   keyJson = JSON.parse(fs.readFileSync("./vertex-key.json", "utf-8"));
// }

// --------------------------------------------
// Vertex AI 초기화 (credentials 직접 주입)
// --------------------------------------------
const vertexAI = new VertexAI({
  project: JSON.parse(fs.readFileSync("gcp-key.json", "utf8")).project_id,
  location: process.env.GCP_LOCATION || "us-central1"
});

// HTTP + WebSocket Server
const app = express();
const port = process.env.PORT || 3001;
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString("utf8");
  }
}));

// 사용할 모델
const TEXT_MODEL = "gemini-2.0-flash";

// HTTP 서버 시작
const server = app.listen(port, () => {
  console.log("🚀 Vertex Server started on port", port);
});

// WebSocket 서버
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔥 WebSocket 클라이언트 연결됨!!");
    console.log("🔥keyJson:", JSON.parse(process.env.GOOGLE_CREDENTIALS));

  let history = []; // 클라이언트별 대화 히스토리

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      msg = { type: "text", data: raw.toString() };
    }

    console.log("📌 수신 메시지 타입:", msg.type);

    if (history.length > 20) {
      history = history.slice(-20);
    }

    // 모델 인스턴스 생성
    const model = vertexAI.getGenerativeModel({
      model: TEXT_MODEL,
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: `
당신은 Vue3 + MSSQL + C# + Java로 업무용 코드를 돕는 시니어 개발자입니다.
- 답변은 항상 한국어로.
- 가능하면 예제 코드를 함께 제시.
- 사용자가 직전에 보낸 표/코드/설명을 기억하고 이어서 답변.
            `.trim(),
          },
        ],
      },
    });

    // 공통 스트리밍 처리 함수
    const callVertexStream = async (userParts) => {
      history.push({ role: "user", parts: userParts });

      try {
        const result = await model.generateContentStream({
          contents: history,
        });

        let assistantReply = "";

        for await (const chunk of result.stream) {
          const parts = chunk?.candidates?.[0]?.content?.parts ?? [];

          let text = "";
          for (const p of parts) {
            if (p.text) text += p.text;
          }

          if (text) {
            ws.send(text);
            assistantReply += text;
          }
        }

        ws.send("[[END]]");

        history.push({
          role: "model",
          parts: [{ text: assistantReply }],
        });
      } catch (e) {
        console.error("❌ Vertex AI 호출 에러:", e);
        ws.send("[[ERROR]]");
      }
    };

    // ============================
    // ① TEXT
    // ============================
    if (msg.type === "text") {
      await callVertexStream([{ text: msg.data }]);
      return;
    }

    // ============================
    // ② EXCEL HTML TABLE
    // ============================
    if (msg.type === "excel") {
      const cleanText = msg.data
        .replace(/<\/td><td>/g, " | ")
        .replace(/<\/tr>/g, "\n")
        .replace(/<[^>]+>/g, "");

      const prompt =
        "아래 HTML 표 데이터를 기억하고, 이후 질문에서 이 표 기준으로 쿼리/로직을 만들어줘.\n\n" +
        cleanText;

      await callVertexStream([{ text: prompt }]);
      return;
    }

    // ============================
    // ③ EXCEL TSV
    // ============================
    if (msg.type === "excel-tsv") {
      const prompt =
        "아래 엑셀(탭 구분) 데이터를 기억하고, 이후 질문에서 이 기준으로 답변해줘.\n\n" +
        msg.data;

      await callVertexStream([{ text: prompt }]);
      return;
    }

    // ============================
    // ④ IMAGE
    // ============================
    if (msg.type === "image") {
      await callVertexStream([
        { text: "사용자가 이미지를 업로드했습니다. 분석해줘." },
      ]);
      return;
    }

    // 그 외 타입
    await callVertexStream([{ text: String(msg.data ?? "") }]);
  });
});

function verifySlack(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // 설정 안 했으면 일단 통과(테스트용)

  const ts = req.headers["x-slack-request-timestamp"];
  const sig = req.headers["x-slack-signature"];
  if (!ts || !sig) return false;

  // 재전송/리플레이 방지(5분)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 60 * 5) return false;

  const base = `v0:${ts}:${req.rawBody || ""}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

async function askAI(text) {
  const model = vertexAI.getGenerativeModel({
    model: TEXT_MODEL
  });

    const result = await model.generateContent(text);

    return result.response.candidates[0].content.parts[0].text;
}

app.post("/slack/events", async (req, res) => {
  if (!verifySlack(req)) return res.sendStatus(401);

  const body = req.body;
  // 1. URL 검증
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // 2. 이벤트 콜백
  if (body.type === "event_callback") {
    const event = body.event;

    // bot이 보낸 메시지는 무시 (무한루프 방지)
    if (event.bot_id) {
      return res.sendStatus(200);
    }

    // 메시지 이벤트만 처리
    if (event.type === "message" && event.text) {
      const userText = event.text;

      // 👉 여기서 기존 AI 로직 재사용
      const aiAnswer = await askAI(userText); 

      // Slack에 응답
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
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

