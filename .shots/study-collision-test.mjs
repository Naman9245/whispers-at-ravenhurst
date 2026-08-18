import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL="http://localhost:5173/?menu=skip", VW=1600, VH=900;
let f=0; const ok=(l,c)=>{console.log(`${c?"  ✓":"  ✗ FAIL"} ${l}`);if(!c)f++;};
const byText=async(p,t)=>{for(const h of await p.$$("button"))if((await h.evaluate(b=>b.textContent.trim()))===t){await h.click();return true}return false};
const pos=p=>p.evaluate(()=>({x:window.__wrChar.x,y:window.__wrChar.y,room:window.__wrChar.anchorRoom}));
const place=(p,x,y)=>p.evaluate(({x,y})=>{window.__wrChar.x=x;window.__wrChar.y=y},{x,y});
const hold=async(p,k,ms)=>{await p.keyboard.down(k);await sleep(ms);await p.keyboard.up(k);await sleep(120)};
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",protocolTimeout:180000,defaultViewport:{width:VW,height:VH},args:[`--window-size=${VW},${VH}`,"--autoplay-policy=no-user-gesture-required"]});
const errs=[];
try{
  const h=await b.newPage();
  h.on("pageerror",e=>errs.push("PAGEERROR: "+e.message));
  h.on("console",m=>{if(m.type()==="error")errs.push("CONSOLE: "+m.text())});
  await h.goto(URL,{waitUntil:"networkidle2"});
  await h.waitForSelector(".lobby"); await byText(h,"Create Room");
  await h.waitForSelector(".lobby-form"); await byText(h,"Create");
  await h.waitForSelector(".lb-code-display");
  const code=await h.$eval(".lb-code-display",e=>e.textContent.trim());
  const w=await b.newPage(); await w.setViewport({width:VW,height:VH});
  await w.goto(URL,{waitUntil:"networkidle2"});
  await w.waitForSelector(".lobby"); await byText(w,"Join with Code");
  await w.waitForSelector(".lb-input.code"); await w.type(".lb-input.code",code,{delay:20}); await byText(w,"Join");
  await h.waitForSelector(".board-canvas"); await h.waitForFunction(()=>!!window.__wrChar);
  await h.bringToFront(); await sleep(1200);
  ok("spawned in the study",(await pos(h)).room==="study");

  // Study desk abs rect = roomRect(44,120) + (240,60,110,52) => x 284..394, y 180..232
  console.log("\n[A] SOLID DESK: walking east into the desk must stop the feet.");
  await place(h,250,206);           // just west of the desk, vertically mid-desk
  await sleep(200);
  const before=await pos(h);
  await hold(h,"d",900);            // push east, hard
  const after=await pos(h);
  console.log(`   feet ${before.x.toFixed(0)} -> ${after.x.toFixed(0)} (desk west edge = 284)`);
  ok("stopped before entering the desk (x < 285)", after.x < 285);
  ok("actually moved toward it (not stuck at spawn)", after.x > before.x);

  console.log("\n[B] SOLID SOFA in the LOUNGE (all six rooms are migrated now).");
  // This assertion used to be the OPPOSITE. The lounge was the un-migrated
  // control — `solid: false` — so the sofa was walk-through, which proved no
  // invisible wall existed in a room still drawn by the legacy renderer. The
  // lounge now paints from shared/roomObjects.js with real collision, so the
  // correct post-migration assertion is that the sofa BLOCKS.
  // lounge = col 2 row 0 -> rect x 1044..1428, y 120..372. Sofa abs: x 1080..1184, y 272..312.
  await place(h,1066,292); await sleep(400);
  const lr=await pos(h);
  ok(`stood in the lounge (${lr.room})`, lr.room==="lounge");
  await hold(h,"d",1200);   // walk east into the sofa
  const lAfter=await pos(h);
  console.log(`   feet 1066 -> ${lAfter.x.toFixed(0)} (sofa west edge = 1080)`);
  ok("lounge sofa blocks the feet (room migrated, collision live)", lAfter.x < 1081);
  ok("and the detective actually moved toward it", lAfter.x > 1066);

  console.log("\n[C] EXAMINE a solid piece: stand beside the desk, press E.");
  await place(h,278,206); await sleep(300);
  await hold(h,"e",180);
  await h.waitForSelector(".examine-modal",{timeout:9000});
  const title=await h.$eval(".examine-title",e=>e.textContent.trim());
  console.log("   ",title);
  ok("solid desk is examinable from beside it",/desk/i.test(title));
  await h.keyboard.press("Escape"); await sleep(400);

  console.log("\n[D] Screenshot of the rebuilt Study.");
  await place(h,236,300); await sleep(600);
  await h.screenshot({path:".shots/study-solid.png"});
  console.log("    -> .shots/study-solid.png");

  console.log("\n[errors]:",errs.length?"\n"+errs.join("\n"):" none");
  ok("no console/page errors",errs.length===0);
}catch(e){console.error("SCRIPT ERROR:",e.message);f++}
finally{await b.close();console.log(`\n=== STUDY: ${f===0?"ALL PASSED ✓":f+" FAILED ✗"} ===`);process.exit(f?1:0)}
