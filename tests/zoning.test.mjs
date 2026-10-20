import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../web/zoning.js",import.meta.url),"utf8");
const {createZoningOverlay,ZONING_CATEGORIES}=await import(
  "data:text/javascript,"+encodeURIComponent(src));
const polygon=id=>({type:"Feature",
  properties:{OBJECTID:id,Zoning:"C2",CATEGORY:id%2?"Commercial":"Residential"},
  geometry:{type:"Polygon",coordinates:[[[-118.26,34.03],[-118.24,34.03],
    [-118.24,34.05],[-118.26,34.05],[-118.26,34.03]]]}
});
function response(obj){return {ok:true,json:async()=>obj}}
const features=ids=>({type:"FeatureCollection",features:ids.map(polygon)});
class FakeMap{
  constructor({zoom=14,viewport=[-118.28,34.02,-118.21,34.08]}={}){
    this.zoom=zoom;this.viewport=viewport;this.sources=new Map();
    this.layers=new Map();this.events=new Map();this.paint=new Map();
    this.filters=new Map();
  }
  on(name,callback){this.events.set(name,callback)}
  fire(name){this.events.get(name)?.({})}
  getZoom(){return this.zoom}
  getBounds(){const [w,s,e,n]=this.viewport;return {
    getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n};}
  getSource(id){return this.sources.get(id)}
  getLayer(id){return this.layers.get(id)}
  addSource(id,opts){this.sources.set(id,{...opts,data:opts.data,setData(v){this.data=v}})}
  addLayer(layer){this.layers.set(layer.id,layer)}
  setPaintProperty(id,name,val){this.paint.set(id+":"+name,val)}
  setFilter(id,value){this.filters.set(id,value)}
  setLayoutProperty(id,name,value){
    const layer=this.layers.get(id);layer.layout={...(layer.layout||{}),[name]:value};
  }
  queryRenderedFeatures(){return []}
}
function make(map,statuses=[],options={}){
  return createZoningOverlay(map,{
    getRegion:()=>[-119,33,-117,35],filterFeatures:value=>value,
    onStatus:x=>statuses.push(x),...options
  });
}
async function settle(){for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve))}
async function painted(){await settle();await new Promise(r=>setTimeout(r,155));await settle()}
function mockApi(ids=[1,2],capture=[]){
  globalThis.fetch=async url=>{
    const u=new URL(url);capture.push(u);
    if(u.searchParams.get("returnIdsOnly")==="true")
      return response({objectIdFieldName:"OBJECTID",objectIds:ids});
    const requested=u.searchParams.get("objectIds").split(",").map(Number);
    return response(features(requested));
  };
}
test("zoning makes no requests until explicitly enabled",async()=>{
  let count=0;globalThis.fetch=async()=>{count++;throw Error("Unexpected")};
  const map=new FakeMap();make(map);
  map.fire("style.load");map.fire("moveend");await settle();
  assert.equal(count,0);
});
test("out of region or below detailed zoom makes no GIS requests",async()=>{
  let count=0;globalThis.fetch=async()=>{count++};
  const outside=new FakeMap({viewport:[-74,40,-73.9,40.1]});
  const a=make(outside);a.setEnabled(true);
  const low=new FakeMap({zoom:9});const b=make(low);b.setEnabled(true);
  await settle();
  assert.equal(count,0);
});
test("viewport-bounded ID query then 40-ID geometry chunks, no recursive subdivision",async()=>{
  const calls=[],map=new FakeMap(),statuses=[];
  mockApi(Array.from({length:93},(_,i)=>i+1),calls);
  const z=make(map,statuses);
  z.setEnabled(true);await painted();
  const ids=calls.filter(x=>x.searchParams.get("returnIdsOnly")==="true");
  const shapes=calls.filter(x=>x.searchParams.has("objectIds"));
  assert.equal(ids.length,1);
  assert.equal(shapes.length,3);
  assert.deepEqual(shapes.map(x=>x.searchParams.get("objectIds").split(",").length),[40,40,13]);
  assert.equal(ids[0].searchParams.get("geometryType"),"esriGeometryEnvelope");
  const [w,s,e,n]=ids[0].searchParams.get("geometry").split(",").map(Number);
  assert.ok(w>=-118.29&&s>=34.01&&e<=-118.20&&n<=34.09);
  assert.equal(map.getSource("la-zoning-data").data.features.length,93);
  assert.ok(statuses.at(-1).includes("93/93 polygons in current view"));
  const count=calls.length;
  z.setEnabled(false);z.setEnabled(true);await settle();
  assert.equal(calls.length,count,"Toggle reuses in-memory polygons and ID index");
  map.zoom=9;map.fire("moveend");await new Promise(r=>setTimeout(r,180));
  assert.equal(map.getSource("la-zoning-data").data.features.length,93);
});
test("completed geometry batches render progressively without waiting for others",async()=>{
  const map=new FakeMap(),statuses=[];
  let resolveSecond;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.searchParams.get("returnIdsOnly")==="true")
      return response({objectIds:Array.from({length:60},(_,i)=>i+1)});
    const ids=u.searchParams.get("objectIds").split(",").map(Number);
    if(ids[0]===41)
      return new Promise(resolve=>{resolveSecond=()=>resolve(response(features(ids)))});
    return response(features(ids));
  };
  const z=make(map,statuses);
  z.setEnabled(true);await painted();
  assert.equal(typeof resolveSecond,"function");
  assert.equal(map.getSource("la-zoning-data").data.features.length,40,
    "First batch must be visible while another batch is pending");
  assert.match(statuses.at(-1),/40\/60 polygons in current view/);
  resolveSecond();await painted();
  assert.equal(map.getSource("la-zoning-data").data.features.length,60);
});
test("a failed batch preserves earlier polygons and can retry missing IDs later",async()=>{
  const map=new FakeMap(),statuses=[];let fail=true,count=0;
  globalThis.fetch=async url=>{
    const u=new URL(url);count++;
    if(u.searchParams.has("returnIdsOnly"))return response({objectIds:[1,2,3]});
    if(fail)throw Error("Transient service interruption");
    return response(features([1,2,3]));
  };
  const z=make(map,statuses);
  z.setEnabled(true);await settle();
  assert.match(statuses.at(-1),/unavailable|failed/);
  fail=false;z.setEnabled(false);z.setEnabled(true);await painted();
  assert.equal(map.getSource("la-zoning-data").data.features.length,3);
  assert.ok(count>=3);
});
test("opacity updates map fill without querying or deleting any polygons",async()=>{
  const map=new FakeMap(),requests=[];mockApi([1,2],requests);
  const z=make(map);
  z.setEnabled(true);await painted();
  const before=requests.length;
  z.setOpacity(0.75);
  assert.equal(map.paint.get("la-zoning-fill:fill-opacity"),0.75);
  z.setOpacity(0);
  assert.equal(map.paint.get("la-zoning-fill:fill-opacity"),0);
  assert.equal(map.getSource("la-zoning-data").data.features.length,2);
  assert.equal(requests.length,before);
});
test("legend category hover highlights matching map polygons; focus works too",()=>{
  const saved=globalThis.document;
  const element=tag=>({
    tag,children:[],handlers:new Map(),attributes:{},style:{},hidden:false,
    textContent:"",tabIndex:undefined,
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=items},
    setAttribute(name,value){this.attributes[name]=value},
    addEventListener(name,fn){this.handlers.set(name,fn)},
    get childElementCount(){return this.children.length}
  });
  globalThis.document={createElement:element};
  try{
    const map=new FakeMap({zoom:9}),container=element("div");
    const z=make(map,[],{legendContainer:container});
    z.setEnabled(true);
    assert.equal(container.hidden,false);
    const entries=container.children[1].children;
    assert.equal(entries.length,ZONING_CATEGORIES.length);
    const chosen=entries[1];assert.equal(chosen.children[1].textContent,"Commercial");
    chosen.handlers.get("mouseenter")();
    assert.deepEqual(map.filters.get("la-zoning-highlight"),["==",["get","CATEGORY"],"Commercial"]);
    assert.equal(map.paint.get("la-zoning-fill:fill-opacity"),0.42,
      "Hover must not repaint the entire fill layer");
    chosen.handlers.get("mouseleave")();
    assert.equal(map.paint.get("la-zoning-fill:fill-opacity"),0.42);
    chosen.handlers.get("focus")();
    assert.deepEqual(map.filters.get("la-zoning-highlight"),["==",["get","CATEGORY"],"Commercial"]);
    chosen.handlers.get("blur")();
    z.setEnabled(false);assert.equal(container.hidden,true);
  }finally{globalThis.document=saved}
});

