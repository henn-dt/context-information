"""
FastAPI Backend for Surface Layers Visualizer
Optimized for fast data fetching and processing
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import httpx
import math
import ee
import os
import json
import tempfile
from typing import Tuple, Dict, List
from pathlib import Path

# Initialize Earth Engine
# Check for environment variable first (for production)
GOOGLE_CREDENTIALS_JSON = os.getenv('GOOGLE_CREDENTIALS_JSON')

if GOOGLE_CREDENTIALS_JSON:
    # Production: Use credentials from environment variable
    print("[INFO] Using Google credentials from environment variable")
    credentials_dict = json.loads(GOOGLE_CREDENTIALS_JSON)
    
    # Write to temporary file (ee.ServiceAccountCredentials requires a file path)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
        json.dump(credentials_dict, temp_file)
        temp_credentials_path = temp_file.name
    
    credentials = ee.ServiceAccountCredentials(
        credentials_dict['client_email'],
        temp_credentials_path
    )
    ee.Initialize(credentials)
    
    # Clean up temp file
    os.unlink(temp_credentials_path)
else:
    # Development: Look for any .json file in MapLayers directory
    # This allows developers to use their own credentials without hardcoding
    json_files = list(Path(__file__).parent.glob("*.json"))
    if json_files:
        service_account_file = json_files[0]
        print(f"[INFO] Using local credentials file: {service_account_file.name}")
        
        # Read the file to get client_email dynamically
        with open(service_account_file, 'r') as f:
            local_creds = json.load(f)
        
        credentials = ee.ServiceAccountCredentials(
            local_creds['client_email'],
            str(service_account_file)
        )
        ee.Initialize(credentials)
    else:
        print("[WARNING] No Google credentials found!")
        print("[WARNING] Set GOOGLE_CREDENTIALS_JSON env var or add a .json file to MapLayers/")
        print("[WARNING] Temperature API will not work without credentials.")

app = FastAPI(title="Surface Layers API")

# CORS middleware
# Read allowed origins from environment variable, fallback to permissive defaults
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ['*'] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (built React app)
STATIC_DIR = Path(__file__).parent.parent / "dist"
if STATIC_DIR.exists():
    print(f"[INFO] Serving static files from: {STATIC_DIR}")
    app.mount("/static", StaticFiles(directory=Path(__file__).parent.parent / "static"), name="static")
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
else:
    print("[WARNING] Static directory not found. Run 'npm run build' first.")

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
]

class LayerRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    size_km: float = Field(..., ge=0.5, le=10)

class LayerResponse(BaseModel):
    sealed_geojson: Dict
    unsealed_geojson: Dict
    status: str
    sealed_count: int
    unsealed_count: int

class TemperatureResponse(BaseModel):
    temperature_data: Dict  # Changed to Dict to accept GeoJSON FeatureCollection
    min_temp: float
    max_temp: float
    mean_temp: float
    status: str
    image_date: str

def get_bbox(center_lat: float, center_lon: float, square_size_km: float) -> Tuple[float, float, float, float]:
    """Calculate bounding box from center point and size."""
    half_size_km = square_size_km / 2
    lat_offset = half_size_km / 111.0
    lon_offset = half_size_km / (111.0 * math.cos(math.radians(center_lat)))
    
    return (
        center_lat - lat_offset,
        center_lon - lon_offset,
        center_lat + lat_offset,
        center_lon + lon_offset
    )

def build_combined_query(bbox: Tuple[float, float, float, float]) -> str:
    """Build single optimized Overpass query for both layer types."""
    b = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
    return f"""
