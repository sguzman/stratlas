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
  let metric="off",token=0,abort=null,lastData=empty(),movementTimer=null;
  const tabulations=new Map();
  const retained=new Map();
  // Successful viewport subdivisions are remembered as geographic coverage,
  // so a pan only fetches previously unseen strips, not the whole viewport.
  const covered=[];
  const MAX_RETAINED=3000,MAX_COVERAGE=128,MAX_DEPTH=6;
  const report=message=>onStatus(message);
  const geokey=box=>box.map(n=>n.toFixed(5)).join(",");
  function cancel(){
    token++;
    abort?.abort();
    abort=null;
    if(movementTimer!==null){clearTimeout(movementTimer);movementTimer=null}
  }
  function source(){return map.getSource(SOURCE)}
  function ensureLayer(){
    if(source())return;
    map.addSource(SOURCE,{type:"geojson",data:lastData});
    map.addLayer({id:FILL,source:SOURCE,type:"fill",
      paint:{"fill-color":colorExpression(metric==="off"?"income":metric),"fill-opacity":0.54}});
    map.addLayer({id:OUTLINE,source:SOURCE,type:"line",
      paint:{"line-color":"#243845","line-opacity":0.55,"line-width":0.55}});
  }
  function visibility(){
    for(const id of [FILL,OUTLINE]){
      if(map.getLayer(id))map.setLayoutProperty?.(id,"visibility",metric==="off"?"none":"visible");
    }
  }
  function render(){
    if(!source())return;
    source().setData(lastData);
    if(metric!=="off" && map.getLayer(FILL))
      map.setPaintProperty(FILL,"fill-color",colorExpression(metric));
    visibility();
  }
  function publish(){
    // Keep previously visited tracts, including values that haven't yet
    // completed a stats query. The study rectangle still controls visibility.
    lastData=JSON.parse(filterFeatures(JSON.stringify({
      type:"FeatureCollection",features:[...retained.values()]
    }),...getRegion()));
    render();
  }
  function merge(features){
    let changed=false;
    for(const f of features){
      const id=f.properties?.GEOID;
      if(!validateGeoid(id))continue;
      const previous=retained.get(id);
      // A geometry refresh must not erase previously enriched ACS statistics.
      if(previous)f.properties={...previous.properties,...f.properties};
      retained.delete(id);retained.set(id,f);changed=true;
      while(retained.size>MAX_RETAINED){
        retained.delete(retained.keys().next().value);
        // A previously completed area might now be missing features.
        covered.length=0;
      }
    }
    if(changed)publish();
  }
  function subtractBox(rect,used){
    const joint=intersect(rect,used);
    if(!joint)return [rect];
    const [w,s,e,n]=rect,[iw,is,ie,inorth]=joint;
    const candidates=[
      [w,s,iw,n],[ie,s,e,n],
      [iw,s,ie,is],[iw,inorth,ie,n]
    ];
    return candidates.filter(b=>b[0]<b[2]&&b[1]<b[3]);
  }
  function missingAreas(rect){
    let remaining=[rect];
    for(const section of covered){
      remaining=remaining.flatMap(b=>subtractBox(b,section));
      if(!remaining.length)break;
      // In heavily revisited geography, avoid pathological fragmentation.
      if(remaining.length>64)return [rect];
    }
    return remaining;
  }
  function rememberCovered(box){
    covered.push(box);
    if(covered.length>MAX_COVERAGE)covered.shift();
  }
  function validateShapes(body){
    if(body?.error)throw Error(body.error.message||"TIGERweb GIS error");
    if(body?.type!=="FeatureCollection"||!Array.isArray(body.features))
      throw Error("TIGERweb did not return GeoJSON");
    return body;
  }
  // A dense viewport is split into smaller independent requests. Three
  // concurrent geometry requests avoid serial network latency without
  // flooding the public TIGERweb service.
  async function loadGeometry(rectangles,controller,budget,current){
    const queue=rectangles.map(box=>({box,depth:0}));
    const active=new Set();
    async function fetchOne({box,depth}){
      const url=shapeUrl(box);
      const body=validateShapes(dataCache
        ? await dataCache.fetchJson(url,{
            namespace:"tigerweb-tracts-acs2024-v1",
            ttlMs:30*24*60*60*1000,signal:controller.signal
          })
        : await (async()=>{
            const response=await fetch(url,{signal:controller.signal,cache:"default",mode:"cors"});
            if(!response.ok)throw Error("TIGERweb HTTP "+response.status);
            return response.json();
          })());
      if(controller.signal.aborted||current!==token)return;
      if(body.features.length>MAX_TRACTS||body.exceededTransferLimit){
        const [w,s,e,n]=box,mx=(w+e)/2,my=(s+n)/2;
        if(depth>=MAX_DEPTH||mx===w||mx===e||my===s||my===n){
          budget.incomplete=true;
          return;
        }
        // Queue within the already requested rectangle, never outside it.
        // Breadth-first subdivision distributes early results across the view.
        queue.push(
          {box:[w,s,mx,my],depth:depth+1},
          {box:[mx,s,e,my],depth:depth+1},
          {box:[w,my,mx,n],depth:depth+1},
          {box:[mx,my,e,n],depth:depth+1}
        );
        return;
      }
      const seen=new Set();
      const features=body.features.filter(f=>{
        const id=f.properties?.GEOID;
        if(!validateGeoid(id)||seen.has(id))return false;
        seen.add(id);return true;
      });
      const clipped=JSON.parse(filterFeatures(JSON.stringify({
        type:"FeatureCollection",features
      }),...getRegion()));
      merge(clipped.features); // publish geometry immediately
      rememberCovered(box);
      budget.completed++;
    }
    while((queue.length||active.size)&&current===token&&!controller.signal.aborted){
      while(queue.length&&active.size<3){
        const task=queue.shift();
        budget.calls++;
        const request=fetchOne(task);
        active.add(request);
        // The finally callback is side-effect only; don't create an
        // unobserved rejecting promise by ignoring Promise.finally().
        request.then(()=>active.delete(request),()=>active.delete(request));
      }
      if(!active.size)break;
      await Promise.race(active);
    }
  }
  function applyStats(ids,data){
    const features=[];
    for(const id of ids){
      const feature=retained.get(id);
      if(feature)features.push(feature);
    }
    if(!features.length)return;
    const enriched=JSON.parse(enrichFeatures(JSON.stringify({
      type:"FeatureCollection",features
    }),JSON.stringify({data})));
    merge(enriched.features); // recolor each completed group without waiting
  }
  async function loadStats(controller,current){
    const ids=[...retained.keys()].filter(id=>!tabulations.has(id));
    if(!ids.length)return 0;
    const groups=[];
    for(let i=0;i<ids.length;i+=BATCH)groups.push(ids.slice(i,i+BATCH));
    report("ACS: "+retained.size+" tract boundaries ready · loading "+
      ids.length+" estimates in "+groups.length+" batches…");
    let next=0,finished=0,failed=0;
    async function worker(){
      while(next<groups.length){
        if(controller.signal.aborted||current!==token)return;
        const group=groups[next++];
        const url=statsUrl(group);
        let body;
        try{
          body=dataCache
            ? await dataCache.fetchJson(url,{
                namespace:"censusreporter-acs2024-5yr-v1",
                ttlMs:90*24*60*60*1000,signal:controller.signal
              })
            : await (async()=>{
                const response=await fetch(url,{signal:controller.signal,cache:"default",mode:"cors"});
                if(!response.ok)throw Error("Census Reporter HTTP "+response.status);
                return response.json();
              })();
          if(!body?.data||typeof body.data!=="object")
            throw Error("Census Reporter statistics unavailable");
        }catch(error){
          if(controller.signal.aborted||current!==token)return;
          failed++;
          report("ACS: "+retained.size+" shapes retained · statistics delayed: "+error.message);
          continue; // other independent groups can still finish
        }
        if(controller.signal.aborted||current!==token)return;
        const joined={};
        for(const id of group){
          const record=body.data["14000US"+id]||null;
          tabulations.set(id,record);
          if(record)joined["14000US"+id]=record;
        }
        applyStats(group,joined); // incremental coloring
        finished+=group.length;
        report("ACS: "+retained.size+" tracts · statistics received for "+
          finished+"/"+ids.length+" new tracts.");
      }
    }
    // Two bounded concurrent requests reduce high-latency serial waits
    // without flooding the public statistics provider.
    await Promise.all(Array.from({length:Math.min(2,groups.length)},()=>worker()));
    return failed;
  }
  async function reload(){
    if(metric==="off")return;
    ensureLayer();
    if(map.getZoom()<MIN_ZOOM){
      cancel();
      report("ACS: "+retained.size+" retained tracts stay visible · zoom to "+
        MIN_ZOOM+"+ to load new geography.");return;
    }
    const scope=intersect(intersect(view(map),getRegion()),COUNTY);
    if(!scope){
      cancel();
      report("ACS: "+retained.size+" retained tracts · outside LA coverage.");return;
    }
    // Coordinate snapping is bounded by the study/source scope.
    const bbox=intersect(intersect(snap(scope),getRegion()),COUNTY);
    if(!bbox)return;
    const missing=missingAreas(bbox);
    const needStats=[...retained.keys()].some(id=>!tabulations.has(id));
    if(!missing.length&&!needStats){
      report("ACS: "+retained.size+" tracts available · no new API requests.");
      return;
    }
    cancel();
    const current=token,controller=new AbortController();
    abort=controller;
    const budget={calls:0,completed:0,incomplete:false};
    try{
      if(missing.length){
        report("ACS: loading "+missing.length+" previously unseen geographic section(s)…");
        // Region subtraction means a pan queries only unseen pieces.
        // Concurrent requests publish each completed rectangle immediately.
        await loadGeometry(missing,controller,budget,current);
      }
      if(current!==token||controller.signal.aborted)return;
      if(budget.incomplete)
        report("ACS: "+retained.size+" tracts retained · detail still loading as you navigate.");
      const statsFailed=await loadStats(controller,current);
      if(current!==token||controller.signal.aborted)return;
      abort=null;
      const n=lastData.features.filter(f=>f.properties?.[METRICS[metric].key]!=null).length;
      report("ACS 2020–2024 · "+n+"/"+lastData.features.length+" visible tracts with "+
        METRICS[metric].label.toLowerCase()+" estimates"+
        (budget.incomplete?" · additional dense sections available on closer navigation":"")+
        (statsFailed?" · some estimates delayed (retry on navigation)":""));
    }catch(error){
      if(current!==token||controller.signal.aborted)return;
      // Abort sibling geometry requests when one source request fails.
      // Successful regions remain retained, but late responses from this
      // failed navigation must not overwrite the visible state.
      controller.abort();
      abort=null;
      report("ACS: "+retained.size+" tracts retained · provider request failed: "+error.message);
    }
  }
  function setMetric(next){
    if(next!=="off"&&!METRICS[next])throw Error("Unknown ACS metric");
    const previous=metric;
    metric=next;
    legend(legendContainer,metric);
    if(metric==="off"){
      cancel();visibility();
      report("ACS hidden · "+retained.size+" tracts retained.");return;
    }
    ensureLayer();publish();
    if(previous!=="off"&&lastData.features.length){
      report("ACS 2020–2024 · "+retained.size+" retained tracts");return;
    }
    reload();
  }
  function reset(){
    cancel();publish();
    if(metric!=="off")reload();
  }
  map.on("style.load",()=>{
    cancel();ensureLayer();publish();
    if(metric!=="off")reload();
  });
  map.on("moveend",()=>{
    if(metric==="off")return;
    if(movementTimer!==null)clearTimeout(movementTimer);
    movementTimer=setTimeout(()=>{movementTimer=null;reload()},140);
  });
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
      line.textContent=label+": "+value;root.append(line);
    }
    const foot=document.createElement("small");
    foot.textContent="ACS 2020–2024 (5-year estimates). Not individual attributes.";
    root.append(foot);
    new window.maplibregl.Popup().setLngLat(event.lngLat)
      .setDOMContent(root).addTo(map);
  });
  return {setMetric,onRegionChange:reset,
    clearMemory:()=>{covered.length=0;tabulations.clear()}};
}
