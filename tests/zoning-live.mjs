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
      gis.push({status:response.status(),url:response.url()});
  });
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.js",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.js",contentType:"text/javascript"}));
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.css",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.css",contentType:"text/css"}));
  await page.route("https://tile.openstreetmap.org/**",
    route=>route.fulfill({body:tile,contentType:"image/png"}));
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#zoom-level")?.textContent?.startsWith("Zoom "));
  // Wait for each zoom animation; rapid clicks can cancel/override each other.
  // The zoning source deliberately does not fetch geography below zoom 13.
  for(let i=0;i<8;i++){
    const value=Number((await page.locator("#zoom-level").textContent()).split(" ")[1]);
    if(value>=14)break;
    await page.locator(".maplibregl-ctrl-zoom-in").click();
    await page.waitForTimeout(450);
  }
  const actualZoom=await page.locator("#zoom-level").textContent();
  console.log("Zoning live test zoom:",actualZoom);
  assert.ok(Number(actualZoom.split(" ")[1])>=14,"Did not reach a detailed map zoom");
  await page.evaluate(()=>{
    const el=document.querySelector("#overlay-status");
    window.__zoningLoaded=false;
    new MutationObserver(()=>{
      const s=el.textContent||"";
      const visible=/^Zoning: (\d+)\/(\d+) polygons in current view/.exec(s);
      if(Number(visible?.[1]||0)>0)window.__zoningLoaded=true;
    }).observe(el,{childList:true,characterData:true,subtree:true});
  });
  await page.locator("#acs-metric").selectOption("zoning");
  try{
    await page.waitForFunction(()=>window.__zoningLoaded,null,{timeout:90000});
  }catch(error){
    console.error("Last zoning status:",await page.locator("#overlay-status").textContent());
    console.error("GIS responses:",JSON.stringify(gis.slice(0,12)));
    throw error;
  }
  assert.ok(gis.some(x=>new URL(x.url).searchParams.get("returnIdsOnly")==="true"),"No ArcGIS ID lookup");
  assert.ok(gis.some(x=>new URL(x.url).searchParams.has("objectIds")),"No ArcGIS polygon query");
  // Reproduce the user's failure: pan while the first area's thousands of
  // features may still be in flight. A different viewport must request
  // a distinct ID envelope without needing to toggle the overlay.
  const idsBefore=new Set(gis.filter(x=>new URL(x.url).searchParams.get("returnIdsOnly")==="true").map(x=>x.url));
  await page.mouse.move(610,375);
  await page.mouse.down();
  await page.mouse.move(965,390,{steps:15});
  await page.mouse.up();
  let sawDifferentIdQuery=false;
  for(let attempt=0;attempt<90;attempt++){
    await page.waitForTimeout(350);
    sawDifferentIdQuery=gis.some(x=>
      new URL(x.url).searchParams.get("returnIdsOnly")==="true"&&!idsBefore.has(x.url));
    if(sawDifferentIdQuery)break;
  }
  assert.ok(sawDifferentIdQuery,"Panning didn't query IDs for the second viewport");
  assert.ok(!errors.length,"Browser exceptions: "+errors.join("; "));
  console.log("Live zoning API succeeded; provider queries:",gis.length);
  console.log("GIS response summary:",gis.map(x=>({status:x.status,idQuery:new URL(x.url).searchParams.has("returnIdsOnly"),geometryQuery:new URL(x.url).searchParams.has("objectIds")})));
  console.log("Overlay status:",await page.locator("#overlay-status").textContent());
}catch(error){
  console.error("Live zoning provider test failed:",String(error));
  throw error;
}finally{
  await browser.close();
}
