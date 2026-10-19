// Los Angeles Department of City Planning: publicly advertised ArcGIS FeatureServer.
// Bounding-box reads only: no citywide data download, no background prefetch.
const SERVICE="https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query";
const COVERAGE=[-118.67,33.70,-118.15,34.34]; // coarse city bbox, not jurisdiction
const PAGE_SIZE=500, MAX_PAGES=4, MIN_ZOOM=13;
const SOURCE="la-zoning-data", FILL="la-zoning-fill", LINE="la-zoning-line";
const empty=()=>({type:"FeatureCollection",features:[]});
const matchColor=["match",["get","CATEGORY"],
  "Agricultural","#8bcf8a","Commercial","#ed777e",
  "Commercial-Mixed","#ca689a","Manufacturing","#82c5d8",
  "Multiple Family Residential","#f9c14c","Single Family Residential","#eddf9e",
  "Residential","#f3b943","Residential-Mixed","#ad8544",
  "Open Space","#80c67d","Public Facilities","#87b5c1",
  "Public","#6bb0c5","Industrial","#668ca6","Industrial-Mixed","#996ab0",
  "Hybrid Industrial","#9071b4","Parking","#bcc3cb",
  "Freeway","#9ea9b0","#9da8ae"
];

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
export function createZoningOverlay(map,{getRegion,filterFeatures,onStatus,dataCache}) {
  let active=false, version=0, abort=null, lastQuery="", lastData=empty();
  const memory=new Map();
  function tell(message){onStatus(message)}
  function cancel() {
    version++;
    if(abort) abort.abort();
    abort=null;
  }
  function putCache(key,value) {
    memory.delete(key);memory.set(key,value);
    if(memory.size>6)memory.delete(memory.keys().next().value);
  }
  function ensureLayer() {
    if(map.getSource(SOURCE)) return;
    map.addSource(SOURCE,{type:"geojson",data:lastData});
    map.addLayer({id:FILL,type:"fill",source:SOURCE,
      paint:{"fill-color":matchColor,"fill-opacity":0.42}});
    map.addLayer({id:LINE,type:"line",source:SOURCE,
      paint:{"line-color":"#233645","line-opacity":0.5,"line-width":0.5}});
  }
  function clear(message){
    lastData=empty();lastQuery="";
    const source=map.getSource(SOURCE);
    if(source)source.setData(lastData);
    tell(message);
  }
  async function reload() {
    if(!active)return;
    ensureLayer();
    if(map.getZoom()<MIN_ZOOM) {
      cancel();clear("Zoning: zoom to level "+MIN_ZOOM+" or closer to query city polygons.");
      return;
    }
    const scope=intersection(intersection(windowBounds(map),getRegion()),COVERAGE);
    if(!scope) {
      cancel();clear("Zoning: no Los Angeles City coverage in this view.");
      return;
    }
    // Quantize and intersect again; never query beyond region/source bounds.
    const bbox=intersection(intersection(canonicalBounds(scope),getRegion()),COVERAGE);
    const key=bbox.map(x=>x.toFixed(5)).join(",");
    if(lastQuery===key && map.getSource(SOURCE))return;
    cancel();
    const thisRequest=version, controller=new AbortController();
    abort=controller;lastQuery=key;
    if(memory.has(key)) {
      lastData=memory.get(key);
      const source=map.getSource(SOURCE);
      if(source)source.setData(lastData);
      tell("Zoning: "+lastData.features.length+" polygons · memory cache.");
      return;
    }
    tell("Zoning: querying city GIS for visible region…");
    try{
      let results=[], limited=false;
      const seen=new Set();
      for(let page=0;page<MAX_PAGES;page++) {
        const url=queryUrl(bbox,page*PAGE_SIZE);
        const data=dataCache
          ? await dataCache.fetchJson(url,{
              namespace:"la-city-zoning-v1",ttlMs:6*60*60*1000,
              signal:controller.signal
            })
          : await (async()=>{
              const response=await fetch(url,{
                cache:"default",signal:controller.signal,mode:"cors"
              });
              if(!response.ok)throw Error("GIS HTTP "+response.status);
              return response.json();
            })();
        if(data.error)throw Error(data.error.message||"ArcGIS query error");
        if(data.type!=="FeatureCollection" || !Array.isArray(data.features))
          throw Error("GIS response was not GeoJSON");
        for(const feature of data.features) {
          const id=feature.properties?.OBJECTID ?? feature.id;
          if(id!==undefined && seen.has(id))continue;
          if(id!==undefined)seen.add(id);
          results.push(feature);
        }
        if(data.features.length<PAGE_SIZE)break;
        if(page===MAX_PAGES-1)limited=true;
      }
      if(thisRequest!==version)return;
      // Rust/WASM performs the last spatial culling pass.
      const clipped=JSON.parse(filterFeatures(JSON.stringify({
        type:"FeatureCollection",features:results
      }),...getRegion()));
      lastData=clipped;putCache(key,clipped);
      const source=map.getSource(SOURCE);
      if(source)source.setData(clipped);
      tell("Zoning: "+clipped.features.length+" city polygons "+
        (limited?"· capped at 2,000; zoom closer":"· City Planning GIS"));
    }catch(error){
      if(controller.signal.aborted || thisRequest!==version)return;
      lastQuery="";
      clear("Zoning unavailable: "+error.message);
    }
  }
  map.on("style.load",()=>{
    cancel();lastQuery="";ensureLayer();
    if(active)reload();
  });
  map.on("moveend",()=>{if(active)reload()});
  map.on("click",event=>{
    if(!active || !map.getLayer(FILL))return;
    const features=map.queryRenderedFeatures(event.point,{layers:[FILL]});
    if(!features.length)return;
    const props=features[0].properties||{};
    const root=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=String(props.Zoning||"Zoning designation");
    const sub=document.createElement("div");
    sub.textContent=String(props.CATEGORY||"Unclassified")+" · Los Angeles City Planning";
    root.append(title,sub);
    new window.maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(root).addTo(map);
  });
  function setEnabled(value){
    active=Boolean(value);
    if(!active){
      cancel();clear("Zoning layer disabled.");return;
    }
    reload();
  }
  return {
    setEnabled,
    onRegionChange:()=>{cancel();lastQuery="";if(active)reload()},
    clearMemory:()=>{memory.clear();lastQuery=""}
  };
}
