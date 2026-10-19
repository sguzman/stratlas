import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=readFileSync(new URL("../web/grid.js",import.meta.url),"utf8");
const {createGridOverlay}=await import("data:text/javascript,"+encodeURIComponent(src));
class MapStub{
  constructor(){
    this.sources=new Map();this.layers=new Map();this.events=new Map();
    this.loaded=false;this.zoom=9;
  }
  isStyleLoaded(){return this.loaded}
  addSource(id,opts){this.sources.set(id,{...opts,updates:[],
    setData(data){this.updates.push(data)}})}
  getSource(id){return this.sources.get(id)}
  addLayer(layer){this.layers.set(layer.id,layer)}
  getLayer(id){return this.layers.get(id)}
  on(type,fn){this.events.set(type,fn)}
  fire(type){this.events.get(type)?.()}
  getZoom(){return this.zoom}
  getBounds(){return {
    getWest:()=>-118.6,getSouth:()=>33.8,
    getEast:()=>-118.1,getNorth:()=>34.2
  }}
}
const feature={type:"Feature",properties:{z:9,x:87,y:204},
  geometry:{type:"Polygon",coordinates:[[[-118.4,33.8],[-118.1,33.8],
    [-118.1,34.2],[-118.4,34.2],[-118.4,33.8]]]}};
test("grid installs during style.load while isStyleLoaded is false",()=>{
  const map=new MapStub(),statuses=[];
  const layer=createGridOverlay(map,{
    getRegion:()=>[-119,33,-117,35],
    gridGeoJson:()=>JSON.stringify({type:"FeatureCollection",features:[feature]}),
    onStatus:x=>statuses.push(x)
  });
  layer.setEnabled(true);
  assert.equal(map.getSource("tile-grid-data"),undefined);
  map.fire("style.load");
  assert.ok(map.getSource("tile-grid-data"));
  assert.ok(map.getLayer("tile-grid-casing"));
  assert.ok(map.getLayer("tile-grid-line"));
  assert.equal(map.getSource("tile-grid-data").updates.at(-1).features.length,1);
  assert.match(statuses.at(-1),/Showing 1 XYZ tile cells/);
  assert.equal(map.isStyleLoaded(),false,"test deliberately exercises early lifecycle");
});
test("checked grid redraws on region and style changes; unchecked empties",()=>{
  const map=new MapStub(),statuses=[];
  const grid=createGridOverlay(map,{
    getRegion:()=>[-119,33,-117,35],
    gridGeoJson:()=>JSON.stringify({type:"FeatureCollection",features:[feature]}),
    onStatus:x=>statuses.push(x)
  });
  map.fire("style.load");
  grid.setEnabled(true);
  map.fire("moveend");
  grid.onRegionChange();
  assert.equal(map.getSource("tile-grid-data").updates.at(-1).features.length,1);
  grid.setEnabled(false);
  assert.equal(map.getSource("tile-grid-data").updates.at(-1).features.length,0);
  assert.equal(statuses.at(-1),"Grid disabled");
});
test("empty Rust grid reports a comprehensible status",()=>{
  const map=new MapStub(),statuses=[];
  const grid=createGridOverlay(map,{
    getRegion:()=>[-119,33,-117,35],
    gridGeoJson:()=>JSON.stringify({type:"FeatureCollection",features:[]}),
    onStatus:x=>statuses.push(x)
  });
  map.fire("style.load");grid.setEnabled(true);
  assert.match(statuses.at(-1),/No grid cells/);
});
