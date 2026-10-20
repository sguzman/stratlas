import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const json=p=>JSON.parse(read(p));
const standard=json("docs/metropolises/standard.json");
const la=json("docs/metropolises/los-angeles.json");
const specimens=json("docs/queues/specimens.json");
const tasks=json("docs/queues/tasks.json");
const plan=json("docs/queues/dispatch-blueprint.json");
const sources=json("docs/sources/catalog.json");
const model=json("docs/ontology/sources.json");
const ontologyPlaces=json("docs/ontology/places.json");
const ids=x=>new Set(x.map(v=>v.id));
const capabilityIds=ids(standard.capabilities);
const sourceIds=ids(sources.sources);
const queueNames=[
  "boundary-and-identity","source-discovery","ontology-and-measurements",
  "data-integration","map-presentation","verification-and-provenance"
];

test("public project governance and operational guide are present and separate from Tarium enrollment",()=>{
  const constitution=read("CONSTITUTION.md"),agents=read("AGENTS.md");
  for(const text of [constitution,agents]){
    assert.ok(text.includes("Stratlas"));
    assert.ok(text.includes("Tarium"));
    assert.ok(text.includes("explicit"));
    assert.ok(text.includes("queue"));
    assert.ok(text.includes("source"));
  }
  assert.match(constitution,/Adding a specimen only records it/);
  assert.match(constitution,/only instantiate its required tasks/);
  assert.match(constitution,/separate, explicit user instruction/);
  assert.match(agents,/Do not execute any task in the same operation/);
  assert.match(agents,/Do not enroll this repository in Tarium/);
});

test("metro standard is complete, consistent, and independent of location-specific providers",()=>{
  assert.equal(standard.schema_version,1);
  assert.equal(standard.capabilities.length,8);
  assert.equal(capabilityIds.size,standard.capabilities.length);
  assert.ok(standard.capabilities.every(c=>c.required===true));
  assert.ok(standard.completeness_statuses.includes("partial"));
  assert.ok(standard.completeness_statuses.includes("unavailable"));
  assert.ok(standard.completeness_statuses.includes("implemented_unverified"));
  assert.ok(standard.capabilities.some(c=>c.id==="metro_identity_and_boundaries"));
  assert.ok(standard.capabilities.some(c=>c.id==="household_income"));
  assert.ok(standard.capabilities.some(c=>c.id==="land_and_improvement_assessments"));
  for(const capability of standard.capabilities){
    assert.ok(capability.title && capability.expected && capability.display);
    for(const id of capability.la_sources)assert.ok(sourceIds.has(id),"Unknown LA provider "+id);
  }
  const optionalIds=ids(standard.optional_future_capabilities);
  assert.equal(optionalIds.size,standard.optional_future_capabilities.length);
  for(const id of optionalIds)assert.ok(!capabilityIds.has(id));
});

test("LA is a documented existing pilot, not a completed metropolitan boundary or authorized specimen dispatch",()=>{
  assert.equal(la.specimen_id,"metro:us:ca:los-angeles");
  assert.equal(la.kind,"metropolitan_area");
  assert.equal(la.authoritative_metropolitan_boundary,null);
  assert.equal(la.scope_status,"metro_definition_pending");
  assert.equal(la.existing_pilot,true);
  assert.match(la.boundary_note,/not establish full metropolitan coverage|Neither is an authoritative metropolitan boundary/);
  assert.equal(la.capabilities.length,standard.capabilities.length);
  const seen=new Set();
  for(const capability of la.capabilities){
    assert.ok(capabilityIds.has(capability.id),"Unknown metro capability "+capability.id);
    assert.ok(!seen.has(capability.id),"Repeated metro capability "+capability.id);
    seen.add(capability.id);
    assert.ok(standard.completeness_statuses.includes(capability.status));
    assert.ok(capability.notes.length>=18);
    for(const id of capability.source_ids)assert.ok(sourceIds.has(id),"Uncataloged provider "+id);
  }
  const candidates=model.sources.filter(s=>s.source_kind==="discovery_candidate").map(s=>s.source_id);
  for(const capability of la.capabilities)
    for(const id of capability.source_ids)assert.ok(!candidates.includes(id),"Candidate mislabeled integrated");
  const acs=la.capabilities.find(c=>c.id==="household_income");
  assert.equal(acs.status,"implemented_unverified");
  const registry=sources.sources.find(s=>s.id==="acs2024");
  assert.equal(registry.status,"implemented-browser-qa-pending");
  const named=new Set(ontologyPlaces.presets.map(x=>x.place_id));
  for(const placeId of la.place_references)assert.ok(named.has(placeId));
});

