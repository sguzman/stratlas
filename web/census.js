// U.S. Census tract boundaries: Census Bureau TIGERweb ACS 2024.
// Statistics: Census Reporter ACS 2024 five-year tables (2020-2024).
// The map never fetches an entire county; it queries visible tract geometry,
// then requests tabulations only for those geographic IDs.
const TRACTS="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query";
const ACS="https://api.censusreporter.org/1.0/data/show/acs2024_5yr";
const COUNTY=[-118.95,32.70,-117.64,34.85]; // conservative source coverage
const SOURCE="acs-tracts", FILL="acs-tract-fill", OUTLINE="acs-tract-outline";
const MAX_TRACTS=250, MIN_ZOOM=12, BATCH=40;
const empty=()=>({type:"FeatureCollection",features:[]});
const METRICS={
  income:{key:"acs_income",label:"Median household income",unit:"USD / household",breaks:[0,30000,60000,90000,130000,200000],
    colors:["#304f91","#5689b9","#91c0c1","#e2ce7d","#de9755","#ba4a3f"]},
  population:{key:"acs_population",label:"Population",unit:"people / tract",breaks:[0,1000,2000,3500,5000,8000],
    colors:["#eef2e6","#cadacc","#93c4ae","#54a594","#267880","#214b72"]},
  hispanic:{key:"acs_hispanic_pct",label:"Hispanic or Latino",unit:"% of tract residents",breaks:[0,20,40,60,80,100],
    colors:["#edf2f4","#bfd7e5","#86b4cf","#568bad","#37618c","#2b3e68"]},
  female:{key:"acs_female_pct",label:"Female",unit:"% of tract residents",breaks:[0,20,40,50,60,100],
    colors:["#eff0e4","#cdd9c0","#a7cba2","#73a58e","#487c86","#305b76"]},
  white:{key:"acs_nh_white_pct",label:"Non-Hispanic White alone",unit:"% of tract residents",breaks:[0,20,40,60,80,100],
    colors:["#f3f0e8","#e9d4ac","#d5b285","#af8f76","#777a7b","#3c637d"]}
};
export const censusMetrics=Object.keys(METRICS);
function intersect(a,b) {
  if(!a)return null;
  const c=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),
    Math.min(a[2],b[2]),Math.min(a[3],b[3])];
  return c[0]<c[2]&&c[1]<c[3]?c:null;
}
function view(map){
  const b=map.getBounds();
  return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
}
function snap(scope){
  // Grid-stable URLs improve browser HTTP cache reuse during nearby pans;
  // re-intersect after snapping, so no request escapes the selected rectangle.
  const step=0.008;
  return [Math.floor(scope[0]/step)*step,Math.floor(scope[1]/step)*step,
    Math.ceil(scope[2]/step)*step,Math.ceil(scope[3]/step)*step];
}
function shapeUrl(bbox) {
  const params=new URLSearchParams({
    where:"STATE='06' AND COUNTY='037'",
    geometry:bbox.map(v=>v.toFixed(5)).join(","),
    geometryType:"esriGeometryEnvelope",inSR:"4326",outSR:"4326",
    spatialRel:"esriSpatialRelIntersects",outFields:"GEOID,BASENAME",
    returnGeometry:"true",resultRecordCount:String(MAX_TRACTS+1),
    geometryPrecision:"5",f:"geojson"
  });
  return TRACTS+"?"+params.toString();
}
function statsUrl(ids) {
  return ACS+"?"+new URLSearchParams({
    table_ids:"B01001,B03002,B19013",
    geo_ids:ids.map(id=>"14000US"+id).join(",")
  });
}
function colorExpression(metric){
  const m=METRICS[metric];
  const gradient=["interpolate",["linear"],["get",m.key]];
  m.breaks.forEach((v,i)=>gradient.push(v,m.colors[i]));
  return ["case",["==",["get",m.key],null],"#a5adb4",gradient];
}
function legend(container,metric){
  if(!container)return;
  container.replaceChildren();
  const m=METRICS[metric];
  if(!m)return;
  const name=document.createElement("div");
  name.textContent=m.label+" · "+m.unit;
  name.className="legend-label";
  container.append(name);
  const gradient=document.createElement("div");
  gradient.className="legend-gradient";
  gradient.style.background="linear-gradient(90deg,"+m.colors.join(",")+")";
  container.append(gradient);
  const range=document.createElement("div");
  range.className="legend-range";
  const first=document.createElement("span");
  first.textContent=format(metric,m.breaks[0]);
  const last=document.createElement("span");
  last.textContent=format(metric,m.breaks.at(-1))+"+";
  range.append(first,last);container.append(range);
  const note=document.createElement("div");
  note.className="meta";
  note.textContent="Gray: unavailable or suppressed · 2020–2024 ACS estimates";
  container.append(note);
}
function format(metric,value){
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return "Unavailable";
  const n=Number(value);
  if(metric==="income")return n.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
  if(metric==="population")return Math.round(n).toLocaleString("en-US");
  return n.toFixed(1)+"%";
}
function validateGeoid(value){
  return typeof value==="string" && /^06\d{9}$/.test(value) && value.slice(2,5)==="037";
}

