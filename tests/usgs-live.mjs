import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {chromium} from "playwright-core";
const exe=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(existsSync);
assert.ok(exe,"Chrome/Chromium required");
const browser=await chromium.launch({executablePath:exe,headless:true,args:["--no-sandbox"]});
try{
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  // USGS shaded relief is intentionally sparse over water and outside native
  // coverage. Verify one actual on-land tile for EACH source.
  const sampleTiles=["9/204/87","9/203/88","9/194/105","10/389/210"];
  for(const [name,service] of [
    ["Topography","USGSTopo"],
    ["Shaded relief","USGSShadedReliefOnly"],
    ["Orthoimagery","USGSImageryOnly"]
  ]){
    const observed=[];
    let good=false;
    for(const tile of sampleTiles){
      const url="https://basemap.nationalmap.gov/arcgis/rest/services/"+
        service+"/MapServer/tile/"+tile;
      const result=await page.evaluate(async url=>{
        const response=await fetch(url,{mode:"cors",cache:"default",
          signal:AbortSignal.timeout(18000)});
        const bytes=await response.arrayBuffer();
        return {ok:response.ok,status:response.status,
          type:response.headers.get("content-type"),length:bytes.byteLength};
      },url);
      observed.push({tile,status:result.status,bytes:result.length});
      if(result.ok && /^image\//i.test(result.type||"") && result.length>900){
        good=true;break;
      }
      if(result.status!==404)break; // don't mask auth, policy, or server errors
    }
    assert.ok(good,name+" had no valid on-land tile: "+JSON.stringify(observed));
    console.log(name+": "+JSON.stringify(observed));
  }
}finally{await browser.close()}
