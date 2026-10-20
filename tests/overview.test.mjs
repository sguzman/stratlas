import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../web/overview.js",import.meta.url),"utf8");
const {overviewCells,arcgisSummary,countyValues,createWideOverview}=
  await import("data:text/javascript,"+encodeURIComponent(src));
const box=[-118.67,33.70,-118.15,34.34];
const region=[-118.95,32.70,-117.64,34.85];
const collection=()=>({type:"FeatureCollection",features:[]});
const fakeFetch=body=>({ok:true,json:async()=>body});
async function settle(){for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r))}
class FakeMap{
  constructor({zoom=9,view=[-118.32,34,-118.12,34.18]}={}){
    this.zoom=zoom;this.view=view;this.events=new Map();this.sources=new Map();
    this.layers=new Map();this.visibility=new Map();this.paint=new Map();
  }
  getBounds(){const [w,s,e,n]=this.view;return {
    getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n};}
  getZoom(){return this.zoom}
  getSource(id){return this.sources.get(id)}
  getLayer(id){return this.layers.get(id)}
  addSource(id,opts){this.sources.set(id,{...opts,data:opts.data,setData(d){this.data=d}})}
  addLayer(l){this.layers.set(l.id,l)}
  setLayoutProperty(id,key,value){this.visibility.set(id+":"+key,value)}
  setPaintProperty(id,key,value){this.paint.set(id+":"+key,value)}
  on(name,cb){this.events.set(name,cb)}
  fire(name){this.events.get(name)?.({})}
}
test("coarse cells are stable, study-bounded, and never exceed nine requests per refresh",()=>{
  for(const kind of ["zoning","parcel"]){
    const first=overviewCells([-122,30,-116,37],region,kind,5);
    const second=overviewCells([-122,30,-116,37],region,kind,5);
    assert.deepEqual(first,second);
    assert.ok(first.length>0&&first.length<=9);
    for(const c of first){
      const [w,s,e,n]=c.box;
      assert.ok(w>=region[0]&&s>=region[1]&&e<=region[2]&&n<=region[3]);
    }
  }
  assert.deepEqual(overviewCells([-75,40,-74,41],region,"zoning",5),[]);
});
test("zoning statistics are source categories by polygon count, not claimed area shares",()=>{
  const f=arcgisSummary("zoning",{features:[
    {attributes:{CATEGORY:"Residential",n:15}},
    {attributes:{CATEGORY:"Commercial",n:7}}
  ]},box);
  assert.equal(f.properties.CATEGORY,"Residential");
  assert.equal(f.properties.count,22);
  assert.equal(f.properties.category_count,15);
  assert.match(f.properties.scope,/not area share/);
  assert.deepEqual(f.geometry.coordinates[0][0],box.slice(0,2));
});
test("assessed-value summary is provider mean and never market price",()=>{
  const f=arcgisSummary("parcel",{features:[
    {attributes:{n:350,avg_value:312000}}
  ]},box);
  assert.equal(f.properties.Roll_LandValue,312000);
  assert.equal(f.properties.count,350);
  assert.match(f.properties.scope,/not a sale price/);
  assert.equal(arcgisSummary("parcel",{features:[]},box),null);
  assert.equal(arcgisSummary("parcel",{features:[{attributes:{n:0,avg_value:0}}]},box),null);
});
test("county ACS summary uses county geography and does not convert missing to zero",()=>{
  const body={data:{"05000US06037":{
    B01001:{estimate:{B01001001:9870000,B01001026:5030000}},
    B03002:{estimate:{B03002001:9870000,B03002012:4860000,B03002003:2500000}},
    B19013:{estimate:{B19013001:75200}}
  }}};
  const result=countyValues(body);
  assert.equal(result.acs_population,9870000);
  assert.equal(result.acs_income,75200);
  assert.ok(result.acs_female_pct>50&&result.acs_female_pct<52);
  body.data["05000US06037"].B19013.estimate.B19013001=null;
  assert.equal(countyValues(body).acs_income,null);
  assert.throws(()=>countyValues({data:{}}),/County ACS record missing/);
});
test("wide zoning view issues only bounded server-side statistics, then detail restores",async()=>{
  const urls=[],status=[],map=new FakeMap();
  globalThis.fetch=async url=>{
    const u=new URL(url);urls.push(u);
    return fakeFetch({features:[{attributes:{CATEGORY:"Residential",n:400}}]});
  };
  const o=createWideOverview(map,{
    getRegion:()=>region,filterFeatures:s=>s,
    onStatus:(kind,message)=>status.push([kind,message])
  });
  assert.equal(urls.length,0,"No API access until a layer is activated");
  o.setZoning(true);await settle();
  assert.ok(urls.length>0&&urls.length<=9);
  assert.ok(urls.every(u=>u.searchParams.has("outStatistics")));
  assert.ok(urls.every(u=>!u.searchParams.has("objectIds")));
  assert.ok(urls.every(u=>u.searchParams.get("groupByFieldsForStatistics")==="CATEGORY"));
  assert.ok(map.getSource("stratlas-zoning-overview").data.features.length>0);
  assert.ok(status.some(([kind,message])=>kind==="zoning"&&message.includes("Overview:")));
  map.zoom=14;map.fire("moveend");await settle();
  assert.equal(map.visibility.get("stratlas-zoning-overview-fill:visibility"),"none");
  const previous=urls.length;
  map.zoom=9;map.fire("moveend");await settle();
  assert.equal(urls.length,previous,"Returning to covered coarse cells reuses memory");
  o.setZoningOpacity(0.7);
  assert.equal(map.paint.get("stratlas-zoning-overview-fill:fill-opacity"),0.7);
});
test("an unrelated study region never fetches LA geographic summaries",async()=>{
  const urls=[],map=new FakeMap({view:[-73.98,40.7,-73.90,40.78]});
  globalThis.fetch=async url=>{urls.push(url);throw Error("should not fetch")};
  const o=createWideOverview(map,{
    getRegion:()=>[-74,40.60,-73.8,40.90],filterFeatures:s=>s,onStatus:()=>{}
  });
  o.setParcel(true);await settle();
  assert.equal(urls.length,0);
});
test("a county summary is not misrepresented as a smaller city's ACS statistic",async()=>{
  const urls=[],map=new FakeMap({zoom:9,view:[-118.32,34,-118.12,34.18]});
  globalThis.fetch=async u=>{urls.push(u);throw Error("unexpected")};
  const status=[],o=createWideOverview(map,{
    getRegion:()=>[-118.67,33.7,-118.15,34.34],filterFeatures:s=>s,
    onStatus:(kind,message)=>status.push(message)
  });
  o.setCensus("income");await settle();
  assert.equal(urls.length,0);
  assert.ok(status.some(s=>/cannot represent a smaller study region/.test(s)));
});
