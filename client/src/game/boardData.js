// Re-export the shared map module so existing game code keeps importing from
// "./boardData.js" while the single source of truth lives in /shared (used by
// the server too).
export * from "@shared/mapData.js";
