import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../web/index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../web/app.js",import.meta.url),"utf8");
const style=readFileSync(new URL("../web/style.css",import.meta.url),"utf8");
test("HTML and JavaScript agree about required elements",()=>{
  const ids=[...app.matchAll(/\$\("([a-z][\w-]*)"\)/g)].map(m=>m[1]);
  assert.ok(ids.length>=15);
  for(const id of new Set(ids))
    assert.ok(html.includes('id="'+id+'"'),"Missing DOM element: "+id);
  assert.ok(html.includes('id="hud-theme"'));
  for(const value of ["system","light","dark"])
    assert.ok(html.includes('value="'+value+'"'));
  assert.ok(html.indexOf("./hud-theme.js")<html.indexOf("./style.css"),
    "Theme must initialize before CSS to prevent flash");
  assert.ok(html.includes('id="hud-theme-status"'));
  assert.ok(style.includes(':root[data-hud-theme="light"]'));
  assert.ok(style.includes(':root[data-hud-theme="dark"]'));
  assert.ok(style.includes('main .maplibregl-ctrl-group'));
  assert.ok(html.includes('id="grid-canvas"'));
  assert.ok(html.includes('id="zoom-level"'));
  assert.ok(app.includes("findOrCreateGridCanvas()"));
  assert.ok(app.includes('map.on("zoom",updateZoom)'));
  assert.ok(style.includes(".grid-canvas{"));
  assert.ok(!html.includes("preview-income"));
  assert.ok(!app.includes("preview-income"));
  assert.ok(html.includes('id="zoning-legend"'));
  assert.ok(html.includes('id="zoning-controls"'));
  assert.ok(html.includes('id="zoning-opacity"'));
  assert.ok(html.includes('id="zoning-opacity-value"'));
  assert.ok(app.includes('legendContainer:$("zoning-legend")'));
  for(const id of ["assessor","assessor-controls","assessor-legend",
    "assessor-opacity","assessor-opacity-value","assessor-status"])
    assert.ok(html.includes('id="'+id+'"'),"Missing parcel UI: "+id);
  assert.ok(app.includes('createParcelOverlay'));
});
