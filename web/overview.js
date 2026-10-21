// Real source statistics at broad map scales. No query envelope is painted:
// rectangular request bounds are not zoning, parcels, or statistical areas.
const ENDPOINTS={
  zoning:"https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query",
  parcel:"https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0/query",
  census:"https://api.censusreporter.org/1.0/data/show/acs2024_5yr"
};
const SCOPE={
  zoning:[-118.67,33.70,-118.15,34.34],
  parcel:[-118.95,32.70,-117.64,34.85],
  census:[-118.95,32.70,-117.64,34.85]
};
const DETAIL_ZOOM={zoning:13,parcel:16,census:12};
const empty=()=>({title:"",description:"",rows:[]});
function intersection(a,b){
  if(!a||!b)return null;
  const r=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),
    Math.min(a[2],b[2]),Math.min(a[3],b[3])];
  return r[0]<r[2]&&r[1]<r[3]?r:null;
}
function viewport(map){
  const b=map.getBounds();
  return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
}
function envelope(bounds,step=0.025){
  // Stable URLs reuse existing saved responses during small camera movements.
  return [Math.floor(bounds[0]/step)*step,Math.floor(bounds[1]/step)*step,
    Math.ceil(bounds[2]/step)*step,Math.ceil(bounds[3]/step)*step];
}
export function statisticsUrl(kind,bounds){
  if(!["zoning","parcel"].includes(kind))throw Error("Unknown summary source");
  const fields=kind==="zoning"
    ?[{statisticType:"count",onStatisticField:"OBJECTID",outStatisticFieldName:"n"}]
    :[{statisticType:"count",onStatisticField:"OBJECTID",outStatisticFieldName:"n"},
      {statisticType:"avg",onStatisticField:"Roll_LandValue",outStatisticFieldName:"mean_value"}];
  return ENDPOINTS[kind]+"?"+new URLSearchParams({
    where:"1=1",geometry:bounds.map(v=>v.toFixed(6)).join(","),
    geometryType:"esriGeometryEnvelope",inSR:"4326",
    spatialRel:"esriSpatialRelIntersects",
    ...(kind==="zoning"?{groupByFieldsForStatistics:"CATEGORY"}:{}),
    outStatistics:JSON.stringify(fields),returnGeometry:"false",f:"json"
  });
}
const integer=n=>Math.round(n).toLocaleString("en-US");
const dollars=n=>Math.round(n).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
export function parseStatistics(kind,body){
  if(body?.error)throw Error(body.error.message||"Provider rejected statistics");
  if(!Array.isArray(body?.features))throw Error("Provider returned invalid statistics");
  if(kind==="zoning"){
    const ranked=body.features.map(f=>f.attributes||{})
      .filter(a=>Number.isFinite(Number(a.n))&&Number(a.n)>0)
      .sort((a,b)=>Number(b.n)-Number(a.n));
    return {title:"LA City zoning · visible-area summary",
      description:"Counts of source polygons intersecting the requested area, not land-area percentages. No boundaries are inferred.",
      rows:ranked.slice(0,5).map(a=>({
        label:String(a.CATEGORY||"Unclassified"),value:integer(Number(a.n))
      }))};
  }
  if(kind==="parcel"){
    const a=body.features[0]?.attributes||{},count=Number(a.n);
    const avg=a.mean_value===null||a.mean_value===undefined?null:Number(a.mean_value);
    return {title:"LA County Assessor · visible-area summary",
      description:"Mean tax-roll assessed land value of intersecting parcels; not their market or sale price. No parcel boundaries are inferred.",
      rows:count>0?[{label:"Intersecting parcels",value:integer(count)},
        {label:"Mean assessed land value",value:avg!==null&&Number.isFinite(avg)&&avg>=0?dollars(avg):"Unavailable"}]:[]};
  }
  throw Error("Unknown statistics kind");
}
const estimate=(record,table,field)=>{
  const raw=record?.[table]?.estimate?.[field];
  if(raw===null||raw===undefined)return null;
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0?value:null;
};
const share=(a,b)=>a!==null&&b!==null&&b>0&&a<=b?a*100/b:null;
export function countyStatistics(body){
  const r=body?.data?.["05000US06037"];
  if(!r)throw Error("LA County ACS record unavailable");
  const total=estimate(r,"B01001","B01001001");
  const ethTotal=estimate(r,"B03002","B03002001");
  const money=estimate(r,"B19013","B19013001");
  return {income:money,population:total,
    hispanic:share(estimate(r,"B03002","B03002012"),ethTotal),
    female:share(estimate(r,"B01001","B01001026"),total),
    white:share(estimate(r,"B03002","B03002003"),ethTotal)};
}
export function countySummary(data,metric){
  const definitions={
    income:["Median household income",data.income===null?"Unavailable":dollars(data.income)],
    population:["County population",data.population===null?"Unavailable":integer(data.population)],
    hispanic:["Hispanic or Latino population",data.hispanic===null?"Unavailable":data.hispanic.toFixed(1)+"%"],
    female:["Female population",data.female===null?"Unavailable":data.female.toFixed(1)+"%"],
    white:["Non-Hispanic White alone",data.white===null?"Unavailable":data.white.toFixed(1)+"%"]
  };
  return {title:"LA County · 2020–2024 ACS",
    description:"County-wide estimate, not a city statistic, tract estimate, or individual attribute. No rectangle is colored as census geography.",
    rows:[{label:definitions[metric]?.[0]||"Estimate",
      value:definitions[metric]?.[1]||"Unavailable"}]};
}
export function createWideOverview(map,{getRegion,dataCache,onStatus,onSummary}){
  let selected="off",generation=0,controller=null,delay=null;
  const memory=new Map();
  function kind(){
    if(selected==="zoning")return "zoning";
    if(selected==="assessor")return "parcel";
    if(["income","population","hispanic","female","white"].includes(selected))return "census";
    return null;
  }
  function isWide(k){return kind()===k&&map.getZoom()<DETAIL_ZOOM[k]}
  function report(k,text){if(isWide(k))onStatus(k,text)}
  function show(data){onSummary(data)}
  function cancel(){
    generation++;controller?.abort();controller=null;
    if(delay!==null){clearTimeout(delay);delay=null}
  }
  async function fetchSummary(url,k,signal,ttl){
    if(memory.has(url))return memory.get(url);
    const value=dataCache
      ?await dataCache.fetchJson(url,{namespace:"stratlas-overview-summary-v2",ttlMs:ttl,signal})
      :await (async()=>{
        const response=await fetch(url,{signal,mode:"cors",cache:"default"});
        if(!response.ok)throw Error("Source HTTP "+response.status);
        return response.json();
      })();
    if(value?.error)throw Error(value.error.message||"Provider error");
    memory.set(url,value);
    while(memory.size>96)memory.delete(memory.keys().next().value);
    return value;
  }
  async function refresh(){
    cancel();
    const k=kind();
    show(empty());
    if(!k||!isWide(k))return;
    const g=generation;
    let url;
    if(k==="census"){
      const region=getRegion(),county=SCOPE.census;
      if(region[0]>county[0]||region[1]>county[1]||
         region[2]<county[2]||region[3]<county[3]){
        report(k,"County aggregate is not valid for the selected smaller region; zoom in for tracts");
        return;
      }
      url=ENDPOINTS.census+"?"+new URLSearchParams({
        table_ids:"B01001,B03002,B19013",geo_ids:"05000US06037"
      });
    }else{
      const bounds=intersection(intersection(viewport(map),getRegion()),SCOPE[k]);
      if(!bounds){report(k,"Outside this source's geographic coverage");return}
      const rounded=intersection(intersection(envelope(bounds),getRegion()),SCOPE[k]);
      if(!rounded){report(k,"Outside this source's geographic coverage");return}
      url=statisticsUrl(k,rounded);
    }
    controller=new AbortController();
    report(k,"Loading source-backed area statistics (no artificial polygons)…");
    try{
      const body=await fetchSummary(url,k,controller.signal,k==="zoning"?6*3600000:
        k==="parcel"?24*3600000:90*86400000);
      if(g!==generation||!isWide(k))return;
      const summary=k==="census"?countySummary(countyStatistics(body),selected):parseStatistics(k,body);
      if(!summary.rows.length){
        report(k,"No source summary available for this area");
        return;
      }
      show(summary);
      report(k,"Area statistics loaded · zoom in for actual geographic features");
    }catch(error){
      if(g!==generation||controller?.signal.aborted)return;
      report(k,"Summary unavailable: "+error.message+" · detailed geometry unaffected");
    }
  }
  function schedule(){
    cancel();show(empty());
    const k=kind();
    if(!k||!isWide(k))return;
    delay=setTimeout(()=>{delay=null;void refresh()},180);
  }
  function setSelection(value){selected=value;schedule()}
  function reset(reload=true){cancel();memory.clear();show(empty());if(reload)schedule()}
  map.on("moveend",schedule);
  // Changing the basemap should never recolor or redownload source statistics.
  return {setSelection,refreshAll:schedule,reset,isWide};
}
