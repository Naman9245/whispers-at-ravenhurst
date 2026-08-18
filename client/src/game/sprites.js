// Loads sprite frames from public/assets via the generated manifest and keeps
// decoded <img> elements in a cache so the render loop can draw them cheaply.

// Cache the PROMISE, not the resolved value: concurrent callers (menuScene loads
// holmes + watson through Promise.all) would otherwise all see `manifest === null`
// and each kick off their own fetch before the first one resolved.
let manifestPromise = null;
const cache = new Map(); // path -> HTMLImageElement

function getManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/assets/sprites.json")
      .then((res) => res.json())
      .catch((e) => { manifestPromise = null; throw e; });   // let a failed load retry
  }
  return manifestPromise;
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
