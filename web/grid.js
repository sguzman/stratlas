/**
 * Region-limited XYZ / Web Mercator tile outlines.
 * Rust/WASM generates geographic grid cells. JS only binds them to MapLibre.
 */
const EMPTY=()=>({type:"FeatureCollection",features:[]});
export function createGridOverlay(map,{getRegion,gridGeoJson,onStatus}) {
  let enabled=false;
  function install(){
    // style.load means the style is ready for addSource/addLayer, even when
    // isStyleLoaded() is false while external tile requests are outstanding.
    if(!map.getSource("study-area")){
      map.addSource("study-area",{type:"geojson",data:EMPTY()});
    }
    if(!map.getLayer("study-area-line")){
      map.addLayer({id:"study-area-line",type:"line",source:"study-area",
        paint:{"line-color":"#0b86bf","line-width":2.5,"line-opacity":0.96}});
    }
    if(!map.getSource("tile-grid-data")){
      map.addSource("tile-grid-data",{type:"geojson",data:EMPTY()});
    }
    if(!map.getLayer("tile-grid-casing")){
      map.addLayer({id:"tile-grid-casing",type:"line",source:"tile-grid-data",
        layout:{"visibility":"visible"},
        paint:{"line-color":"#1b2f3d","line-opacity":0.85,"line-width":4}});
    }
    if(!map.getLayer("tile-grid-line")){
      map.addLayer({id:"tile-grid-line",type:"line",source:"tile-grid-data",
        paint:{"line-color":"#ffb448","line-opacity":1,"line-width":2.2}});
    }
    refresh();
  }
  function refresh(){
    const [w,s,e,n]=getRegion();
    const outline={type:"Feature",properties:{},geometry:{
      type:"Polygon",coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]
    }};
    const border=map.getSource("study-area");
    if(border)border.setData({type:"FeatureCollection",features:[outline]});
    const source=map.getSource("tile-grid-data");
    if(!source){
      onStatus(enabled?"Waiting for map style…":"Grid disabled");
      return;
    }
    if(!enabled){source.setData(EMPTY());onStatus("Grid disabled");return}
    const bounds=map.getBounds();
    const view=[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()];
    const zoom=Math.max(0,Math.min(18,Math.floor(map.getZoom())));
    try{
      const result=JSON.parse(gridGeoJson(
        Math.max(-180,view[0]),Math.max(-90,view[1]),
        Math.min(180,view[2]),Math.min(90,view[3]),
        w,s,e,n,zoom,250
      ));
      if(!Array.isArray(result.features))throw Error("Invalid Rust grid output");
      // Rust generates standard tile cell polygons; MapLibre renders their edges.
      source.setData(result);
      const count=result.features.length;
      onStatus(count
        ? "Showing "+count+" XYZ tile cells · zoom "+zoom+(count===250?" · display cap 250":"")
        : "No grid cells intersect the visible study rectangle.");
    }catch(error){
      source.setData(EMPTY());
      onStatus("Grid error: "+error.message);
    }
  }
  map.on("style.load",install);
  map.on("moveend",refresh);
  return {
    setEnabled(value){enabled=Boolean(value);refresh()},
    onRegionChange:refresh,
    refresh
  };
}
