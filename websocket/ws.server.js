import { WebSocketServer } from "ws";
import { askAIStream } from "../services/ai.service.js";

export function attachWebSocketServer(server) {
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

      history.push({ role: "user", parts: [{ text: msg.data }] });
      if (history.length > 20) history = history.slice(-20);

      try {
        const result = await askAIStream(history);

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
      } catch (e) {
        console.error("❌ Vertex Error:", e);
        ws.send("[[ERROR]]");
      }
    });
  });

  return wss;
}
