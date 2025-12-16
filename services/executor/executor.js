import { runTests } from "./testRunner.js";
import { gitCommitPush } from "./gitOperator.js";

export async function executeTestCommitPush() {
  const result = {
    test: null,
    git: null,
  };

  // 1️⃣ 테스트
  const testResult = await runTests();
  result.test = testResult;

  if (!testResult.success) {
    return {
      success: false,
      step: "test",
      log: testResult.output,
    };
  }

  // 2️⃣ Git
  await gitCommitPush("chore: auto commit after test pass");
  result.git = "commit & push success";

  return {
    success: true,
    result,
  };
}


export async function executeCommitPushOnly(commitMessage = "chore: auto commit") {
  const gitResult = await gitCommitPush(commitMessage);
  return { success: true, step: "done", git: gitResult };
}