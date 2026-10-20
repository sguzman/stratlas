import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const js=readFileSync(new URL("../web/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../web/index.html",import.meta.url),"utf8");
const sources=JSON.parse(readFileSync(
  new URL("../docs/sources/catalog.json",import.meta.url),"utf8"));
const cases=[
  ["usgs-topo","USGSTopo"],
  ["usgs-relief","USGSShadedReliefOnly"],
  ["usgs-imagery","USGSImageryOnly"]
];
test("the three USGS basemaps use the official ArcGIS level/row/column tile convention",()=>{
  for(const [id,service] of cases){
    const url="https://basemap.nationalmap.gov/arcgis/rest/services/"+
      service+"/MapServer/tile/{z}/{y}/{x}";
    assert.ok(js.includes('url:"'+url+'"'),"Incorrect tile URL: "+id);
    assert.ok(html.includes('value="'+id+'"'),"Missing basemap option: "+id);
    const record=sources.sources.find(x=>x.id===id);
    assert.ok(record,"Missing provenance for "+id);
    assert.equal(record.endpoint,url);
    assert.equal(record.credentials,"none");
    assert.match(record.coverage,/U.S./);
  }
});
test("native USGS raster requests still run through the study-region tile restriction",()=>{
  assert.match(js,/tile_in_region\(z,x,y,w,s,e,n\)/);
  assert.match(js,/if \(!tile_in_region/);
  assert.match(js,/maxZoom:16/);
  assert.match(js,/USGS tile coverage is primarily U.S./);
  assert.match(js,/response.status===404 && state.baseId.startsWith\("usgs-"\)/);
});