test("panning while initial polygon downloads are pending starts new-area IDs and prioritizes new-area geometry",async()=>{
  const map=new FakeMap({viewport:[-118.28,34.02,-118.21,34.08]}),calls=[],statuses=[];
  let oldResolvers=[],newCalls=0;
  globalThis.fetch=async url=>{
    const u=new URL(url);calls.push(u);
    if(u.searchParams.get("returnIdsOnly")==="true"){
      const west=Number(u.searchParams.get("geometry").split(",")[0]);
      return response({objectIds:west<-118.4
        ? Array.from({length:40},(_,i)=>200+i)
        : Array.from({length:120},(_,i)=>1+i)});
    }
    const ids=u.searchParams.get("objectIds").split(",").map(Number);
    if(ids[0]<200)
      return new Promise(resolve=>oldResolvers.push(()=>resolve(response(features(ids)))));
    newCalls++;
    return response(features(ids));
  };
  const zoning=make(map,statuses);
  zoning.setEnabled(true);await settle();
  assert.equal(oldResolvers.length,3,"old view has three outstanding requests");
  map.viewport=[-118.49,34.02,-118.42,34.08];map.fire("moveend");
  await new Promise(r=>setTimeout(r,180));await settle();
  assert.equal(calls.filter(u=>u.searchParams.get("returnIdsOnly")==="true").length,2,
    "Panning must query IDs for the new geographic area while old downloads run");
  assert.equal(newCalls,0,"global three-request concurrency is respected");
  oldResolvers.shift()();await painted();
  assert.equal(newCalls,1,"new-area geometry runs as soon as one request slot frees");
  assert.ok(map.getSource("la-zoning-data").data.features.some(f=>f.properties.OBJECTID>=200),
    "New area is rendered without waiting for the first area to finish");
  const others=oldResolvers.splice(0);
  for(const complete of others)complete();
  await painted();
  assert.ok(statuses.some(x=>x.includes("in current view")));
  assert.equal(calls.filter(u=>u.searchParams.get("returnIdsOnly")==="true").length,2);
});
test("a failed ID lookup can retry in the same viewport",async()=>{
  const map=new FakeMap(),statuses=[];
  let idQueries=0;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.searchParams.has("returnIdsOnly")){
      idQueries++;
      if(idQueries===1)throw Error("temporary ID failure");
      return response({objectIds:[7]});
    }
    return response(features([7]));
  };
  const z=make(map,statuses);z.setEnabled(true);await settle();
  assert.match(statuses.at(-1),/ID lookup failed/);
  map.fire("moveend");await new Promise(r=>setTimeout(r,170));await painted();
  assert.equal(idQueries,2);
  assert.equal(map.getSource("la-zoning-data").data.features.length,1);
});
test("legend pointer transitions are coalesced; only highlight changes, not base fill",()=>{
  const savedDocument=globalThis.document;
  const savedRaf=globalThis.requestAnimationFrame;
  const frames=[];
  const element=tag=>({
    tag,children:[],handlers:new Map(),attributes:{},style:{},hidden:false,
    textContent:"",tabIndex:undefined,
    append(...children){this.children.push(...children)},
    replaceChildren(...children){this.children=children},
    setAttribute(key,value){this.attributes[key]=value},
    addEventListener(event,handler){this.handlers.set(event,handler)},
    get childElementCount(){return this.children.length}
  });
  globalThis.document={createElement:element};
  globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length};
  try{
    const map=new FakeMap({zoom:9}),legend=element("div");
    let fillPaintCalls=0,highlightChanges=0;
    const oldPaint=map.setPaintProperty.bind(map);
    const oldFilter=map.setFilter.bind(map);
    map.setPaintProperty=(layer,name,value)=>{
      if(layer==="la-zoning-fill"&&name==="fill-opacity")fillPaintCalls++;
      oldPaint(layer,name,value);
    };
    map.setFilter=(layer,value)=>{
      if(layer==="la-zoning-highlight")highlightChanges++;
      oldFilter(layer,value);
    };
    const z=make(map,[],{legendContainer:legend});z.setEnabled(true);
    const initialPaint=fillPaintCalls;
    const initialFilter=highlightChanges;
    const entries=legend.children[1].children;
    entries[0].handlers.get("mouseenter")();
    entries[0].handlers.get("mouseleave")();
    entries[1].handlers.get("mouseenter")();
    assert.equal(highlightChanges,initialFilter,"No highlight repaint before animation frame");
    assert.equal(frames.length,1,"Many pointer changes schedule one paint");
    frames.shift()();
    assert.equal(highlightChanges,initialFilter+1,"One final highlight filter");
    assert.deepEqual(map.filters.get("la-zoning-highlight"),
      ["==",["get","CATEGORY"],"Commercial"]);
    assert.equal(fillPaintCalls,initialPaint,"Hover leaves base fill opacity untouched");
    entries[1].handlers.get("mouseleave")();
    frames.shift()();
    assert.equal(map.paint.get("la-zoning-fill:fill-opacity"),0.42);
    assert.equal(fillPaintCalls,initialPaint);
    z.setEnabled(false);
  }finally{
    globalThis.document=savedDocument;
    if(savedRaf===undefined)delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame=savedRaf;
  }
});
