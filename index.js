// server/index.js
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import express from "express";
import { WebSocketServer } from "ws";
import { VertexAI } from "@google-cloud/vertexai";

// --------------------------------------------
// 🔑 GOOGLE_CREDENTIALS 환경변수(JSON) 파싱
// --------------------------------------------
let keyJson;

if (process.env.GOOGLE_CREDENTIALS) {
  // 🔹 Render 배포환경: 환경변수에서 JSON 파싱
  keyJson = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
  // 🔹 로컬 개발환경: vertex-key.json 파일에서 읽기
  keyJson = JSON.parse(fs.readFileSync("./vertex-key.json", "utf-8"));
}

// --------------------------------------------
// Vertex AI 초기화 (credentials 직접 주입)
// --------------------------------------------
const vertexAI = new VertexAI({
  project: keyJson.project_id, // 키 JSON에서 project_id 자동 추출
  location: process.env.GCP_LOCATION || "us-central1"
});

// HTTP + WebSocket Server
const app = express();
const port = process.env.PORT || 3001;
app.use(express.json());

// 사용할 모델
const TEXT_MODEL = "gemini-2.0-flash-lite";

// HTTP 서버 시작
const server = app.listen(port, () => {
  console.log("🚀 Vertex Server started on port", port);
});

// WebSocket 서버
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔥 WebSocket 클라이언트 연결됨");

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
