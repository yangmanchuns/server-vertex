import fs from "fs";
import path from "path";
import { exec } from "child_process";
import fetch from "node-fetch";
import { acquireGitLock, releaseGitLock } from "./gitLock.js";

function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
      if (err) reject(stderr || stdout);
      else resolve(stdout.trim());
    });
  });
}

function nowBranchName() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `auto/${ts}`;
}

async function enableAutoMerge({ owner, repo, pullRequestId }) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${process.env.GIT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        mutation EnableAutoMerge($prId: ID!) {
          enablePullRequestAutoMerge(input: {
            pullRequestId: $prId,
            mergeMethod: SQUASH
          }) {
            pullRequest {
              number
              autoMergeRequest {
                enabledAt
              }
            }
          }
        }
      `,
      variables: { prId: pullRequestId },
    }),
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(
      "Auto-merge 활성화 실패: " + JSON.stringify(json.errors)
    );
  }
}

export async function gitCommitAndCreatePR({
  commitMessage = "chore: automated changes",
  prTitle = "🤖 Automated PR",
  prBody = "자동화 테스트 통과 후 생성된 PR입니다.",
  baseBranch = "main",
}) {
  acquireGitLock();

  try {
    const {
      GIT_USERNAME,
      GIT_TOKEN,
      GIT_REPO,
      GITHUB_OWNER,
      GITHUB_REPO,
    } = process.env;

    if (
      !GIT_USERNAME ||
      !GIT_TOKEN ||
      !GIT_REPO ||
      !GITHUB_OWNER ||
      !GITHUB_REPO
    ) {
      throw new Error("Git/GitHub 환경변수 누락");
    }

    const authRepo = GIT_REPO.replace(
      "https://",
      `https://${GIT_USERNAME}:${GIT_TOKEN}@`
    );

    await execCmd("git reset -- '*.json'").catch(() => {});

    const branch = nowBranchName();
    await execCmd(`git checkout -b ${branch}`);

    await execCmd(`git config user.name "AI-Auto-Bot"`);
    await execCmd(`git config user.email "ai-bot@automation.local"`);

    const status = await execCmd("git status --porcelain");
    if (!status) {
      return { ok: true, result: "no_changes", branch };
    }

    await execCmd("git add .");
    await execCmd(`git commit -m "${commitMessage}" --no-gpg-sign`);

    await execCmd("git remote remove origin").catch(() => {});
    await execCmd(`git remote add origin ${authRepo}`);
    await execCmd(`git push origin ${branch}`);

    // 🔹 PR 생성
    const prRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${GIT_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          title: prTitle,
          head: branch,
          base: baseBranch,
          body: prBody,
        }),
      }
    );

    const pr = await prRes.json();
    if (!pr.html_url || !pr.node_id) {
      throw new Error(`PR 생성 실패: ${JSON.stringify(pr)}`);
    }

    // 🔥 Auto-merge 활성화
    await enableAutoMerge({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      pullRequestId: pr.node_id,
    });

    return {
      ok: true,
      result: "pr_created_auto_merge_enabled",
      branch,
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  } finally {
    releaseGitLock();
  }
}
