import { createZoningOverlay } from "./zoning.js";
import { createParcelOverlay } from "./parcel.js";
import { createCensusOverlay } from "./census.js";
import { createGridOverlay } from "./grid.js";
import { createDataCache } from "./data-cache.js";
import { createWideOverview } from "./overview.js";
import init, {
  tile_in_region, region_area_km2, visible_grid_geojson, filter_geojson_bbox, enrich_acs_tracts
} from "./pkg/stratlas_core.js";

const REGIONS = {
  "la-county": {name:"Los Angeles County",bbox:[-118.95,32.70,-117.64,34.85]},
  "la-city": {name:"Los Angeles City",bbox:[-118.67,33.70,-118.15,34.34]},
  california: {name:"California",bbox:[-124.42,32.53,-114.13,42.02]},
  jalisco: {name:"Jalisco, Mexico",bbox:[-105.72,18.88,-101.50,22.76]}
};
const OSM_ATTR = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
const USGS_ATTR = '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>';
const BASES = {
  osm: {
    name:"OpenStreetMap",url:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:OSM_ATTR, maxZoom:19
  },
  topo: {
    name:"OpenTopoMap",url:"https://tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:OSM_ATTR+' · <a href="https://opentopomap.org/" target="_blank" rel="noopener">© OpenTopoMap (CC BY-SA)</a> · SRTM',
    maxZoom:17
  },
  "usgs-topo": {
    name:"USGS Topographic",url:"https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    attribution:USGS_ATTR,maxZoom:16
  },
  "usgs-relief": {
    name:"USGS Shaded Relief",url:"https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}",
    attribution:USGS_ATTR+" · 3DEP / GMTED2010",maxZoom:16
  },
  "usgs-imagery": {
    name:"USGS Orthoimagery",url:"https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    attribution:USGS_ATTR+" · USDA NAIP and USGS",maxZoom:16
  },
  "carto-voyager": {
    name:"CARTO Voyager",url:"https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attribution:OSM_ATTR+' · <a href="https://carto.com/attributions" target="_blank" rel="noopener">© CARTO</a>',
    maxZoom:20,needsKey:true
  },
  "carto-positron": {
    name:"CARTO Positron",url:"https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution:OSM_ATTR+' · <a href="https://carto.com/attributions" target="_blank" rel="noopener">© CARTO</a>',
    maxZoom:20,needsKey:true
  },
  "carto-dark": {
    name:"CARTO Dark Matter",url:"https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution:OSM_ATTR+' · <a href="https://carto.com/attributions" target="_blank" rel="noopener">© CARTO</a>',
    maxZoom:20,needsKey:true
  }
};
const $ = id => document.getElementById(id);
function read(name, fallback) {
  try {return localStorage.getItem("stratlas:"+name) || fallback} catch {return fallback}
}
function write(name,value) {
  try {localStorage.setItem("stratlas:"+name,value)} catch { /* private browser */ }
}
const state={
  regionId:read("region","la-county"),
  baseId:read("basemap","osm"),
  cartoKey:read("cartoKey",""),
  count:0, blocked:0, showGrid:read("grid","true")==="true"
};
if (!REGIONS[state.regionId] && state.regionId!=="viewport") state.regionId="la-county";
if (!BASES[state.baseId]) state.baseId="osm";
const DEFAULT_REGION=REGIONS["la-county"];
let customRegion=DEFAULT_REGION;
try {
  const saved=JSON.parse(read("customRegion","null"));
  if (saved && Array.isArray(saved.bbox) && saved.bbox.length===4 &&
      saved.bbox.every(v=>typeof v==="number"&&Number.isFinite(v)) &&
      saved.bbox[0]<saved.bbox[2] && saved.bbox[1]<saved.bbox[3]) {
    customRegion={name:"Custom viewport",bbox:saved.bbox};
  }
} catch { /* ignore invalid local setting */ }
const region=()=>state.regionId==="viewport" ? customRegion : REGIONS[state.regionId];
const setStatus=message=>$("status").textContent=message;

