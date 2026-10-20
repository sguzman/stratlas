import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {chromium} from "playwright-core";

// Exercises the REAL ArcGIS GIS endpoint in a browser, including provider CORS.
// Basemap pixels are mocked so unrelated tile servers cannot affect this test.
const executablePath=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true,args:[
  "--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"
]});
const tile=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=","base64");
try{
  const page=await browser.newPage({viewport:{width:1200,height:720}});
  const errors=[],gis=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("response",response=>{
    if(response.url().includes("/Zoning/FeatureServer/15/query"))
      gis.push({status:response.status(),url:response.url().slice(0,180)});
  });
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.js",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.js",contentType:"text/javascript"}));
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.css",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.css",contentType:"text/css"}));
  await page.route("https://tile.openstreetmap.org/**",
    route=>route.fulfill({body:tile,contentType:"image/png"}));
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#zoom-level")?.textContent?.startsWith("Zoom "));
  // Zoom into central LA before enabling the overlay. Never query whole LA.
  for(let i=0;i<6;i++)await page.locator(".maplibregl-ctrl-zoom-in").click();
  await page.waitForFunction(()=>Number(document.querySelector("#zoom-level")?.textContent?.split(" ")[1])>=14,
    {timeout:16000});
  await page.evaluate(()=>{
    const el=document.querySelector("#overlay-status");
    window.__zoningLoaded=false;
    new MutationObserver(()=>{
      const s=el.textContent||"";
      if(/^Zoning: loaded \d+\//.test(s)||/^Zoning: \d+ retained · \d+\/\d+ in current view/.test(s))
        window.__zoningLoaded=true;
    }).observe(el,{childList:true,characterData:true,subtree:true});
  });
  await page.locator("#zoning").check();
  await page.waitForFunction(()=>window.__zoningLoaded,{timeout:90000});
  assert.ok(gis.some(x=>x.url.includes("returnIdsOnly=true")),"No ArcGIS ID lookup");
  assert.ok(gis.some(x=>x.url.includes("objectIds=")),"No ArcGIS polygon query");
  assert.ok(!errors.length,"Browser exceptions: "+errors.join("; "));
  console.log("Live zoning API succeeded; provider queries:",gis.length);
  console.log("Overlay status:",await page.locator("#overlay-status").textContent());
}catch(error){
  console.error("Live zoning provider test failed:",String(error));
  throw error;
}finally{
  await browser.close();
}
