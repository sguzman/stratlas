import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=p=>readFileSync(path.join(root,p),"utf8");
const json=p=>JSON.parse(file(p));
const catalog=json("docs/sources/catalog.json");
const model=json("docs/ontology/model.json");
const places=json("docs/ontology/places.json");
const manifest=json("docs/ontology/sources.json");
const measures=json("docs/ontology/measurements.json");
const schema=json("docs/ontology/source-bindings.schema.json");
const app=file("web/app.js"),html=file("web/index.html");
const core=file("crates/stratlas-core/src/lib.rs");
const ids=(records,key="id")=>new Set(records.map(x=>x[key]));
const get=id=>catalog.sources.find(x=>x.id===id);
const binding=id=>manifest.sources.find(x=>x.source_id===id);
const vocabulary=key=>ids(model[key]);

test("ontology defines distinct place, feature, source and presentation entities",()=>{
  for(const data of [model,places,manifest,measures])assert.equal(data.schema_version,1);
  const types=vocabulary("entity_types");
  for(const type of ["place","study_window","spatial_feature","observation","dataset","source","map_layer"])
    assert.ok(types.has(type),type);
  assert.ok(vocabulary("relation_types").has("joined_on"));
  assert.ok(vocabulary("relation_types").has("renders"));
  assert.equal(schema.$schema,"https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schema_version.const,1);
  assert.equal(schema.properties.sources.items.$ref,"#/$defs/source_binding");
});

test("exactly one semantic binding per actual provider and none are forgotten",()=>{
  const seen=new Set();
  assert.equal(manifest.sources.length,catalog.sources.length);
  const types=vocabulary("source_kinds"),delivery=vocabulary("delivery_kinds");
  const times=vocabulary("time_models");
  for(const x of manifest.sources){
    assert.ok(!seen.has(x.source_id),"Duplicate "+x.source_id);
    seen.add(x.source_id);
    const src=get(x.source_id);
    assert.ok(src,"Missing provider "+x.source_id);
    assert.ok(types.has(x.source_kind)&&delivery.has(x.delivery_kind)&&times.has(x.time_model));
    if(src.status==="research-only"){
      assert.equal(x.source_kind,"discovery_candidate");
      assert.equal(x.delivery_kind,"not_connected");
      assert.equal(x.runtime,null);
      assert.equal(x.dataset_id,null);
      assert.equal(x.identity,null);
      continue;
    }
    assert.ok(x.dataset_id?.startsWith("dataset:"));
    assert.ok(x.runtime?.module && existsSync(path.join(root,x.runtime.module)));
    assert.ok(x.identity?.namespace && x.identity?.key);
    if(x.source_kind==="raster_basemap"){
      assert.equal(src.type,"basemap");
      assert.equal(x.runtime.module,"web/app.js");
      assert.equal(x.feature_type,"web_mercator_tile");
      const key=x.runtime.selector_value;
      assert.ok(app.includes('"'+key+'":')||app.includes(key+':'),"Missing runtime basemap "+key);
      assert.ok(html.includes('value="'+key+'"'),"Missing basemap picker entry "+key);
    }else if(x.source_kind==="vector_feature_api"){
      assert.equal(src.type,"feature-api");
      assert.equal(x.delivery_kind,"arcgis_geojson");
    }else{
      assert.equal(x.source_kind,"statistical_tabulation_api");
      assert.equal(src.type,"statistics-api");
      assert.equal(x.delivery_kind,"tabulation_json");
    }
  }
  for(const src of catalog.sources)assert.ok(seen.has(src.id),"Missing ontology binding "+src.id);
  assert.equal(manifest.sources.filter(x=>x.source_kind==="raster_basemap").length,8);
  assert.equal(manifest.sources.filter(x=>x.source_kind==="vector_feature_api").length,3);
  assert.equal(manifest.sources.filter(x=>x.source_kind==="statistical_tabulation_api").length,1);
  assert.equal(manifest.sources.filter(x=>x.source_kind==="discovery_candidate").length,4);
});

test("layers consume all connected providers but no discovery candidates",()=>{
  const connected=manifest.sources.filter(s=>s.runtime!==null).map(s=>s.source_id).sort();
  const used=[];
  assert.equal(manifest.layers.length,4);
  for(const layer of manifest.layers){
    assert.ok(html.includes('id="'+layer.selection_element+'"'),layer.id+" absent");
    assert.equal(new Set(layer.source_ids).size,layer.source_ids.length);
    for(const sourceId of layer.source_ids){
      const b=binding(sourceId);
      assert.ok(b?.runtime,"Disconnected provider in layer "+sourceId);
      assert.equal(b.runtime.map_layer,layer.id);
      assert.equal(b.feature_type,layer.feature_type);
      const provider=get(sourceId);
      if(provider.min_zoom!==undefined)
        assert.equal(provider.min_zoom,layer.min_zoom_for_new_data);
      used.push(sourceId);
    }
  }
  assert.deepEqual(used.sort(),connected);
  assert.equal(manifest.layers.find(x=>x.id==="census").min_zoom_for_new_data,12);
  assert.deepEqual(manifest.layers.find(x=>x.id==="census").source_ids,["tiger-tracts","acs2024"]);
  assert.equal(manifest.layers.find(x=>x.id==="zoning").min_zoom_for_new_data,13);
  assert.equal(manifest.layers.find(x=>x.id==="assessed_land_value").min_zoom_for_new_data,16);
});

test("the four named study rectangles match the running map exactly, not legal boundaries",()=>{
  const anchors=new Set(places.anchor_places.map(x=>x.place_id));
  const named=new Set(places.presets.map(x=>x.place_id));
  const types=vocabulary("place_types");
  const start=app.indexOf("const REGIONS = {");
  const section=app.slice(start,app.indexOf("\n};",start));
  assert.ok(start>=0&&section.length>100);
  assert.equal(places.coordinate_system,"EPSG:4326");
  assert.deepEqual(places.bbox_order,["west","south","east","north"]);
  assert.equal(places.presets.length,4);
  for(const entry of places.presets){
    assert.ok(types.has(entry.place_type));
    assert.equal(entry.window_kind,"approximate_study_rectangle");
    assert.ok(anchors.has(entry.parent_place_id)||named.has(entry.parent_place_id));
    assert.ok(html.includes('value="'+entry.preset_id+'"'));
    const names=['"'+entry.preset_id+'":',entry.preset_id+":"];
    const token=names.find(n=>section.includes(n));
    assert.ok(token,"Missing preset "+entry.preset_id);
    const begin=section.indexOf(token),end=section.indexOf("}",begin);
    const runtime=section.slice(begin,end);
    assert.ok(runtime.includes('name:"'+entry.name+'"'));
    const found=runtime.match(/bbox:\[([^\]]+)\]/);
    assert.ok(found,"Missing bbox for "+entry.preset_id);
    assert.deepEqual(found[1].split(",").map(Number),entry.bbox);
    const [w,s,e,n]=entry.bbox;
    assert.ok(w<e&&s<n&&w>=-180&&e<=180&&s>=-90&&n<=90);
  }
  assert.equal(places.dynamic_window.preset_id,"viewport");
  assert.ok(places.geometry_claim.includes("NOT authoritative jurisdiction polygons"));
});