function transparentPng() {
  const raw=atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=");
  return Uint8Array.from(raw,ch=>ch.charCodeAt(0)).buffer;
}
const EMPTY_TILE=transparentPng();

function styleForBase() {
  const base=BASES[state.baseId];
  return {
    version:8,
    sources:{basemap:{
      type:"raster",
      tiles:["stratlas://tiles/{z}/{x}/{y}.png"],
      tileSize:256,maxzoom:base.maxZoom,
      attribution:base.attribution
    }},
    layers:[{id:"basemap",source:"basemap",type:"raster"}]
  };
}

async function start() {
  await init();
  if (!window.maplibregl) throw Error("MapLibre did not load");
  const maplibregl=window.maplibregl;
  maplibregl.addProtocol("stratlas",async (request,controller)=>{
    const match=/^stratlas:\/\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(request.url);
    if (!match) throw Error("Unexpected tile path");
    const z=Number(match[1]),x=Number(match[2]),y=Number(match[3]);
    const [w,s,e,n]=region().bbox;
    if (!tile_in_region(z,x,y,w,s,e,n)) {
      state.blocked++;
      $("blocked").textContent=String(state.blocked);
      return {data:EMPTY_TILE};
    }
    const base=BASES[state.baseId];
    if (base.needsKey && !state.cartoKey) {
      return {data:EMPTY_TILE};
    }
    let url=base.url.replace("{z}",String(z)).replace("{x}",String(x)).replace("{y}",String(y));
    if (base.needsKey) url+="?key="+encodeURIComponent(state.cartoKey);
    const response=await fetch(url,{cache:"default",signal:controller.signal,mode:"cors"});
    // Public USGS raster caches can legitimately omit tiles with no source
    // coverage (especially shaded relief over water). A 404 is an empty tile,
    // not a fatal map error. Other HTTP errors still surface normally.
    if(response.status===404 && state.baseId.startsWith("usgs-"))
      return {data:EMPTY_TILE};
    if (!response.ok) throw Error(base.name+" tile HTTP "+response.status);
    const bytes=await response.arrayBuffer();
    state.count++;
    $("fetched").textContent=String(state.count);
    return {data:bytes};
  });

  const dataCache=createDataCache();
  // Cache inspection reads only metadata, not saved response bodies.
  let inspecting=false;
  async function updateCacheInspection(){
    if(inspecting)return;
    inspecting=true;
    try{
      const s=dataCache.stats(),disk=await dataCache.inspect();
      const amount=disk.available
        ? disk.entries+" saved responses · "+(disk.bytes/1048576).toFixed(1)+" MiB"
        : "IndexedDB unavailable";
      $("cache-live").textContent="Geographic API cache: "+amount+
        " · "+s.hits+" reused · "+s.network+" network responses"+
        " · "+s.policyBlocked+" disallowed by provider headers"+
        (s.oversize?" · "+s.oversize+" oversized":"");
    }catch(error){
      $("cache-live").textContent="Cache inspection unavailable: "+error.message;
    }finally{inspecting=false}
  }
  void updateCacheInspection();
  setInterval(()=>{void updateCacheInspection()},5000);
  const map=new maplibregl.Map({
    container:"map",style:styleForBase(),
    center:[-118.30,34.05],zoom:9,minZoom:2,maxZoom:19,
    attributionControl:true,renderWorldCopies:false
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:true}),"top-right");
  map.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
  const zoning=createZoningOverlay(map,{
    getRegion:()=>region().bbox,
    filterFeatures:(input,...bounds)=>filter_geojson_bbox(input,...bounds),
    dataCache,
    legendContainer:$("zoning-legend"),
    onStatus:message=>$("overlay-status").textContent=message
  });
  const zoningOpacity=$("zoning-opacity");
  const storedOpacity=Math.max(0,Math.min(100,Number(read("zoningOpacity","42"))||0));
  zoningOpacity.value=String(storedOpacity);
  $("zoning-opacity-value").textContent=storedOpacity+"%";
  zoning.setOpacity(storedOpacity/100);
  zoningOpacity.addEventListener("input",event=>{
    const pct=Number(event.target.value);
    $("zoning-opacity-value").textContent=pct+"%";
    zoning.setOpacity(pct/100);
    overview.setZoningOpacity(pct/100);
    write("zoningOpacity",String(pct));
  });
  $("zoning").addEventListener("change",event=>{
    $("zoning-controls").hidden=!event.target.checked;
    zoning.setEnabled(event.target.checked);
    overview.setZoning(event.target.checked);
  });
  const census=createCensusOverlay(map,{
    getRegion:()=>region().bbox,
    filterFeatures:(input,...bounds)=>filter_geojson_bbox(input,...bounds),
    enrichFeatures:enrich_acs_tracts,
    dataCache,
    onStatus:message=>$("acs-status").textContent=message,
    legendContainer:$("acs-legend")
  });
  $("acs-metric").addEventListener("change",event=>{
    census.setMetric(event.target.value);
    overview.setCensus(event.target.value);
  });
  const assessor=createParcelOverlay(map,{
    getRegion:()=>region().bbox,
    filterFeatures:(input,...bounds)=>filter_geojson_bbox(input,...bounds),
    dataCache,legendContainer:$("assessor-legend"),
    onStatus:message=>$("assessor-status").textContent=message
  });
  const assessorOpacity=$("assessor-opacity");
  const assessorStored=Math.max(0,Math.min(100,Number(read("assessorOpacity","66"))||0));
  assessorOpacity.value=String(assessorStored);
  $("assessor-opacity-value").textContent=assessorStored+"%";
  assessor.setOpacity(assessorStored/100);
  assessorOpacity.addEventListener("input",event=>{
    const percent=Number(event.target.value);
    $("assessor-opacity-value").textContent=percent+"%";
    assessor.setOpacity(percent/100);
    overview.setParcelOpacity(percent/100);
    write("assessorOpacity",String(percent));
  });
  $("assessor").addEventListener("change",event=>{
    $("assessor-controls").hidden=!event.target.checked;
    assessor.setEnabled(event.target.checked);
    overview.setParcel(event.target.checked);
  });
  const overview=createWideOverview(map,{
    getRegion:()=>region().bbox,
    filterFeatures:(input,...bounds)=>filter_geojson_bbox(input,...bounds),
    dataCache,
    onStatus:(kind,message)=>{
      const node=$(kind==="census"?"acs-status":
        kind==="parcel"?"assessor-status":"overlay-status");
      node.textContent=message;
    }
  });
  overview.setZoningOpacity(storedOpacity/100);
  overview.setParcelOpacity(assessorStored/100);

  // Defensive compatibility during rolling Pages/browser-cache updates:
  // one missing optional UI element must never prevent the whole map starting.
  function findOrCreateGridCanvas(){
    let canvas=$("grid-canvas");
    if(!canvas){
      canvas=document.createElement("canvas");
      canvas.id="grid-canvas";
      canvas.className="grid-canvas";
      canvas.hidden=true;
      canvas.setAttribute("aria-hidden","true");
      $("map").insertAdjacentElement("afterend",canvas);
      console.warn("Stratlas repaired a missing grid canvas from an older HTML shell");
    }
    return canvas;
  }
  const grid=createGridOverlay(map,{
    getRegion:()=>region().bbox,
    gridGeoJson:visible_grid_geojson,
    onStatus:message=>$("grid-status").textContent=message,
    canvas:findOrCreateGridCanvas()
  });
  function boundsObj() {
    const b=map.getBounds();
    return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
  }
  function updateZoom(){
    const level=map.getZoom();
    const label=$("zoom-level");
    if(label)label.textContent="Zoom "+level.toFixed(1);
  }
  updateZoom();
  map.on("zoom",updateZoom);
  map.on("moveend",()=>{
    updateZoom();
    const center=map.getCenter();
    $("coordinates").textContent=center.lat.toFixed(4)+"°, "+center.lng.toFixed(4)+"° · z"+map.getZoom().toFixed(1);
    grid.refresh();
  });
  map.on("error",evt=>{
    const message=evt.error && evt.error.message ? evt.error.message : "Unknown map error";
    setStatus("Map source error: "+message);
  });
  function applyRegion(fit) {
    const selected=region();
    const [w,s,e,n]=selected.bbox;
    $("study-name").textContent=selected.name;
    $("region-details").textContent="Bounds: "+selected.bbox.map(x=>x.toFixed(2)).join(", ") +
      " · "+Math.round(region_area_km2(w,s,e,n)).toLocaleString()+" km² rectangle";
    map.setMaxBounds([[w,s],[e,n]]);
    if (fit) map.fitBounds([[w,s],[e,n]],{padding:35,duration:0});
    // Force MapLibre to discard previous-region raster tiles.
    map.setStyle(styleForBase());
    zoning.onRegionChange();
    census.onRegionChange();
    assessor.onRegionChange();
    overview.reset();
    grid.onRegionChange();
  }
  function switchBase() {
    const selected=BASES[state.baseId];
    if (selected.needsKey && !state.cartoKey) {
      setStatus(selected.name+" requires your CARTO basemap API key. Enter one in the sidebar.");
    } else {
      setStatus("Rust/WASM ready · "+selected.name+" · requests restricted to study region."+
        (state.baseId.startsWith("usgs-")?" USGS tile coverage is primarily U.S.; above z16, cached tiles are enlarged.":""));
    }
    map.setStyle(styleForBase());
  }
  $("region").value=state.regionId;
  $("basemap").value=state.baseId;
  $("carto-key").value=state.cartoKey;
  $("region").addEventListener("change",event=>{
    state.regionId=event.target.value;
    write("region",state.regionId);
    applyRegion(true);
  });
  $("capture").addEventListener("click",()=>{
    const [w,s,e,n]=boundsObj();
    if (w < -180 || e > 180 || w >= e || s >= n) {
      setStatus("Choose a non-wrapping viewport before capturing the region.");
      return;
    }
    customRegion={name:"Custom viewport",bbox:[w,s,e,n]};
    write("customRegion",JSON.stringify(customRegion));
    state.regionId="viewport";write("region",state.regionId);
    $("region").value="viewport";
    applyRegion(true);
  });
  $("basemap").addEventListener("change",event=>{
    state.baseId=event.target.value;
    write("basemap",state.baseId);
    switchBase();
  });
  $("save-key").addEventListener("click",()=>{
    state.cartoKey=$("carto-key").value.trim();
    write("cartoKey",state.cartoKey);
    switchBase();
  });
  $("clear-data-cache").addEventListener("click",async()=>{
    const control=$("clear-data-cache");
    control.disabled=true;
    try{
      const ok=await dataCache.clear();
      zoning.clearMemory();
      census.clearMemory();
      assessor.clearMemory();
      overview.reset(false);
      void updateCacheInspection();
      $("cache-status").textContent=ok
        ? "Stored API responses removed. Current map remains visible; future requests reload."
        : "Persistent storage unavailable. In-memory geographic responses cleared.";
    }catch(error){
      $("cache-status").textContent="Cache clear failed: "+error.message;
    }finally{control.disabled=false}
  });
  $("tile-grid").addEventListener("change",event=>{
    state.showGrid=event.target.checked;
    write("grid",String(state.showGrid));
    grid.setEnabled(state.showGrid);
  });
  $("tile-grid").checked=state.showGrid;
  grid.setEnabled(state.showGrid);
  map.once("load",()=>{
    applyRegion(true);
    setStatus("Rust/WASM ready · loading visible tiles within "+region().name+".");
    if (BASES[state.baseId].needsKey && !state.cartoKey) switchBase();
  });
}

start().catch(error=>{
  console.error(error);
  setStatus("Initialization failed: "+error.message+". Check browser console and Pages build.");
});
