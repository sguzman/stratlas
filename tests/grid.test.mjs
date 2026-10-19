import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../web/grid.js",import.meta.url),"utf8");
const {createGridOverlay}=await import("data:text/javascript,"+encodeURIComponent(src));
const feature={type:"Feature",properties:{z:9,x:87,y:204},
  geometry:{type:"Polygon",coordinates:[[[-118.4,33.8],[-118.1,33.8],
    [-118.1,34.2],[-118.4,34.2],[-118.4,33.8]]]}};
function make(){
  const actions=[],events=new Map();
  const ctx={
    setTransform(){actions.push("transform")},clearRect(){actions.push("clear")},
    save(){actions.push("save")},restore(){actions.push("restore")},
    beginPath(){actions.push("begin")},rect(){actions.push("rect")},
    clip(){actions.push("clip")},moveTo(){actions.push("move")},
    lineTo(){actions.push("line")},closePath(){actions.push("close")},
    stroke(){actions.push("stroke")}
  };
  const canvas={width:0,height:0,hidden:true,getContext:()=>ctx};
  const map={
    on:(name,cb)=>events.set(name,cb),
    getContainer:()=>({clientWidth:600,clientHeight:400}),
    getBounds:()=>({getWest:()=>-118.6,getSouth:()=>33.7,
      getEast:()=>-118.0,getNorth:()=>34.3}),
    getZoom:()=>13,
    project:([lng,lat])=>({x:(lng+119)*1000,y:(35-lat)*500})
  };
  const statuses=[];
  const opts={getRegion:()=>[-119,33,-117,35],canvas,
    gridGeoJson:()=>JSON.stringify({type:"FeatureCollection",features:[feature]}),
    onStatus:x=>statuses.push(x)};
  return {map,canvas,actions,events,statuses,opts};
}
test("the grid is drawn to an independent, topmost canvas",()=>{
  const {map,canvas,actions,statuses,opts}=make();
  const g=createGridOverlay(map,opts);
  g.setEnabled(true);
  assert.equal(canvas.hidden,false);
  assert.ok(actions.filter(x=>x==="stroke").length>=2);
  assert.ok(actions.includes("line"));
  assert.match(statuses.at(-1),/Showing 1 tile cells/);
  g.setEnabled(false);
  assert.equal(canvas.hidden,true);
});
test("map movement redraws without changing the map style",()=>{
  const {map,canvas,actions,events,opts}=make();
  const g=createGridOverlay(map,opts);
  g.setEnabled(true);
  const before=actions.filter(x=>x==="stroke").length;
  events.get("move")();
  assert.ok(actions.filter(x=>x==="stroke").length>before);
  events.get("style.load")();
  assert.equal(canvas.hidden,false);
});
test("dense tile grid coarsens until all visible cells fit, never leaves a partial stripe",()=>{
  const {map,opts,statuses}=make();
  const seen=[];
  opts.gridGeoJson=(...args)=>{
    const zoom=args[8];seen.push(zoom);
    return JSON.stringify({type:"FeatureCollection",
      features:Array.from({length:zoom>11?250:5},()=>feature)});
  };
  const g=createGridOverlay(map,opts);
  g.setEnabled(true);
  assert.deepEqual(seen,[13,12,11]);
  assert.match(statuses.at(-1),/coarsened/);
});
