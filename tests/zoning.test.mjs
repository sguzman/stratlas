import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

// Import an ESM browser module without requiring Node/npm project scaffolding.
const file=new URL("../web/zoning.js",import.meta.url);
const code=readFileSync(file,"utf8");
const {createZoningOverlay}=await import("data:text/javascript,"+encodeURIComponent(code));

class FakeMap {
  constructor({zoom=14,viewport=[-118.26,34.03,-118.24,34.06]}={}) {
    this.zoom=zoom;this.viewport=viewport;this.sources=new Map();
    this.layers=new Map();this.events=new Map();
  }
  getZoom(){return this.zoom}
  isStyleLoaded(){return true}
  getBounds(){
    const [w,s,e,n]=this.viewport;
    return {getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n};
  }
  getSource(id){return this.sources.get(id)}
  getLayer(id){return this.layers.get(id)}
  addSource(id,entry){this.sources.set(id,{...entry,setData(value){this.data=value}})}
  addLayer(entry){this.layers.set(entry.id,entry)}
  on(name,callback){this.events.set(name,callback)}
  fire(name){this.events.get(name)?.({})}
}

const geojson={type:"FeatureCollection",features:[{
  type:"Feature",properties:{OBJECTID:1,Zoning:"C2",CATEGORY:"Commercial"},
  geometry:{type:"Polygon",coordinates:[[[-118.25,34.04],[-118.24,34.04],
    [-118.24,34.05],[-118.25,34.05],[-118.25,34.04]]]}
}]};
function create(map,region,fetches,statuses) {
  return createZoningOverlay(map,{
    getRegion:()=>region,
    filterFeatures:input=>input,
    onStatus:value=>statuses.push(value)
  });
}
async function settle() {
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
}

test("zoning is opt-in and never downloads by default",async()=>{
  const map=new FakeMap(),requests=[],statuses=[];
  globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>geojson}};
  create(map,[-119,33,-117,35],requests,statuses);
  map.fire("style.load");map.fire("moveend");await settle();
  assert.equal(requests.length,0);
});

test("no requests outside source, region, or below minimum zoom",async()=>{
  const requests=[],statuses=[];
  globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>geojson}};
  const distant=new FakeMap({viewport:[-73.99,40.7,-73.9,40.8]});
  const a=create(distant,[-74.1,40.6,-73.8,40.9],requests,statuses);
  distant.fire("style.load");a.setEnabled(true);await settle();
  assert.equal(requests.length,0);
  const low=new FakeMap({zoom:11});
  const b=create(low,[-119,33,-117,35],requests,statuses);
  low.fire("style.load");b.setEnabled(true);await settle();
  assert.equal(requests.length,0);
});

test("queries only viewport/region/source intersection and displays returned features",async()=>{
  const map=new FakeMap(),requests=[],statuses=[];
  globalThis.fetch=async url=>{requests.push(new URL(url));return {ok:true,json:async()=>geojson}};
  const z=create(map,[-118.255,34.035,-118.235,34.055],requests,statuses);
  map.fire("style.load");z.setEnabled(true);await settle();
  assert.equal(requests.length,1);
  assert.equal(requests[0].hostname,"services5.arcgis.com");
  const b=requests[0].searchParams.get("geometry").split(",").map(Number);
  assert.ok(b[0]>=-118.255 && b[1]>=34.035);
  assert.ok(b[2]<=-118.235 && b[3]<=34.055);
  assert.equal(map.getSource("la-zoning-data").data.features[0].properties.Zoning,"C2");
  assert.ok(statuses.at(-1).includes("1 city polygons"));
  z.setEnabled(false);
  assert.equal(map.getSource("la-zoning-data").data.features.length,0);
});
