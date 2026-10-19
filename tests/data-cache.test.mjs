import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../web/data-cache.js",import.meta.url),"utf8");
const {createDataCache,createIndexedDbStore}=await import("data:text/javascript,"+encodeURIComponent(src));
function storeFactory(){
  const data=new Map();
  return {data,
    get:async key=>data.get(key)??null,
    put:async e=>{data.set(e.key,e);return true},
    remove:async k=>{data.delete(k);return true},
    entries:async()=>[...data.values()],
    deleteMany:async a=>{for(const k of a)data.delete(k);return true},
    clear:async()=>{data.clear();return true}
  };
}
function response(value,{headers={},status=200}={}){
  return {ok:status>=200&&status<300,status,headers:new Headers(headers),json:async()=>value};
}
const url="https://api.censusreporter.org/1.0/data/show/acs2024_5yr?geo_ids=14000US06037101010";
const options={namespace:"acs2024-test",ttlMs:90*24*60*60*1000};
test("no IndexedDB is tolerated",async()=>{
  const s=createIndexedDbStore(null);
  assert.equal(await s.get("a"),null);
  assert.equal(await s.put({key:"a"}),null);
  assert.equal(await s.clear(),null);
});
test("response survives cache object restart and can be cleared",async()=>{
  const store=storeFactory();let calls=0;
  const make=()=>createDataCache({store,now:()=>100000,transport:async()=>{
    calls++;return response({data:{healthy:true}});
  }});
  await make().fetchJson(url,options);
  const second=make();
  assert.deepEqual(await second.fetchJson(url,options),{data:{healthy:true}});
  assert.equal(calls,1);
  assert.equal(second.stats().hits,1);
  assert.equal(await second.clear(),true);
  await second.fetchJson(url,options);
  assert.equal(calls,2);
});
test("provider max-age minus Age wins over local retention",async()=>{
  const store=storeFactory();let calls=0,clock=500000;
  const cache=createDataCache({store,now:()=>clock,transport:async()=>{
    calls++;return response({calls},{headers:{"cache-control":"public,max-age=60","Age":"20"}});
  }});
  await cache.fetchJson(url,options);
  assert.equal([...store.data.values()][0].expires,540000);
  clock+=20000;
  await cache.fetchJson(url,options);
  assert.equal(calls,1);
  clock+=21000;
  await cache.fetchJson(url,options);
  assert.equal(calls,2);
});
test("prohibited response caching directives prevent persistence",async()=>{
  for(const directive of ["no-store","private","no-cache","must-revalidate","public,max-age=0"]){
    let calls=0;const store=storeFactory();
    const cache=createDataCache({store,transport:async()=>{
      calls++;return response({calls},{headers:{"cache-control":directive}});
    }});
    await cache.fetchJson(url,options);
    await cache.fetchJson(url,options);
    assert.equal(calls,2,directive);
    assert.equal(store.data.size,0,directive);
  }
});
test("upstream errors and HTTP 429 do not enter storage",async()=>{
  let calls=0;const store=storeFactory();
  const cache=createDataCache({store,transport:async()=>{
    calls++;
    if(calls===1)return response({error:{message:"provider error"}});
    if(calls===2)return response({}, {status:429});
    return response({ok:true});
  }});
  assert.deepEqual(await cache.fetchJson(url,options),{error:{message:"provider error"}});
  await assert.rejects(cache.fetchJson(url,options),/HTTP 429/);
  assert.equal(store.data.size,0);
  await cache.fetchJson(url,options);
  assert.equal(calls,3);
  assert.equal(store.data.size,1);
});
test("pre-aborted request does not make a network call",async()=>{
  let calls=0;const store=storeFactory();
  const cache=createDataCache({store,transport:async()=>{
    calls++;return response({ok:true});
  }});
  const abort=new AbortController();abort.abort();
  await assert.rejects(cache.fetchJson(url,{...options,signal:abort.signal}),{name:"AbortError"});
  assert.equal(calls,0);
});
test("cache rejects responses larger than four mebibytes",async()=>{
  const store=storeFactory();
  const cache=createDataCache({store,transport:async()=>response({huge:"a".repeat(4*1024*1024)})});
  await cache.fetchJson(url,options);
  assert.equal(store.data.size,0);
});
test("geographic API URLs must use HTTPS",async()=>{
  let calls=0;
  const cache=createDataCache({store:storeFactory(),transport:async()=>{
    calls++;return response({});
  }});
  await assert.rejects(cache.fetchJson("http://example.org",options),/HTTPS/);
  assert.equal(calls,0);
});
