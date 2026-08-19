// Thin wrapper around the Socket.io client. Exposes promise-based intent senders
// (createRoom/joinRoom/move) and pass-through event subscription. The client only
// ever sends intents; the server validates and replies with filtered views.
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export const socket = io(SERVER_URL, { autoConnect: true });

// How long to wait for the server's ack before giving up on an intent.
// Generous enough to ride out a brief reconnect (socket.io buffers emits while
// disconnected and flushes them on reconnect), short enough that a dead backend
// surfaces as an error rather than a spinner.
const ACK_TIMEOUT_MS = 7000;

// Emit an event and resolve with the server's ack.
//
// ALWAYS settles. The original version resolved only when the server answered,
// so if the backend was down or restarting the promise simply never settled —
// callers that flip a `busy` flag (the lobby's Create/Join buttons, the
// accusation lock-in) sat on "Creating…" forever with no error and no way back.
// A timed-out intent resolves with the same `{ ok: false, error }` shape every
// caller already handles, so nothing else needed to change.
function ask(event, payload) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(
      () => done({
        ok: false,
        timeout: true,
        error: socket.connected
          ? "The server didn't respond. Please try again."
          : "Can't reach the server — check that it's running, then try again.",
      }),
      ACK_TIMEOUT_MS
    );
    socket.emit(event, payload, done);
  });
}

export const net = {
  socket,
  createRoom: (name, devMode, settings) => ask("room:create", { name, devMode, settings }),
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