test("specimen intake is a separate queue and has a unique LA record without dispatch",()=>{
  assert.equal(specimens.schema_version,1);
  assert.equal(specimens.queue,"specimens");
  const found=new Set();
  for(const item of specimens.items){
    assert.ok(!found.has(item.specimen_id));
    found.add(item.specimen_id);
    assert.ok(["queued","dispatched"].includes(item.status));
    assert.ok(["not_authorized","dispatched"].includes(item.specimen_processing));
    assert.ok(["not_created","created"].includes(item.downstream_dispatch));
    assert.ok(item.record.startsWith("../metropolises/"));
    assert.ok(existsSync(path.join(root,"docs/queues",item.record)));
    const contents=json(path.normalize("docs/queues/"+item.record));
    assert.equal(contents.specimen_id,item.specimen_id);
    if(item.specimen_processing==="not_authorized"){
      assert.equal(item.status,"queued");
      assert.equal(item.downstream_dispatch,"not_created");
    }
  }
  assert.deepEqual([...found],["metro:us:ca:los-angeles"]);
  assert.equal(specimens.items[0].specimen_processing,"not_authorized");
  assert.equal(specimens.items[0].downstream_dispatch,"not_created");
});

test("downstream queue schema distinguishes definitions from authorized task instances",()=>{
  assert.equal(tasks.schema_version,1);
  assert.equal(plan.schema_version,1);
  assert.equal(plan.mode,"descriptive_templates_only");
  assert.deepEqual(Object.keys(tasks.queues).sort(),queueNames.slice().sort());
  assert.deepEqual(plan.blueprints.map(t=>t.queue).sort(),queueNames.slice().sort());
  const taskIds=new Set();
  for(const blueprint of plan.blueprints){
    assert.ok(blueprint.deliverable.length>20);
    assert.ok(blueprint.capability_ids.length>0);
    assert.equal(new Set(blueprint.capability_ids).size,blueprint.capability_ids.length);
    for(const id of blueprint.capability_ids)assert.ok(capabilityIds.has(id),"Unrecognized target "+id);
  }
  for(const [queue,items] of Object.entries(tasks.queues)){
    assert.ok(Array.isArray(items));
    for(const item of items){
      assert.equal(item.queue,queue);
      assert.ok(!taskIds.has(item.id),"Duplicate downstream task "+item.id);
      taskIds.add(item.id);
      assert.ok(["queued","in_progress","blocked","complete"].includes(item.status));
      assert.ok(specimens.items.some(s=>s.specimen_id===item.specimen_id));
      assert.ok(Array.isArray(item.capability_ids)&&item.capability_ids.length>0);
      for(const id of item.capability_ids)assert.ok(capabilityIds.has(id));
      assert.ok(Array.isArray(item.dependencies));
      assert.ok(item.deliverable?.length>0);
      if(item.status==="complete")assert.ok(item.evidence?.length>0,"Completion without evidence");
    }
  }
  for(const item of specimens.items){
    if(item.specimen_processing==="not_authorized"){
      assert.equal(Object.values(tasks.queues).flat().filter(t=>t.specimen_id===item.specimen_id).length,0,
        "Unprocessed intake cannot silently instantiate downstream work");
    }
  }
});

test("public documentation separates specimen intake and downstream queue execution",()=>{
  const q=read("docs/queues/README.md");
  const standardDoc=read("docs/metropolises/STANDARD.md");
  assert.match(q,/Task creation is the .*only.* permitted result/);
  assert.match(q,/separate, explicit authorization/);
  assert.match(q,/initial task queues are deliberately empty/);
  assert.match(standardDoc,/Required common capabilities/);
  assert.match(standardDoc,/not market value/);
  assert.match(read("README.md"),/docs\/metropolises\/STANDARD\.md/);
  assert.match(read("README.md"),/docs\/queues\/README\.md/);
  assert.match(read("docs/ontology/README.md"),/metropolises\/STANDARD\.md/);
});
