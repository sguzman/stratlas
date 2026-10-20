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
  let active=false,opacity=0.42,hover=null,generation=0,abort=null,debounce=null;
  let completeKey="",loadingKey="";
  const polygons=new Map(),knownWindows=new Map();
  const MAX_POLYGONS=12000,MAX_WINDOWS=32;
  const status=message=>onStatus(message);
  function cancel(){
    generation++;
    abort?.abort();abort=null;loadingKey="";
    if(debounce!==null){clearTimeout(debounce);debounce=null}
  }
  function source(){return map.getSource(SOURCE)}
  function publish(){
    if(!source())return;
    const clipped=JSON.parse(filterFeatures(JSON.stringify({
      type:"FeatureCollection",features:[...polygons.values()]
    }),...getRegion()));
    source().setData(clipped);
  }
  function merge(features){
    let updated=0;
    for(const feature of features){
      const id=feature.properties?.OBJECTID??feature.id;
      if(!validId(id))continue;
      const key=Number(id);
      polygons.delete(key);
      polygons.set(key,feature);
      updated++;
      while(polygons.size>MAX_POLYGONS){
        polygons.delete(polygons.keys().next().value);
        // Eviction means a viewport may need missing IDs fetched again.
        completeKey="";
      }
    }
    if(updated)publish();
    return updated;
  }
  function rememberWindow(key,ids){
    knownWindows.delete(key);
    knownWindows.set(key,ids);
    while(knownWindows.size>MAX_WINDOWS)knownWindows.delete(knownWindows.keys().next().value);
  }
  function applyPaint(){
    if(map.getLayer(FILL)){
      const dim=Math.max(0.025,opacity*0.14);
      map.setPaintProperty(FILL,"fill-opacity",
        hover===null?opacity:["case",activeFilter(hover),opacity,dim]);
    }
    if(map.getLayer(HIGHLIGHT)){
      map.setFilter(HIGHLIGHT,hover===null?noHighlight:activeFilter(hover));
    }
  }
  function visibility(){
    for(const id of [FILL,LINE,HIGHLIGHT]){
      if(map.getLayer(id))map.setLayoutProperty(id,"visibility",active?"visible":"none");
    }
  }
  function ensureLayers(){
    if(!source())map.addSource(SOURCE,{type:"geojson",data:empty()});
    if(!map.getLayer(FILL))map.addLayer({id:FILL,type:"fill",source:SOURCE,
      paint:{"fill-color":categoricalPaint,"fill-opacity":opacity}});
    if(!map.getLayer(LINE))map.addLayer({id:LINE,type:"line",source:SOURCE,
      paint:{"line-color":"#233645","line-opacity":0.53,"line-width":0.5}});
    if(!map.getLayer(HIGHLIGHT))map.addLayer({id:HIGHLIGHT,type:"line",source:SOURCE,
      filter:noHighlight,paint:{"line-color":"#ffdf63","line-width":2.6,"line-opacity":1}});
    visibility();applyPaint();
  }
  function highlight(category){
    hover=active?category:null;
    applyPaint();
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
      const text=document.createElement("span");text.textContent=name;
      entry.append(swatch,text);
      entry.addEventListener("mouseenter",()=>highlight(name));
      entry.addEventListener("mouseleave",()=>highlight(null));
      entry.addEventListener("focus",()=>highlight(name));
      entry.addEventListener("blur",()=>highlight(null));
      grid.append(entry);
    }
    const note=document.createElement("p");note.className="meta";
    note.textContent="Hover or focus a category to highlight all loaded matching polygons.";
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
  async function load(){
    if(!active)return;
    ensureLayers();
    if(map.getZoom()<MIN_ZOOM){
      cancel();status("Zoning: "+polygons.size+" polygons retained · zoom to "+
        MIN_ZOOM+"+ to load new areas.");return;
    }
    const region=getRegion();
    const scope=intersect(intersect(viewport(map),region),COVERAGE);
    if(!scope){
      cancel();status("Zoning: "+polygons.size+" retained · outside Los Angeles City coverage.");return;
    }
    const box=intersect(intersect(snapped(scope),region),COVERAGE);
    if(!box)return;
    const key=box.map(v=>v.toFixed(5)).join(",");
    if(key===loadingKey)return;
    if(key===completeKey && knownWindows.get(key)?.every(id=>polygons.has(id))){
      status("Zoning: "+polygons.size+" polygons · current view already cached.");
      return;
    }
    cancel();
    const current=generation,controller=new AbortController();
    abort=controller;loadingKey=key;
    try{
      status("Zoning: identifying visible polygons · "+polygons.size+" retained…");
      let ids=knownWindows.get(key);
      if(!ids){
        const body=await json(idsUrl(box),controller,"la-zoning-ids-v1");
        if(body?.error)throw Error(body.error.message||"City Planning ID query error");
        if(!Array.isArray(body?.objectIds))throw Error("City Planning returned no object ID list");
        ids=[...new Set(body.objectIds.map(Number).filter(validId))];
        rememberWindow(key,ids);
      }
      if(controller.signal.aborted||current!==generation)return;
      const missing=ids.filter(id=>!polygons.has(id));
      if(!missing.length){
        completeKey=key;abort=null;loadingKey="";
        status("Zoning: "+polygons.size+" polygons · all "+ids.length+
          " visible polygons already cached.");return;
      }
      const batches=[];
      for(let i=0;i<missing.length;i+=IDS_PER_BATCH)
        batches.push(missing.slice(i,i+IDS_PER_BATCH));
      let next=0,loaded=0,failures=0;
      status("Zoning: "+ids.length+" visible polygons · loading "+
        missing.length+" missing · "+polygons.size+" retained…");
      async function worker(){
        while(next<batches.length){
          if(controller.signal.aborted||current!==generation)return;
          const group=batches[next++];
          try{
            const body=await json(featuresUrl(group),controller,"la-zoning-features-v1");
            if(controller.signal.aborted||current!==generation)return;
            const features=validFeatures(body);
            const clipped=JSON.parse(filterFeatures(JSON.stringify({
              type:"FeatureCollection",features
            }),...region));
            merge(clipped.features);
            loaded+=group.length;
            status("Zoning: loaded "+Math.min(loaded,missing.length)+"/"+missing.length+
              " missing polygons · "+polygons.size+" retained.");
          }catch(error){
            if(controller.signal.aborted||current!==generation)return;
            failures++;
            status("Zoning: "+polygons.size+" retained · batch failed: "+error.message);
          }
        }
      }
      await Promise.all(Array.from({length:Math.min(CONCURRENT_BATCHES,batches.length)},()=>worker()));
      if(controller.signal.aborted||current!==generation)return;
      abort=null;loadingKey="";
      const stillMissing=ids.filter(id=>!polygons.has(id)).length;
      if(!stillMissing)completeKey=key;
      status("Zoning: "+polygons.size+" retained · "+(ids.length-stillMissing)+
        "/"+ids.length+" in current view"+
        (stillMissing?" · "+stillMissing+" unavailable; revisit to retry":"")+
        (failures?" · "+failures+" failed batches":""));
    }catch(error){
      if(controller.signal.aborted||current!==generation)return;
      abort=null;loadingKey="";
      status("Zoning: "+polygons.size+" retained · GIS request failed: "+error.message);
    }
  }
  function setEnabled(enabled){
    active=Boolean(enabled);
    buildLegend();
    if(!active){
      cancel();highlight(null);visibility();
      status("Zoning hidden · "+polygons.size+" polygons retained.");return;
    }
    ensureLayers();publish();load();
  }
  function setOpacity(value){
    if(!Number.isFinite(value))return;
    opacity=Math.max(0,Math.min(1,value));
    applyPaint();
  }
  map.on("style.load",()=>{
    cancel();ensureLayers();publish();
    if(active)load();
  });
  map.on("moveend",()=>{
    if(!active)return;
    if(debounce!==null)clearTimeout(debounce);
    debounce=setTimeout(()=>{debounce=null;load()},160);
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
    onRegionChange:()=>{cancel();completeKey="";publish();if(active)load()},
    clearMemory:()=>{knownWindows.clear();completeKey=""}
  };
}
