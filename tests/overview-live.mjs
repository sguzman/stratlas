import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {chromium} from "playwright-core";
const chrome=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(existsSync);
assert.ok(chrome,"Chromium/Chrome required");
const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox"]});
try{
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  const output=await page.evaluate(async()=>{
    const bbox="-118.305,34.04,-118.285,34.06";
    async function request(url,timeout=25000){
      const res=await fetch(url,{mode:"cors",signal:AbortSignal.timeout(timeout)});
      if(!res.ok)throw Error(url.split("/query")[0]+" returned HTTP "+res.status);
      const data=await res.json();
      if(data.error)throw Error(url.split("/query")[0]+": "+data.error.message);
      return data;
    }
    function url(base,values){return base+"?"+new URLSearchParams(values)}
    const common={where:"1=1",geometry:bbox,geometryType:"esriGeometryEnvelope",
      inSR:"4326",spatialRel:"esriSpatialRelIntersects",
      returnGeometry:"false",f:"json"};
    const zone=await request(url(
      "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query",
      {...common,groupByFieldsForStatistics:"CATEGORY",
        outStatistics:JSON.stringify([{statisticType:"count",onStatisticField:"OBJECTID",outStatisticFieldName:"n"}])}
    ));
    if(!Array.isArray(zone.features)||zone.features.length===0)
      throw Error("Real zoning statistics response contains no categories");
    if(!(Number(zone.features[0].attributes?.n)>=0))
      throw Error("Real zoning statistics missing count");
    const parcel=await request(url(
      "https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0/query",
      {...common,outStatistics:JSON.stringify([
        {statisticType:"count",onStatisticField:"OBJECTID",outStatisticFieldName:"n"},
        {statisticType:"avg",onStatisticField:"Roll_LandValue",outStatisticFieldName:"avg_value"}
      ])}
    ),35000);
    if(!(Number(parcel.features?.[0]?.attributes?.n)>0))
      throw Error("Real assessor statistics missing parcel count");
    if(!Number.isFinite(Number(parcel.features?.[0]?.attributes?.avg_value)))
      throw Error("Real assessor statistics missing assessed land average");
    const county=await request(url(
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/82/query",
      {where:"STATE='06' AND COUNTY='037'",outFields:"GEOID,NAME",
        outSR:"4326",geometryPrecision:"4",returnGeometry:"true",f:"geojson"}
    ),35000);
    if(county.type!=="FeatureCollection"||!county.features?.some(x=>
      x.geometry?.type==="Polygon"||x.geometry?.type==="MultiPolygon"))
      throw Error("Real TIGERweb LA County polygon missing");
    const acs=await request(url(
      "https://api.censusreporter.org/1.0/data/show/acs2024_5yr",
      {table_ids:"B01001,B03002,B19013",geo_ids:"05000US06037"}
    ),30000);
    if(!acs.data?.["05000US06037"]?.B01001)
      throw Error("Real Census Reporter county summary missing");
    return {zoningCategories:zone.features.length,
      parcelCount:parcel.features[0].attributes.n,
      countyPolygons:county.features.length,
      population:acs.data["05000US06037"].B01001.estimate.B01001001};
  });
  assert.ok(output.zoningCategories>0&&output.parcelCount>0&&output.population>0);
  console.log("Live low-zoom providers:",JSON.stringify(output));
}finally{await browser.close()}
