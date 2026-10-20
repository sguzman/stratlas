import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

// Import an ESM browser module without requiring Node/npm project scaffolding.
const file=new URL("../web/zoning.js",import.meta.url);
const code=readFileSync(file,"utf8");
const {createZoningOverlay,ZONING_CATEGORIES}=await import("data:text/javascript,"+encodeURIComponent(code));

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
  setLayoutProperty(id,name,value){const layer=this.layers.get(id);layer.layout={...(layer.layout||{}),[name]:value}}
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
  assert.match(statuses.at(-1),/1 retained polygons/);
  z.setEnabled(false);
  assert.equal(map.getSource("la-zoning-data").data.features.length,1,
    "Disabling must preserve the already loaded polygons");
  z.setEnabled(true);await settle();
  assert.equal(requests.length,1,"Re-enabling the same view must not refetch");
});

test("early style.load registers zoning source before basemap tiles finish",async()=>{
  let requests=0;globalThis.fetch=async()=>{requests++;return {ok:true,json:async()=>geojson}};
  const map=new FakeMap({zoom:11});map.isStyleLoaded=()=>false;
  const layer=create(map,[-119,33,-117,35],[],[]);
  map.fire("style.load");layer.setEnabled(true);await settle();
  assert.ok(map.getSource("la-zoning-data"));
  assert.ok(map.getLayer("la-zoning-fill"));
  assert.equal(requests,0);
});

test("zooming out preserves previously loaded zoning and makes no new API calls",async()=>{
  const map=new FakeMap(),requests=[],statuses=[];
  globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>geojson}};
  const overlay=create(map,[-119,33,-117,35],requests,statuses);
  map.fire("style.load");overlay.setEnabled(true);await settle();
  const count=requests.length;
  map.zoom=8;map.fire("moveend");await settle();
  assert.equal(requests.length,count);
  assert.equal(map.getSource("la-zoning-data").data.features.length,1);
  assert.match(statuses.at(-1),/retained polygons/);
});
test("dense zoning requests subdivide geographic bounds and retain deduplicated features",async()=>{
  const map=new FakeMap(),urls=[],statuses=[];
  globalThis.fetch=async url=>{
    urls.push(new URL(url));
    const bbox=new URL(url).searchParams.get("geometry").split(",").map(Number);
    const wide=(bbox[2]-bbox[0])>0.015;
    if(wide){
      // A capped/overfull page of a dense initial study bbox.
      const offset=Number(new URL(url).searchParams.get("resultOffset"));
      return {ok:true,json:async()=>({type:"FeatureCollection",features:
        Array.from({length:500},(_,i)=>({type:"Feature",properties:{OBJECTID:offset+i},
          geometry:geojson.features[0].geometry}))})};
    }
    return {ok:true,json:async()=>geojson};
  };
  const overlay=create(map,[-119,33,-117,35],urls,statuses);
  map.fire("style.load");overlay.setEnabled(true);await settle();
  // Caller is never permitted to fetch geography outside the viewport.
  assert.ok(urls.length>4);
  for(const u of urls){
    const [w,s,e,n]=u.searchParams.get("geometry").split(",").map(Number);
    assert.ok(w>=-118.26-.01 && e<=-118.24+.01);
    assert.ok(s>=34.03-.01 && n<=34.06+.01);
  }
  assert.ok(map.getSource("la-zoning-data").data.features.length>0);
});

test("zoning legend exactly matches rendered category palette and toggles with visibility",()=>{
  const element=tag=>({
    tag,children:[],style:{},hidden:false,textContent:"",
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=items},
    get childElementCount(){return this.children.length}
  });
  const previous=globalThis.document;globalThis.document={createElement:element};
  try{
    const container=element("div"),map=new FakeMap({zoom:11}),statuses=[];
    container.hidden=true;
    const control=createZoningOverlay(map,{
      getRegion:()=>[-119,33,-117,35],
      filterFeatures:input=>input,
      onStatus:x=>statuses.push(x),legendContainer:container
    });
    assert.equal(container.hidden,true);
    control.setEnabled(true);
    assert.equal(container.hidden,false);
    const labels=container.children[1].children;
    assert.equal(labels.length,ZONING_CATEGORIES.length);
    for(let i=0;i<labels.length;i++){
      assert.equal(labels[i].children[0].style.backgroundColor,ZONING_CATEGORIES[i][1]);
      assert.equal(labels[i].children[1].textContent,ZONING_CATEGORIES[i][0]);
    }
    control.setEnabled(false);
    assert.equal(container.hidden,true);
    control.setEnabled(true);
    assert.equal(container.hidden,false);
    assert.equal(container.children[1].children.length,labels.length);
  }finally{globalThis.document=previous}
});
test("zoning loads beyond 24 requests and toggling partial coverage does not refetch",async()=>{
  const map=new FakeMap({viewport:[-118.28,34.01,-118.22,34.07]});
  const urls=[],statuses=[],focus=[-118.25231,34.0421];
  globalThis.fetch=async url=>{
    const u=new URL(url),[w,s,e,n]=u.searchParams.get("geometry").split(",").map(Number);
    urls.push(u);
    const capped=w<focus[0]&&focus[0]<e&&s<focus[1]&&focus[1]<n;
    if(capped){
      const offset=Number(u.searchParams.get("resultOffset"));
      return {ok:true,json:async()=>({type:"FeatureCollection",features:
        Array.from({length:500},(_,i)=>({type:"Feature",
          properties:{OBJECTID:offset+i,Zoning:"C2",CATEGORY:"Commercial"},
          geometry:geojson.features[0].geometry}))})};
    }
    return {ok:true,json:async()=>geojson};
  };
  const control=create(map,[-119,33,-117,35],urls,statuses);
  control.setEnabled(true);
  for(let i=0;i<100;i++){
    await settle();
    if(statuses.at(-1)?.includes("provider requests"))break;
  }
  const count=urls.length;
  assert.ok(count>24,"No arbitrary 24-request cap for zoning");
  assert.ok(map.getSource("la-zoning-data").data.features.length>0);
  control.setEnabled(false);control.setEnabled(true);await settle();
  assert.equal(urls.length,count,"Previously loaded partial window is reused");
});
