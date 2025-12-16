import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { attachWebSocketServer } from "./websocket/ws.server.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log("🚀 Server started on port", env.PORT);
});

attachWebSocketServer(server);
