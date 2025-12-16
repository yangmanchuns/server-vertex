import { Router } from "express";
import { verifySlack } from "./verifySlack.js";
import { askAI } from "../services/ai.service.js";
import { postSlackMessage } from "./slackClient.js";

export const slackRouter = Router();

slackRouter.post("/events", async (req, res) => {
  if (!verifySlack(req)) return res.sendStatus(401);

  const body = req.body;

  // URL Verification
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // Event Callback
  if (body.type === "event_callback") {
    const event = body.event;

    // bot 메시지 무시 (무한루프 방지)
    if (event?.bot_id) return res.sendStatus(200);

    if (event?.type === "message" && event?.text) {
      const userText = event.text.trim();
      if (!userText) return res.sendStatus(200);

      const aiAnswer = await askAI(userText);

      await postSlackMessage(event.channel, aiAnswer);
    }

    return res.sendStatus(200);
  }

  return res.sendStatus(200);
});
