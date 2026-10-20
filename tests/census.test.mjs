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
  setLayoutProperty(id,name,value){const layer=this.layers.get(id);layer.layout={...(layer.layout||{}),[name]:value}}
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
  assert.match(statuses.at(-1),/1\/1 visible tracts/);
  c.setMetric("population");await settle();
  assert.equal(urls.length,2);
  assert.equal(map.lastPaint.value[0],"case");
  c.setMetric("off");
  assert.equal(map.getSource("acs-tracts").data.features.length,1,
    "Disabling a choropleth must hide it without dropping its data");
  c.setMetric("income");await settle();
  assert.equal(urls.length,2,"Re-enabling same tract view must use retained estimates");
});
test("oversized viewport is subdivided instead of rejected at 250 tracts",async()=>{
  const urls=[],statuses=[];
  globalThis.fetch=async url=>{
    const parsed=new URL(url);
    urls.push(parsed);
    if(parsed.hostname==="api.censusreporter.org")
      return {ok:true,json:async()=>figures};
    const bbox=parsed.searchParams.get("geometry").split(",").map(Number);
    const tooWide=bbox[2]-bbox[0]>0.027;
    return {ok:true,json:async()=>({
      type:"FeatureCollection",
      features:tooWide
        ? Array.from({length:251},(_,i)=>feature("06037"+String(i).padStart(6,"0")))
        : [feature("06037101010")],
      exceededTransferLimit:false
    })};
  };
  const map=new FakeMap(),c=overlay(map,statuses);
  c.setMetric("income");await settle();
  const geom=urls.filter(x=>x.hostname==="tigerweb.geo.census.gov");
  assert.ok(geom.length>=5, "A large response must be subdivided");
  assert.ok(geom.length<200, "Subdivision remains bounded by depth");
  assert.equal(map.getSource("acs-tracts").data.features.length,1);
  assert.doesNotMatch(statuses.at(-1),/Too many tracts/);
});
test("more than 24 Census geography requests complete without arbitrary request cutoff",async()=>{
  const urls=[],statuses=[],focus=[-118.24657,34.044567];
  globalThis.fetch=async url=>{
    const parsed=new URL(url);urls.push(parsed);
    if(parsed.hostname==="api.censusreporter.org")
      return {ok:true,json:async()=>figures};
    const [w,s,e,n]=parsed.searchParams.get("geometry").split(",").map(Number);
    const capped=w<focus[0]&&focus[0]<e&&s<focus[1]&&focus[1]<n;
    return {ok:true,json:async()=>({type:"FeatureCollection",
      features:capped
        ? Array.from({length:251},(_,i)=>feature("06037"+String(i).padStart(6,"0")))
        : [feature("06037101010")]})};
  };
  const map=new FakeMap(),control=overlay(map,statuses);
  control.setMetric("income");await settle();
  const geo=urls.filter(x=>x.hostname==="tigerweb.geo.census.gov");
  assert.ok(geo.length>24,"The old 24-request navigation cutoff must not return");
  for(const q of geo){
    const [w,s,e,n]=q.searchParams.get("geometry").split(",").map(Number);
    assert.ok(w>=-118.4&&e<=-118.15&&s>=33.9&&n<=34.2);
  }
  assert.ok(map.getSource("acs-tracts").data.features.length>0);
  assert.match(statuses.at(-1),/additional dense sections/);
});

test("early style.load registers census source before basemap tiles finish",async()=>{
  let requests=0;globalThis.fetch=async()=>{requests++;throw Error("unexpected")};
  const map=new FakeMap({zoom:11});map.isStyleLoaded=()=>false;
  const layer=overlay(map);map.fire("style.load");layer.setMetric("income");await settle();
  assert.ok(map.getSource("acs-tracts"));
  assert.ok(map.getLayer("acs-tract-fill"));
  assert.equal(requests,0);
});

