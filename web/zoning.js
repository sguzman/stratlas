// Los Angeles Department of City Planning: publicly advertised ArcGIS FeatureServer.
// Bounding-box reads only: no citywide data download, no background prefetch.
const SERVICE="https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query";
const COVERAGE=[-118.67,33.70,-118.15,34.34]; // coarse city bbox, not jurisdiction
const PAGE_SIZE=500, MAX_PAGES=4, MIN_ZOOM=13;
const SOURCE="la-zoning-data", FILL="la-zoning-fill", LINE="la-zoning-line";
const empty=()=>({type:"FeatureCollection",features:[]});
// One canonical palette powers both MapLibre and the visible zoning legend.
export const ZONING_CATEGORIES=Object.freeze([
  ["Agricultural","#8bcf8a"],["Commercial","#ed777e"],
  ["Commercial-Mixed","#ca689a"],["Manufacturing","#82c5d8"],
  ["Multiple Family Residential","#f9c14c"],["Single Family Residential","#eddf9e"],
  ["Residential","#f3b943"],["Residential-Mixed","#ad8544"],
  ["Open Space","#80c67d"],["Public Facilities","#87b5c1"],
  ["Public","#6bb0c5"],["Industrial","#668ca6"],
  ["Industrial-Mixed","#996ab0"],["Hybrid Industrial","#9071b4"],
  ["Parking","#bcc3cb"],["Freeway","#9ea9b0"],
  ["Other / unclassified","#9da8ae"]
]);
const matchColor=["match",["get","CATEGORY"],
  ...ZONING_CATEGORIES.slice(0,-1).flatMap(([name,color])=>[name,color]),
  ZONING_CATEGORIES.at(-1)[1]
];
function renderLegend(container,enabled){
  if(!container)return;
  container.hidden=!enabled;
  if(!enabled)return;
  if(container.childElementCount)return; // Build once; the palette does not vary with viewport.
  const heading=document.createElement("div");
  heading.className="zoning-legend-heading";
  heading.textContent="Zoning categories";
  const items=document.createElement("div");
  items.className="zoning-legend-items";
  for(const [name,color] of ZONING_CATEGORIES){
    const item=document.createElement("div");
    item.className="zoning-legend-item";
    const swatch=document.createElement("span");
    swatch.className="zoning-legend-swatch";
    swatch.style.backgroundColor=color;
    const text=document.createElement("span");
    text.textContent=name;
    item.append(swatch,text);
    items.append(item);
  }
  const note=document.createElement("p");
  note.className="meta";
  note.textContent="Source: LA City Planning · categories shown at 42% opacity on the map.";
  container.replaceChildren(heading,items,note);
}

function intersection(a,b) {
  const x=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];
  return x[0]<x[2] && x[1]<x[3] ? x : null;
}
function windowBounds(map) {
  const b=map.getBounds();
  return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
}
function canonicalBounds(b) {
  // Snap outer edges to grid so nearby pans reuse identical HTTP URLs.
  const step=0.01;
  return [Math.floor(b[0]/step)*step,Math.floor(b[1]/step)*step,
    Math.ceil(b[2]/step)*step,Math.ceil(b[3]/step)*step];
}
function queryUrl(b,offset) {
  const p=new URLSearchParams({
    where:"1=1",geometry:b.map(v=>v.toFixed(5)).join(","),
    geometryType:"esriGeometryEnvelope",inSR:"4326",outSR:"4326",
    spatialRel:"esriSpatialRelIntersects",outFields:"OBJECTID,Zoning,CATEGORY",
    returnGeometry:"true",resultRecordCount:String(PAGE_SIZE),
    resultOffset:String(offset),orderByFields:"OBJECTID ASC",
    f:"geojson"
  });
  return SERVICE+"?"+p.toString();
}

/**
 * Lightweight browser/MapLibre adapter. Rust owns the post-download geographic
 * feature filter. Selection and map navigation can cancel obsolete requests.
 *
 * All requests are viewport intersected with selected rectangle and source
 * coverage. HTTP cache uses default browser semantics and provider headers.
 */
