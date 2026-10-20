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
  // HUD appearance is independent from tiles, polygon paints, and the grid.
  const hud=page.locator("#hud-theme");
  assert.deepEqual(await hud.locator("option").evaluateAll(
    options=>options.map(el=>el.value)),["system","light","dark"]);
  assert.equal(await hud.inputValue(),"system","System must be the default");
  await page.emulateMedia({colorScheme:"light"});
  await page.waitForFunction(()=>document.documentElement.dataset.hudTheme==="light");
  const mapSurface=await page.locator("main").evaluate(el=>getComputedStyle(el).backgroundColor);
  const gridPaint=await page.locator("#grid-canvas").evaluate(el=>{
    const a=el.getContext("2d").getImageData(0,0,el.width,el.height).data;
    let sum=0;
    for(let i=3;i<a.length;i+=4)sum+=a[i];
    return sum;
  });
  const lightSidebar=await page.locator(".sidebar").evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(lightSidebar,"rgb(251, 253, 255)");
  assert.equal(await page.locator("#hud-theme-status").textContent(),"System · browser reports light");
  await page.emulateMedia({colorScheme:"dark"});
  await page.waitForFunction(()=>document.documentElement.dataset.hudTheme==="dark");
  const darkSidebar=await page.locator(".sidebar").evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(darkSidebar,"rgb(20, 34, 48)");
  assert.notEqual(lightSidebar,darkSidebar);
  assert.equal(await page.locator("#hud-theme-status").textContent(),"System · browser reports dark");
  await hud.selectOption("light");
  assert.equal(await page.locator("html").getAttribute("data-hud-theme"),"light");
  assert.equal(await page.locator("#hud-theme-status").textContent(),"Manual · light");
  await hud.selectOption("dark");
  await page.emulateMedia({colorScheme:"light"});
  assert.equal(await page.locator("html").getAttribute("data-hud-theme"),"dark",
    "Manual override must ignore subsequent system changes");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#grid-status")?.textContent?.startsWith("Showing "));
  assert.equal(await page.locator("#hud-theme").inputValue(),"dark",
    "Manual mode survives a browser reload");
  await page.locator("#hud-theme").selectOption("system");
  assert.equal(await page.locator("html").getAttribute("data-hud-theme"),"light");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#grid-status")?.textContent?.startsWith("Showing "));
  assert.equal(await page.locator("#hud-theme").inputValue(),"system",
    "System setting survives a browser reload");
  assert.equal(await page.locator("main").evaluate(el=>getComputedStyle(el).backgroundColor),
    mapSurface,"Theme changes must not recolor the map stage");
  const currentGridPaint=await page.locator("#grid-canvas").evaluate(el=>{
    const a=el.getContext("2d").getImageData(0,0,el.width,el.height).data;
    let sum=0;for(let i=3;i<a.length;i+=4)sum+=a[i];return sum;
  });
  assert.ok(currentGridPaint>0 && gridPaint>0,"Grid overlay remains painted in both themes");
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
  assert.equal(await page.locator("#assessor-legend").isVisible(),false);
  await page.locator("#assessor").check();
  assert.equal(await page.locator("#assessor-controls").isVisible(),true);
  assert.equal(await page.locator(".assessor-legend-item").count(),7);
  assert.match(await page.locator("#assessor-legend").textContent(),/NOT market or sale prices/);
  await page.locator("#assessor-opacity").evaluate(el=>{
    el.value="39";el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  assert.equal(await page.locator("#assessor-opacity-value").textContent(),"39%");
  await page.locator("#assessor").uncheck();
  assert.equal(await page.locator("#assessor-legend").isVisible(),false);
  // Official USGS raster tile styles share the same region-bounded protocol.
  await page.route("https://basemap.nationalmap.gov/**",
    route=>route.fulfill({body:png,contentType:"image/png"}));
  for(const selected of ["usgs-topo","usgs-relief","usgs-imagery"]){
    await page.locator("#basemap").selectOption(selected);
    assert.equal(await page.locator("#basemap").inputValue(),selected);
    await page.waitForTimeout(120);
    assert.doesNotMatch(await page.locator("#status").textContent(),/Initialization failed/);
  }
  await page.locator("#basemap").selectOption("osm");
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
