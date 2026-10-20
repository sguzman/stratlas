// Coarse, source-backed views before individual features are legible.
// This is a display-level change, not a request for all parcel polygons.
// Rectangular cells represent query envelopes, never official boundaries.
const ZONING="https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query";
const PARCEL="https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0/query";
const COUNTY="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/82/query";
const ACS="https://api.censusreporter.org/1.0/data/show/acs2024_5yr";
const extent={
  zoning:[-118.67,33.70,-118.15,34.34],
  parcel:[-118.95,32.70,-117.64,34.85],
  census:[-118.95,32.70,-117.64,34.85]
};
const thresholds={zoning:13,parcel:16,census:12};
const colors={
  zoning:["match",["get","CATEGORY"],
    "Agricultural","#8bcf8a","Commercial","#ed777e","Commercial-Mixed","#ca689a",
    "Manufacturing","#82c5d8","Multiple Family Residential","#f9c14c",
    "Single Family Residential","#eddf9e","Residential","#f3b943",
    "Residential-Mixed","#ad8544","Open Space","#80c67d",
    "Public Facilities","#87b5c1","Public","#6bb0c5",
    "Industrial","#668ca6","Industrial-Mixed","#996ab0",
    "Hybrid Industrial","#9071b4","Parking","#bcc3cb",
    "Freeway","#9ea9b0","#9da8ae"],
  parcel:["case",["<",["to-number",["get","Roll_LandValue"],-1],0],"#a0a9ad",
    ["step",["to-number",["get","Roll_LandValue"],-1],
      "#cee9db",50000,"#93d1b8",150000,"#56aca7",300000,"#488db1",
      600000,"#646b9f",1200000,"#8b4e91"]],
};
const censusMetrics={
  income:["acs_income",[0,30000,60000,90000,130000,200000],
    ["#304f91","#5689b9","#91c0c1","#e2ce7d","#de9755","#ba4a3f"]],
  population:["acs_population",[0,1000000,3000000,5000000,7000000,10000000],
    ["#eef2e6","#cadacc","#93c4ae","#54a594","#267880","#214b72"]],
  hispanic:["acs_hispanic_pct",[0,20,40,60,80,100],
    ["#edf2f4","#bfd7e5","#86b4cf","#568bad","#37618c","#2b3e68"]],
  female:["acs_female_pct",[0,20,40,50,60,100],
    ["#eff0e4","#cdd9c0","#a7cba2","#73a58e","#487c86","#305b76"]],
  white:["acs_nh_white_pct",[0,20,40,60,80,100],
    ["#f3f0e8","#e9d4ac","#d5b285","#af8f76","#777a7b","#3c637d"]]
};
const EMPTY=()=>({type:"FeatureCollection",features:[]});
function intersect(a,b){
  if(!a||!b)return null;
  const c=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),
    Math.min(a[2],b[2]),Math.min(a[3],b[3])];
  return c[0]<c[2]&&c[1]<c[3]?c:null;
}
function viewport(map){
  const b=map.getBounds();
  return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
}
function rect(box){
  const [w,s,e,n]=box;
  return {type:"Polygon",coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
}
// Quantized, repeatable source query envelopes. Coarsen until a broad view
// needs at most nine requests, even when a small study rectangle is zoomed out.
export function overviewCells(scope,region,kind,zoom){
  const clip=intersect(intersect(scope,region),extent[kind]);
  if(!clip)return [];
  let step=kind==="parcel"
    ? (zoom<7?0.6:zoom<10?0.22:zoom<13?0.065:0.018)
    : (zoom<7?0.5:zoom<10?0.18:0.05);
  const counts=size=>[
    Math.ceil(clip[2]/size)-Math.floor(clip[0]/size),
    Math.ceil(clip[3]/size)-Math.floor(clip[1]/size)
  ];
  for(let tries=0;tries<12;tries++){
    const [nx,ny]=counts(step);
    if(nx*ny<=9)break;
    step*=2;
  }
  const result=[];
  const [w,s,e,n]=clip;
  const x0=Math.floor(w/step),x1=Math.ceil(e/step);
  const y0=Math.floor(s/step),y1=Math.ceil(n/step);
  for(let x=x0;x<x1;x++)for(let y=y0;y<y1;y++){
    const box=intersect(intersect([x*step,y*step,(x+1)*step,(y+1)*step],region),extent[kind]);
    if(box)result.push({key:kind+":"+step.toFixed(8)+":"+x+":"+y,
      box:box.map(v=>Number(v.toFixed(6)))});
  }
  return result.slice(0,9);
}
function statsUrl(kind,box){
  const outStatistics=kind==="zoning"
    ? [{statisticType:"count",onStatisticField:"OBJECTID",outStatisticFieldName:"n"}]
    : [
      {statisticType:"count",onStatisticField:"OBJECTID",outStatisticFieldName:"n"},
      {statisticType:"avg",onStatisticField:"Roll_LandValue",outStatisticFieldName:"avg_value"}
    ];
  return (kind==="zoning"?ZONING:PARCEL)+"?"+new URLSearchParams({
    where:"1=1",geometry:box.join(","),geometryType:"esriGeometryEnvelope",
    inSR:"4326",spatialRel:"esriSpatialRelIntersects",
    ...(kind==="zoning"?{groupByFieldsForStatistics:"CATEGORY"}:{}),
    outStatistics:JSON.stringify(outStatistics),returnGeometry:"false",f:"json"
  });
}
export function arcgisSummary(kind,body,box){
  if(body?.error)throw Error(body.error.message||"Provider statistics unavailable");
  if(!Array.isArray(body?.features))throw Error("Provider statistics response invalid");
  if(kind==="zoning"){
    const values=body.features.map(f=>f.attributes||{});
    const ranked=values.filter(a=>Number(a.n)>0)
      .sort((a,b)=>Number(b.n)-Number(a.n));
    if(!ranked.length)return null;
    return {type:"Feature",geometry:rect(box),
      properties:{CATEGORY:String(ranked[0].CATEGORY??"Other / unclassified"),
        count:ranked.reduce((n,a)=>n+Number(a.n||0),0),
        category_count:Number(ranked[0].n),
        scope:"Category with most intersecting zoning polygons; not area share"}};
  }
  const a=body.features[0]?.attributes||{};
  if(!(Number(a.n)>0))return null;
  const avg=a.avg_value===null?null:Number(a.avg_value);
  return {type:"Feature",geometry:rect(box),properties:{
    Roll_LandValue:Number.isFinite(avg)&&avg>=0?avg:null,
    count:Number(a.n),scope:"Mean assessed land value of intersecting parcels; not a sale price"
  }};
}
function stat(record,table,key){
  const raw=record?.[table]?.estimate?.[key];
  if(raw===null||raw===undefined)return null;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0?n:null;
}
function pct(a,b){return a!==null&&b!==null&&b>0&&a<=b?a/b*100:null}
export function countyValues(body){
  const r=body?.data?.["05000US06037"];
  if(!r)throw Error("County ACS record missing");
  const population=stat(r,"B01001","B01001001");
  const ethTotal=stat(r,"B03002","B03002001");
  return {
    acs_income:stat(r,"B19013","B19013001"),
    acs_population:population,
    acs_hispanic_pct:pct(stat(r,"B03002","B03002012"),ethTotal),
    acs_female_pct:pct(stat(r,"B01001","B01001026"),population),
    acs_nh_white_pct:pct(stat(r,"B03002","B03002003"),ethTotal)
  };
}
function censusColor(metric){
  const [field,stops,palette]=censusMetrics[metric]||censusMetrics.income;
  return ["case",["==",["get",field],null],"#a5adb4",
    ["interpolate",["linear"],["get",field],
      ...stops.flatMap((s,i)=>[s,palette[i]])]];
}
export function createWideOverview(map,{getRegion,dataCache,onStatus,filterFeatures}){
  const flags={zoning:false,parcel:false,census:"off"};
  const records={zoning:new Map(),parcel:new Map()};
  const generations={zoning:0,parcel:0,census:0};
  const aborts={zoning:null,parcel:null,census:null};
  let countyFeature=null,countyValuesRecord=null;
  const opacity={zoning:0.42,parcel:0.66};
  const active=kind=>kind==="census"?flags.census!=="off":flags[kind];
  const isWide=kind=>active(kind)&&map.getZoom()<thresholds[kind];
  function report(kind,message){if(isWide(kind))onStatus(kind,message)}
  function source(kind){return map.getSource("stratlas-"+kind+"-overview")}
  function ensure(kind){
    const id="stratlas-"+kind+"-overview";
    if(!source(kind))map.addSource(id,{type:"geojson",data:EMPTY()});
    const fill=id+"-fill",stroke=id+"-outline";
    if(!map.getLayer(fill))map.addLayer({id:fill,type:"fill",source:id,
      paint:{"fill-color":kind==="census"?censusColor(flags.census):colors[kind],
        "fill-opacity":kind==="census"?0.50:opacity[kind]}});
    if(!map.getLayer(stroke))map.addLayer({id:stroke,type:"line",source:id,
      paint:{"line-color":"#203746","line-width":1.2,"line-opacity":0.70}});
  }
  function visibility(kind){
    const show=isWide(kind);
    if(kind==="census"&&typeof document!=="undefined"&&flags.census==="population"){
      const legend=document.getElementById("acs-legend");
      const label=legend?.querySelector(".legend-label");
      const end=legend?.querySelector(".legend-range span:last-child");
      if(label)label.textContent=show
        ? "County population · people (total)"
        : "Population · people / tract";
      if(end)end.textContent=show?"10,000,000+":"8,000+";
    }
    for(const id of ["stratlas-"+kind+"-overview-fill","stratlas-"+kind+"-overview-outline"])
      if(map.getLayer(id))map.setLayoutProperty(id,"visibility",show?"visible":"none");
    // Avoid double painting retained detailed polygons below the transition.
    const detail={
      zoning:["la-zoning-fill","la-zoning-line","la-zoning-highlight"],
      parcel:["assessor-land-fill","assessor-land-line"],
      census:["acs-tract-fill","acs-tract-outline"]
    };
    for(const id of detail[kind])
      if(map.getLayer(id))map.setLayoutProperty(id,"visibility",
        !active(kind)||show?"none":"visible");
  }
  function publish(kind){
    if(!source(kind))return;
    let features=[];
    if(kind==="census"){
      if(countyFeature&&countyValuesRecord){
        const f={...countyFeature,properties:{...countyFeature.properties,...countyValuesRecord}};
        features=JSON.parse(filterFeatures(JSON.stringify({
          type:"FeatureCollection",features:[f]
        }),...getRegion())).features;
      }
    }else{
      const view=intersect(viewport(map),getRegion());
      if(view)for(const x of records[kind].values())
        if(x&&intersect(bbox(x.geometry),view))features.push(x);
    }
    source(kind).setData({type:"FeatureCollection",features});
  }
  function bbox(geometry){
    const ring=geometry.coordinates[0];
    return [Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),
      Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
  }
  async function request(url,kind,signal,ttl){
    if(dataCache)return dataCache.fetchJson(url,{
      namespace:"stratlas-overview-"+kind+"-v1",ttlMs:ttl,signal
    });
    const r=await fetch(url,{signal,cache:"default",mode:"cors"});
    if(!r.ok)throw Error("Overview source HTTP "+r.status);
    return r.json();
  }
  async function runGrid(kind,gen,signal){
    const areas=overviewCells(viewport(map),getRegion(),kind,map.getZoom());
    if(!areas.length){report(kind,"Outside source coverage · no summary available");return}
    const missing=areas.filter(a=>!records[kind].has(a.key));
    publish(kind);
    if(!missing.length){
      report(kind,"Overview: "+areas.length+" source-backed cells reused · zoom in for individual polygons");
      return;
    }
    report(kind,"Overview: "+(areas.length-missing.length)+"/"+areas.length+
      " cells available · loading source statistics");
    let cursor=0,failed=0,completed=0;
    async function worker(){
      while(cursor<missing.length && !signal.aborted && generations[kind]===gen){
        const area=missing[cursor++];
        try{
          const data=await request(statsUrl(kind,area.box),kind,signal,
            kind==="zoning"?6*3600000:24*3600000);
          if(signal.aborted||generations[kind]!==gen)return;
          const f=arcgisSummary(kind,data,area.box);
          if(f){f.properties.cell_key=area.key;records[kind].set(area.key,f)}
          else records[kind].set(area.key,null);
          while(records[kind].size>128)records[kind].delete(records[kind].keys().next().value);
          completed++;
          // MapLibre re-renders after each cell, without waiting for the last.
          publish(kind);
          report(kind,"Overview: "+(areas.length-missing.length+completed)+"/"+
            areas.length+" geographic cells · "+(failed?"some unavailable · ":"")+
            "zoom in for individual polygons");
        }catch(e){
          if(signal.aborted||generations[kind]!==gen)return;
          failed++;
          report(kind,"Overview: "+completed+" cells loaded · source error: "+e.message);
        }
      }
    }
    await Promise.all([worker(),worker()]);
  }
  async function runCounty(gen,signal){
    // A county-wide statistic must never be mislabeled as a city value.
    const region=getRegion();
    if(region[0]>extent.census[0]||region[1]>extent.census[1]||
       region[2]<extent.census[2]||region[3]<extent.census[3]){
      report("census","County ACS summary cannot represent a smaller study region · "+
        "zoom in for tract data");
      return;
    }
    report("census","ACS: loading LA County summary (tract detail on closer zoom)…");
    try{
      const geometryUrl=COUNTY+"?"+new URLSearchParams({
        where:"STATE='06' AND COUNTY='037'",outFields:"GEOID,NAME",
        outSR:"4326",geometryPrecision:"4",returnGeometry:"true",f:"geojson"
      });
      const statsUrl=ACS+"?"+new URLSearchParams({
        table_ids:"B01001,B03002,B19013",geo_ids:"05000US06037"
      });
      const [geo,stats]=await Promise.all([
        countyFeature?Promise.resolve(null):request(geometryUrl,"census-county-geometry",signal,30*86400000),
        countyValuesRecord?Promise.resolve(null):request(statsUrl,"census-county-acs2024",signal,90*86400000)
      ]);
      if(signal.aborted||generations.census!==gen)return;
      if(geo){
        if(geo?.error)throw Error(geo.error.message);
        const f=geo.features?.find(f=>f.geometry?.type==="Polygon"||f.geometry?.type==="MultiPolygon");
        if(!f)throw Error("County boundary unavailable");
        countyFeature=f;
      }
      if(stats)countyValuesRecord=countyValues(stats);
      publish("census");
      report("census","ACS county-wide summary · 2020–2024 estimates · zoom in for tract detail");
    }catch(e){
      if(!signal.aborted&&gen===generations.census)
        report("census","County summary source unavailable: "+e.message);
    }
  }
  function refresh(kind){
    generations[kind]++;
    aborts[kind]?.abort();
    aborts[kind]=null;
    ensure(kind);
    visibility(kind);
    if(!isWide(kind))return;
    if(kind==="census"){
      map.setPaintProperty("stratlas-census-overview-fill","fill-color",censusColor(flags.census));
      publish(kind);
      if(countyFeature&&countyValuesRecord){
        report(kind,"ACS county-wide summary · 2020–2024 estimates · zoom in for tract detail");
        return;
      }
    }
    const ctrl=new AbortController();aborts[kind]=ctrl;
    void (kind==="census"
      ? runCounty(generations[kind],ctrl.signal)
      : runGrid(kind,generations[kind],ctrl.signal));
  }
  function refreshAll(){for(const kind of ["zoning","parcel","census"])refresh(kind)}
  function set(kind,value){flags[kind]=value;refresh(kind)}
  function setOpacity(kind,value){
    if(!Number.isFinite(value))return;
    opacity[kind]=Math.max(0,Math.min(1,value));
    const fill="stratlas-"+kind+"-overview-fill";
    if(map.getLayer(fill))map.setPaintProperty(fill,"fill-opacity",opacity[kind]);
  }
  function reset(reload=true){
    for(const kind of ["zoning","parcel","census"]){
      generations[kind]++;aborts[kind]?.abort();aborts[kind]=null;
    }
    for(const kind of ["zoning","parcel"])records[kind].clear();
    countyFeature=null;countyValuesRecord=null;
    if(reload)refreshAll();
    else for(const kind of ["zoning","parcel","census"]){
      if(source(kind))source(kind).setData(EMPTY());
    }
  }
  map.on("click",event=>{
    if(typeof document==="undefined"||typeof window==="undefined"||
      !window.maplibregl?.Popup)return;
    const pairs=["zoning","parcel","census"].filter(isWide)
      .filter(kind=>map.getLayer("stratlas-"+kind+"-overview-fill"));
    if(!pairs.length)return;
    const hits=map.queryRenderedFeatures(event.point,{
      layers:pairs.map(k=>"stratlas-"+k+"-overview-fill")
    });
    const feature=hits[0];if(!feature)return;
    const data=feature.properties||{};
    const title=feature.layer.id.includes("zoning")
      ? "Zoning summary · intersecting polygons"
      :feature.layer.id.includes("parcel")
      ? "Assessed parcel summary · USD"
      :"LA County ACS summary · 2020–2024";
    const fields=feature.layer.id.includes("zoning")
      ? [["Most common category",data.CATEGORY],
         ["Polygons intersecting cell",data.count],
         ["Polygons in leading category",data.category_count]]
      :feature.layer.id.includes("parcel")
      ? [["Mean assessed land value",data.Roll_LandValue===null?
          "Unavailable":Number(data.Roll_LandValue).toLocaleString("en-US",{
            style:"currency",currency:"USD",maximumFractionDigits:0})],
         ["Parcels intersecting cell",data.count]]
      : [["Median household income (USD)",data.acs_income],
         ["County population",data.acs_population],
         ["Hispanic or Latino (%)",data.acs_hispanic_pct],
         ["Female (%)",data.acs_female_pct],
         ["Non-Hispanic White alone (%)",data.acs_nh_white_pct]];
    const root=document.createElement("div"),heading=document.createElement("strong");
    heading.textContent=title;root.append(heading);
    for(const [name,value] of fields){
      const line=document.createElement("div");
      line.textContent=name+": "+(value===null||value===undefined?"Unavailable":value);
      root.append(line);
    }
    const footer=document.createElement("small");
    footer.textContent=feature.layer.id.includes("zoning")
      ?"Count of intersecting polygons, not percentage of land area."
      :feature.layer.id.includes("parcel")
      ?"Assessed tax-roll value, not a market or sale price."
      :"County aggregate, not a tract estimate or household attribute.";
    root.append(footer);
    new window.maplibregl.Popup().setLngLat(event.lngLat)
      .setDOMContent(root).addTo(map);
  });
  map.on("moveend",refreshAll);
  map.on("style.load",refreshAll);
  return {setZoning:value=>set("zoning",Boolean(value)),
    setParcel:value=>set("parcel",Boolean(value)),
    setCensus:value=>set("census",value),
    setZoningOpacity:value=>setOpacity("zoning",value),
    setParcelOpacity:value=>setOpacity("parcel",value),
    refreshAll,reset,isWide};
}
