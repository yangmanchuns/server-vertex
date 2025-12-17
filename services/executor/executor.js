import fs from "fs";
import path from "path";
import { askAI } from "../ai.service.js";
import { runTests } from "./testRunner.js";
import { gitCommitAndCreatePR } from "./gitOperator.pr.js";

/* ====== 내부 유틸 ====== */
function assertUnifiedDiffOnly(text) {
  const t = (text || "").trim();
  if (
    !t.startsWith("diff --git") &&
    !t.startsWith("--- a/") &&
    !t.includes("\n--- a/")
  ) {
    throw new Error("AI 출력이 diff 형식이 아님 (설명 차단)");
  }
}

function readFileSafe(relPath) {
  const abs = path.join(process.cwd(), relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`파일 없음: ${relPath}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function makeDiffPrompt({ filePath, source, instruction }) {
  return `
너는 코드 수정 봇이다.
반드시 unified diff만 출력한다.
설명, 문장, 코드블록, 마크다운 출력 금지.

파일 경로: ${filePath}

<FILE>
${source}
</FILE>

요청:
${instruction}
`;
}

/* ====== 🔥 modify_code executor ====== */
export async function executeModifyCode(plan) {
  console.log("[EXECUTOR] modify_code", plan.targetFile);

  // 1️⃣ 파일 읽기
  const source = readFileSafe(plan.targetFile);

  // 2️⃣ diff 생성
  const prompt = makeDiffPrompt({
    filePath: plan.targetFile,
    source,
    instruction: plan.instruction,
  });

  const diff = await askAI(prompt);

  // 3️⃣ diff 검증
  assertUnifiedDiffOnly(diff);

  // 4️⃣ patch 적용
  const { execSync } = await import("child_process");
  execSync("git apply", { input: diff });

  // 5️⃣ 테스트
  const testResult = await runTests();
  if (!testResult.success) {
    throw new Error("테스트 실패 → PR 중단");
  }

  // 6️⃣ PR 생성
  const pr = await gitCommitAndCreatePR({
    commitMessage: plan.commitMessage,
    prTitle: `🤖 ${plan.commitMessage}`,
    prBody: "AI가 slack.routes.js 수정 후 테스트 통과하여 생성한 PR입니다.",
  });

  return { success: true, pr, test: testResult };
}
