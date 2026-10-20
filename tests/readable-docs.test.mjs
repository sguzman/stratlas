import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const json=p=>JSON.parse(read(p));
const bt=String.fromCharCode(96);
const names=[
 "docs/ontology/MODEL.md","docs/ontology/PLACES.md",
 "docs/ontology/MEASUREMENTS.md","docs/ontology/SOURCES.md",
 "docs/metropolises/los-angeles.md","docs/queues/STATUS.md"
];
const markdown=Object.fromEntries(names.map(p=>[p,read(p)]));
const contains=(text,id)=>text.includes(bt+id+bt);
const model=json("docs/ontology/model.json");
const places=json("docs/ontology/places.json");
const measurements=json("docs/ontology/measurements.json");
const catalog=json("docs/sources/catalog.json");
const bindings=json("docs/ontology/sources.json");
const standard=json("docs/metropolises/standard.json");
const la=json("docs/metropolises/los-angeles.json");
const specimens=json("docs/queues/specimens.json");
const tasks=json("docs/queues/tasks.json");
const blueprints=json("docs/queues/dispatch-blueprint.json");
const statusLabels={
 implemented:"Implemented (not separately live-verified)",
 "implemented-browser-verified":"Live-browser verified",
 "implemented-browser-qa-pending":"Implemented; live browser QA pending",
 "implemented-key-required":"Implemented; user key needed",
 "research-only":"Research candidate; not connected"
};

test("human-readable ontology and specimen Markdown companions are available",()=>{
  for(const name of names){
    assert.ok(existsSync(path.join(root,name)),name+" missing");
    assert.match(markdown[name],/^# .+/);
    assert.ok(markdown[name].length>1200,"Insufficient documentation in "+name);
  }
  const rootReadme=read("README.md");
  for(const p of ["docs/metropolises/los-angeles.md","docs/queues/STATUS.md",
    "docs/ontology/PLACES.md","docs/ontology/SOURCES.md",
    "docs/ontology/MEASUREMENTS.md"]){
    assert.ok(rootReadme.includes(p),"Not discoverable from README: "+p);
  }
  for(const p of ["MODEL.md","PLACES.md","SOURCES.md","MEASUREMENTS.md"]){
    assert.ok(read("docs/ontology/README.md").includes(p),"No ontology index link to "+p);
  }
  assert.ok(read("AGENTS.md").includes("human-readable Markdown companions"));
});

test("all ontology entities, relationships and types have readable definitions",()=>{
  const doc=markdown["docs/ontology/MODEL.md"];
  for(const collection of ["entity_types","place_types","source_kinds",
    "delivery_kinds","time_models","relation_types"]){
    for(const item of model[collection]){
      assert.ok(contains(doc,item.id),"Missing readable "+collection+" definition "+item.id);
    }
  }
  assert.match(doc,/identity join/i);
});

test("place index mirrors all named study bounds and local custom viewport",()=>{
  const doc=markdown["docs/ontology/PLACES.md"];
  for(const p of places.presets){
    assert.ok(contains(doc,p.place_id));
    assert.ok(contains(doc,p.preset_id));
    assert.ok(doc.includes("**"+p.name+"**"),"Place missing "+p.name);
    assert.ok(p.bbox.every(n=>contains(doc,String(n))),"Missing bbox value for "+p.preset_id);
    assert.ok(contains(doc,p.parent_place_id));
  }
  for(const country of places.anchor_places)assert.ok(contains(doc,country.place_id));
  assert.ok(contains(doc,places.dynamic_window.preset_id));
  assert.match(doc,/not official administrative or metropolitan boundaries/i);
});

test("all 16 sources have names, provenance links and accurate current states",()=>{
  const doc=markdown["docs/ontology/SOURCES.md"];
  assert.equal(catalog.sources.length,bindings.sources.length);
  for(const source of catalog.sources){
    assert.ok(contains(doc,source.id),"Missing source ID "+source.id);
    assert.ok(doc.includes(source.name),"Missing source name "+source.id);
    assert.ok(doc.includes(source.endpoint||source.metadata),"Missing provider link "+source.id);
    assert.ok(doc.includes(statusLabels[source.status]),"Status missing for "+source.id);
  }
  for(const layer of bindings.layers){
    assert.ok(contains(doc,layer.id),"Missing layer "+layer.id);
    for(const id of layer.source_ids)assert.ok(contains(doc,id));
  }
  assert.match(doc,/no automatic downloads/i);
  assert.match(doc,/market valuations/i);
});

test("all ten measurement concepts have a source, units and interpretation",()=>{
  const doc=markdown["docs/ontology/MEASUREMENTS.md"];
  for(const m of measurements.concepts){
    assert.ok(contains(doc,m.id),"Missing measurement "+m.id);
    assert.ok(doc.includes(m.label),"Missing label "+m.id);
    assert.ok(contains(doc,m.source_id),"Missing source for "+m.id);
    assert.ok(contains(doc,m.units),"Missing unit for "+m.id);
    assert.ok(doc.includes(m.interpretation),"Missing interpretation for "+m.id);
    if(m.table)assert.ok(contains(doc,m.table));
    if(m.numerator&&m.denominator){
      assert.ok(contains(doc,m.numerator));
      assert.ok(contains(doc,m.denominator));
    }
  }
});

test("Los Angeles profile mirrors every capability, status and provider",()=>{
  const doc=markdown["docs/metropolises/los-angeles.md"];
  assert.ok(contains(doc,la.specimen_id));
  assert.equal(la.capabilities.length,standard.capabilities.length);
  for(const c of la.capabilities){
    assert.ok(contains(doc,c.id),"Missing capability "+c.id);
    assert.ok(contains(doc,c.status),"Missing status "+c.id);
    assert.ok(doc.includes(c.notes),"Notes drift "+c.id);
    for(const id of c.source_ids)assert.ok(contains(doc,id),"Missing provider "+id);
  }
  for(const extra of standard.optional_future_capabilities)
    assert.ok(contains(doc,extra.id),"Missing optional capability "+extra.id);
  assert.equal(la.authoritative_metropolitan_boundary,null);
  assert.match(doc,/not authoritative metropolitan boundaries/i);
  assert.match(doc,/not processed/i);
});

test("queue Markdown mirrors specimen state, all queue names and task counts",()=>{
  const doc=markdown["docs/queues/STATUS.md"];
  for(const item of specimens.items){
    for(const value of [item.specimen_id,item.status,item.specimen_processing,item.downstream_dispatch])
      assert.ok(contains(doc,value),"Missing queue state "+value);
  }
  const total=Object.values(tasks.queues).reduce((n,items)=>n+items.length,0);
  assert.ok(doc.includes(total+" instantiated downstream tasks"));
  for(const blueprint of blueprints.blueprints){
    const rows=doc.split("\n").filter(line=>line.startsWith("| "+bt+blueprint.queue+bt+" |"));
    assert.equal(rows.length,1,"Missing or duplicate queue "+blueprint.queue);
    assert.ok(rows[0].includes("| "+tasks.queues[blueprint.queue].length+" |"),
      "Queue task count differs "+blueprint.queue);
  }
  assert.match(doc,/not authorization/i);
});