test("zoom-out keeps previously visited tract estimates, with no API refetch",async()=>{
  const map=new FakeMap(),calls=[];
  globalThis.fetch=async url=>{
    calls.push(url);
    return {ok:true,json:async()=>url.includes("tigerweb")?geojson:figures};
  };
  const c=overlay(map);
  c.setMetric("income");await settle();
  assert.equal(map.getSource("acs-tracts").data.features.length,1);
  map.zoom=9;map.fire("moveend");await settle();
  assert.equal(map.getSource("acs-tracts").data.features.length,1);
  assert.equal(calls.length,2);
});

test("pan queries only new geographic strips and does not redownload covered area",async()=>{
  const urls=[],statuses=[],map=new FakeMap();
  globalThis.fetch=async url=>{
    urls.push(new URL(url));
    return {ok:true,json:async()=>url.includes("tigerweb")?geojson:figures};
  };
  const c=overlay(map,statuses);
  c.setMetric("income");await settle();
  const firstShapes=urls.filter(u=>u.hostname==="tigerweb.geo.census.gov");
  assert.equal(firstShapes.length,1);
  const coveredEast=Number(firstShapes[0].searchParams.get("geometry").split(",")[2]);
  map.viewport=[-118.25,34.01,-118.21,34.07];
  map.fire("moveend");
  await new Promise(r=>setTimeout(r,185));
  await settle();
  const shapes=urls.filter(u=>u.hostname==="tigerweb.geo.census.gov");
  assert.equal(shapes.length,2,"Only the unseen strip is fetched on a small pan");
  const [w,s,e,n]=shapes[1].searchParams.get("geometry").split(",").map(Number);
  assert.ok(w>=coveredEast-0.00001,"Do not query already-covered longitudes");
  assert.equal(urls.filter(u=>u.hostname==="api.censusreporter.org").length,1,
    "Already known tract statistics are reused");
});
test("geometry appears before slow ACS statistics finish",async()=>{
  const map=new FakeMap(),statuses=[];
  let resolveStats;
  globalThis.fetch=async url=>{
    if(url.includes("tigerweb"))return {ok:true,json:async()=>geojson};
    return new Promise(resolve=>{resolveStats=()=>resolve({ok:true,json:async()=>figures})});
  };
  const c=overlay(map,statuses);
  c.setMetric("income");await settle();
  assert.equal(typeof resolveStats,"function");
  assert.equal(map.getSource("acs-tracts").data.features.length,1,
    "Map should show geometry while still waiting for remote estimates");
  assert.match(statuses.at(-1),/boundaries ready|loading/);
  resolveStats();await settle();
  assert.equal(map.getSource("acs-tracts").data.features[0].properties.acs_income,85000);
});

test("dense census sections fetch in parallel with a strict three-request ceiling",async()=>{
  const map=new FakeMap();
  const outstanding=[];
  const requested=[];
  let concurrent=0, peak=0;
  globalThis.fetch=async url=>{
    const parsed=new URL(url);
    if(parsed.hostname==="api.censusreporter.org")
      return {ok:true,json:async()=>figures};
    const bounds=parsed.searchParams.get("geometry").split(",").map(Number);
    requested.push(bounds);
    if(bounds[2]-bounds[0]>0.027){
      return {ok:true,json:async()=>({type:"FeatureCollection",
        features:Array.from({length:251},(_,i)=>feature("06037"+String(i).padStart(6,"0")))})};
    }
    concurrent++;
    peak=Math.max(peak,concurrent);
    return new Promise(resolve=>{
      outstanding.push(()=>{
        concurrent--;
        resolve({ok:true,json:async()=>geojson});
      });
    });
  };
  const census=overlay(map);
  census.setMetric("income");
  await settle();
  assert.equal(peak,3,"at most three geometry requests should run concurrently");
  assert.equal(outstanding.length,3,"three quadrants start without waiting serially");
  const first=outstanding.shift();
  first();await settle();
  assert.equal(outstanding.length,3,"replenish the worker slot when a query finishes");
  while(outstanding.length){
    outstanding.shift()();
    await settle();
  }
  assert.equal(concurrent,0);
  assert.equal(map.getSource("acs-tracts").data.features.length,1);
  assert.ok(requested.length>=5);
  assert.ok(requested.length<200);
  assert.ok(peak<=3,"never exceed the public service concurrency ceiling");
});
