import { runTests } from "./testRunner.js";
import { gitCommitAndCreatePR } from "./gitOperator.pr.js";

export async function executeTestCommitPush() {
  // 1️⃣ 테스트
  const testResult = await runTests();
  if (!testResult.success) {
    return {
      success: false,
      step: "test",
      test: testResult,
    };
  }

  // 2️⃣ PR 생성 (🔥 여기 바뀜)
  const gitResult = await gitCommitAndCreatePR({
    commitMessage: "chore: automated changes",
    prTitle: "🤖 Automated PR (tests passed)",
    prBody: "Slack 명령으로 테스트 통과 후 생성된 PR입니다.",
  });

  return {
    success: true,
    step: "done",
    test: testResult,
    git: gitResult,
  };
}
