import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {chromium} from "playwright-core";

const executablePath=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(existsSync);
assert.ok(executablePath,"Chromium unavailable");
const browser=await chromium.launch({executablePath,headless:true,args:[
  "--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"
]});
const tile=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=","base64");
try{
  const page=await browser.newPage({viewport:{width:1200,height:720}});
  const errors=[],responses=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("response",response=>{
    if(response.url().includes("/LACounty_Parcel/FeatureServer/0/query"))
      responses.push({status:response.status(),url:response.url()});
  });
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.js",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.js",contentType:"text/javascript"}));
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.css",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.css",contentType:"text/css"}));
  await page.route("https://tile.openstreetmap.org/**",
    route=>route.fulfill({body:tile,contentType:"image/png"}));
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#zoom-level")?.textContent.startsWith("Zoom "));
  // MapLibre animates controls; allow transitions to settle at parcel detail.
  for(let i=0;i<14;i++){
    const value=Number((await page.locator("#zoom-level").textContent()).split(" ")[1]);
    if(value>=16.1)break;
    await page.locator(".maplibregl-ctrl-zoom-in").click();
    await page.waitForTimeout(440);
  }
  const zoom=Number((await page.locator("#zoom-level").textContent()).split(" ")[1]);
  assert.ok(zoom>=16,"Live parcel integration must use a detailed study viewport");
  await page.evaluate(()=>{
    window.__parcelLoaded=false;
    const element=document.querySelector("#assessor-status");
    new MutationObserver(()=>{
      const text=element.textContent||"";
      const match=/^Assessor: (\d+)\/(\d+) parcels in view/.exec(text);
      if(Number(match?.[1]||0)>0)window.__parcelLoaded=true;
    }).observe(element,{childList:true,characterData:true,subtree:true});
  });
  await page.locator("#assessor").check();
  try {
    await page.waitForFunction(()=>window.__parcelLoaded,null,{timeout:110000});
  } catch(error) {
    console.error("Parcel overlay status:",await page.locator("#assessor-status").textContent());
    console.error("GIS response summary:",responses.slice(0,10).map(x=>({
      status:x.status,id:new URL(x.url).searchParams.get("returnIdsOnly")==="true",
      geometry:new URL(x.url).searchParams.has("objectIds")
    })));
    throw error;
  }
  assert.ok(responses.some(x=>new URL(x.url).searchParams.get("returnIdsOnly")==="true"),
    "Missing live assessor ID discovery");
  assert.ok(responses.some(x=>new URL(x.url).searchParams.has("objectIds")),
    "Missing live assessor parcel geometry requests");
  assert.equal(errors.length,0,"Browser exceptions: "+errors.join("; "));
  console.log("Live Assessor parcel layer:",await page.locator("#assessor-status").textContent());
  console.log("Provider requests:",responses.length);
}finally{
  await browser.close();
}
