/**
 * Browser-owned cache for explicit, public geographic JSON API responses.
 *
 * API source selection stays in adapters; this module never crawls, prefetches,
 * changes query bounds, or manufactures provider responses. We avoid overriding
 * no-store/private/no-cache/must-revalidate and obey max-age/Expires when sent.
 * Basemap tiles remain in the standard browser HTTP cache, not IndexedDB.
 */
const DB_NAME="stratlas-public-data";
const STORE="responses";
const DB_VERSION=1;
const MAX_RECORDS=192;
const MAX_TOTAL_BYTES=24*1024*1024;
const MAX_ENTRY_BYTES=4*1024*1024;

function readRequest(request) {
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("IndexedDB request failed"));
  });
}
function openDb(indexedDBImpl) {
  if(!indexedDBImpl)return Promise.resolve(null);
  return new Promise(resolve=>{
    let request;
    try{request=indexedDBImpl.open(DB_NAME,DB_VERSION)}
    catch{return resolve(null)}
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE,{keyPath:"key"});
    };
    request.onsuccess=()=>{
      request.result.onversionchange=()=>request.result.close();
      resolve(request.result);
    };
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
}
export function createIndexedDbStore(indexedDBImpl=globalThis.indexedDB) {
  let open=null;
  const db=()=>open||(open=openDb(indexedDBImpl));
  const withStore=async(mode,operation)=>{
    const database=await db();
    if(!database)return null;
    try{
      const transaction=database.transaction(STORE,mode);
      const store=transaction.objectStore(STORE);
      return await operation(store,transaction);
    }catch{return null} // storage is optional; never break rendering
  };
  return {
    get:key=>withStore("readonly",async store=>await readRequest(store.get(key))),
    put:entry=>withStore("readwrite",async store=>{
      await readRequest(store.put(entry));return true;
    }),
    remove:key=>withStore("readwrite",async store=>{
      await readRequest(store.delete(key));return true;
    }),
    entries:()=>withStore("readonly",async store=>await readRequest(store.getAll())),
    deleteMany:keys=>withStore("readwrite",async store=>{
      for(const key of keys)store.delete(key);
      return true;
    }),
    clear:()=>withStore("readwrite",async store=>{
      await readRequest(store.clear());return true;
    })
  };
}
function providerFreshness(headers,requestedMs,now) {
  if(!Number.isFinite(requestedMs)||requestedMs<=0)return 0;
  let allowed=requestedMs;
  const cc=String(headers?.get?.("cache-control")||"").toLowerCase();
  if(/(?:^|,)\s*(?:no-store|no-cache|private|must-revalidate)(?:\s|,|$)/.test(cc))
    return 0;
  const maxAge=cc.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/);
  const upstreamAge=Math.max(0,Number(headers?.get?.("age")||0));
  if(maxAge)allowed=Math.min(allowed,
    Math.max(0,Number(maxAge[1])-upstreamAge)*1000);
  const expires=headers?.get?.("expires");
  if(expires) {
    const value=Date.parse(expires);
    if(Number.isFinite(value))allowed=Math.min(allowed,Math.max(0,value-now));
  }
  return Math.max(0,allowed);
}
function aborted(signal) {
  if(signal?.aborted)throw new DOMException("The request was aborted","AbortError");
}
export function createDataCache({
  store=createIndexedDbStore(),
  transport=(url,options)=>fetch(url,options),
  now=()=>Date.now()
}={}) {
  let generation=0;
  let hits=0,network=0;
  const inflight=new Map();
  async function read(key,signal) {
    const entry=await store.get(key).catch(()=>null);
    aborted(signal);
    if(!entry)return null;
    if(entry.expires<=now()) {
      void store.remove(key).catch(()=>{});
      return null;
    }
    try {
      const value=JSON.parse(entry.payload);
      hits++;
      return value;
    }catch{
      void store.remove(key).catch(()=>{});
      return null;
    }
  }
  async function trim() {
    try{
      const rows=await store.entries();
      if(!Array.isArray(rows))return;
      const current=now();
      const live=rows.filter(r=>r.expires>current);
      const expired=rows.filter(r=>r.expires<=current).map(r=>r.key);
      let bytes=live.reduce((a,r)=>a+(r.bytes||0),0);
      live.sort((a,b)=>(b.saved||0)-(a.saved||0));
      const remove=[...expired];
      for(let i=0;i<live.length;i++){
        if(i>=MAX_RECORDS||bytes>MAX_TOTAL_BYTES) {
          remove.push(live[i].key);bytes-=live[i].bytes||0;
        }
      }
      if(remove.length)await store.deleteMany(remove);
    }catch{/* persistent cache is opportunistic */}
  }
  async function fetchJson(url,{namespace,ttlMs,signal}={}) {
    if(typeof namespace!=="string"||!namespace||!Number.isFinite(ttlMs)||ttlMs<=0)
      throw Error("Geographic cache requires namespace and finite TTL");
    if(!String(url).startsWith("https://"))
      throw Error("Geographic API requires HTTPS");
    aborted(signal);
    const key=namespace+":"+url;
    const cached=await read(key,signal);
    if(cached!==null)return cached;
    aborted(signal);
    // De-duplicate calls with the *same* signal only. Independent viewport
    // requests must not inherit somebody else's cancellation signal.
    const same=inflight.get(key);
    if(same && same.signal===signal)return same.promise;
    const currentGeneration=generation;
    const work=(async()=>{
      const response=await transport(url,{cache:"default",mode:"cors",signal});
      if(!response.ok)throw Error("Geographic API HTTP "+response.status);
      const value=await response.json();
      aborted(signal);
      network++;
      // Don't persist server errors. Map adapters validate response schemas.
      if(!value || typeof value!=="object" || value.error)return value;
      const ttl=providerFreshness(response.headers,ttlMs,now());
      if(ttl && currentGeneration===generation){
        try{
          const payload=JSON.stringify(value);
          const bytes=new TextEncoder().encode(payload).length;
          if(bytes>0 && bytes<=MAX_ENTRY_BYTES) {
            await store.put({key,payload,bytes,saved:now(),expires:now()+ttl});
            // A read-only cache eviction pass is bounded by MAX_RECORDS.
            await trim();
          }
        }catch{/* storage quotas cannot block real data rendering */}
      }
      aborted(signal);
      return value;
    })();
    inflight.set(key,{signal,promise:work});
    try{return await work}
    finally{if(inflight.get(key)?.promise===work)inflight.delete(key)}
  }
  async function clear(){
    generation++;
    const cleared=await store.clear().catch(()=>false);
    return Boolean(cleared);
  }
  return {fetchJson,clear,stats:()=>({hits,network})};
}
