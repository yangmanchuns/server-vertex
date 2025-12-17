import fs from "fs";
import path from "path";

export function readProjectFile(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`파일이 존재하지 않습니다: ${relativePath}`);
  }

  return fs.readFileSync(fullPath, "utf-8");
}
