import { askAI } from "./ai.service.js";

const SYSTEM_RULES = `
너는 Slack에서 들어온 개발 자동화 요청을 "계획(JSON)"으로 바꾸는 Planner다.
반드시 JSON만 출력한다. 설명/문장/코드블록 금지.

허용 작업(action) 목록:
- "test_commit_push"
- "commit_push"
- "chat"

판단 규칙:
- 사용자가 테스트/테스트 실행/검증/ci 라고 하면 test_commit_push
- 사용자가 커밋/푸시만/commit/push 라고 하고 테스트 언급 없으면 commit_push
- 그 외는 chat

출력 JSON 스키마:
{
  "action": "test_commit_push" | "commit_push" | "chat",
  "reason": "짧게",
  "commitMessage": "필요 시(기본값 가능)"
}
`;

export async function planFromText(userText) {
  const prompt = `${SYSTEM_RULES}\n\n사용자 메시지:\n${userText}\n`;
  const raw = await askAI(prompt);

  // JSON만 뽑기 (가끔 앞뒤에 글 섞이면 방어)
  const jsonText = extractFirstJsonObject(raw);
  const plan = JSON.parse(jsonText);

  // 최소 검증 + 기본값
  if (!plan.action) plan.action = "chat";
  if (!plan.reason) plan.reason = "auto-planned";
  if (!plan.commitMessage) plan.commitMessage = "chore: automated changes";

  // 허용 action만
  if (!["test_commit_push", "commit_push", "chat"].includes(plan.action)) {
    return { action: "chat", reason: "invalid_action", commitMessage: "chore: automated changes" };
  }

  return plan;
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    // JSON이 아예 없으면 chat으로 폴백
    return JSON.stringify({ action: "chat", reason: "no_json", commitMessage: "chore: automated changes" });
  }
  return text.slice(start, end + 1);
}
