import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {chromium} from "playwright-core";
const exe=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(existsSync);
assert.ok(exe,"Chrome/Chromium required");
const browser=await chromium.launch({executablePath:exe,headless:true,args:["--no-sandbox"]});
try{
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  for(const [name,service] of [
    ["Topography","USGSTopo"],
    ["Shaded relief","USGSShadedReliefOnly"],
    ["Orthoimagery","USGSImageryOnly"]
  ]){
    const url="https://basemap.nationalmap.gov/arcgis/rest/services/"+
      service+"/MapServer/tile/9/204/87";
    const response=await page.evaluate(async url=>{
      const signal=AbortSignal.timeout(18000);
      const result=await fetch(url,{mode:"cors",cache:"default",signal});
      const bytes=await result.arrayBuffer();
      return {ok:result.ok,status:result.status,type:result.headers.get("content-type"),length:bytes.byteLength};
    },url);
    assert.ok(response.ok,name+" returned HTTP "+response.status);
    assert.match(response.type||"",/^image\//i,name+" is not an image: "+response.type);
    assert.ok(response.length>900,name+" returned suspiciously few bytes");
    console.log(name+": HTTP "+response.status+" · "+response.length+" bytes");
  }
}finally{await browser.close()}
