import { askAI } from "./ai.service.js";
import { buildFileIndex } from "./code/fileIndex.service.js";
import { resolveFileByExactName } from "./code/fileResolve.service.js";

const SYSTEM_RULES = `
너는 Slack에서 들어온 개발 자동화 요청을 "계획(JSON)"으로 바꾸는 Planner다.
반드시 JSON만 출력한다. 설명, 문장, 코드블록, 마크다운 금지.

허용 작업(action) 목록:
- "modify_code"
- "test_commit_push"
- "commit_push"
- "chat"

작업 판단 규칙:
1. 사용자가 특정 파일(.js 등)을 언급하며
   "수정", "고쳐", "바꿔", "변경", "추가", "개선" 중 하나라도 포함하면
   → action = "modify_code"

2. 사용자가 테스트/테스트 실행/검증/ci 를 언급하면
   → action = "test_commit_push"

3. 사용자가 커밋/푸시/commit/push 만 요청하고
   테스트 언급이 없으면
   → action = "commit_push"

4. 그 외 모든 경우
   → action = "chat"

modify_code 추가 규칙:
- targetFile은 사용자가 언급한 파일 경로를 문자열로 지정
- instruction은 "무엇을 어떻게 수정할지"를 자연어로 요약
- commitMessage는 수정 내용에 맞게 생성 (없으면 기본값 사용)

출력 JSON 스키마:
{
  "action": "modify_code" | "test_commit_push" | "commit_push" | "chat",
  "reason": "판단 이유를 짧게",
  "targetFile": "modify_code일 때 필수, 아니면 null",
  "instruction": "modify_code일 때 필수, 아니면 null",
  "commitMessage": "필요 시(없으면 기본값)"
}
`;


export async function planFromText(userText) {
  const prompt = `${SYSTEM_RULES}\n\n사용자 메시지:\n${userText}\n`;
  const raw = await askAI(prompt);  
  const fileIndex = buildFileIndex();

  const jsonText = extractFirstJsonObject(raw);
  let plan = JSON.parse(jsonText);

  // 🔹 action 기본값
  if (!plan.action) plan.action = "chat";
  if (!plan.commitMessage) plan.commitMessage = "chore: automated changes";

  const isPathLike = plan.targetFile?.includes("/");

  console.log("[PLANNER] before resolve", {
    targetFile: plan.targetFile,
    isPathLike,
  });


  if (plan.action === "modify_code") {
    if (!plan.targetFile) {
      plan.targetFile = resolveFileByExactName(fileIndex, userText);
    }
    
    console.log("[PLANNER] after resolve", plan.targetFile);

    if (!plan.targetFile) {
      throw new Error("수정할 파일을 찾을 수 없습니다.");
    }

    if (!plan.instruction) {
      plan.instruction = userText;
    }
    console.log("[PLANNER RAW targetFile]", plan.targetFile);
  }

  // 🔹 허용 action 목록 (modify_code 추가!)
  const allowedActions = [
    "modify_code",
    "test_commit_push",
    "commit_push",
    "chat",
  ];

  if (!allowedActions.includes(plan.action)) {
    return {
      action: "chat",
      reason: "invalid_action",
      commitMessage: "chore: automated changes",
    };
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