[out:json][timeout:90][maxsize:536870912];
(
  way[building]({b});
  way["amenity"="parking"]({b});
  way["landuse"~"^(industrial|commercial|retail|construction|railway)$"]({b});
  way["highway"]({b});
  way["railway"]({b});
  way["aeroway"~"^(runway|taxiway|apron|helipad)$"]({b});
  way["leisure"~"^(pitch|track|sports_centre)$"]({b});
  way["natural"~"^(wood|grassland|scrub|wetland|beach|sand)$"]({b});
  way["landuse"~"^(forest|farmland|meadow|grass|orchard|vineyard|allotments|cemetery|recreation_ground)$"]({b});
  way["leisure"~"^(park|garden|golf_course|nature_reserve)$"]({b});
);
out geom;
"""

async def fetch_overpass_data(query: str) -> Dict:
    """Fetch data from Overpass API with async retry."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        for url in OVERPASS_URLS:
            try:
                response = await client.post(url, data={'data': query})
                response.raise_for_status()
                return response.json()
            except Exception:
                continue
    raise HTTPException(status_code=503, detail="All Overpass API servers are unavailable")

def classify_and_convert(osm_data: Dict) -> Tuple[Dict, Dict]:
    """Convert OSM data to GeoJSON and split into sealed/unsealed layers."""
    if not osm_data or 'elements' not in osm_data:
        empty = {"type": "FeatureCollection", "features": []}
        return empty, empty
    
    sealed_features = []
    unsealed_features = []
    
    # Define classification rules
    sealed_tags = {'building', 'highway', 'railway', 'aeroway', 'amenity'}
    sealed_landuse = {'industrial', 'commercial', 'retail', 'construction', 'railway'}
    sealed_leisure = {'pitch', 'track', 'sports_centre'}
    
    for elem in osm_data['elements']:
        if elem['type'] != 'way' or 'geometry' not in elem:
            continue
            
        tags = elem.get('tags', {})
        coords = [[node['lon'], node['lat']] for node in elem['geometry']]
        
        if len(coords) < 3:
            continue
            
        # Close polygon if needed
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        
        feature = {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": tags
        }
        
        # Classify as sealed or unsealed
        is_sealed = (
            any(tag in tags for tag in sealed_tags) or
            tags.get('landuse') in sealed_landuse or
            tags.get('leisure') in sealed_leisure
        )
        
        if is_sealed:
            sealed_features.append(feature)
        else:
            unsealed_features.append(feature)
    
    return (
        {"type": "FeatureCollection", "features": sealed_features},
        {"type": "FeatureCollection", "features": unsealed_features}
    )

@app.post("/api/generate-layers", response_model=LayerResponse)
async def generate_layers(request: LayerRequest):
    """Generate sealed and unsealed surface layers from OpenStreetMap data."""
    
    bbox = get_bbox(request.lat, request.lon, request.size_km)
    query = build_combined_query(bbox)
    
    # Single API call for both layers
    osm_data = await fetch_overpass_data(query)
    
    # Split and convert to GeoJSON
    sealed_geojson, unsealed_geojson = classify_and_convert(osm_data)
    
    return LayerResponse(
        sealed_geojson=sealed_geojson,
        unsealed_geojson=unsealed_geojson,
        status="success",
        sealed_count=len(sealed_geojson['features']),
        unsealed_count=len(unsealed_geojson['features'])
    )

