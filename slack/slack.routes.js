import { Router } from "express";
import { verifySlack } from "./verifySlack.js";
import { askAI } from "../services/ai.service.js";
import { postSlackMessage } from "./slackClient.js";
import { executeTestCommitPush } from "../services/executor/executor.js";

export const slackRouter = Router();

slackRouter.post("/events", async (req, res) => {
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
    if (event?.bot_id) return res.sendStatus(200);

    if (event?.type === "message" && event?.text) {
      const userText = event.text.trim();

      if (userText === "/auto test") {
        await postSlackMessage(event.channel, "🧪 테스트 실행 중...");

        try {
          const result = await executeTestCommitPush();

          if (!result.success) {
            await postSlackMessage(
              event.channel,
              `❌ 테스트 실패\n\n${result.log}`
            );
          } else {
            await postSlackMessage(
              event.channel,
              "✅ 테스트 통과\n📦 Git commit & push 완료"
            );
          }
        } catch (e) {
          await postSlackMessage(
            event.channel,
            `🚨 실행 중 오류 발생\n${e.toString()}`
          );
        }

        return res.sendStatus(200);
      }

      // 기존 AI 응답
      const aiAnswer = await askAI(userText);
      await postSlackMessage(event.channel, aiAnswer);
    }
  }
  
  return res.sendStatus(200);
});
