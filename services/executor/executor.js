import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { askAI } from "../ai.service.js";
import { runTests } from "./testRunner.js";
import { gitCommitAndCreatePR } from "./gitOperator.pr.js";

const gitLockFile = path.join(process.cwd(), ".git-auto.lock");

if (fs.existsSync(gitLockFile)) {
  console.log("[LOCK] stale .git-auto.lock detected, removing");
  fs.unlinkSync(gitLockFile);
}

function extractUnifiedDiff(text) {
  const idx = text.indexOf("diff --git");
  if (idx === -1) return text.trim();
  return text.slice(idx).trim();
}


function readProjectFile(relPath) {
  const absPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`파일을 찾을 수 없음: ${relPath}`);
  }
  return fs.readFileSync(absPath, "utf8");
}

function assertUnifiedDiffOnly(text) {
  const t = text.trim();

  if (!t.startsWith("diff --git")) {
    throw new Error("diff --git 헤더 없음");
  }

  if (!t.includes("\n@@")) {
    throw new Error("hunk 헤더(@@) 없음");
  }

  if (t.match(/```|설명|위와|다음/)) {
    throw new Error("diff 외 텍스트 포함");
  }

  if (!ok) {
    throw new Error("AI 출력이 diff 형식이 아님 (설명/문서 차단)");
  }
}

function makeDiffPrompt({ filePath, source, instruction }) {
  return `
너는 코드 수정 자동화 봇이다.
반드시 unified diff만 출력한다.
설명, 문장, 예시, 코드블록, 마크다운 출력 금지.

파일 경로: ${filePath}

<FILE>
${source}
</FILE>

요청:
${instruction}
`;
}

/* ===============================
   1️⃣ modify_code executor
================================ */
let isRunning = false;
export async function executeModifyCode(plan) {
  console.log("[LOCK STATUS] isRunning =", isRunning);
   if (isRunning) {
    throw new Error("Git 작업이 이미 실행 중입니다.");
  }

  isRunning = true;
  console.log("[LOCK] acquire");

  try {
    console.log("[EXECUTOR] modify_code start:", plan.targetFile);

    // 1. 파일 읽기
    const source = readProjectFile(plan.targetFile);

    // 2. diff 생성
    const diffPrompt = makeDiffPrompt({
      filePath: plan.targetFile,
      source,
      instruction: plan.instruction,
    });

    let diff = await askAI(diffPrompt, {
      mode: "diff",
      temperature: 0,
    });
    diff = extractUnifiedDiff(diff);
    
    // 3. diff 검증
    assertUnifiedDiffOnly(diff);

    // 4. patch 적용
    execSync("git apply --whitespace=fix", { input: diff });

    // 5. 테스트
    const testResult = await runTests();
    if (!testResult.success) {
      throw new Error("테스트 실패 → PR 생성 중단");
    }

    // 6. PR 생성
    const prResult = await gitCommitAndCreatePR({
      commitMessage: plan.commitMessage || "chore: automated changes",
      prTitle: `🤖 ${plan.commitMessage || "Automated PR"}`,
      prBody: `
  AI가 ${plan.targetFile} 파일을 수정하고
  테스트 통과 후 자동 생성한 PR입니다.
  `,
    });

    fs.writeFileSync(
    ".__last.diff",
    diff,
    "utf8"
    );

    return {
      success: true,
      test: testResult,
      pr: prResult,
    };
  }finally {
    isRunning = false;
    console.log("[LOCK] release");

    }
}

/* ===============================
   2️⃣ test_commit_push executor
================================ */

export async function executeTestCommitPush() {
  console.log("[EXECUTOR] test_commit_push start");

  // 1. 테스트
  const testResult = await runTests();
  if (!testResult.success) {
    return {
      success: false,
      step: "test",
      test: testResult,
    };
  }

  // 2. PR 생성
  const prResult = await gitCommitAndCreatePR({
    commitMessage: "chore: automated changes",
    prTitle: "🤖 Automated PR (tests passed)",
    prBody: "Slack 명령으로 테스트 통과 후 생성된 PR입니다.",
  });

  return {
    success: true,
    step: "done",
    test: testResult,
    git: prResult,
  };
}
