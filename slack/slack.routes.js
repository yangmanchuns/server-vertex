// slack/slack.routes.js
import { Router } from "express";

import { verifySlack } from "./verifySlack.js";
import { postSlackMessage } from "./slackClient.js";
import { isDuplicateEvent } from "./eventDedup.js";

import { askAI } from "../services/ai.service.js";
import { planFromText } from "../services/planner.service.js";

import {
  executeModifyCode,
  executeTestCommitPush,
} from "../services/executor/executor.js";

export const slackRouter = Router();

function stripMention(text) {
  return (text || "").replace(/<@[^>]+>/g, "").trim();
}

slackRouter.post("/events", async (req, res) => {
  if (!verifySlack(req)) return res.sendStatus(401);

  const body = req.body;

  // URL Verification
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  if (body.type !== "event_callback") {
    return res.sendStatus(200);
  }

  const eventId = body.event_id;
  if (isDuplicateEvent(eventId)) return res.sendStatus(200);

  // Slack 재전송 방지 (먼저 응답)
  res.sendStatus(200);

  const event = body.event;
  if (event?.bot_id) return;
  if (event?.type !== "message" || !event.text) return;

  const userText = stripMention(event.text);
  if (!userText) return;

  try {
    const plan = await planFromText(userText);
    console.log("[PLAN]", plan);

    /* ===============================
       modify_code
    ================================ */
    if (plan.action === "modify_code") {
      await postSlackMessage(event.channel, "🛠 코드 수정 및 테스트 진행 중...");

      const modifyResult = await executeModifyCode(plan);

      // 템플릿 리터럴 내부에 변수를 직접 넣어 가독성을 높였습니다.
      await postSlackMessage(
        event.channel,
        `✅ 테스트 통과
        📌 PR 생성 완료

        ${modifyResult.pr.prUrl}

        테스트 요약:
        \`\`\`
        ${modifyResult.test?.summary || modifyResult.test?.output || "테스트 결과 없음"}
        \`\`\``
      );

      return;
    }

    /* ===============================
       test_commit_push
    ================================ */
    if (plan.action === "test_commit_push") {
      await postSlackMessage(event.channel, "🧪 테스트 실행 중...");
      const testResult = await executeTestCommitPush();

      if (!testResult.success) {
        await postSlackMessage(
          event.channel,
          `❌ 테스트 실패\n\`\`\`\n${testResult.test?.output || "unknown"}\n\`\`\``
        );
      } else {
        await postSlackMessage(
          event.channel,
          `✅ 테스트 통과\n📌 PR 생성 완료\n\n${testResult.git.prUrl}\n\n` +
          `테스트 요약:\n` +
          `\`\`\`\n` +
          `${
            testResult.test?.summary ||
            testResult.test?.output || "테스트 결과 없음"
          }\n` + `\`\`\``



      }
      return;
    }

    /* ===============================
       chat (기본)
    ================================ */
    const aiAnswer = await askAI(userText);
    await postSlackMessage(event.channel, aiAnswer);
  } catch (e) {
    const msg =
      typeof e === "string" ? e : e?.message || JSON.stringify(e);
    await postSlackMessage(
      event.channel,
      `🚨 처리 중 오류\n\`\`\`\n${msg}\n\`\`\``
    );
  }
});