export function createCensusOverlay(map,{getRegion,enrichFeatures,filterFeatures,onStatus,legendContainer,dataCache}){
  let metric="off",token=0,abort=null,lastWindow="",lastData=empty();
  const windows=new Map(), tabulations=new Map();
  const report=message=>onStatus(message);
  function cancel(){
    token++;
    if(abort)abort.abort();
    abort=null;
  }
  function source(){
    return map.getSource(SOURCE);
  }
  function ensureLayer(){
    if(source())return;
    map.addSource(SOURCE,{type:"geojson",data:lastData});
    map.addLayer({id:FILL,source:SOURCE,type:"fill",
      paint:{"fill-color":colorExpression(metric==="off"?"income":metric),
        "fill-opacity":0.54}});
    map.addLayer({id:OUTLINE,source:SOURCE,type:"line",
      paint:{"line-color":"#243845","line-opacity":0.55,"line-width":0.55}});
  }
  function render(){
    if(!source())return;
    source().setData(lastData);
    if(metric!=="off" && map.getLayer(FILL))
      map.setPaintProperty(FILL,"fill-color",colorExpression(metric));
  }
  function wipe(message){
    lastData=empty();lastWindow="";render();report(message);
  }
  function cachePut(key,features){
    windows.delete(key);windows.set(key,features);
    if(windows.size>8)windows.delete(windows.keys().next().value);
  }
  async function reload(){
    if(metric==="off")return;
    ensureLayer();
    if(map.getZoom()<MIN_ZOOM){
      cancel();wipe("ACS: zoom to "+MIN_ZOOM+"+ to query visible census tracts.");return;
    }
    const scope=intersect(intersect(view(map),getRegion()),COUNTY);
    if(!scope){
      cancel();wipe("ACS: current view is outside Los Angeles County coverage.");return;
    }
    const bbox=intersect(intersect(snap(scope),getRegion()),COUNTY);
    if(!bbox)return;
    const key=bbox.map(n=>n.toFixed(5)).join(",");
    if(key===lastWindow && source())return;
    cancel();
    const current=token;
    const controller=new AbortController();
    abort=controller;lastWindow=key;
    try{
      let shapes=windows.get(key);
      if(!shapes){
        report("ACS: retrieving visible tract boundaries…");
        const url=shapeUrl(bbox);
        const body=dataCache
          ? await dataCache.fetchJson(url,{
              namespace:"tigerweb-tracts-acs2024-v1",
              ttlMs:30*24*60*60*1000,signal:controller.signal
            })
          : await (async()=>{
              const response=await fetch(url,{
                signal:controller.signal,cache:"default",mode:"cors"
              });
              if(!response.ok)throw Error("TIGERweb HTTP "+response.status);
              return response.json();
            })();
        if(body.error)throw Error(body.error.message||"TIGERweb GIS error");
        if(body.type!=="FeatureCollection"||!Array.isArray(body.features))
          throw Error("TIGERweb did not return GeoJSON");
        if(body.features.length>MAX_TRACTS||body.exceededTransferLimit)
          throw Error("Too many tracts in viewport; zoom closer (maximum 250).");
        shapes=JSON.parse(filterFeatures(JSON.stringify(body),...getRegion()));
        // Deduplicate before API requests. Never ask for non-LA tract GEOIDs.
        const seen=new Set();
        shapes.features=shapes.features.filter(f=>{
          const id=f.properties?.GEOID;
          if(!validateGeoid(id)||seen.has(id))return false;
          seen.add(id);return true;
        });
        cachePut(key,shapes);
      }
      if(current!==token)return;
      if(!shapes.features.length){
        lastData=empty();render();report("ACS: no tracts in this view.");return;
      }
      const needed=[...new Set(shapes.features.map(f=>f.properties.GEOID))]
        .filter(id=>!tabulations.has(id));
      if(needed.length)report("ACS: loading estimates for "+needed.length+" visible tracts…");
      for(let i=0;i<needed.length;i+=BATCH){
        const ids=needed.slice(i,i+BATCH);
        const url=statsUrl(ids);
        const body=dataCache
          ? await dataCache.fetchJson(url,{
              namespace:"censusreporter-acs2024-5yr-v1",
              ttlMs:90*24*60*60*1000,signal:controller.signal
            })
          : await (async()=>{
              const response=await fetch(url,{
                signal:controller.signal,cache:"default",mode:"cors"
              });
              if(!response.ok)throw Error("Census Reporter HTTP "+response.status);
              return response.json();
            })();
        if(!body.data || typeof body.data!=="object")
          throw Error("Census Reporter returned invalid statistics");
        // Cache all requested IDs, including missing ones, to avoid repeated misses.
        for(const id of ids){
          tabulations.set(id,body.data["14000US"+id]||null);
        }
        if(current!==token)return;
      }
      const data={data:{}};
      for(const feature of shapes.features){
        const id=feature.properties.GEOID;
        if(tabulations.get(id))data.data["14000US"+id]=tabulations.get(id);
      }
      lastData=JSON.parse(enrichFeatures(JSON.stringify(shapes),JSON.stringify(data)));
      if(current!==token)return;
      render();
      const n=lastData.features.filter(f=>f.properties?.[METRICS[metric].key]!==null
        && f.properties?.[METRICS[metric].key]!==undefined).length;
      report("ACS 2020–2024 · "+n+"/"+lastData.features.length+
        " tracts with "+METRICS[metric].label.toLowerCase()+" data");
    }catch(error){
      if(current!==token || controller.signal.aborted)return;
      wipe("ACS unavailable: "+error.message);
    }
  }
  function setMetric(next){
    if(next!=="off"&&!METRICS[next])throw Error("Unknown ACS metric");
    const previous=metric;
    metric=next;
    legend(legendContainer,metric);
    if(metric==="off"){
      cancel();wipe("ACS overlay disabled.");return;
    }
    ensureLayer();
    if(previous!=="off" && lastData.features.length) {
      render();
      report("ACS 2020–2024 · "+lastData.features.length+" census tracts");
      return;
    }
    reload();
  }
  function reset(){
    cancel();
    lastWindow="";lastData=empty();render();
    if(metric!=="off")reload();
  }
  map.on("style.load",()=>{
    cancel();lastWindow="";
    if(metric!=="off"){ensureLayer();render();reload()}
  });
  map.on("moveend",()=>{if(metric!=="off")reload()});
  map.on("click",event=>{
    if(metric==="off"||!map.getLayer(FILL))return;
    const found=map.queryRenderedFeatures(event.point,{layers:[FILL]});
    if(!found.length)return;
    const p=found[0].properties||{};
    const root=document.createElement("div");
    const h=document.createElement("strong");
    h.textContent="Census tract "+String(p.BASENAME||p.GEOID||"");
    root.append(h);
    const fields=[
      ["Median household income",format("income",p.acs_income)],
      ["Income margin of error (90%)",format("income",p.acs_income_moe)],
      ["Population",format("population",p.acs_population)],
      ["Hispanic / Latino",format("hispanic",p.acs_hispanic_pct)],
      ["Female",format("female",p.acs_female_pct)],
      ["Non-Hispanic White alone",format("white",p.acs_nh_white_pct)]
    ];
    for(const [label,value] of fields){
      const line=document.createElement("div");
      line.textContent=label+": "+value;
      root.append(line);
    }
    const foot=document.createElement("small");
    foot.textContent="ACS 2020–2024 (5-year estimates). Not individual attributes.";
    root.append(foot);
    new window.maplibregl.Popup().setLngLat(event.lngLat)
      .setDOMContent(root).addTo(map);
  });
  return {setMetric,onRegionChange:reset,clearMemory:()=>{windows.clear();tabulations.clear();lastWindow=""}};
}
