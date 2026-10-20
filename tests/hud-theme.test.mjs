import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const script=readFileSync(new URL("../web/hud-theme.js",import.meta.url),"utf8");
function scenario(saved=null,systemDark=false){
  const handlers={},stored=new Map(saved===null?[]:[["stratlas:hudTheme",saved]]);
  const preference={matches:systemDark,
    addEventListener(type,handler){handlers["media:"+type]=handler}};
  const element={dataset:{},setAttribute(){}};
  const meta={setAttribute(k,v){meta[k]=v}};
  const status={textContent:""};
  const selector={value:"",addEventListener(k,fn){handlers["select:"+k]=fn}};
  const document={
    documentElement:element,
    querySelector(s){return s==='meta[name="theme-color"]'?meta:null},
    getElementById(id){return id==="hud-theme"?selector:id==="hud-theme-status"?status:null},
    addEventListener(type,handler){handlers["document:"+type]=handler}
  };
  const window={
    matchMedia(q){assert.equal(q,"(prefers-color-scheme: dark)");return preference},
    localStorage:{
      getItem(k){return stored.get(k)??null},
      setItem(k,v){stored.set(k,v)}
    }
  };
  runInNewContext(script,{window,document});
  handlers["document:DOMContentLoaded"]();
  const select=(value)=>{selector.value=value;handlers["select:change"]()};
  const system=(value)=>{preference.matches=value;handlers["media:change"]()};
  return {element,status,meta,selector,stored,select,system};
}
test("HUD defaults to system and follows browser color changes",()=>{
  const ui=scenario();
  assert.equal(ui.element.dataset.hudPreference,"system");
  assert.equal(ui.element.dataset.hudTheme,"light");
  ui.system(true);
  assert.equal(ui.element.dataset.hudTheme,"dark");
  assert.equal(ui.status.textContent,"System · browser reports dark");
  assert.equal(ui.meta.content,"#142230");
});
test("manual modes persist without reacting to browser color-scheme events",()=>{
  const ui=scenario(null,true);
  ui.select("light");
  ui.system(false);ui.system(true);
  assert.equal(ui.element.dataset.hudTheme,"light");
  assert.equal(ui.stored.get("stratlas:hudTheme"),"light");
  ui.select("dark");
  assert.equal(ui.element.dataset.hudTheme,"dark");
  ui.select("system");
  assert.equal(ui.element.dataset.hudTheme,"dark");
  ui.system(false);
  assert.equal(ui.element.dataset.hudTheme,"light");
});
test("invalid stored settings fall back to system without affecting the map",()=>{
  const ui=scenario("bad-value",true);
  assert.equal(ui.selector.value,"system");
  assert.equal(ui.element.dataset.hudTheme,"dark");
  assert.doesNotMatch(script,/setStyle|setPaintProperty|setData|queryRenderedFeatures/);
});
