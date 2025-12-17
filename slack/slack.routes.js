import { Router } from "express";
import { verifySlack } from "./verifySlack.js";
import { askAI } from "../services/ai.service.js";
import { postSlackMessage } from "./slackClient.js";
import { isDuplicateEvent } from "./eventDedup.js";
import { planFromText } from "../services/planner.service.js";
import { executeTestCommitPush } from "../services/executor/executor.js";


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

  // Event Callback
  if (body.type === "event_callback") {
  const eventId = body.event_id;
  if (isDuplicateEvent(eventId)) return res.sendStatus(200);

  // Slack 재전송 방지: 먼저 응답
  res.sendStatus(200);

  const event = body.event;
  if (event?.bot_id) return;

  if (event?.type === "message" && event?.text) {
    const rawText = event.text;
    const userText = stripMention(rawText);

    // 아래는 비동기로 실행
    (async () => {
      await handleMessage(event.channel, userText);
    })().catch(async (e) => {
      const msg = typeof e === "string" ? e : (e?.message || JSON.stringify(e));
      await postSlackMessage(event.channel, `🚨 처리 중 오류\n\`\`\`\n${msg}\n\`\`\``);
    });

    return;
  }
  return;
}

  return res.sendStatus(200);
});

async function handleMessage(channel, userText) {
  if (!userText) return;

  const plan = await planFromText(userText);

  if (plan.action === "test_commit_push") {
    await postSlackMessage(channel, "🧪 테스트 실행 중...");
    const result = await executeTestCommitPush();

    if (!result.success) {
      await postSlackMessage(
        channel,
        `❌ 실패\n\`\`\`\n${JSON.stringify(result, null, 2)}\n\`\`\``
      );
      return;
    }

    // 🔥 PR 기준 메시지
    if (result.git?.result === "pr_created") {
      await postSlackMessage(
        channel,
        `✅ 테스트 통과\n📌 PR 생성 완료\n\n브랜치: ${result.git.branch}\nPR: ${result.git.prUrl}`
      );
      return;
    }

    if (result.git?.result === "no_changes") {
      await postSlackMessage(
        channel,
        `ℹ️ 변경사항 없음 → PR 생성 생략\n브랜치: ${result.git.branch}`
      );
      return;
    }
  }



//  if (plan.action === "commit_push") {
//   await postSlackMessage(channel, "📦 커밋/푸시 실행 중...");
//   const result = await executeCommitPushOnly(plan.commitMessage);

//   if (!result.success) {
//     await postSlackMessage(
//       channel,
//       `❌ Git 실패\n\`\`\`\n${JSON.stringify(result.git, null, 2)}\n\`\`\``
//     );
//     return;
//   }

  const git = result.git;

  if (git?.result === "no_changes" || git === "no changes") {
    await postSlackMessage(
      channel,
      `ℹ️ 변경사항 없음\n현재 HEAD:\n\`\`\`\n${git.head || "unknown"}\n\`\`\``
    );
    return;
  }

  await postSlackMessage(
    channel,
    `✅ Git push 완료\n브랜치: ${git.branch || "main"}\n커밋: ${git.head || "unknown"}`
  );
  return;
}


  // chat
  const aiAnswer = await askAI(userText);
  await postSlackMessage(channel, aiAnswer);
}
