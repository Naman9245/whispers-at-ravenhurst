// One playable character with free-roam, collision-aware movement. It owns its
// pixel position (FEET on the floor), facing, animation, and which room it is
// "anchored" to. Movement is driven by an input vector (WASD/arrows); the
// connection graph decides which rooms are walkable (current room + neighbours),
// so you still can't reach a non-connected room.
import { roomStanding, ROOM_IDS, isWalkable, roomAt } from "./boardData.js";
import { frameImg } from "./sprites.js";
import { MOVE_SPEED } from "@shared/constants.js";

const DIRS = [
  "east", "south-east", "south", "south-west",
  "west", "north-west", "north", "north-east",
];

// Screen coords: +x = east, +y = south. Snap a velocity vector to one of 8 dirs.
function dirFromVector(dx, dy) {
  let i = Math.round((Math.atan2(dy, dx) * 4) / Math.PI);
  if (i < 0) i += 8;
  return DIRS[i % 8];
}

const FRAME = 124;
const ANCHOR_X = 62;
const ANCHOR_Y = 94;
// Smaller sprite: fits the room interiors better (rooms feel roomier) and keeps
// the head from poking far past the top wall when feet collide near the edge.
const SCALE = 0.8;
const WALK_FRAME_MS = 80;
const IDLE_FRAME_MS = 190;

export class Character {
  constructor(character, room, spriteData) {
    this.character = character;
    this.data = spriteData;
    this.anchorRoom = room;       // room whose doorways are open (last entered)
    this.inCorridor = false;      // standing in the corridor (not a room)
    const s = roomStanding(room);
    this.x = s.x;
    this.y = s.y;
    this.dir = "south";
    this.state = "idle";          // "idle" | "walking"
    this.frame = 0;
    this.frameT = 0;
    this.ix = 0;                  // input vector (set each frame)
    this.iy = 0;
    this.sprint = false;          // Shift held → 2x speed (set each frame)
    this.onRegionChange = null;   // (anchorRoom, inCorridor) => void
  }

  setSprites(data) { this.data = data; }
  setInput(dx, dy) { this.ix = dx; this.iy = dy; }
  isMoving() { return this.state === "walking"; }
  get room() { return this.anchorRoom; }

  // Instantly turn to face a board point (no walking). Used when examining a
  // hotspot so the detective looks AT the furniture instead of away from it.
  faceToward(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    if (Math.hypot(dx, dy) > 0.01) this.dir = dirFromVector(dx, dy);
  }

  // Rooms the player may currently walk into. The central corridor physically
  // connects ALL six rooms, so every room is reachable — gating entry to only the
  // anchor's graph-neighbours left players stuck at the doorways of rooms they
  // could plainly see and walk to. Walls + doorways are the only real constraint.
  _openRooms() { return ROOM_IDS; }

  update(dt) {
    let dx = this.ix, dy = this.iy;
    const mag = Math.hypot(dx, dy);

    if (mag > 0.01) {
      dx /= mag; dy /= mag;
      this.dir = dirFromVector(dx, dy);   // face the way we're pushing, even if blocked
      // Sprint doubles speed; the walk animation stays at normal cadence (a 2x
      // cycle reads cartoonishly), so fast feet just cover more ground per step.
      const step = (MOVE_SPEED * (this.sprint ? 2 : 1) * dt) / 1000;
      const open = this._openRooms();
      const sx = this.x, sy = this.y;   // feet position BEFORE this step
      const nx = this.x + dx * step;
      const ny = this.y + dy * step;
      // Move on both axes if possible, else slide along whichever wall yields.
      if (isWalkable(nx, ny, open)) { this.x = nx; this.y = ny; }
      else if (isWalkable(nx, this.y, open)) { this.x = nx; }
      else if (isWalkable(this.x, ny, open)) { this.y = ny; }
      // AFTER collision: if the feet didn't actually advance (≥0.5px on either
      // axis), a wall is blocking us — show IDLE (facing the wall) instead of a
      // walk cycle going nowhere ("moonwalking"). Stays IDLE until we move again.
      const moved = Math.abs(this.x - sx) >= 0.5 || Math.abs(this.y - sy) >= 0.5;
      this.state = moved ? "walking" : "idle";
    } else {
      this.state = "idle";
    }

    // Region detection: did we enter a (neighbour) room, or step into the corridor?
    const here = roomAt(this.x, this.y, this._openRooms());
    let changed = false;
    if (here && here !== this.anchorRoom) { this.anchorRoom = here; this.inCorridor = false; changed = true; }
    else if (here === this.anchorRoom && this.inCorridor) { this.inCorridor = false; changed = true; }
    else if (!here && !this.inCorridor) { this.inCorridor = true; changed = true; }
    if (changed) this.onRegionChange?.(this.anchorRoom, this.inCorridor);

    // Animation frame advance.
    const frames = this.state === "walking" ? this.data.walk[this.dir] : this.data.idle[this.dir];
    const dur = this.state === "walking" ? WALK_FRAME_MS : IDLE_FRAME_MS;
    this.frameT += dt;
    while (this.frameT >= dur) {
      this.frameT -= dur;
      this.frame = (this.frame + 1) % frames.length;
    }
  }

  draw(ctx) {
    const frames = this.state === "walking" ? this.data.walk[this.dir] : this.data.idle[this.dir];
    const img = frameImg(frames[this.frame % frames.length]);
    if (!img) return;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 2, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      this.x - ANCHOR_X * SCALE,
      this.y - ANCHOR_Y * SCALE,
      FRAME * SCALE,
      FRAME * SCALE
    );
  }
}
