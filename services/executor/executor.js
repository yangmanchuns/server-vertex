import { runTests } from "./testRunner.js";
import { gitCommitPush } from "./gitOperator.js";

export async function executeTestCommitPush(commitMessage = "chore: auto commit after test pass") {
  // 1️⃣ 테스트
  const testResult = await runTests();

  if (!testResult.success) {
    return {
      success: false,
      step: "test",
      test: testResult,
    };
  }

  // 2️⃣ Git
  const gitResult = await gitCommitPush(commitMessage);

  // gitResult 기준으로 최종 성공 판단
  if (!gitResult?.ok && gitResult !== "push success") {
    return {
      success: false,
      step: "git",
      git: gitResult,
    };
  }

  return {
    success: true,
    step: "done",
    test: testResult,
    git: gitResult,
  };
}

export async function executeCommitPushOnly(commitMessage = "chore: auto commit") {
  const gitResult = await gitCommitPush(commitMessage);

  if (!gitResult?.ok && gitResult !== "push success") {
    return {
      success: false,
      step: "git",
      git: gitResult,
    };
  }

  return {
    success: true,
    step: "done",
    git: gitResult,
  };
}
