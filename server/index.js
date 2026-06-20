// Whispers at Ravenhurst — game server.
// Express for HTTP (health + future REST), Socket.io for real-time play.
// Server-authoritative: clients send intents, the server validates and pushes
// privacy-filtered views. In-memory state, one GameRoom per code (no DB).
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { RoomStore, registerLobby, handleDisconnect } from "./rooms.js";
import { registerMovement } from "./handlers/movement.js";
import { registerInvestigate } from "./handlers/investigate.js";
import { registerSuspects } from "./handlers/suspects.js";
import { registerAccusation } from "./handlers/accusation.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const store = new RoomStore();

const app = express();
app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "whispers-at-ravenhurst", rooms: store.rooms.size })
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`[io] connect ${socket.id}`);
  registerLobby(io, socket, store);
  registerMovement(io, socket, store);
  registerInvestigate(io, socket, store);
  registerSuspects(io, socket, store);
  registerAccusation(io, socket, store);
  socket.on("disconnect", () => handleDisconnect(io, socket, store));
});

httpServer.listen(PORT, () => {
  console.log(`Whispers server listening on http://localhost:${PORT}`);
  console.log(`Allowing client origin: ${CLIENT_ORIGIN}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[ai] No ANTHROPIC_API_KEY set — case generation (step 6) will use the baked fallback case.");
  }
});
