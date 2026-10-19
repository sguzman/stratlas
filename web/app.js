import { createZoningOverlay } from "./zoning.js";
import init, {
  tile_in_region, region_area_km2, visible_grid_geojson, filter_geojson_bbox
} from "./pkg/stratlas_core.js";

const REGIONS = {
  "la-county": {name:"Los Angeles County",bbox:[-118.95,32.70,-117.64,34.85]},
  "la-city": {name:"Los Angeles City",bbox:[-118.67,33.70,-118.15,34.34]},
  california: {name:"California",bbox:[-124.42,32.53,-114.13,42.02]},
  jalisco: {name:"Jalisco, Mexico",bbox:[-105.72,18.88,-101.50,22.76]}
};
const OSM_ATTR = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
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
  count:0, blocked:0, showGrid:false
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
    if (!response.ok) throw Error(base.name+" tile HTTP "+response.status);
    const bytes=await response.arrayBuffer();
    state.count++;
    $("fetched").textContent=String(state.count);
    return {data:bytes};
  });

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
    onStatus:message=>$("overlay-status").textContent=message
  });
  $("zoning").addEventListener("change",event=>zoning.setEnabled(event.target.checked));

  const empty=()=>({type:"FeatureCollection",features:[]});
  function boundsObj() {
    const b=map.getBounds();
    return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
  }
  function drawGrid() {
    const source=map.getSource("tile-grid-data");
    if (!source) return;
    if (!state.showGrid) {source.setData(empty());return}
    const [vw,vs,ve,vn]=boundsObj();
    const [rw,rs,re,rn]=region().bbox;
    // Avoid antimeridian-wrapping region requests.
    const geojson=visible_grid_geojson(
      Math.max(-180,vw),Math.max(-90,vs),Math.min(180,ve),Math.min(90,vn),
      rw,rs,re,rn,Math.max(0,Math.min(18,Math.floor(map.getZoom()))),250
    );
    source.setData(JSON.parse(geojson));
  }
  function overlay() {
    if (!map.isStyleLoaded()) return;
    const [w,s,e,n]=region().bbox;
    const outline={type:"Feature",properties:{},geometry:{
      type:"Polygon",coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]
    }};
    map.addSource("study-area",{type:"geojson",data:outline});
    map.addLayer({id:"study-area-line",type:"line",source:"study-area",
      paint:{"line-color":"#0b86bf","line-width":2.5,"line-opacity":0.95}});
    map.addSource("tile-grid-data",{type:"geojson",data:empty()});
    map.addLayer({id:"tile-grid-line",type:"line",source:"tile-grid-data",
      paint:{"line-color":"#f0933d","line-opacity":0.65,"line-width":1}});
    drawGrid();
  }
  map.on("style.load",overlay);
  map.on("moveend",()=>{
    const center=map.getCenter();
    $("coordinates").textContent=center.lat.toFixed(4)+"°, "+center.lng.toFixed(4)+"° · z"+map.getZoom().toFixed(1);
    drawGrid();
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
  }
  function switchBase() {
    const selected=BASES[state.baseId];
    if (selected.needsKey && !state.cartoKey) {
      setStatus(selected.name+" requires your CARTO basemap API key. Enter one in the sidebar.");
    } else {
      setStatus("Rust/WASM ready · "+selected.name+" · requests restricted to study region.");
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
  $("tile-grid").addEventListener("change",event=>{
    state.showGrid=event.target.checked;
    drawGrid();
  });
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
