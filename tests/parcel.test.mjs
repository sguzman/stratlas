import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../web/parcel.js",import.meta.url),"utf8");
const {createParcelOverlay,ASSESSMENT_BANDS}=await import(
  "data:text/javascript,"+encodeURIComponent(source));
const polygon=id=>({
  type:"Feature",properties:{
    OBJECTID:id,AIN:String(id).padStart(10,"0"),
    Roll_Year:"2025",Roll_LandValue:id*1000,Roll_ImpValue:200000
  },
  geometry:{type:"Polygon",coordinates:[[[-118.281,34.035],[-118.279,34.035],
    [-118.279,34.037],[-118.281,34.037],[-118.281,34.035]]]}
});
const collection=ids=>({type:"FeatureCollection",features:ids.map(polygon)});
const response=value=>({ok:true,json:async()=>value});
class FakeMap {
  constructor({zoom=16,box=[-118.283,34.034,-118.276,34.040]}={}){
    this.zoom=zoom;this.box=box;this.events=new Map();
    this.sources=new Map();this.layers=new Map();this.paint=new Map();
  }
  getZoom(){return this.zoom}
  getBounds(){
    const [w,s,e,n]=this.box;
    return {getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n};
  }
  getSource(id){return this.sources.get(id)}
  getLayer(id){return this.layers.get(id)}
  addSource(id,opt){this.sources.set(id,{...opt,setData(v){this.data=v},data:opt.data})}
  addLayer(v){this.layers.set(v.id,v)}
  setLayoutProperty(id,key,value){this.layers.get(id).layout={...(this.layers.get(id).layout||{}),[key]:value}}
  setPaintProperty(id,key,value){this.paint.set(id+":"+key,value)}
  on(key,fn){this.events.set(key,fn)}
  fire(key){this.events.get(key)?.({})}
  queryRenderedFeatures(){return []}
}
const opts=(map,status=[],extra={})=>createParcelOverlay(map,{
  getRegion:()=>[-118.95,32.70,-117.64,34.85],
  filterFeatures:s=>s,onStatus:x=>status.push(x),...extra
});
async function settle(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))}
async function drawn(){await settle();await new Promise(r=>setTimeout(r,155));await settle()}
function mock(ids,urls){
  globalThis.fetch=async url=>{
    const u=new URL(url);urls.push(u);
    if(u.searchParams.get("returnIdsOnly")==="true")return response({objectIds:ids});
    return response(collection(u.searchParams.get("objectIds").split(",").map(Number)));
  };
}
test("parcel layer starts disabled and does not issue background requests",async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error("Unexpected request")};
  const map=new FakeMap(),p=opts(map);
  map.fire("style.load");map.fire("moveend");
  await drawn();assert.equal(calls,0);
  p.setOpacity(0.9);assert.equal(calls,0);
});
test("zoom and study region stop new queries, retaining visited data",async()=>{
  let count=0;globalThis.fetch=async()=>{count++;throw Error("Unexpected")};
  const low=new FakeMap({zoom:15});
  opts(low).setEnabled(true);
  const outside=new FakeMap({box:[-73.9,40.7,-73.85,40.78]});
  opts(outside).setEnabled(true);
  await drawn();assert.equal(count,0);
});
test("ID discovery is viewport scoped and features are fetched only in small batches",async()=>{
  const map=new FakeMap(),urls=[],status=[];
  mock(Array.from({length:74},(_,i)=>i+1),urls);
  const p=opts(map,status);
  p.setEnabled(true);await drawn();
  assert.equal(urls.filter(u=>u.searchParams.get("returnIdsOnly")==="true").length,1);
  const geometries=urls.filter(u=>u.searchParams.has("objectIds"));
  assert.deepEqual(geometries.map(u=>u.searchParams.get("objectIds").split(",").length),[35,35,4]);
  for(const u of geometries){
    assert.equal(u.searchParams.get("f"),"geojson");
    assert.equal(u.searchParams.get("outFields"),
      "OBJECTID,AIN,Roll_Year,Roll_LandValue,Roll_ImpValue");
    assert.doesNotMatch(u.href,/Owner|MailAddress|OwnerName/);
  }
  const idsQuery=urls[0];
  assert.equal(idsQuery.searchParams.get("geometryType"),"esriGeometryEnvelope");
  const [w,s,e,n]=idsQuery.searchParams.get("geometry").split(",").map(Number);
  assert.ok(w>=-118.29&&e<=-118.27&&s>=34.03&&n<=34.05);
  assert.equal(map.getSource("assessor-parcels").data.features.length,74);
  assert.match(status.at(-1),/74\/74 parcels in view/);
  const before=urls.length;
  p.setEnabled(false);
  p.setEnabled(true);
  await drawn();
  assert.equal(urls.length,before,"Re-enabling a visited area must not refetch");
  map.zoom=13;map.fire("moveend");await drawn();
  assert.equal(map.getSource("assessor-parcels").data.features.length,74);
});
test("a completed parcel chunk appears while a second chunk is still in flight",async()=>{
  const map=new FakeMap();
  let complete;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.searchParams.has("returnIdsOnly"))
      return response({objectIds:Array.from({length:45},(_,i)=>i+1)});
    const ids=u.searchParams.get("objectIds").split(",").map(Number);
    if(ids[0]===36)
      return new Promise(resolve=>complete=()=>resolve(response(collection(ids))));
    return response(collection(ids));
  };
  opts(map).setEnabled(true);
  await drawn();
  assert.equal(typeof complete,"function");
  assert.equal(map.getSource("assessor-parcels").data.features.length,35);
  complete();await drawn();
  assert.equal(map.getSource("assessor-parcels").data.features.length,45);
});
test("opacity never changes geographic requests, and missing values have their own color",async()=>{
  const map=new FakeMap(),urls=[];
  mock([1],urls);
  const overlay=opts(map);overlay.setEnabled(true);await drawn();
  const total=urls.length;
  overlay.setOpacity(0.25);
  assert.equal(map.paint.get("assessor-land-fill:fill-opacity"),0.25);
  overlay.setOpacity(0);
  assert.equal(map.paint.get("assessor-land-fill:fill-opacity"),0);
  assert.equal(urls.length,total);
  assert.equal(ASSESSMENT_BANDS.length,7);
  assert.equal(ASSESSMENT_BANDS.at(-1).label,"Unavailable");
  assert.match(JSON.stringify(map.getLayer("assessor-land-fill").paint["fill-color"]),/Roll_LandValue/);
});
test("failed geometry chunks do not erase already fetched parcels and can retry",async()=>{
  const map=new FakeMap(),status=[];let fail=true;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.searchParams.has("returnIdsOnly"))return response({objectIds:[1,2,3]});
    if(fail)throw Error("Provider unavailable");
    return response(collection([1,2,3]));
  };
  const p=opts(map,status);p.setEnabled(true);await drawn();
  assert.match(status.at(-1),/failed/);
  fail=false;p.setEnabled(false);p.setEnabled(true);await drawn();
  assert.equal(map.getSource("assessor-parcels").data.features.length,3);
});
test("legend identifies assessed values and not sale or market prices",()=>{
  const prev=globalThis.document;
  const el=tag=>({tag,children:[],textContent:"",style:{},hidden:false,
    append(...v){this.children.push(...v)},
    replaceChildren(...v){this.children=v},
    get childElementCount(){return this.children.length}
  });
  globalThis.document={createElement:el};
  try{
    const map=new FakeMap({zoom:9}),container=el("div");
    const p=opts(map,[],{legendContainer:container});
    p.setEnabled(true);
    assert.equal(container.hidden,false);
    assert.equal(container.children[1].children.length,7);
    assert.match(container.children[2].textContent,/NOT market or sale prices/);
    p.setEnabled(false);assert.equal(container.hidden,true);
  }finally{globalThis.document=prev}
});

