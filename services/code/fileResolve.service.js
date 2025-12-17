import path from "path";

/**
 * 사용자 텍스트에서 파일명 추출 → 정확히 일치하는 경로 반환
 */
export function resolveFileByExactName(fileIndex, userText) {
  // 1️⃣ *.js 형태 추출
  const match = userText.match(/[\w.-]+\.js/);
  if (!match) return null;

  const fileName = match[0];

  // 2️⃣ fileIndex에서 파일명 정확 일치
  const matches = fileIndex.filter(
    (f) => path.basename(f) === fileName
  );

  if (matches.length === 1) {
    return matches[0]; // 🎯 자동 확정
  }

  if (matches.length > 1) {
    throw new Error(
      `파일명이 중복됩니다: ${fileName}\n후보:\n- ${matches.join("\n- ")}`
    );
  }

  return null;
}
