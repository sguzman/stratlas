import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const code=readFileSync(new URL("../web/census.js",import.meta.url),"utf8");
const {createCensusOverlay}=await import("data:text/javascript,"+encodeURIComponent(code));
class FakeMap {
  constructor({zoom=13,viewport=[-118.27,34.01,-118.23,34.07]}={}) {
    this.zoom=zoom;this.viewport=viewport;this.events=new Map();
    this.sources=new Map();this.layers=new Map();this.lastPaint=null;
  }
  getZoom(){return this.zoom}
  getBounds(){
    const [w,s,e,n]=this.viewport;
    return {getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n};
  }
  isStyleLoaded(){return true}
  getSource(id){return this.sources.get(id)}
  getLayer(id){return this.layers.get(id)}
  addSource(id,obj){this.sources.set(id,{...obj,setData(value){this.data=value}})}
  addLayer(layer){this.layers.set(layer.id,layer)}
  setPaintProperty(id,name,value){this.lastPaint={id,name,value}}
  on(event,callback){this.events.set(event,callback)}
  fire(event){this.events.get(event)?.({})}
}
const feature=id=>({
  type:"Feature",properties:{GEOID:id,BASENAME:"1010.10"},
  geometry:{type:"Polygon",coordinates:[[[-118.25,34.03],[-118.24,34.03],
    [-118.24,34.05],[-118.25,34.05],[-118.25,34.03]]]}
});
const geojson={type:"FeatureCollection",features:[feature("06037101010")]};
const figures={data:{"14000US06037101010":{
  B19013:{estimate:{B19013001:85000},error:{B19013001:9000}},
  B01001:{estimate:{B01001001:100,B01001026:55}},
  B03002:{estimate:{B03002001:100,B03002012:45,B03002003:35}}
}}};
function overlay(map,statuses=[]){
  return createCensusOverlay(map,{
    getRegion:()=>[-118.4,33.9,-118.15,34.2],
    filterFeatures:value=>value,
    // Fake boundary to Rust/WASM. Real normalization is covered by Rust tests.
    enrichFeatures:(geo,acs)=>{
      const result=JSON.parse(geo),stats=JSON.parse(acs).data;
      result.features.forEach(f=>{
        const record=stats["14000US"+f.properties.GEOID];
        if(record) {
          f.properties.acs_income=record.B19013.estimate.B19013001;
          f.properties.acs_population=record.B01001.estimate.B01001001;
        }
      });
      return JSON.stringify(result);
    },
    onStatus:text=>statuses.push(text),legendContainer:null
  });
}
async function settle(){
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
}
test("opt-in only: no Census requests when disabled",async()=>{
  let count=0;globalThis.fetch=async()=>{count++;throw Error("unexpected")};
  const map=new FakeMap(),c=overlay(map);
  map.fire("style.load");map.fire("moveend");await settle();
  c.setMetric("off");
  assert.equal(count,0);
});
test("no network use outside LA County coverage or below zoom 12",async()=>{
  let count=0;globalThis.fetch=async()=>{count++;throw Error("unexpected")};
  overlay(new FakeMap({viewport:[-73.9,40.7,-73.8,40.8]})).setMetric("income");
  overlay(new FakeMap({zoom:11})).setMetric("hispanic");
  await settle();
  assert.equal(count,0);
});
test("only intersecting tracts are retrieved; metric switching does not refetch",async()=>{
  const urls=[],statuses=[];
  globalThis.fetch=async url=>{
    const u=new URL(url);urls.push(u);
    if(u.hostname==="tigerweb.geo.census.gov")return {ok:true,json:async()=>geojson};
    assert.equal(u.hostname,"api.censusreporter.org");
    return {ok:true,json:async()=>figures};
  };
  const map=new FakeMap(),c=overlay(map,statuses);
  c.setMetric("income");await settle();
  assert.equal(urls.length,2);
  const bbox=urls[0].searchParams.get("geometry").split(",").map(Number);
  assert.ok(bbox[0]>=-118.4 && bbox[1]>=33.9);
  assert.ok(bbox[2]<=-118.15 && bbox[3]<=34.2);
  assert.ok(bbox[0]>=map.viewport[0]-.01);
  assert.ok(bbox[2]<=map.viewport[2]+.01);
  assert.equal(urls[0].searchParams.get("where"),"STATE='06' AND COUNTY='037'");
  assert.equal(urls[1].pathname,"/1.0/data/show/acs2024_5yr");
  assert.equal(urls[1].searchParams.get("geo_ids"),"14000US06037101010");
  assert.equal(map.getSource("acs-tracts").data.features[0].properties.acs_income,85000);
  assert.match(statuses.at(-1),/1\/1 tracts/);
  c.setMetric("population");await settle();
  assert.equal(urls.length,2);
  assert.equal(map.lastPaint.value[0],"case");
  c.setMetric("off");
  assert.equal(map.getSource("acs-tracts").data.features.length,0);
});
test("no partial choropleth when viewport exceeds 250 tract limit",async()=>{
  let count=0;const statuses=[];
  globalThis.fetch=async url=>{
    count++;
    if(url.includes("censusreporter"))throw Error("Statistics must not be fetched");
    return {ok:true,json:async()=>({type:"FeatureCollection",
      features:Array.from({length:251},(_,i)=>feature("06037"+String(i).padStart(6,"0")))})};
  };
  const map=new FakeMap(),c=overlay(map,statuses);
  c.setMetric("income");await settle();
  assert.equal(count,1);
  assert.match(statuses.at(-1),/Too many tracts/);
  assert.equal(map.getSource("acs-tracts").data.features.length,0);
});