test("panning while old parcel requests are pending prioritizes the second area",async()=>{
  const map=new FakeMap(),statuses=[],urls=[];
  const pendingOld=[];
  let requestedNew=0;
  globalThis.fetch=async url=>{
    const u=new URL(url);urls.push(u);
    if(u.searchParams.get("returnIdsOnly")==="true"){
      const west=Number(u.searchParams.get("geometry").split(",")[0]);
      return response({objectIds:west<-118.29
        ? Array.from({length:20},(_,i)=>501+i)
        : Array.from({length:105},(_,i)=>1+i)});
    }
    const ids=u.searchParams.get("objectIds").split(",").map(Number);
    if(ids[0]<500)
      return new Promise(resolve=>pendingOld.push(()=>resolve(response(collection(ids)))));
    requestedNew++;
    return response(collection(ids));
  };
  const p=opts(map,statuses);
  p.setEnabled(true);await settle();
  assert.equal(pendingOld.length,3,"first area has three in-flight batches");
  map.box=[-118.311,34.034,-118.304,34.040];
  map.fire("moveend");
  await new Promise(r=>setTimeout(r,190));await settle();
  assert.equal(urls.filter(u=>u.searchParams.get("returnIdsOnly")==="true").length,2,
    "moving the camera must request second-area IDs without waiting for the first area");
  assert.equal(requestedNew,0,"three-way concurrency is respected");
  pendingOld.shift()();await drawn();
  assert.equal(requestedNew,1,"new-area features start when a worker becomes available");
  assert.ok(map.getSource("assessor-parcels").data.features.some(f=>
    f.properties.OBJECTID>=501),"second area's geometry becomes visible");
  for(const finish of pendingOld.splice(0))finish();
  await drawn();
  const before=urls.length;
  p.setEnabled(false);p.setEnabled(true);await drawn();
  assert.equal(urls.length,before,"returning to the second area reuses known parcel geometry");
});
