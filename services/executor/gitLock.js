import fs from "fs";
import path from "path";

const LOCK_PATH = path.join(process.cwd(), ".git-auto.lock");

export function acquireGitLock() {
  if (fs.existsSync(LOCK_PATH)) {
    throw new Error("Git 작업이 이미 실행 중입니다.");
  }
  fs.writeFileSync(LOCK_PATH, String(Date.now()));
}

export function releaseGitLock() {
  if (fs.existsSync(LOCK_PATH)) {
    fs.unlinkSync(LOCK_PATH);
  }
}
