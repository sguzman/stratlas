/**
 * Public Los Angeles County Assessor parcel roll values.
 * These are ASSESSED values, not sale prices, market values or appraisals.
 *
 * Provider: https://cache.gis.lacounty.gov/cache/rest/services/
 *           LACounty_Cache/LACounty_Parcel/FeatureServer/0
 * ID lookup is viewport-limited; only missing features are downloaded.
 */
const SERVICE="https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0/query";
const COVERAGE=[-118.95,32.70,-117.64,34.85];
const MIN_ZOOM=16, BATCH_SIZE=35, CONCURRENCY=3;
const SOURCE="assessor-parcels",FILL="assessor-land-fill",LINE="assessor-land-line";
const MAX_FEATURES=12000,MAX_WINDOWS=32;
const EMPTY=()=>({type:"FeatureCollection",features:[]});
const dollars=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
export const ASSESSMENT_BANDS=[
  {label:"Under $50,000",color:"#cee9db",min:0},
  {label:"$50k–$150k",color:"#93d1b8",min:50000},
  {label:"$150k–$300k",color:"#56aca7",min:150000},
  {label:"$300k–$600k",color:"#488db1",min:300000},
  {label:"$600k–$1.2m",color:"#646b9f",min:600000},
  {label:"$1.2m and above",color:"#8b4e91",min:1200000},
  {label:"Unavailable",color:"#a0a9ad",min:null}
];
const colorPaint=["case",
  [">=",["to-number",["get","Roll_LandValue"],-1],0],
  ["step",["to-number",["get","Roll_LandValue"],-1],
    ...ASSESSMENT_BANDS.slice(0,6).flatMap((band,i)=>
      i===0?[band.color]:[band.min,band.color])],
  ASSESSMENT_BANDS[6].color
];
const validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>=0;
function intersection(a,b){
  if(!a||!b)return null;
  const box=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];
  return box[0]<box[2]&&box[1]<box[3]?box:null;
}
function viewport(map){
  const b=map.getBounds();
  return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
}
function snap(box){
  const step=0.002;
  return [Math.floor(box[0]/step)*step,Math.floor(box[1]/step)*step,
    Math.ceil(box[2]/step)*step,Math.ceil(box[3]/step)*step];
}
function idsUrl(box){
  return SERVICE+"?"+new URLSearchParams({
    where:"1=1",geometry:box.map(n=>n.toFixed(6)).join(","),
    geometryType:"esriGeometryEnvelope",inSR:"4326",
    spatialRel:"esriSpatialRelIntersects",returnIdsOnly:"true",f:"json"
  });
}
function featuresUrl(ids){
  return SERVICE+"?"+new URLSearchParams({
    objectIds:ids.join(","),
    outFields:"OBJECTID,AIN,Roll_Year,Roll_LandValue,Roll_ImpValue",
    outSR:"4326",geometryPrecision:"5",returnGeometry:"true",f:"geojson"
  });
}
function validGeometry(f){
  return f?.type==="Feature"&&f.geometry?.type==="Polygon"||
    f?.type==="Feature"&&f.geometry?.type==="MultiPolygon";
}
function buildLegend(container){
  if(!container||container.childElementCount)return;
  const heading=document.createElement("strong");
  heading.textContent="Assessed land value · USD";
  const items=document.createElement("div");items.className="assessor-legend-items";
  for(const band of ASSESSMENT_BANDS){
    const item=document.createElement("div");item.className="assessor-legend-item";
    const swatch=document.createElement("span");
    swatch.className="assessor-legend-swatch";
    swatch.style.backgroundColor=band.color;
    const label=document.createElement("span");label.textContent=band.label;
    item.append(swatch,label);items.append(item);
  }
  const note=document.createElement("p");note.className="meta";
  note.textContent="Tax-roll assessments, NOT market or sale prices. Roll year varies by parcel.";
  container.replaceChildren(heading,items,note);
}
export function createParcelOverlay(map,{getRegion,filterFeatures,onStatus,dataCache,legendContainer}){
  let enabled=false,opacity=0.66,epoch=0,idAbort=null,workAbort=new AbortController();
  let activeKey="",activeIds=null,lookupKey="",lastError="",workCount=0;
  let timer=null,drawTimer=null,lastRender=0;
  const polygons=new Map(),windows=new Map(),queue=[],queued=new Set(),inflight=new Set();
  const status=message=>onStatus(message);
  function source(){return map.getSource(SOURCE)}
  function visible(){
    for(const name of [FILL,LINE])
      if(map.getLayer(name))
        map.setLayoutProperty(name,"visibility",enabled?"visible":"none");
  }
  function ensure(){
    if(source()&&map.getLayer(FILL)&&map.getLayer(LINE))return;
    if(!source())map.addSource(SOURCE,{type:"geojson",data:EMPTY()});
    if(!map.getLayer(FILL))map.addLayer({id:FILL,type:"fill",source:SOURCE,
      paint:{"fill-color":colorPaint,"fill-opacity":opacity}});
    if(!map.getLayer(LINE))map.addLayer({id:LINE,type:"line",source:SOURCE,
      paint:{"line-color":"#27394a","line-width":0.55,"line-opacity":0.63}});
    visible();
  }
  function publish(){
    if(drawTimer!==null){clearTimeout(drawTimer);drawTimer=null}
    if(!source())return;
    const box=intersection(viewport(map),getRegion());
    if(!box){source().setData(EMPTY());return}
    const result=JSON.parse(filterFeatures(JSON.stringify({
      type:"FeatureCollection",features:[...polygons.values()]
    }),...box));
    source().setData(result);
    lastRender=Date.now();
  }
  function redraw(){
    const delay=Math.max(0,140-(Date.now()-lastRender));
    if(delay===0)publish();
    else if(drawTimer===null)drawTimer=setTimeout(publish,delay);
  }
  function report(){
    if(!enabled||!activeIds)return;
    const ready=activeIds.reduce((n,id)=>n+(polygons.has(id)?1:0),0);
    status("Assessor: "+ready+"/"+activeIds.length+" parcels in view · "+
      polygons.size+" retained"+
      (activeIds.length===ready?" · loaded":" · "+(activeIds.length-ready)+" remaining")+
      (lastError?" · failed: "+lastError:""));
  }
  function storeFeatures(features){
    let changed=0;
    for(const feature of features){
      if(!validGeometry(feature))continue;
      const id=feature.properties?.OBJECTID??feature.id;
      if(!validId(id))continue;
      const key=Number(id);
      polygons.delete(key);polygons.set(key,feature);changed++;
      while(polygons.size>MAX_FEATURES)
        polygons.delete(polygons.keys().next().value);
    }
    if(changed)redraw();
  }
  async function request(url,controller,namespace){
    if(dataCache)return dataCache.fetchJson(url,{
      namespace,ttlMs:24*60*60*1000,signal:controller.signal
    });
    const response=await fetch(url,{cache:"default",mode:"cors",signal:controller.signal});
    if(!response.ok)throw Error("Assessor GIS HTTP "+response.status);
    return response.json();
  }
  function pump(){
    if(!enabled)return;
    const current=epoch,controller=workAbort;
    while(workCount<CONCURRENCY&&queue.length){
      const ids=queue.shift();
      for(const id of ids){queued.delete(id);inflight.add(id)}
      workCount++;
      (async()=>{
        try{
          const value=await request(featuresUrl(ids),controller,"lacounty-assessor-roll-parcel-v1");
          if(current!==epoch||controller.signal.aborted)return;
          if(value?.error)throw Error(value.error.message||"Parcel service error");
          if(value?.type!=="FeatureCollection"||!Array.isArray(value.features))
            throw Error("Parcel service returned invalid GeoJSON");
          storeFeatures(value.features);
        }catch(error){
          if(current!==epoch||controller.signal.aborted)return;
          lastError=error.message;
        }finally{
          if(current!==epoch)return;
          for(const id of ids)inflight.delete(id);
          workCount--;pump();report();
        }
      })();
    }
  }
  function prioritize(ids){
    queue.length=0;queued.clear();
    const missing=ids.filter(id=>!polygons.has(id)&&!inflight.has(id));
    for(let i=0;i<missing.length;i+=BATCH_SIZE){
      const group=missing.slice(i,i+BATCH_SIZE);
      queue.push(group);
      for(const id of group)queued.add(id);
    }
    pump();report();
  }
  async function refresh(){
    if(!enabled)return;
    ensure();publish();
    if(map.getZoom()<MIN_ZOOM){
      status("Assessor: "+polygons.size+" retained · zoom to "+MIN_ZOOM+
        "+ for additional parcel assessments.");return;
    }
    const scope=intersection(intersection(viewport(map),getRegion()),COVERAGE);
    if(!scope){
      status("Assessor: "+polygons.size+" retained · outside LA County coverage.");return;
    }
    const box=intersection(intersection(snap(scope),getRegion()),COVERAGE);
    if(!box)return;
    const key=box.map(n=>n.toFixed(6)).join(",");
    if(key===activeKey){
      if(activeIds){
        if(!queue.length&&!workCount&&activeIds.some(id=>!polygons.has(id)))
          prioritize(activeIds);
        else report();
        return;
      }
      if(lookupKey===key)return;
    }
    activeKey=key;activeIds=null;lastError="";
    idAbort?.abort();
    const controller=new AbortController();idAbort=controller;lookupKey=key;
    queue.length=0;queued.clear();
    status("Assessor: identifying parcels in visible area · "+polygons.size+" retained…");
    try{
      let ids=windows.get(key);
      if(!ids){
        const data=await request(idsUrl(box),controller,"lacounty-assessor-roll-ids-v1");
        if(data?.error)throw Error(data.error.message||"Assessor ID lookup error");
        if(!Array.isArray(data?.objectIds))throw Error("Parcel service provided no ID list");
        ids=[...new Set(data.objectIds.map(Number).filter(validId))];
        windows.set(key,ids);
        if(windows.size>MAX_WINDOWS)windows.delete(windows.keys().next().value);
      }
      if(controller.signal.aborted||!enabled||key!==activeKey)return;
      idAbort=null;lookupKey="";activeIds=ids;
      prioritize(ids);
    }catch(error){
      if(controller.signal.aborted||key!==activeKey)return;
      idAbort=null;lookupKey="";
      status("Assessor: "+polygons.size+" retained · ID lookup failed: "+error.message);
    }
  }
  function stop(){
    epoch++;
    idAbort?.abort();idAbort=null;
    workAbort.abort();workAbort=new AbortController();
    queue.length=0;queued.clear();inflight.clear();workCount=0;
    if(timer!==null){clearTimeout(timer);timer=null}
    activeKey="";activeIds=null;lookupKey="";
  }
  function setEnabled(value){
    enabled=Boolean(value);
    if(legendContainer){
      legendContainer.hidden=!enabled;
      if(enabled)buildLegend(legendContainer);
    }
    if(!enabled){stop();visible();status("Assessor hidden · "+polygons.size+" parcels retained.");return}
    ensure();publish();void refresh();
  }
  function setOpacity(value){
    if(!Number.isFinite(value))return;
    opacity=Math.max(0,Math.min(1,value));
    if(map.getLayer(FILL))map.setPaintProperty(FILL,"fill-opacity",opacity);
  }
  map.on("style.load",()=>{
    ensure();publish();if(enabled)void refresh();
  });
  map.on("moveend",()=>{
    if(!enabled)return;
    if(timer!==null)clearTimeout(timer);
    timer=setTimeout(()=>{timer=null;void refresh()},170);
  });
  map.on("click",event=>{
    if(!enabled||!map.getLayer(FILL))return;
    const hit=map.queryRenderedFeatures(event.point,{layers:[FILL]})[0];
    if(!hit)return;
    const p=hit.properties||{};
    const root=document.createElement("div");
    const heading=document.createElement("strong");
    heading.textContent="Parcel "+String(p.AIN??p.OBJECTID??"");
    root.append(heading);
    for(const [label,value] of [
      ["Roll year",p.Roll_Year||"Unavailable"],
      ["Assessed land",Number.isFinite(Number(p.Roll_LandValue))&&p.Roll_LandValue!==null?
        dollars.format(Number(p.Roll_LandValue)):"Unavailable"],
      ["Assessed improvements",Number.isFinite(Number(p.Roll_ImpValue))&&p.Roll_ImpValue!==null?
        dollars.format(Number(p.Roll_ImpValue)):"Unavailable"]
    ]){
      const line=document.createElement("div");
      line.textContent=label+": "+value;root.append(line);
    }
    const note=document.createElement("small");
    note.textContent="Tax assessments are not recent sale or market values.";
    root.append(note);
    new window.maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(root).addTo(map);
  });
  return {setEnabled,setOpacity,
    onRegionChange:()=>{stop();publish();if(enabled)void refresh()},
    clearMemory:()=>{windows.clear();activeKey="";activeIds=null}};
}