test("measurements have real source fields, units, and consistent joins",()=>{
  const measureIds=new Set(),types=vocabulary("place_types");
  for(const m of measures.concepts){
    assert.ok(!measureIds.has(m.id),"Duplicate measure "+m.id);
    measureIds.add(m.id);
    const src=binding(m.source_id);
    assert.ok(src?.runtime);
    assert.ok(types.has(m.feature_type));
    assert.ok(vocabulary("time_models").has(m.time_model));
    assert.ok(m.units && m.interpretation.length>10);
    const adapter=file(src.runtime.module);
    if(m.field)assert.ok(adapter.includes(m.field),"Missing field "+m.field);
    if(m.table)assert.ok(adapter.includes(m.table),"Missing ACS table "+m.table);
    if(m.rendered_field)assert.ok(core.includes(m.rendered_field),"Missing derived field "+m.rendered_field);
    if(m.numerator)assert.ok(core.includes(m.numerator));
    if(m.denominator)assert.ok(core.includes(m.denominator));
  }
  for(const src of manifest.sources)
    for(const id of src.measures||[]){
      assert.ok(measureIds.has(id),"Undeclared measure "+id);
      assert.equal(measures.concepts.find(m=>m.id===id).source_id,src.source_id);
    }
  const tab=binding("acs2024"),geom=binding("tiger-tracts");
  assert.equal(tab.joins_to.source_id,"tiger-tracts");
  assert.equal(tab.joins_to.right,geom.identity.key);
  assert.equal(tab.joins_to.left,"14000US{GEOID}");
  assert.match(file("web/census.js"),/ids\.map\(id=>"14000US"\+id\)/);
  assert.match(core,/format!\("14000US\{geoid\}"\)/);
  assert.match(measures.concepts.find(m=>m.id==="median_household_income").interpretation,/not net wealth/);
  assert.match(measures.concepts.find(m=>m.id==="assessed_land_value").interpretation,/neither market price nor sale price/);
});

test("ontology and provenance are linked without hiding candidates in current app",()=>{
  assert.match(file("README.md"),/docs\/ontology\/README\.md/);
  assert.match(file("docs/sources/README.md"),/\.\.\/ontology\/README\.md/);
  assert.match(file("docs/ARCHITECTURE.md"),/ontology\/README\.md/);
  assert.match(file("docs/ontology/README.md"),/16 registered sources/);
  for(const src of manifest.sources.filter(x=>x.source_kind==="discovery_candidate")){
    assert.equal(get(src.source_id).status,"research-only");
    assert.equal(src.runtime,null);
  }
});
