// LA City Planning: https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15
// IDs are discovered by a viewport-bounded ArcGIS query. Only missing IDs
// are fetched in small GeoJSON batches, drawn immediately when each finishes.
const SERVICE="https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query";
const COVERAGE=[-118.67,33.70,-118.15,34.34];
const MIN_ZOOM=13, IDS_PER_BATCH=40, CONCURRENT_BATCHES=3;
const SOURCE="la-zoning-data",FILL="la-zoning-fill",LINE="la-zoning-line",HIGHLIGHT="la-zoning-highlight";
const empty=()=>({type:"FeatureCollection",features:[]});
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
const knownNames=ZONING_CATEGORIES.slice(0,-1).map(([name])=>name);
const categoricalPaint=["match",["get","CATEGORY"],
  ...ZONING_CATEGORIES.slice(0,-1).flatMap(([name,color])=>[name,color]),
  ZONING_CATEGORIES.at(-1)[1]
];
const noHighlight=["==",["get","CATEGORY"],"__no_selected_category__"];
function intersect(a,b){
  if(!a)return null;
  const x=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];
  return x[0]<x[2]&&x[1]<x[3]?x:null;
}
function viewport(map){
  const b=map.getBounds();
  return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
}
function snapped(b){
  const step=0.01;
  return [Math.floor(b[0]/step)*step,Math.floor(b[1]/step)*step,
    Math.ceil(b[2]/step)*step,Math.ceil(b[3]/step)*step];
}
function idsUrl(box){
  return SERVICE+"?"+new URLSearchParams({
    where:"1=1",geometry:box.map(v=>v.toFixed(5)).join(","),
    geometryType:"esriGeometryEnvelope",inSR:"4326",
    spatialRel:"esriSpatialRelIntersects",returnIdsOnly:"true",f:"json"
  });
}
function featuresUrl(ids){
  return SERVICE+"?"+new URLSearchParams({
    objectIds:ids.join(","),outFields:"OBJECTID,Zoning,CATEGORY",
    returnGeometry:"true",outSR:"4326",geometryPrecision:"5",f:"geojson"
  });
}
function validId(id){
  const value=Number(id);
  return Number.isSafeInteger(value)&&value>=0;
}
function activeFilter(category){
  return category==="Other / unclassified"
    ? ["!",["in",["get","CATEGORY"],["literal",knownNames]]]
    : ["==",["get","CATEGORY"],category];
}
export function createZoningOverlay(map,{getRegion,filterFeatures,onStatus,dataCache,legendContainer}){
  let active=false,opacity=0.42,hover=null;
  let pointerCategory=null,focusedCategory=null,highlightFrame=null;
  let latestKey="",latestIds=null,fetchingIndex=null,lastError=null;
  let session=0,sessionController=new AbortController(),idController=null;
  const polygons=new Map(),knownWindows=new Map();
  const queued=[],queuedIds=new Set(),inFlightIds=new Set();
  const MAX_POLYGONS=12000,MAX_WINDOWS=32;
  let running=0,debounce=null,drawTimer=null,lastDraw=0;
  const status=message=>onStatus(message);

  function source(){return map.getSource(SOURCE)}
  function publish(){
    if(drawTimer!==null){clearTimeout(drawTimer);drawTimer=null}
    if(!source())return;
    // Only send geometry currently in view to MapLibre; preserve all visited
    // polygons in memory so panning/zoom-out restores them without refetches.
    const scope=intersect(viewport(map),getRegion());
    const clipped=scope?JSON.parse(filterFeatures(JSON.stringify({
      type:"FeatureCollection",features:[...polygons.values()]
    }),...scope)):empty();
    source().setData(clipped);
    lastDraw=Date.now();
  }
  function scheduleDraw(){
    const wait=Math.max(0,130-(Date.now()-lastDraw));
    if(wait===0){publish();return}
    if(drawTimer===null)drawTimer=setTimeout(()=>publish(),wait);
  }
  function merge(features){
    let count=0;
    for(const feature of features){
      const id=feature.properties?.OBJECTID??feature.id;
      if(!validId(id))continue;
      const key=Number(id);
      polygons.delete(key);polygons.set(key,feature);count++;
      while(polygons.size>MAX_POLYGONS)
        polygons.delete(polygons.keys().next().value);
    }
    if(count)scheduleDraw();
    return count;
  }
  function rememberWindow(key,ids){
    knownWindows.delete(key);knownWindows.set(key,ids);
    while(knownWindows.size>MAX_WINDOWS)
      knownWindows.delete(knownWindows.keys().next().value);
  }
  function progress(){
    if(!active||!latestIds)return;
    const complete=latestIds.reduce((n,id)=>n+(polygons.has(id)?1:0),0);
    const waiting=latestIds.length-complete;
    status("Zoning: "+complete+"/"+latestIds.length+
      " polygons in current view · "+polygons.size+" retained"+
      (waiting?" · "+waiting+" remaining":" · loaded")+
      (lastError?" · some requests failed: "+lastError:""));
  }
  function paintOpacity(){
    if(map.getLayer(FILL))map.setPaintProperty(FILL,"fill-opacity",opacity);
  }
  function renderHighlight(){
    highlightFrame=null;
    const desired=active?(pointerCategory??focusedCategory):null;
    if(desired===hover)return;
    hover=desired;
    if(map.getLayer(HIGHLIGHT))
      map.setFilter(HIGHLIGHT,hover===null?noHighlight:activeFilter(hover));
  }
  function scheduleHighlight(){
    if(typeof globalThis.requestAnimationFrame==="function"){
      if(highlightFrame!==null)return;
      highlightFrame=globalThis.requestAnimationFrame(renderHighlight);
    }else renderHighlight();
  }
  function visibility(){
    for(const id of [FILL,LINE,HIGHLIGHT])
      if(map.getLayer(id))
        map.setLayoutProperty(id,"visibility",active?"visible":"none");
  }
  function ensureLayers(){
    // Applying paint/filter properties on every pan forces costly full-layer
    // repaints. Only initialize after a genuine MapLibre style replacement.
    if(source()&&map.getLayer(FILL)&&map.getLayer(LINE)&&map.getLayer(HIGHLIGHT))return;
    if(!source())map.addSource(SOURCE,{type:"geojson",data:empty()});
    if(!map.getLayer(FILL))map.addLayer({id:FILL,type:"fill",source:SOURCE,
      paint:{"fill-color":categoricalPaint,"fill-opacity":opacity}});
    if(!map.getLayer(LINE))map.addLayer({id:LINE,type:"line",source:SOURCE,
      paint:{"line-color":"#233645","line-opacity":0.53,"line-width":0.5}});
    if(!map.getLayer(HIGHLIGHT))map.addLayer({id:HIGHLIGHT,type:"line",source:SOURCE,
      filter:noHighlight,paint:{"line-color":"#ffdf63","line-width":3.2,"line-opacity":1}});
    visibility();
    paintOpacity();
    // On a style reset, the map's filter must be reattached even if the
    // selected legend category has not changed.
    if(map.getLayer(HIGHLIGHT))
      map.setFilter(HIGHLIGHT,hover===null?noHighlight:activeFilter(hover));
  }
  function buildLegend(){
    if(!legendContainer)return;
    legendContainer.hidden=!active;
    if(legendContainer.childElementCount)return;
    const heading=document.createElement("div");
    heading.className="zoning-legend-heading";
    heading.textContent="Zoning categories";
    const grid=document.createElement("div");
    grid.className="zoning-legend-items";
    for(const [name,color] of ZONING_CATEGORIES){
      const entry=document.createElement("div");
      entry.className="zoning-legend-item";
      entry.tabIndex=0;
      entry.setAttribute("aria-label","Highlight "+name+" zoning on map");
      const swatch=document.createElement("span");
      swatch.className="zoning-legend-swatch";swatch.style.backgroundColor=color;
      const label=document.createElement("span");label.textContent=name;
      entry.append(swatch,label);
      entry.addEventListener("mouseenter",()=>{pointerCategory=name;scheduleHighlight()});
      entry.addEventListener("mouseleave",()=>{if(pointerCategory===name)pointerCategory=null;scheduleHighlight()});
      entry.addEventListener("focus",()=>{focusedCategory=name;scheduleHighlight()});
      entry.addEventListener("blur",()=>{if(focusedCategory===name)focusedCategory=null;scheduleHighlight()});
      grid.append(entry);
    }
    const note=document.createElement("p");note.className="meta";
    note.textContent="Hover or focus a category to outline matching loaded polygons.";
    legendContainer.replaceChildren(heading,grid,note);
  }
  async function json(url,controller,namespace){
    if(dataCache)return dataCache.fetchJson(url,{
      namespace,ttlMs:6*60*60*1000,signal:controller.signal
    });
    const response=await fetch(url,{cache:"default",mode:"cors",signal:controller.signal});
    if(!response.ok)throw Error("City Planning GIS HTTP "+response.status);
    return response.json();
  }
  function validFeatures(body){
    if(body?.error)throw Error(body.error.message||"City Planning GIS error");
    if(body?.type!=="FeatureCollection"||!Array.isArray(body.features))
      throw Error("City Planning returned an invalid GeoJSON feature collection");
    return body.features;
  }
  function stopRequests(){
    session++;
    sessionController.abort();sessionController=new AbortController();
    idController?.abort();idController=null;fetchingIndex=null;
    queued.length=0;queuedIds.clear();inFlightIds.clear();running=0;
    if(debounce!==null){clearTimeout(debounce);debounce=null}
    latestKey="";latestIds=null;lastError=null;
  }
  function pump(){
    if(!active)return;
    const currentSession=session,controller=sessionController;
    while(running<CONCURRENT_BATCHES&&queued.length){
      const group=queued.shift();
      for(const id of group){queuedIds.delete(id);inFlightIds.add(id)}
      running++;
      (async()=>{
        try{
          const body=await json(featuresUrl(group),controller,"la-zoning-features-v1");
          if(currentSession!==session||controller.signal.aborted)return;
          const features=validFeatures(body);
          // Store full returned geometry, rather than clipping to the
          // viewport that initiated the request. A subsequent pan may need it.
          merge(features);
        }catch(error){
          if(currentSession!==session||controller.signal.aborted)return;
          lastError=error.message;
          status("Zoning: "+polygons.size+" retained · geometry request failed: "+error.message);
        }finally{
          if(currentSession!==session)return;
          for(const id of group)inFlightIds.delete(id);
          running--;
          pump();
          progress();
        }
      })();
    }
  }
  function prioritize(ids){
    // Never let thousands of old queued polygons block the newest viewport.
    // Completed and in-flight requests are preserved. Old queued work can be
    // recovered from the cached ID index when that area becomes visible again.
    queued.length=0;queuedIds.clear();
    const missing=ids.filter(id=>!polygons.has(id)&&!inFlightIds.has(id));
    for(let i=0;i<missing.length;i+=IDS_PER_BATCH){
      const group=missing.slice(i,i+IDS_PER_BATCH);
      queued.push(group);
      for(const id of group)queuedIds.add(id);
    }
    pump();
    progress();
  }
  async function load(){
    if(!active)return;
    ensureLayers();
    publish();
    if(map.getZoom()<MIN_ZOOM){
      status("Zoning: "+polygons.size+" retained · zoom to "+MIN_ZOOM+
        "+ to load new polygons.");return;
    }
    const region=getRegion();
    const scope=intersect(intersect(viewport(map),region),COVERAGE);
    if(!scope){
      status("Zoning: "+polygons.size+" retained · outside LA City coverage.");return;
    }
    const box=intersect(intersect(snapped(scope),region),COVERAGE);
    if(!box)return;
    const key=box.map(v=>v.toFixed(5)).join(",");
    if(key===latestKey){
      if(latestIds){
        // A failed group is retryable on the next navigation. Don't restart
        // already queued or currently running groups on repeated moveend.
        if(!queued.length&&!running&&latestIds.some(id=>!polygons.has(id))){
          lastError=null;prioritize(latestIds);
        }
        else progress();
        return;
      }
      if(fetchingIndex===key)return;
      // A failed ID lookup must not permanently poison this viewport key.
    }
    latestKey=key;latestIds=null;lastError=null;
    // New viewport cancels ONLY the previous ID lookup, not geometry batches
    // already in flight. A completed batch always enters the retained cache.
    idController?.abort();
    const indexController=new AbortController();
    idController=indexController;fetchingIndex=key;
    queued.length=0;queuedIds.clear();
    status("Zoning: discovering new view · "+polygons.size+" polygons retained…");
    try{
      let ids=knownWindows.get(key);
      if(!ids){
        const body=await json(idsUrl(box),indexController,"la-zoning-ids-v1");
        if(body?.error)throw Error(body.error.message||"City Planning ID query error");
        if(!Array.isArray(body?.objectIds))throw Error("City Planning returned no object ID list");
        ids=[...new Set(body.objectIds.map(Number).filter(validId))];
        rememberWindow(key,ids);
      }
      if(!active||indexController.signal.aborted||key!==latestKey)return;
      idController=null;fetchingIndex=null;
      latestIds=ids;
      prioritize(ids);
    }catch(error){
      if(!active||indexController.signal.aborted||key!==latestKey)return;
      idController=null;fetchingIndex=null;
      status("Zoning: "+polygons.size+" retained · GIS ID lookup failed: "+error.message);
    }
  }
  function setEnabled(enabled){
    active=Boolean(enabled);
    buildLegend();
    if(!active){
      stopRequests();
      pointerCategory=null;focusedCategory=null;scheduleHighlight();
      visibility();
      status("Zoning hidden · "+polygons.size+" polygons retained.");
      return;
    }
    ensureLayers();publish();void load();
  }
  function setOpacity(value){
    if(!Number.isFinite(value))return;
    opacity=Math.max(0,Math.min(1,value));
    paintOpacity();
  }
  map.on("style.load",()=>{
    ensureLayers();publish();
    if(active)void load();
  });
  map.on("moveend",()=>{
    if(!active)return;
    // A new viewport doesn't abort in-flight polygons from the old view.
    if(debounce!==null)clearTimeout(debounce);
    debounce=setTimeout(()=>{debounce=null;void load()},140);
  });
  map.on("click",event=>{
    if(!active||!map.getLayer(FILL))return;
    const features=map.queryRenderedFeatures(event.point,{layers:[FILL]});
    if(!features.length)return;
    const p=features[0].properties||{};
    const root=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=String(p.Zoning||"Zoning designation");
    const description=document.createElement("div");
    description.textContent=String(p.CATEGORY||"Unclassified")+" · LA City Planning";
    root.append(title,description);
    new window.maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(root).addTo(map);
  });
  return {
    setEnabled,setOpacity,
    onRegionChange:()=>{stopRequests();publish();if(active)void load()},
    clearMemory:()=>{knownWindows.clear();latestKey="";latestIds=null}
  };
}
