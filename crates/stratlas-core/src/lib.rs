//! Stratlas spatial engine. Bounds use WGS84 [west, south, east, north].
//! Deliberately no dateline-wrapping rectangle or arbitrary polygon clipping.

use serde_json::{json, Value};
use wasm_bindgen::prelude::*;

const MERCATOR_LIMIT: f64 = 85.051_128_779_806_6;

#[derive(Clone, Copy, Debug)]
struct Bbox { west: f64, south: f64, east: f64, north: f64 }

impl Bbox {
    fn new(west: f64, south: f64, east: f64, north: f64) -> Option<Self> {
        if [west,south,east,north].iter().all(|v| v.is_finite())
            && west >= -180.0 && east <= 180.0
            && south >= -90.0 && north <= 90.0
            && west < east && south < north {
            Some(Self {west,south,east,north})
        } else { None }
    }

    fn overlaps(self, other: Self) -> bool {
        self.west < other.east && self.east > other.west
            && self.south < other.north && self.north > other.south
    }

    fn intersection(self, other: Self) -> Option<Self> {
        Self::new(self.west.max(other.west),self.south.max(other.south),
            self.east.min(other.east),self.north.min(other.north))
    }
}

fn tile_bounds(z: u32, x: u32, y: u32) -> Option<Bbox> {
    if z > 24 { return None; }
    let n = 1u64 << z;
    if u64::from(x) >= n || u64::from(y) >= n { return None; }
    let n = n as f64;
    let latitude = |row: f64| (std::f64::consts::PI*(1.0-2.0*row/n))
        .sinh().atan().to_degrees();
    Some(Bbox {
        west: x as f64 / n * 360.0 - 180.0,
        east: (x as f64+1.0) / n * 360.0 - 180.0,
        south: latitude(y as f64+1.0), north: latitude(y as f64)
    })
}

fn longitude_tile(lon:f64,z:u32)->u32 {
    let n=(1u64<<z) as f64;
    ((lon+180.0)/360.0*n).floor().clamp(0.0,n-1.0) as u32
}
fn latitude_tile(lat:f64,z:u32)->u32 {
    let n=(1u64<<z) as f64;
    let r=lat.clamp(-MERCATOR_LIMIT,MERCATOR_LIMIT).to_radians();
    let y=(1.0-(r.tan()+1.0/r.cos()).ln()/std::f64::consts::PI)/2.0*n;
    y.floor().clamp(0.0,n-1.0) as u32
}

/// Invoked before every tile request: out-of-region tiles never reach a server.
#[wasm_bindgen]
pub fn tile_in_region(z:u32,x:u32,y:u32,w:f64,s:f64,e:f64,n:f64)->bool {
    match (tile_bounds(z,x,y),Bbox::new(w,s,e,n)) {
        (Some(tile),Some(region))=>tile.overlaps(region),
        _=>false
    }
}

/// Approximate area of study rectangle in square kilometers.
#[wasm_bindgen]
pub fn region_area_km2(w:f64,s:f64,e:f64,n:f64)->f64 {
    let Some(b)=Bbox::new(w,s,e,n) else {return 0.0};
    6371.0088_f64.powi(2)*(b.east-b.west).to_radians()
        *(b.north.to_radians().sin()-b.south.to_radians().sin())
}

/// Generate bounded tile outlines for the viewport/study intersection.
/// This does NOT fetch or prefetch tiles.
#[wasm_bindgen]
pub fn visible_grid_geojson(
    vw:f64,vs:f64,ve:f64,vn:f64,
    rw:f64,rs:f64,re:f64,rn:f64,
    zoom:u32,limit:u32
)->String {
    let empty=json!({"type":"FeatureCollection","features":[]}).to_string();
    if zoom>22 || limit==0 {return empty}
    let Some(view)=Bbox::new(vw,vs,ve,vn) else {return empty};
    let Some(region)=Bbox::new(rw,rs,re,rn) else {return empty};
    let Some(active)=view.intersection(region) else {return empty};
    let (min_x,max_x)=(longitude_tile(active.west,zoom),longitude_tile(active.east,zoom));
    let (min_y,max_y)=(latitude_tile(active.north,zoom),latitude_tile(active.south,zoom));
    let mut features=Vec::new();
    'outer: for x in min_x..=max_x {
        for y in min_y..=max_y {
            if features.len() >= limit.min(250) as usize {break 'outer}
            let Some(b)=tile_bounds(zoom,x,y) else {continue};
            if !b.overlaps(active) {continue}
            features.push(json!({
                "type":"Feature",
                "properties":{"z":zoom,"x":x,"y":y},
                "geometry":{"type":"Polygon","coordinates":[[
                    [b.west,b.south],[b.east,b.south],
                    [b.east,b.north],[b.west,b.north],[b.west,b.south]
                ]]}
            }));
        }
    }
    json!({"type":"FeatureCollection","features":features}).to_string()
}

