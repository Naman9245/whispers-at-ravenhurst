// Lobby: the room registry plus the create/join socket handlers. Rooms live in
// memory keyed by a short code. When the second player joins we auto-start and
// push each client its own filtered view.
import { GameRoom } from "./game.js";
import { RECONNECT_WINDOW_MS } from "../shared/constants.js";
import { scheduleForceResolve } from "./handlers/accusation.js";

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
}

export function registerLobby(io, socket, store) {
  // Create a room; creator becomes Holmes (player 1).
  socket.on("room:create", ({ name, devMode } = {}, cb) => {
    const code = store.makeCode();
    const room = new GameRoom(code, Boolean(devMode));
    const player = room.addPlayer({ id: socket.id, name });
    store.rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.token = player.token;
    cb?.({ ok: true, code, token: player.token, view: room.viewFor(socket.id) });
    console.log(`[lobby] room ${code} created by ${player.name} (dev=${room.devMode})`);
  });

  // Join an existing room by code; joiner becomes Watson (player 2).
  socket.on("room:join", async ({ code, name } = {}, cb) => {
    const room = store.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    if (room.isFull()) return cb?.({ ok: false, error: "Room is full." });
    if (room.status !== "lobby") return cb?.({ ok: false, error: "Game already started." });

    const player = room.addPlayer({ id: socket.id, name });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.token = player.token;
    console.log(`[lobby] ${player.name} joined ${room.code} (${room.players.length}/2)`);

    // Two players present -> start the game and send each its own view.
    if (room.isFull()) {
      await room.start();
      scheduleForceResolve(io, room); // soft-timer cap on the whole game
      for (const p of room.players) {
        io.to(p.id).emit("game:start", room.viewFor(p.id));
      }
      console.log(`[lobby] room ${room.code} started`);
    }
    cb?.({ ok: true, code: room.code, token: player.token, view: room.viewFor(socket.id) });
  });

  // Lightweight re-sync request (client can ask for its current view any time).
  socket.on("state:request", (_payload, cb) => {
    const room = store.roomOf(socket);
    cb?.(room ? { ok: true, view: room.viewFor(socket.id) } : { ok: false });
  });
}

// Basic disconnect handling. Full pause + 30s reconnect-by-token is step 12;
// for now we notify the opponent and clean up empty rooms after the window.
export function handleDisconnect(io, socket, store) {
  const room = store.roomOf(socket);
  if (!room) return;
  const player = room.player(socket.id);
  if (player) player.connected = false;
  io.to(room.code).emit("peer:status", { connected: false });
  console.log(`[lobby] ${player?.name || socket.id} disconnected from ${room.code}`);

  const t = setTimeout(() => {
    room.removePlayer(socket.id);
    if (room.players.length === 0) {
      room.clearTimers();
      store.rooms.delete(room.code);
      console.log(`[lobby] room ${room.code} closed (empty)`);
    }
    store.disconnectTimers.delete(socket.id);
  }, RECONNECT_WINDOW_MS);
  store.disconnectTimers.set(socket.id, t);
}
