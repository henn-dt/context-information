# Surface & Temperature Analysis Web Application

Interactive web application for analyzing sealed/unsealed surfaces and surface temperatures using OpenStreetMap data and Google Earth Engine satellite imagery.

![Surface Analysis Demo](public/app.png)

## Features

### 🗺️ Surface Analysis
- **Sealed Surfaces**: Buildings, parking lots, industrial areas (shown in red)
- **Unsealed Surfaces**: Parks, forests, grasslands (shown in green)
- Interactive layer controls (opacity, visibility)
- Click on features to see detailed information

### 🌡️ Temperature Analysis

![Temperature Analysis Demo](public/Temp.png)

- **Satellite thermal data** from Landsat 8/9 (Google Earth Engine)
- **Continuous temperature surface** with color-coded visualization
- Adjustable temperature scale (min/max sliders)
- Temperature statistics (min, max, mean, satellite image date)
- Zoom-independent colors based on actual temperature values

### 📸 Export Capabilities
- **Sealed Only (PNG)**: Export red layer only
- **Unsealed Only (PNG)**: Export green layer only
- **Screenshot of View**: Export current map view with all visible layers
- **GeoJSON Downloads**: Export raw data for further analysis

## Technology Stack

### Frontend
- **React 18** with Vite
- **Mapbox GL JS v2.15.0** for interactive mapping
- Satellite basemap with custom data layers

### Backend
- **FastAPI** (Python) for API endpoints
- **Google Earth Engine API** for satellite temperature data
- **OpenStreetMap Overpass API** for surface data
- **httpx** for async HTTP requests

## Prerequisites

- **Node.js** (v16 or higher)
- **Python 3.8+**
- **Google Earth Engine Service Account** (for temperature data)
- **Mapbox Access Token**

## Installation

### 1. Frontend Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### 2. Backend Setup

```bash
# Navigate to backend folder
cd MapLayers

# Install Python dependencies
pip install fastapi uvicorn earthengine-api httpx

# Configure Google Earth Engine
# Place your service account key file in MapLayers/
# Update the path in api.py (line ~27)

# Start backend server
python api.py
```

The API will be available at `http://localhost:8000`

## Configuration

### Mapbox Token
1. Copy `.env.example` to `.env`
2. Replace `your_mapbox_token_here` with your actual Mapbox access token
3. Get your token from: https://account.mapbox.com/access-tokens/

```bash
# .env file
VITE_MAPBOX_TOKEN=your_actual_token_here
```

### Google Earth Engine Service Account
1. Create a service account in Google Cloud Console
2. Enable Earth Engine API
3. Download the JSON key file
4. Place it in `MapLayers/` folder. Or pass it as environment variable in .env as "GOOGLE_CREDENTIALS_JSON=one_line_json" (safer for production)
5. Update the path in `MapLayers/api.py`:
```python
service_account = 'your-service-account@project.iam.gserviceaccount.com'
credentials = ee.ServiceAccountCredentials(service_account, 'path/to/key.json')
```

## Usage

1. **Set Location**: Enter latitude, longitude, and area size
2. **Generate Layers**: Click "🌿 Generate Layers" to fetch surface data
3. **Fetch Temperature**: Click "🌡️ Fetch Temperature" to get thermal data
4. **Adjust Controls**: Use sliders to control opacity and color scales
5. **Click Features**: Click on map to inspect individual features
6. **Export**: Use PNG/GeoJSON export buttons to save results

## Project Structure

```
Context_Info/
├── src/
│   ├── App.jsx           # Main React component
│   ├── App.css           # Styling
│   ├── main.jsx          # React entry point
│   └── index.css         # Global styles
├── MapLayers/
│   ├── api.py            # FastAPI backend
│   └── [service-key.json] # GEE credentials (not in repo)
├── public/               # Static assets
├── index.html            # HTML template
├── package.json          # Frontend dependencies
├── vite.config.js        # Vite configuration
└── README.md            # This file
```

## API Endpoints

### POST `/api/generate-layers`
Fetch sealed/unsealed surface data from OpenStreetMap
```json
{
  "lat": 51.1787,
  "lon": 6.8416,
  "size_km": 2.0
}
```

### POST `/api/surface-temperature`
Fetch surface temperature data from Google Earth Engine
```json
{
  "lat": 51.1787,
  "lon": 6.8416,
  "size_km": 2.0
}
```

## Temperature Data Details

- **Source**: Landsat 8 & 9 Collection 2 Level-2
- **Band**: ST_B10 (thermal infrared)
- **Resolution**: ~30m native, resampled to 50m grid
- **Temporal Filter**: Last 6 months, cloud cover < 20%
- **Processing**: Converted from DN to Celsius
- **Visualization**: Continuous polygon grid with value-based colors

## Known Limitations

- Temperature data requires recent cloud-free satellite passes
- OpenStreetMap data quality varies by region
- Large areas (>5km) may take longer to process
- Google Earth Engine has usage quotas

## Development

```bash
# Frontend development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Backend with auto-reload
# (Install uvicorn[standard] for auto-reload)
cd MapLayers
uvicorn api:app --reload
```

## License

This project uses:
- OpenStreetMap data (© OpenStreetMap contributors, ODbL)
- Google Earth Engine (subject to Google's terms)
- Mapbox GL JS (subject to Mapbox terms)

## Credits

Built with:
- React + Vite
- Mapbox GL JS
- FastAPI
- Google Earth Engine
- OpenStreetMap

---

**Last Updated**: 11 December 2025
