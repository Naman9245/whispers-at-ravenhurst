// Lobby: the room registry plus the create/join socket handlers. Rooms live in
// memory keyed by a short code. When the second player joins we auto-start and
// push each client its own filtered view.
import { GameRoom } from "./game.js";
import { RECONNECT_WINDOW_MS } from "../shared/constants.js";
import { armBriefing, settleAfterDeparture } from "./handlers/accusation.js";
import { onIntent } from "./intent.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const CODE_LEN = 5;

export class RoomStore {
  constructor() {
    this.rooms = new Map();           // code -> GameRoom
    this.disconnectTimers = new Map(); // socketId -> timeout
  }

  makeCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LEN }, () =>
        CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  get(code) { return this.rooms.get((code || "").toUpperCase()); }
  roomOf(socket) { return this.get(socket.data.roomCode); }

  // Drop a room once nobody is left in it. Called from every exit path (explicit
  // leave AND the disconnect grace timeout) — previously only the disconnect path
  // deleted rooms, so every finished / abandoned game stayed in this Map for the
  // lifetime of the process.
  reapIfEmpty(room) {
    if (!room || room.players.length > 0) return false;
    room.clearTimers();
    // Only if the code still points at THIS room: a late disconnect timer for a
    // room that was already reaped must not delete a newer room that reused it.
    if (this.rooms.get(room.code) !== room) return false;
    this.rooms.delete(room.code);
    console.log(`[lobby] room ${room.code} closed (empty)`);
    return true;
  }
}

// Detach one socket from its room: drop the player, leave the socket.io room,
// forget the code, tell whoever remains, and reap the room if it's now empty.
// `left: true` distinguishes a deliberate exit from a dropped connection.
export function detachFromRoom(io, socket, store, { left = false } = {}) {
  const room = store.roomOf(socket);
  if (!room) return null;
  const player = room.player(socket.id);
  room.removePlayer(socket.id);
  socket.leave(room.code);
  socket.data.roomCode = null;
  socket.data.token = null;
  io.to(room.code).emit("peer:status", { connected: false, left });
  for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  console.log(`[lobby] ${player?.name || socket.id} left ${room.code} (${room.players.length} remaining)`);
  settleAfterDeparture(io, room);
  store.reapIfEmpty(room);
  return room;
}

export function registerLobby(io, socket, store) {
  // Create a room; creator becomes Holmes (player 1).
  onIntent(socket, "room:create", ({ name, devMode, settings }, cb) => {
    detachFromRoom(io, socket, store, { left: true }); // never hold two rooms at once
    const code = store.makeCode();
    // `settings` is untrusted; GameRoom runs it through sanitizeSettings().
    const room = new GameRoom(code, Boolean(devMode), settings);
    const player = room.addPlayer({ id: socket.id, name });
    store.rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.token = player.token;
    cb({ ok: true, code, token: player.token, view: room.viewFor(socket.id) });
    console.log(`[lobby] room ${code} created by ${player.name} (dev=${room.devMode})`);
  });

  // Join an existing room by code; joiner becomes Watson (player 2).
  onIntent(socket, "room:join", async ({ code, name }, cb) => {
    const room = store.get(typeof code === "string" ? code : "");
    if (!room) return cb({ ok: false, error: "Room not found." });
    // Your own code: the detach below would empty the room, reap it, and then add
    // you back into a room no one else can find — waiting forever.
    if (socket.data.roomCode === room.code) return cb({ ok: false, error: "That's your own room — send the code to your partner." });
    if (room.isFull()) return cb({ ok: false, error: "Room is full." });
    if (room.status !== "lobby") return cb({ ok: false, error: "Game already started." });

    detachFromRoom(io, socket, store, { left: true }); // never hold two rooms at once
    const player = room.addPlayer({ id: socket.id, name });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.token = player.token;
    console.log(`[lobby] ${player.name} joined ${room.code} (${room.players.length}/2)`);

    // Two players present -> start the game and send each its own view.
    if (room.isFull()) {
      await room.start();
      // The briefing comes first; the soft cap is armed when play begins.
      armBriefing(io, room);
      for (const p of room.players) {
        io.to(p.id).emit("game:start", room.viewFor(p.id));
      }
      console.log(`[lobby] room ${room.code} started`);
    }
    cb({ ok: true, code: room.code, token: player.token, view: room.viewFor(socket.id) });
  });

  // Explicit exit: Exit Game / Play Again / Main Menu. The client used to just
  // reset its own state, which left the GameRoom running — its soft cap would
  // later fire and push a `game:reveal` at a player sitting in the lobby (or in
  // a NEW room), and the opponent was never told their rival had walked away.
  onIntent(socket, "room:leave", (_payload, cb) => {
    detachFromRoom(io, socket, store, { left: true });
    cb({ ok: true });
  });

  // Lightweight re-sync request (client can ask for its current view any time).
  onIntent(socket, "state:request", (_payload, cb) => {
    const room = store.roomOf(socket);
    cb(room ? { ok: true, view: room.viewFor(socket.id) } : { ok: false });
  });
}

// Basic disconnect handling. Full pause + 30s reconnect-by-token is step 12;
// for now we notify the opponent and clean up after the window.
export function handleDisconnect(io, socket, store) {
  const room = store.roomOf(socket);
  if (!room) return;

  // Still in the lobby: there is no game to come back to, so leave right away.
  // Holding the seat for the reconnect window let a partner join a host who was
  // already gone, and start a game against nobody.
  if (room.status === "lobby") {
    detachFromRoom(io, socket, store);
    return;
  }

  const player = room.player(socket.id);
  if (player) player.connected = false;
  io.to(room.code).emit("peer:status", { connected: false });
  for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
  console.log(`[lobby] ${player?.name || socket.id} disconnected from ${room.code}`);

  const t = setTimeout(() => {
    store.disconnectTimers.delete(socket.id);
    if (!room.player(socket.id)) return;
    room.removePlayer(socket.id);
    for (const p of room.players) io.to(p.id).emit("state:update", room.viewFor(p.id));
    settleAfterDeparture(io, room);
    store.reapIfEmpty(room);
  }, RECONNECT_WINDOW_MS);
  store.disconnectTimers.set(socket.id, t);
}
