import { exec } from "child_process";

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

  // 1️⃣ 인증 포함 remote 설정
  await execCmd("git remote remove origin").catch(() => {});
  await execCmd(`git remote add origin ${authRepo}`);

  // 2️⃣ 상태 확인
  const status = await execCmd("git status --porcelain");
  if (!status.trim()) {
    return "no changes";
  }

  // 3️⃣ commit & push
  await execCmd("git add .");
  await execCmd(`git commit -m "${message}"`);
  await execCmd("git push origin main");

  return "push success";
}
