import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const catalog=JSON.parse(readFileSync(new URL("../docs/sources/catalog.json",import.meta.url),"utf8"));
test("catalog records every implemented source and its provenance",()=>{
  assert.equal(catalog.schema_version,1);
  const ids=new Set();
  for(const s of catalog.sources){
    assert.equal(typeof s.id,"string");
    assert.ok(!ids.has(s.id),"Duplicate source: "+s.id);
    ids.add(s.id);
    assert.ok(["implemented","implemented-key-required","implemented-browser-qa-pending","implemented-browser-verified","research-only"].includes(s.status));
    assert.ok(s.endpoint||s.metadata);
    if(s.status==="implemented-browser-verified"){
      assert.match(s.verification_run,/^https:\/\/github\.com\/sguzman\/stratlas\/actions\/runs\/\d+$/);
      assert.equal(typeof s.verification,"string");
    }
    if(s.status!=="research-only")
      for(const key of ["coverage","attribution","cache","credentials","date"])
        assert.equal(typeof s[key],"string",s.id+" lacks "+key);
  }
  for(const id of ["osm","opentopomap","la-zoning","tiger-tracts","acs2024"])
    assert.ok(ids.has(id));
});
