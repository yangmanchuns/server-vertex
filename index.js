// server/index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { WebSocketServer } from "ws";
import { VertexAI } from "@google-cloud/vertexai";

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// 🔑 Vertex AI 초기화
const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GCP_LOCATION || "us-central1",
});

// 쓸 모델 (무료 크레딧 + 실사용용으로 가벼운 놈)
const TEXT_MODEL = "gemini-2.0-flash-lite";
// 필요하면 나중에 pro/2.5로 갈아타면 됨

// HTTP 서버
const server = app.listen(port, () => {
  console.log("🚀 Vertex Server started on port", port);
});

// WebSocket 서버
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔥 WebSocket 클라이언트 연결됨");

  // 🔁 클라이언트별 대화 히스토리
  let history = [];

  ws.on("message", async (raw) => {
    let msg;

    // 1) JSON 여부 판별 (text / excel / excel-tsv / image 등 구분)
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      msg = { type: "text", data: raw.toString() };
    }

    console.log("📌 수신 메시지 타입:", msg.type);

    // 너무 길어지면 최근 20턴만 유지
    if (history.length > 20) {
      history = history.slice(-20);
    }

    // 공통으로 쓸 모델 인스턴스
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

    // 공통 스트리밍 호출 함수
    const callVertexStream = async (userParts) => {
      // 1) 히스토리에 사용자 메시지 추가
      history.push({
        role: "user",
        parts: userParts,
      });

      try {
        const result = await model.generateContentStream({
          contents: history,
        });

        let assistantReply = "";

        // 2) 스트리밍 chunk 수신
        for await (const chunk of result.stream) {
          // chunk 안에 들어있는 텍스트들 모아서 보내기
          const parts =
            chunk?.candidates?.[0]?.content?.parts ?? [];

          let text = "";
          for (const p of parts) {
            if (p.text) text += p.text;
          }

          if (text) {
            ws.send(text);
            assistantReply += text;
          }
        }

        // 3) 종료 신호
        ws.send("[[END]]");

        // 4) 히스토리에 모델 응답도 저장
        history.push({
          role: "model",
          parts: [{ text: assistantReply }],
        });
      } catch (e) {
        console.error("❌ Vertex AI 호출 에러:", e);
        ws.send("[[ERROR]]");
      }
    };

    // ------------------------------
    // ① 순수 텍스트 메시지
    // ------------------------------
    if (msg.type === "text") {
      await callVertexStream([{ text: msg.data }]);
      return;
    }

    // ------------------------------
    // ② 엑셀 HTML 표 (붙여넣기)
    // ------------------------------
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

    // ------------------------------
    // ③ 엑셀 TSV (탭 구분 텍스트)
    // ------------------------------
    if (msg.type === "excel-tsv") {
      const prompt =
        "아래 엑셀(탭 구분) 데이터를 기억하고, 이후 질문에서 이 기준으로 답변해줘.\n\n" +
        msg.data;

      await callVertexStream([{ text: prompt }]);
      return;
    }

    // ------------------------------
    // ④ 이미지 (dataURL) – 원하면 나중에 살
    // ------------------------------
    if (msg.type === "image") {
      // 필요하면 여기서 vision 모델(gemini-2.0-flash 등) 따로 써도 됨
      await callVertexStream([
        {
          text: "사용자가 이미지를 업로드했습니다. 이미지 내용을 설명하거나 분석해줘.",
        },
      ]);
      return;
    }

    // 그 외 타입은 그냥 텍스트로 처리
    await callVertexStream([{ text: String(msg.data ?? "") }]);
  });
});
