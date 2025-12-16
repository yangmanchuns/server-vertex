import express from "express";
import { slackRouter } from "./slack/slack.routes.js";

export function createApp() {
  const app = express();

  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    })
  );

  // Slack endpoint: /slack/events
  app.use("/slack", slackRouter);

  return app;
}
