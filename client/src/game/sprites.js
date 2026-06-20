// Loads sprite frames from public/assets via the generated manifest and keeps
// decoded <img> elements in a cache so the render loop can draw them cheaply.

let manifest = null;
const cache = new Map(); // path -> HTMLImageElement

async function getManifest() {
  if (!manifest) {
    const res = await fetch("/assets/sprites.json");
    manifest = await res.json();
  }
  return manifest;
}

function preload(path) {
  if (cache.has(path)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { cache.set(path, img); resolve(); };
    img.onerror = () => resolve(); // don't block on a missing frame
    img.src = "/" + path;
  });
}

// Returns the manifest section for a character: { walk:{dir:[paths]}, idle:{...} }
export async function loadSprites(character) {
  const m = await getManifest();
  const data = m[character];
  const paths = [];
  for (const anim of ["walk", "idle"]) {
    for (const dir of Object.keys(data[anim])) paths.push(...data[anim][dir]);
  }
  await Promise.all(paths.map(preload));
  return data;
}

export const frameImg = (path) => cache.get(path);
