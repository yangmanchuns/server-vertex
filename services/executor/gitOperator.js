import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { acquireGitLock, releaseGitLock } from "./gitLock.js";

const GIT_DIR = path.join(process.cwd(), ".git");
const INDEX_LOCK = path.join(GIT_DIR, "index.lock");

function cleanupGitIndexLock() {
  if (fs.existsSync(INDEX_LOCK)) {
    fs.unlinkSync(INDEX_LOCK);
  }
}

function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || stdout);
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function gitCommitPush(message = "chore: automated commit") {
  // 🔒 App-level lock (가장 중요)
  acquireGitLock();

  try {
    cleanupGitIndexLock();

    const user = process.env.GIT_USERNAME;
    const token = process.env.GIT_TOKEN;
    const repo = process.env.GIT_REPO;

    if (!user || !token || !repo) {
      throw new Error("GIT_USERNAME / GIT_TOKEN / GIT_REPO 환경변수 누락");
    }

    const authRepo = repo.replace(
      "https://",
      `https://${user}:${token}@`
    );

    // identity는 commit 전에 반드시
    await execCmd(`git config user.name "AI-Auto-Bot"`);
    await execCmd(`git config user.email "ai-bot@automation.local"`);

    // remote 재설정
    await execCmd("git remote remove origin").catch(() => {});
    await execCmd(`git remote add origin ${authRepo}`);

    const status = await execCmd("git status --porcelain");
    if (!status.trim()) {
      return "no changes";
    }

    await execCmd("git add .");
    await execCmd(`git commit -m "${message}" --no-gpg-sign`);
    await execCmd("git push origin main");

    return "push success";
  } finally {
    // 🔓 무조건 해제 (실패해도)
    releaseGitLock();
  }
}
