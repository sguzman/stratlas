import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {chromium} from "playwright-core";

const chrome=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"]
  .find(existsSync);
assert.ok(chrome,"Headless Chrome or Chromium must exist on the Actions runner");
const browser=await chromium.launch({
  executablePath:chrome,headless:true,
  args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"]
});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.js",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.js",contentType:"text/javascript"}));
  await page.route("https://cdn.jsdelivr.net/npm/maplibre-gl@5.5.0/dist/maplibre-gl.css",
    route=>route.fulfill({path:"node_modules/maplibre-gl/dist/maplibre-gl.css",contentType:"text/css"}));
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=","base64");
  await page.route("https://tile.openstreetmap.org/**",
    route=>route.fulfill({body:png,contentType:"image/png"}));
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>{
    const status=document.querySelector("#grid-status")?.textContent||"";
    return status.startsWith("Showing ")&&document.querySelector("#zoom-level")?.textContent.startsWith("Zoom ");
  },{timeout:30000});
  assert.equal(await page.locator("#preview-income").count(),0);
  assert.equal(await page.locator("#grid-canvas").count(),1);
  assert.equal(await page.locator("#tile-grid").isChecked(),true);
  const painted=await page.$eval("#grid-canvas",element=>{
    if(element.hidden)return false;
    const ctx=element.getContext("2d");
    if(!ctx)return false;
    const a=ctx.getImageData(0,0,element.width,element.height).data;
    for(let i=3;i<a.length;i+=4)if(a[i]>0)return true;
    return false;
  });
  assert.ok(painted,"Grid canvas must actually draw visible nontransparent lines");
  // At the initial broad zoom there are no GIS requests; toggling still
  // needs to expose a complete, truthful categorical legend.
  assert.equal(await page.locator("#zoning-legend").isVisible(),false);
  await page.locator("#zoning").check();
  assert.equal(await page.locator("#zoning-controls").isVisible(),true);
  assert.equal(await page.locator("#zoning-opacity-value").textContent(),"42%");
  await page.locator("#zoning-opacity").evaluate(element=>{element.value="76";element.dispatchEvent(new Event("input",{bubbles:true}));});
  assert.equal(await page.locator("#zoning-opacity-value").textContent(),"76%");
  assert.equal(await page.locator("#zoning-legend").isVisible(),true);
  assert.equal(await page.locator(".zoning-legend-item").count(),17);
  assert.ok(await page.locator("#zoning-legend").getByText("Single Family Residential").isVisible());
  await page.locator("#zoning").uncheck();
  assert.equal(await page.locator("#zoning-legend").isVisible(),false);
  const initial=await page.locator("#zoom-level").textContent();
  await page.locator(".maplibregl-ctrl-zoom-in").click();
  await page.waitForFunction(old=>document.querySelector("#zoom-level")?.textContent!==old,initial,
    {timeout:12000});
  assert.equal(errors.length,0,"Browser errors: "+errors.join("; "));
  assert.doesNotMatch(await page.locator("#status").textContent(),/Initialization failed/);
  console.log("Browser smoke passed: grid painted, zoom visible, obsolete button absent.");
}catch(error){
  console.error("Browser smoke failed:",error);
  throw error;
}finally{
  await browser.close();
}
