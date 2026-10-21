import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const script=readFileSync(new URL("../web/overview.js",import.meta.url),"utf8");
const {statisticsUrl,parseStatistics,countyStatistics,countySummary,createWideOverview}=
  await import("data:text/javascript,"+encodeURIComponent(script));
const bounds=[-118.32,34.00,-118.12,34.20];
const region=[-118.95,32.70,-117.64,34.85];
class FakeMap{
  constructor(){this.zoom=9;this.bounds=bounds;this.handlers=new Map()}
  getZoom(){return this.zoom}
  getBounds(){const [w,s,e,n]=this.bounds;return {
    getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n
  }}
  on(name,callback){this.handlers.set(name,callback)}
  fire(name){this.handlers.get(name)?.()}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test("statistics URLs ask for actual provider aggregate values, never polygons",()=>{
  for(const type of ["zoning","parcel"]){
    const url=new URL(statisticsUrl(type,bounds));
    assert.equal(url.searchParams.get("geometryType"),"esriGeometryEnvelope");
    assert.equal(url.searchParams.get("returnGeometry"),"false");
    assert.equal(url.searchParams.has("objectIds"),false);
    assert.equal(url.searchParams.has("outStatistics"),true);
  }
  const z=new URL(statisticsUrl("zoning",bounds));
  assert.equal(z.searchParams.get("groupByFieldsForStatistics"),"CATEGORY");
  const p=new URL(statisticsUrl("parcel",bounds));
  assert.equal(JSON.parse(p.searchParams.get("outStatistics"))[1].outStatisticFieldName,"mean_value");
});
test("zoning summary reports polygon counts as text, not geographic shares",()=>{
  const summary=parseStatistics("zoning",{features:[
    {attributes:{CATEGORY:"Residential",n:15}},
    {attributes:{CATEGORY:"Commercial",n:7}}
  ]});
  assert.equal(summary.rows[0].label,"Residential");
  assert.equal(summary.rows[0].value,"15");
  assert.match(summary.description,/not land-area percentages/);
  assert.equal(summary.geometry,undefined);
  assert.deepEqual(parseStatistics("zoning",{features:[]}).rows,[]);
});
test("assessor summary reports tax-roll means, not market valuations",()=>{
  const s=parseStatistics("parcel",{features:[{attributes:{n:350,mean_value:312000}}]});
  assert.equal(s.rows[0].value,"350");
  assert.equal(s.rows[1].value,"$312,000");
  assert.match(s.description,/not their market or sale price/);
  assert.equal(parseStatistics("parcel",{features:[]}).rows.length,0);
  assert.throws(()=>parseStatistics("parcel",{error:{message:"Service unavailable"}}),/Service unavailable/);
});
test("county ACS values preserve zero-vs-missing semantics and are labeled county-wide",()=>{
  const data={data:{"05000US06037":{
    B01001:{estimate:{B01001001:9870000,B01001026:5030000}},
    B03002:{estimate:{B03002001:9870000,B03002012:4860000,B03002003:2500000}},
    B19013:{estimate:{B19013001:75200}}
  }}};
  assert.equal(countyStatistics(data).income,75200);
  assert.match(countySummary(countyStatistics(data),"population").title,/LA County/);
  data.data["05000US06037"].B19013.estimate.B19013001=null;
  assert.equal(countyStatistics(data).income,null);
  assert.equal(countySummary(countyStatistics(data),"income").rows[0].value,"Unavailable");
});
test("no selected layer makes no requests and fake map geometry cannot be painted",async()=>{
  const map=new FakeMap(),calls=[],updates=[];
  globalThis.fetch=async url=>{calls.push(url);throw Error("unexpected call")};
  const overview=createWideOverview(map,{getRegion:()=>region,
    onStatus:()=>{},onSummary:v=>updates.push(v)});
  await wait(250);
  assert.equal(calls.length,0);
  assert.ok(!script.includes("addLayer(") && !script.includes("addSource("));
  assert.equal(overview.isWide("zoning"),false);
});
test("one selected wide-area layer loads once, reuses statistics and cancels on off",async()=>{
  const map=new FakeMap(),urls=[],out=[],statuses=[];
  globalThis.fetch=async url=>{
    urls.push(url);return {ok:true,json:async()=>({
      features:[{attributes:{CATEGORY:"Residential",n:21}}]
    })};
  };
  const overview=createWideOverview(map,{getRegion:()=>region,
    onStatus:(kind,status)=>statuses.push([kind,status]),
    onSummary:summary=>out.push(summary)});
  overview.setSelection("zoning");
  await wait(260);
  assert.equal(urls.length,1);
  assert.equal(out.at(-1).rows[0].label,"Residential");
  map.fire("moveend");
  await wait(260);
  assert.equal(urls.length,1,"Previously loaded source summary reused");
  map.zoom=15;map.fire("moveend");
  await wait(220);
  assert.equal(out.at(-1).rows.length,0,"Detailed zoom clears coarse summary");
  assert.equal(overview.isWide("zoning"),false);
  overview.setSelection("off");
  await wait(230);
  assert.equal(urls.length,1);
});
test("county estimate is not falsely attributed to a narrower city-only window",async()=>{
  const map=new FakeMap(),statuses=[],calls=[];
  globalThis.fetch=async url=>{calls.push(url);throw Error("Not permitted")};
  const overview=createWideOverview(map,{getRegion:()=>[-118.67,33.7,-118.15,34.34],
    onStatus:(kind,status)=>statuses.push(status),onSummary:()=>{}});
  overview.setSelection("income");
  await wait(250);
  assert.equal(calls.length,0);
  assert.ok(statuses.some(s=>s.includes("not valid for the selected smaller region")));
});