export function createZoningOverlay(map,{getRegion,filterFeatures,onStatus,dataCache,legendContainer}) {
  let active=false, version=0, abort=null, pending="", currentKey="";
  const windows=new Map();
  const retained=new Map();
  const MAX_RETAINED=12000;
  let displayed=empty();

  function tell(message){onStatus(message)}
  function cancel(){
    version++;
    abort?.abort();
    abort=null;
    pending="";
  }
  function publish(){
    const combined={type:"FeatureCollection",features:[...retained.values()]};
    // Retain all visited source records in memory but render only records
    // intersecting the currently selected study rectangle.
    displayed=JSON.parse(filterFeatures(JSON.stringify(combined),...getRegion()));
    map.getSource(SOURCE)?.setData(displayed);
  }
  function merge(features){
    for(const f of features){
      const id=f.properties?.OBJECTID ?? f.id;
      if(id===undefined||id===null)continue;
      const key=String(id);
      retained.delete(key);
      retained.set(key,f);
      while(retained.size>MAX_RETAINED)retained.delete(retained.keys().next().value);
    }
    publish();
  }
  function putCache(key,features,partial=false){
    windows.delete(key);
    windows.set(key,{features,partial});
    if(windows.size>24)windows.delete(windows.keys().next().value);
  }
  function visible(value){
    for(const layer of [FILL,LINE]){
      if(map.getLayer(layer))map.setLayoutProperty?.(layer,"visibility",value?"visible":"none");
    }
  }
  function ensureLayer(){
    if(!map.getSource(SOURCE))map.addSource(SOURCE,{type:"geojson",data:displayed});
    if(!map.getLayer(FILL))map.addLayer({id:FILL,type:"fill",source:SOURCE,
      paint:{"fill-color":matchColor,"fill-opacity":0.42}});
    if(!map.getLayer(LINE))map.addLayer({id:LINE,type:"line",source:SOURCE,
      paint:{"line-color":"#233645","line-opacity":0.52,"line-width":0.55}});
    visible(active);
  }
  async function queryBox(box,controller,progress,depth=0){
    const key=box.map(x=>x.toFixed(5)).join(",");
    if(windows.has(key))return {...windows.get(key),cached:true};
    const rows=[], seen=new Set();
    let capped=false;
    for(let page=0;page<MAX_PAGES;page++){
      progress.calls++;
      const url=queryUrl(box,page*PAGE_SIZE);
      const data=dataCache
        ? await dataCache.fetchJson(url,{
            namespace:"la-city-zoning-v1",ttlMs:6*60*60*1000,
            signal:controller.signal
          })
        : await (async()=>{
            const response=await fetch(url,{cache:"default",signal:controller.signal,mode:"cors"});
            if(!response.ok)throw Error("GIS HTTP "+response.status);
            return response.json();
          })();
      if(data.error)throw Error(data.error.message||"ArcGIS query error");
      if(data.type!=="FeatureCollection"||!Array.isArray(data.features))
        throw Error("GIS response was not GeoJSON");
      for(const f of data.features){
        const id=f.properties?.OBJECTID??f.id;
        const k=id===undefined?JSON.stringify(f.geometry):String(id);
        if(seen.has(k))continue;
        seen.add(k);rows.push(f);
      }
      if(data.features.length<PAGE_SIZE){capped=false;break}
      capped=page===MAX_PAGES-1;
    }
    if(!capped){
      putCache(key,rows,false);
      return {features:rows,partial:false,cached:false};
    }
    // A single ArcGIS query may cap results at 2,000 records. Subdivide the
    // *visible* bbox rather than silently treating those first 2,000 as all data.
    if(depth>=5)
      return {features:rows,partial:true,cached:false};
    const [w,s,e,n]=box,mx=(w+e)/2,my=(s+n)/2;
    const quadrants=[[w,s,mx,my],[mx,s,e,my],[w,my,mx,n],[mx,my,e,n]];
    // Keep parent-page results as a safety net when the bounded child-query
    // budget is exhausted. Dedupe overlapping polygons by stable OBJECTID.
    const combined=new Map();
    for(const feature of rows){
      const id=feature.properties?.OBJECTID??feature.id;
      if(id!==undefined)combined.set(String(id),feature);
    }
    let partial=false;
    for(const child of quadrants){
      if(controller.signal.aborted)throw new DOMException("Canceled","AbortError");
      const part=await queryBox(child,controller,progress,depth+1);
      for(const f of part.features){
        const id=f.properties?.OBJECTID??f.id;
        if(id!==undefined)combined.set(String(id),f);
      }
      partial||=part.partial;
    }
    const result=[...combined.values()];
    putCache(key,result,partial);
    return {features:result,partial,cached:false};
  }
  async function reload(){
    if(!active)return;
    ensureLayer();
    if(map.getZoom()<MIN_ZOOM){
      cancel();
      tell("Zoning: showing "+retained.size+" retained polygons · zoom to "+MIN_ZOOM+
        "+ to load additional detail.");
      return;
    }
    const scope=intersection(intersection(windowBounds(map),getRegion()),COVERAGE);
    if(!scope){
      cancel();
      tell("Zoning: "+retained.size+" previously loaded polygons retained · outside LA coverage.");
      return;
    }
    const box=intersection(intersection(canonicalBounds(scope),getRegion()),COVERAGE);
    const key=box.map(x=>x.toFixed(5)).join(",");
    if((key===currentKey||key===pending)&&map.getSource(SOURCE))return;
    cancel();
    const generation=version, controller=new AbortController();
    abort=controller;pending=key;
    if(windows.has(key)){
      const cached=windows.get(key);
      merge(cached.features);currentKey=key;pending="";
      tell("Zoning: "+retained.size+" retained polygons · session cache"+
        (cached.partial?" · incomplete area; move closer for more":"")+".");
      return;
    }
    tell("Zoning: loading visible City Planning polygons… "+retained.size+" retained.");
    try{
      const progress={calls:0};
      const result=await queryBox(box,controller,progress);
      if(generation!==version||controller.signal.aborted)return;
      const clipped=JSON.parse(filterFeatures(JSON.stringify({
        type:"FeatureCollection",features:result.features
      }),...getRegion()));
      merge(clipped.features);
      putCache(key,clipped.features,result.partial);
      currentKey=key;
      pending="";abort=null;
      tell("Zoning: "+retained.size+" retained polygons · "+progress.calls+
        " provider requests"+(result.partial?" · dense area partially loaded; zoom in for more":""));
    }catch(error){
      if(controller.signal.aborted||generation!==version)return;
      pending="";currentKey="";abort=null;
      tell("Zoning: kept "+retained.size+" polygons · request failed: "+error.message);
    }
  }
  map.on("style.load",()=>{
    cancel();ensureLayer();publish();
    if(active)reload();
  });
  map.on("moveend",()=>{if(active)reload()});
  map.on("click",event=>{
    if(!active||!map.getLayer(FILL))return;
    const features=map.queryRenderedFeatures(event.point,{layers:[FILL]});
    if(!features.length)return;
    const p=features[0].properties||{};
    const root=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=String(p.Zoning||"Zoning designation");
    const sub=document.createElement("div");
    sub.textContent=String(p.CATEGORY||"Unclassified")+" · Los Angeles City Planning";
    root.append(title,sub);
    new window.maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(root).addTo(map);
  });
  function setEnabled(value){
    active=Boolean(value);
    renderLegend(legendContainer,active);
    if(!active){
      cancel();visible(false);
      tell("Zoning hidden · "+retained.size+" polygons retained; toggle on to restore.");
      return;
    }
    ensureLayer();visible(true);
    publish();
    if(retained.size)tell("Zoning restored · "+retained.size+" polygons available immediately.");
    reload();
  }
  return {
    setEnabled,
    onRegionChange:()=>{
      cancel();currentKey="";
      // Rendering remains geographically scoped to selected study rectangle.
      if(active)reload();
    },
    clearMemory:()=>{windows.clear();currentKey="";pending=""}
  };
}