fn visit_coords(value:&Value,bounds:&mut Option<Bbox>) {
    let Some(items)=value.as_array() else {return};
    if items.len()>=2 {
        if let (Some(x),Some(y))=(items[0].as_f64(),items[1].as_f64()) {
            if x.is_finite() && y.is_finite() && (-180.0..=180.0).contains(&x)
                && (-90.0..=90.0).contains(&y) {
                *bounds=Some(match *bounds {
                    None=>Bbox {west:x,south:y,east:x,north:y},
                    Some(b)=>Bbox {west:b.west.min(x),south:b.south.min(y),
                        east:b.east.max(x),north:b.north.max(y)}
                });
            }
            return;
        }
    }
    for item in items {visit_coords(item,bounds)}
}

fn extent(geometry:&Value)->Option<Bbox> {
    if geometry.get("type")?.as_str()?=="GeometryCollection" {
        let mut result:Option<Bbox>=None;
        for g in geometry.get("geometries")?.as_array()? {
            if let Some(b)=extent(g) {
                result=Some(match result {
                    None=>b,
                    Some(r)=>Bbox {west:r.west.min(b.west),south:r.south.min(b.south),
                        east:r.east.max(b.east),north:r.north.max(b.north)}
                });
            }
        }
        return result
    }
    let mut result=None;
    visit_coords(geometry.get("coordinates")?,&mut result);
    result
}

/// Cull irrelevant GeoJSON features in Rust; not a geometry clipping operation.
#[wasm_bindgen]
pub fn filter_geojson_bbox(input:&str,w:f64,s:f64,e:f64,n:f64)->Result<String,JsValue> {
    let region=Bbox::new(w,s,e,n)
        .ok_or_else(||JsValue::from_str("Invalid bounding rectangle"))?;
    let mut data:Value=serde_json::from_str(input)
        .map_err(|err|JsValue::from_str(&err.to_string()))?;
    if data.get("type").and_then(Value::as_str)!=Some("FeatureCollection"){
        return Err(JsValue::from_str("Expected a GeoJSON FeatureCollection"))
    }
    let features=data.get_mut("features").and_then(Value::as_array_mut)
        .ok_or_else(||JsValue::from_str("Expected features array"))?;
    features.retain(|f|match f.get("geometry").and_then(extent) {
        Some(b)=>b.west<=region.east && b.east>=region.west
            && b.south<=region.north && b.north>=region.south,
        None=>false
    });
    Ok(data.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reject_invalid_and_distant_tiles() {
        assert!(!tile_in_region(1,2,0,-119.0,33.0,-117.0,35.0));
        assert!(!tile_in_region(40,0,0,-119.0,33.0,-117.0,35.0));
        let z=11;
        assert!(tile_in_region(z,longitude_tile(-118.25,z),latitude_tile(34.05,z),
            -119.0,33.0,-117.0,35.0));
        assert!(!tile_in_region(z,longitude_tile(-73.9,z),latitude_tile(40.7,z),
            -119.0,33.0,-117.0,35.0));
    }
    #[test]
    fn slippy_equator_is_correct() {
        let b=tile_bounds(1,1,1).unwrap();
        assert_eq!(b.west,0.0);
        assert!(b.north.abs()<1e-9);
    }
    #[test]
    fn grid_is_bounded() {
        let output=visible_grid_geojson(-118.8,33.9,-118.0,34.4,
            -119.0,33.0,-117.0,35.0,11,30);
        let obj:Value=serde_json::from_str(&output).unwrap();
        let features=obj["features"].as_array().unwrap();
        assert!(!features.is_empty() && features.len()<=30);
    }
    #[test]
    fn feature_culling() {
        let input=r#"{"type":"FeatureCollection","features":[
          {"type":"Feature","geometry":{"type":"Point","coordinates":[-118.2,34.0]}},
          {"type":"Feature","geometry":{"type":"Point","coordinates":[-73.9,40.7]}}
        ]}"#;
        let result=filter_geojson_bbox(input,-119.0,33.0,-117.0,35.0).unwrap();
        let obj:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(obj["features"].as_array().unwrap().len(),1);
    }
}
