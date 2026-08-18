// Thin wrapper around the Socket.io client. Exposes promise-based intent senders
// (createRoom/joinRoom/move) and pass-through event subscription. The client only
// ever sends intents; the server validates and replies with filtered views.
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export const socket = io(SERVER_URL, { autoConnect: true });

// Emit an event and resolve with the server's ack.
function ask(event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

export const net = {
  socket,
  createRoom: (name, devMode) => ask("room:create", { name, devMode }),
  joinRoom: (code, name) => ask("room:join", { code, name }),
  // Explicit "I'm done with this room" (Exit Game / Play Again / Main Menu). The
  // server drops us from the GameRoom so an abandoned game can't keep pushing
  // reveals at us, and an empty room gets reaped instead of leaking.
  leaveRoom: () => ask("room:leave", {}),
  enterRegion: (room, inCorridor) => ask("region:enter", { room, inCorridor }),
  examine: (hotspotId) => ask("hotspot:examine", { hotspotId }),
  askSuspect: (suspectId, questionId) => ask("suspect:ask", { suspectId, questionId }),
  confrontSuspect: (suspectId, clueId) => ask("suspect:confront", { suspectId, clueId }),
  accuse: (payload) => ask("accuse:lock", payload),
  requestState: () => ask("state:request", {}),
  on: (event, cb) => { socket.on(event, cb); return () => socket.off(event, cb); },
  off: (event, cb) => socket.off(event, cb),
};