@app.post("/api/surface-temperature", response_model=TemperatureResponse)
async def get_surface_temperature(request: LayerRequest):
    """
    Fetch surface temperature (°C) from Google Earth Engine using Landsat 8/9
    Collection 2 Level-2 'ST_B10'. Returns a downsampled grid + stats.
    """
    import datetime

    try:
        # 1) AOI
        bbox = get_bbox(request.lat, request.lon, request.size_km)
        # Earth Engine Rectangle expects [west, south, east, north]
        aoi = ee.Geometry.Rectangle([bbox[1], bbox[0], bbox[3], bbox[2]])

        # 2) Date range (last 6 months)
        end_date = ee.Date(datetime.datetime.utcnow())  # <-- FIXED
        start_date = end_date.advance(-6, 'month')

        # 3) Landsat 8 + 9 (C02 / L2) ImageCollections with ST_B10
        l8 = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
              .filterBounds(aoi)
              .filterDate(start_date, end_date))
        l9 = (ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
              .filterBounds(aoi)
              .filterDate(start_date, end_date))

        # Merge and prefer clearer scenes (use CLOUD_COVER property)
        coll = (l8.merge(l9)
                  .filter(ee.Filter.lt('CLOUD_COVER', 20))
                  .sort('CLOUD_COVER'))

        # Guard: no images
        if coll.size().getInfo() == 0:
            raise HTTPException(status_code=404, detail="No cloud-free Landsat 8/9 L2 ST images in the last 6 months for this area.")

        # 4) Take the least cloudy image
        image = ee.Image(coll.first())
        image_date = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo()

        # 5) Select ST band and convert to °C
        # ST_B10 (Kelvin) = DN*0.00341802 + 149.0  -> then °C = K - 273.15
        st_k = image.select('ST_B10').multiply(0.00341802).add(149.0)
        st_c = st_k.subtract(273.15)

        # Optional: basic mask using the L2 QA bits (kept simple here)
        # qa = image.select('QA_PIXEL')
        # st_c = st_c.updateMask(qa.bitwiseAnd(1<<3).eq(0))  # example: simple water/cloud mask tweak as needed

        # 6) Stats over AOI (30 m nominal)
        stats = st_c.reduceRegion(
            reducer=ee.Reducer.minMax().combine(ee.Reducer.mean(), sharedInputs=True),
            geometry=aoi,
            scale=30,
            maxPixels=1e9
        ).getInfo()

        # Keys inherit source band name
        min_temp = float(stats.get('ST_B10_min', 0.0))
        max_temp = float(stats.get('ST_B10_max', 0.0))
        mean_temp = float(stats.get('ST_B10_mean', 0.0))

        # 7) Create a GRID OF POLYGONS for continuous coverage
        # Sample at regular intervals to create a complete grid
        grid_size = 50  # 50x50 grid
        sample_scale_m = max(request.size_km * 1000.0 / grid_size, 30.0)  # At least 30m (Landsat resolution)
        
        # Sample points
        samples = st_c.sample(
            region=aoi,
            scale=sample_scale_m,
            geometries=True
        )
        
        # Get the sampled features
        features_info = samples.getInfo()
        
        # Convert each point to a SQUARE POLYGON
        temperature_data = []
        # Make polygons slightly larger to ensure complete coverage (slight overlap is OK)
        half_size = sample_scale_m / 111320.0  # Convert meters to degrees (approximate)
        
        for f in features_info.get('features', []):
            props = f.get('properties', {})
            temp_val = props.get('ST_B10', None)
            if temp_val is None:
                continue
                
            lon, lat = f['geometry']['coordinates']
            
            # Create a square polygon around this point
            # Slight overlap ensures no gaps
            temperature_data.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [[
                        [lon - half_size, lat - half_size],
                        [lon + half_size, lat - half_size],
                        [lon + half_size, lat + half_size],
                        [lon - half_size, lat + half_size],
                        [lon - half_size, lat - half_size]
                    ]]
                },
                'properties': {
                    'temperature': round(float(temp_val), 2)
                }
            })
        
        # Return as proper GeoJSON FeatureCollection
        temp_geojson = {
            'type': 'FeatureCollection',
            'features': temperature_data
        }

        return TemperatureResponse(
            temperature_data=temp_geojson,  # Return the GeoJSON, not the list!
            min_temp=round(min_temp, 2),
            max_temp=round(max_temp, 2),
            mean_temp=round(mean_temp, 2),
            status="success",
            image_date=image_date
        )

    except ee.EEException as e:
        raise HTTPException(status_code=500, detail=f"Earth Engine error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching temperature data: {str(e)}")


@app.get("/")
async def root():
    """Serve the React app or API info"""
    index_file = Path(__file__).parent.parent / "dist" / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Surface Layers API", "status": "running", "note": "Build frontend with 'npm run build'"}

# Catch-all route for client-side routing
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve React app for all non-API routes"""
    # Skip API routes
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    index_file = Path(__file__).parent.parent / "dist" / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend not built")


if __name__ == "__main__":
    import uvicorn
    print("[INFO] Starting Surface Layers API server...")
    print("[INFO] API will be available at: http://localhost:8000")
    print("[INFO] API docs at: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
