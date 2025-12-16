import crypto from "crypto";
import { env } from "../config/env.js";

export function verifySlack(req) {
  const secret = env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // 테스트용

  const ts = req.headers["x-slack-request-timestamp"];
  const sig = req.headers["x-slack-signature"];
  if (!ts || !sig) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 60 * 5) return false;

  const base = `v0:${ts}:${req.rawBody}`;
  const hash = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(sig));
  } catch {
    return false;
  }
}
