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
  acquireGitLock();

  try {
    cleanupGitIndexLock();

    console.log("[GIT] cwd:", process.cwd());

    // git repo 확인
    const isRepo = await execCmd("git rev-parse --is-inside-work-tree");
    console.log("[GIT] is repo:", isRepo.trim());

    const user = process.env.GIT_USERNAME;
    const token = process.env.GIT_TOKEN;
    const repo = process.env.GIT_REPO;

    console.log("[GIT] env:", {
      hasUser: !!user,
      hasToken: !!token,
      repo,
    });

    if (!user || !token || !repo) {
      throw new Error("GIT_USERNAME / GIT_TOKEN / GIT_REPO 환경변수 누락");
    }

    const authRepo = repo.replace(
      "https://",
      `https://${user}:***@`
    );
    console.log("[GIT] remote(url masked):", authRepo);

    // identity 설정
    await execCmd(`git config user.name "AI-Auto-Bot"`);
    await execCmd(`git config user.email "ai-bot@automation.local"`);

    // remote 재설정
    await execCmd("git remote remove origin").catch(() => {});
    await execCmd(`git remote add origin ${repo}`);

    const remoteInfo = await execCmd("git remote -v");
    console.log("[GIT] remote -v:\n", remoteInfo);

    // 변경 여부
    const status = await execCmd("git status --porcelain");
    console.log("[GIT] status --porcelain:\n", status);

    if (!status.trim()) {
      const head = await execCmd("git log -1 --oneline");
      console.log("[GIT] no changes, head:", head.trim());

      return {
        ok: true,
        result: "no_changes",
        head: head.trim(),
      };
    }

    await execCmd("git add .");
    const commitOut = await execCmd(`git commit -m "${message}" --no-gpg-sign`);
    console.log("[GIT] commit output:\n", commitOut);

    const branch = await execCmd("git branch --show-current");
    const head = await execCmd("git log -1 --oneline");

    const pushOut = await execCmd("git push origin main");
    console.log("[GIT] push output:\n", pushOut);

    return {
      ok: true,
      result: "pushed",
      branch: branch.trim(),
      head: head.trim(),
    };
  } finally {
    releaseGitLock();
  }
}

