/**
 * Visible tile-grid inspector. Rust/WASM owns the Web Mercator tile bounds.
 * Draw directly to a transparent overlay canvas so style reloads, raster
 * tiles, and choropleth ordering can never hide the inspection grid.
 * No map requests are initiated by this module.
 */
const LIMIT=250;
export function createGridOverlay(map,{getRegion,gridGeoJson,onStatus,canvas}) {
  let enabled=false;
  const surface=canvas;
  // Grid must share the map's stacking context. When it sits outside #map,
  // its z-index places lines above the MapLibre attribution and navigation.
  // Reparent the existing canvas without recreating or repainting map data.
  if(surface && surface.parentElement!==map.getContainer())
    map.getContainer().appendChild(surface);
  const ctx=surface?.getContext?.("2d",{alpha:true});
  if(!ctx){
    onStatus("Grid unavailable: canvas is not supported. Map remains usable.");
    return {setEnabled(){},onRegionChange(){},refresh(){}};
  }
  function paint(){
    surface.hidden=!enabled;
    if(!enabled){onStatus("Grid disabled");return}
    const width=Math.max(1,map.getContainer().clientWidth);
    const height=Math.max(1,map.getContainer().clientHeight);
    const ratio=Math.max(1,Math.min(2,globalThis.devicePixelRatio||1));
    const pixelWidth=Math.round(width*ratio);
    const pixelHeight=Math.round(height*ratio);
    if(surface.width!==pixelWidth)surface.width=pixelWidth;
    if(surface.height!==pixelHeight)surface.height=pixelHeight;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,width,height);
    const b=map.getBounds();
    const view=[Math.max(-180,b.getWest()),Math.max(-90,b.getSouth()),
      Math.min(180,b.getEast()),Math.min(90,b.getNorth())];
    if(!(view[0]<view[2]&&view[1]<view[3])){
      onStatus("Tile grid unavailable for a wrapping viewport");return;
    }
    const [w,s,e,n]=getRegion();
    let z=Math.max(0,Math.min(18,Math.floor(map.getZoom())));
    let features=[];
    try{
      for(;;){
        const parsed=JSON.parse(gridGeoJson(...view,w,s,e,n,z,LIMIT));
        if(!Array.isArray(parsed.features))throw Error("Rust grid returned invalid GeoJSON");
        features=parsed.features;
        // The Rust grid caps its result to LIMIT. Coarsen if necessary instead
        // of drawing only a corner of an otherwise truncated viewport.
        if(features.length<LIMIT || z===0)break;
        z--;
      }
      ctx.save();
      ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
      ctx.lineWidth=2;
      ctx.strokeStyle="rgba(5,21,35,0.95)";
      const paths=[];
      for(const f of features){
        const ring=f.geometry?.coordinates?.[0];
        if(!Array.isArray(ring))continue;
        const points=ring.map(coord=>map.project(coord));
        paths.push(points);
      }
      function strokeAll(){
        ctx.beginPath();
        for(const points of paths){
          if(points.length===0)continue;
          ctx.moveTo(points[0].x,points[0].y);
          for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
          ctx.closePath();
        }
        ctx.stroke();
      }
      ctx.lineWidth=4;ctx.strokeStyle="rgba(10,31,47,0.94)";strokeAll();
      ctx.lineWidth=1.8;ctx.strokeStyle="rgba(255,195,66,0.98)";strokeAll();
      ctx.restore();
      onStatus(features.length
        ?"Showing "+features.length+" tile cells · z"+z+
          (z<Math.floor(map.getZoom())?" (coarsened for clarity)":"")
        :"No tile cells intersect the visible study region");
    }catch(error){
      ctx.clearRect(0,0,width,height);
      onStatus("Tile grid error: "+error.message);
    }
  }
  // Keep the canvas above the map; both camera animations and resizes redraw.
  let queued=false;
  function schedule(){
    if(queued||!enabled)return;
    if(typeof globalThis.requestAnimationFrame!=="function"){paint();return}
    queued=true;
    globalThis.requestAnimationFrame(()=>{queued=false;paint()});
  }
  map.on("move",schedule);
  map.on("resize",schedule);
  map.on("moveend",paint);
  map.on("style.load",paint);
  return {
    setEnabled(value){enabled=Boolean(value);paint()},
    onRegionChange:paint,
    refresh:paint
  };
}
