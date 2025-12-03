import { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'
import { Globe, Thermometer, Download, Image as ImageIcon, MapPin, ExternalLink } from 'lucide-react'

const INITIAL_CENTER = [6.84105, 51.17984] // [lon, lat]
const INITIAL_ZOOM = 14

function App() {
  const mapRef = useRef()
  const mapContainerRef = useRef()

  // Map state
  const [center, setCenter] = useState(INITIAL_CENTER)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)

  // Input state
  const [lat, setLat] = useState(51.17984)
  const [lon, setLon] = useState(6.84105)
  const [sizeKm, setSizeKm] = useState(2.0)

  // Layer data state
  const [sealedData, setSealedData] = useState(null)
  const [unsealedData, setUnsealedData] = useState(null)
  const [temperatureData, setTemperatureData] = useState(null)
  const [tempStats, setTempStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  // Layer control state
  const [showSealed, setShowSealed] = useState(true)
  const [showUnsealed, setShowUnsealed] = useState(true)
  const [showTemperature, setShowTemperature] = useState(false)
  const [sealedOpacity, setSealedOpacity] = useState(60)
  const [unsealedOpacity, setUnsealedOpacity] = useState(80)
  const [temperatureOpacity, setTemperatureOpacity] = useState(70)

  // Temperature scale control
  const [tempScaleMin, setTempScaleMin] = useState(10)
  const [tempScaleMax, setTempScaleMax] = useState(40)

  // Feature info state
  const [clickedFeature, setClickedFeature] = useState(null)

  // Initialize map
  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      center: center,
      zoom: zoom,
      style: 'mapbox://styles/mapbox/satellite-v9',
      preserveDrawingBuffer: true  // Enable PNG export
    });

    mapRef.current.on('move', () => {
      const mapCenter = mapRef.current.getCenter()
      const mapZoom = mapRef.current.getZoom()
      setCenter([mapCenter.lng, mapCenter.lat])
      setZoom(mapZoom)

      // Update input fields as user pans the map
      setLat(mapCenter.lat)
      setLon(mapCenter.lng)
    })

    // Click handler for feature inspection
    mapRef.current.on('click', (e) => {
      const features = mapRef.current.queryRenderedFeatures(e.point, {
        layers: ['sealed-layer', 'unsealed-layer']
      })

      if (features.length > 0) {
        // Process ALL features at click point
        const allFeatures = features.map(feature => {
          const props = feature.properties
          let featureType = 'Unknown'
          let layerType = feature.layer.id === 'sealed-layer' ? 'Sealed' : 'Unsealed'

          if (props.building) featureType = 'Building'
          else if (props.highway) featureType = `Road (${props.highway})`
          else if (props.railway) featureType = 'Railway'
          else if (props.aeroway) featureType = `Airport (${props.aeroway})`
          else if (props.amenity === 'parking') featureType = 'Parking Lot'
          else if (props.landuse) featureType = props.landuse.charAt(0).toUpperCase() + props.landuse.slice(1).replace('_', ' ')
          else if (props.leisure) featureType = props.leisure.charAt(0).toUpperCase() + props.leisure.slice(1).replace('_', ' ')
          else if (props.natural) featureType = props.natural.charAt(0).toUpperCase() + props.natural.slice(1).replace('_', ' ')

          return {
            type: featureType,
            layer: layerType,
            name: props.name || null,
            allProps: props
          }
        })

        // Save ALL features to state for sidebar display
        setClickedFeature(allFeatures)

        // Create popup content for FIRST feature only
        const firstFeature = features[0]
        const props = firstFeature.properties
        let featureType = allFeatures[0].type
        let layerType = allFeatures[0].layer

        let popupContent = `<div style="font-family: Arial, sans-serif;">
          <h3 style="margin: 0 0 8px 0; color: ${firstFeature.layer.id === 'sealed-layer' ? '#dc3545' : '#28a745'};">
            ${featureType}
          </h3>
          <p style="margin: 0; font-size: 12px; color: #666;">
            <strong>Type:</strong> ${layerType} Surface
          </p>`

        // Add name if available
        if (props.name) {
          popupContent += `<p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">
            <strong>Name:</strong> ${props.name}
          </p>`
        }

        // Add count if multiple features
        if (features.length > 1) {
          popupContent += `<p style="margin: 8px 0 0 0; font-size: 11px; color: #999; font-style: italic;">
            +${features.length - 1} more feature(s) - check sidebar
          </p>`
        }

        popupContent += `</div>`

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(mapRef.current)
      }
    })

    // Change cursor on hover
    mapRef.current.on('mouseenter', ['sealed-layer', 'unsealed-layer'], () => {
      mapRef.current.getCanvas().style.cursor = 'pointer'
    })

    mapRef.current.on('mouseleave', ['sealed-layer', 'unsealed-layer'], () => {
      mapRef.current.getCanvas().style.cursor = ''
    })

    return () => {
      mapRef.current.remove()
    }
  }, [])

  // Add layers when data changes (no recreation on opacity change)
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    const addLayers = () => {
      // Add SEALED layer first (bottom)
      if (sealedData) {
        if (map.getLayer('sealed-layer')) map.removeLayer('sealed-layer')
        if (map.getSource('sealed')) map.removeSource('sealed')

        map.addSource('sealed', { type: 'geojson', data: sealedData })
        map.addLayer({
          id: 'sealed-layer',
          type: 'fill',
          source: 'sealed',
          paint: {
            'fill-color': '#dc3545',
            'fill-opacity': sealedOpacity / 100
          }
        })
      }

      // Add UNSEALED layer second (top)
      if (unsealedData) {
        if (map.getLayer('unsealed-layer')) map.removeLayer('unsealed-layer')
        if (map.getSource('unsealed')) map.removeSource('unsealed')

        map.addSource('unsealed', { type: 'geojson', data: unsealedData })
        map.addLayer({
          id: 'unsealed-layer',
          type: 'fill',
          source: 'unsealed',
          paint: {
            'fill-color': '#00ff00',
            'fill-opacity': unsealedOpacity / 100
          }
        })
      }

      // Add TEMPERATURE layer (POLYGONS for continuous smooth coverage)
      if (temperatureData && tempStats) {
        if (map.getLayer('temperature-layer')) map.removeLayer('temperature-layer')
        if (map.getSource('temperature')) map.removeSource('temperature')

        map.addSource('temperature', { type: 'geojson', data: temperatureData })
        map.addLayer({
          id: 'temperature-layer',
          type: 'fill',  // Changed to 'fill' for polygon rendering
          source: 'temperature',
          paint: {
            // COLOR based on temperature value - creates smooth continuous surface
            'fill-color': [
              'interpolate', ['linear'],
              ['get', 'temperature'],
              tempScaleMin, '#0000ff',                                          // Blue (cold)
              tempScaleMin + (tempScaleMax - tempScaleMin) * 0.25, '#00ffff',  // Cyan
              tempScaleMin + (tempScaleMax - tempScaleMin) * 0.5, '#00ff00',   // Green
              tempScaleMin + (tempScaleMax - tempScaleMin) * 0.75, '#ffff00',  // Yellow
              tempScaleMax, '#ff0000'                                           // Red (hot)
            ],
            // Overall opacity
            'fill-opacity': temperatureOpacity / 100
          }
        })
      }
    }

    if (map.isStyleLoaded()) {
      addLayers()
    } else {
      map.on('load', addLayers)
    }
  }, [sealedData, unsealedData, temperatureData, tempStats])

  // Update temperature scale independently (without recreating layer)
  useEffect(() => {
    if (!mapRef.current?.getLayer('temperature-layer')) return
    mapRef.current.setPaintProperty('temperature-layer', 'fill-color', [
      'interpolate', ['linear'],
      ['get', 'temperature'],
      tempScaleMin, '#0000ff',
      tempScaleMin + (tempScaleMax - tempScaleMin) * 0.25, '#00ffff',
      tempScaleMin + (tempScaleMax - tempScaleMin) * 0.5, '#00ff00',
      tempScaleMin + (tempScaleMax - tempScaleMin) * 0.75, '#ffff00',
      tempScaleMax, '#ff0000'
    ])
  }, [tempScaleMin, tempScaleMax])

  // Update opacity smoothly without recreating layers
  useEffect(() => {
    if (!mapRef.current?.getLayer('sealed-layer')) return
    mapRef.current.setPaintProperty('sealed-layer', 'fill-opacity', sealedOpacity / 100)
  }, [sealedOpacity])

  useEffect(() => {
    if (!mapRef.current?.getLayer('unsealed-layer')) return
    mapRef.current.setPaintProperty('unsealed-layer', 'fill-opacity', unsealedOpacity / 100)
  }, [unsealedOpacity])

  useEffect(() => {
    if (!mapRef.current?.getLayer('temperature-layer')) return
    mapRef.current.setPaintProperty('temperature-layer', 'fill-opacity', temperatureOpacity / 100)
  }, [temperatureOpacity])

  // Update visibility toggles
  useEffect(() => {
    if (!mapRef.current?.getLayer('sealed-layer')) return
    mapRef.current.setLayoutProperty('sealed-layer', 'visibility', showSealed ? 'visible' : 'none')
  }, [showSealed])

  useEffect(() => {
    if (!mapRef.current?.getLayer('unsealed-layer')) return
    mapRef.current.setLayoutProperty('unsealed-layer', 'visibility', showUnsealed ? 'visible' : 'none')
  }, [showUnsealed])

  useEffect(() => {
    if (!mapRef.current?.getLayer('temperature-layer')) return
    mapRef.current.setLayoutProperty('temperature-layer', 'visibility', showTemperature ? 'visible' : 'none')
  }, [showTemperature])

  // Fetch layers from API
  const fetchLayers = async () => {
    setLoading(true)
    setStatus('Fetching data from OpenStreetMap...')

    try {
      const response = await fetch('http://localhost:8000/api/generate-layers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
          size_km: sizeKm
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to fetch layers')
      }

      const data = await response.json()

      console.log('📊 API Response:', {
        sealed_count: data.sealed_count,
        unsealed_count: data.unsealed_count,
        sealed_features: data.sealed_geojson?.features?.length || 0,
        unsealed_features: data.unsealed_geojson?.features?.length || 0
      })

      setSealedData(data.sealed_geojson)
      setUnsealedData(data.unsealed_geojson)
      setStatus(`Success! Found ${data.sealed_count} sealed and ${data.unsealed_count} unsealed features.`)

      // Fly to location
      mapRef.current.flyTo({
        center: [lon, lat],
        zoom: 13
      })

    } catch (error) {
      setStatus(`Error: ${error.message}`)
      console.error('Error fetching layers:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch temperature data from Google Earth Engine
  const fetchTemperature = async () => {
    setLoading(true)
    setStatus('Fetching temperature data from Google Earth Engine...')

    try {
      const response = await fetch('http://localhost:8000/api/surface-temperature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
          size_km: sizeKm
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to fetch temperature data')
      }

      const data = await response.json()

      console.log('🌡️ Temperature Response:', {
        features: data.temperature_data?.features?.length || 0,
        min: data.min_temp,
        max: data.max_temp,
        mean: data.mean_temp,
        date: data.image_date
      })

      // Data is already in GeoJSON format from backend
      setTemperatureData(data.temperature_data)
      setTempStats({
        min: data.min_temp,
        max: data.max_temp,
        mean: data.mean_temp,
        date: data.image_date
      })
      // Auto-set scale to actual data range
      setTempScaleMin(Math.floor(data.min_temp))
      setTempScaleMax(Math.ceil(data.max_temp))
      setShowTemperature(true)
      setStatus(`Temperature data loaded! Date: ${data.image_date}`)

    } catch (error) {
      setStatus(`Error: ${error.message}`)
      console.error('Error fetching temperature:', error)
    } finally {
      setLoading(false)
    }
  }

  // Download GeoJSON
  const downloadGeoJSON = (data, filename) => {
    try {
      console.log('Download initiated:', filename)
      console.log('Data exists:', !!data)

      if (!data) {
        console.error('No data to download')
        return
      }

      const jsonString = JSON.stringify(data, null, 2)
      console.log('JSON size:', jsonString.length, 'bytes')

      const blob = new Blob([jsonString], { type: 'application/json' })
      console.log('Blob created:', blob.size, 'bytes')

      const url = URL.createObjectURL(blob)
      console.log('Blob URL:', url)

      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.setAttribute('download', filename) // Explicitly set download attribute
      link.style.display = 'none'

      document.body.appendChild(link)
      console.log('Link appended to body')

      // Force download
      link.click()
      console.log('Link clicked')

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        console.log('Cleanup complete')
      }, 100)
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  // Helper function to convert GeoJSON to PNG image
  const geojsonToPNG = (geojson, color, filename) => {
    if (!mapRef.current || !geojson) return

    const map = mapRef.current
    const canvas = document.createElement('canvas')
    const mapCanvas = map.getCanvas()

    // Match map dimensions
    canvas.width = mapCanvas.width
    canvas.height = mapCanvas.height
    const ctx = canvas.getContext('2d')

    // Transparent background (no fill)
    // ctx is already transparent by default

    // Calculate bounding box of all features to center them
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const projectedFeatures = []

    geojson.features.forEach(feature => {
      if (feature.geometry.type === 'Polygon') {
        const coords = feature.geometry.coordinates[0]
        const projectedCoords = coords.map(coord => {
          const point = map.project(coord)
          minX = Math.min(minX, point.x)
          minY = Math.min(minY, point.y)
          maxX = Math.max(maxX, point.x)
          maxY = Math.max(maxY, point.y)
          return point
        })
        projectedFeatures.push(projectedCoords)
      }
    })

    // Calculate offset to center polygons
    const boundsWidth = maxX - minX
    const boundsHeight = maxY - minY
    const offsetX = (canvas.width - boundsWidth) / 2 - minX
    const offsetY = (canvas.height - boundsHeight) / 2 - minY

    // Set polygon style
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 1

    // Draw each feature with centering offset
    projectedFeatures.forEach(coords => {
      ctx.beginPath()
      coords.forEach((point, idx) => {
        const x = point.x + offsetX
        const y = point.y + offsetY
        if (idx === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })

    // Convert to blob and download (PNG supports transparency)
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }, 'image/png')
  }

  // Download PNG - Unsealed layer only (polygons only, transparent background)
  const downloadUnsealedPNG = () => {
    geojsonToPNG(
      unsealedData,
      '#00ff00',
      `unsealed_polygons_${lat.toFixed(5)}_${lon.toFixed(5)}.png`
    )
  }

  // Download PNG - Sealed layer only (polygons only, transparent background)
  const downloadSealedPNG = () => {
    geojsonToPNG(
      sealedData,
      '#dc3545',
      `sealed_polygons_${lat.toFixed(5)}_${lon.toFixed(5)}.png`
    )
  }

  // Download PNG - Combined (satellite + both layers at current opacity)
  const downloadCombinedPNG = () => {
    if (!mapRef.current) return

    const map = mapRef.current

    // Function to capture and download
    const captureMap = () => {
      const canvas = map.getCanvas()
      if (!canvas) {
        console.error('Canvas not available')
        return
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create blob')
          return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `combined_${lat.toFixed(5)}_${lon.toFixed(5)}.png`
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 100)
      }, 'image/png')
    }

    // Check if map is already idle
    if (map.loaded() && !map.isMoving()) {
      // Map is ready, capture immediately
      captureMap()
    } else {
      // Wait for map to become idle
      map.once('idle', captureMap)
    }
  }

  return (
    <>
      <div className="sidebar">
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img
            src="/static/images/logo-HENN.png"
            alt="HENN Logo"
            style={{ maxWidth: '120px', height: 'auto' }}
          />
        </div>

        <h2>Surface Layers Visualizer</h2>
        <p style={{ fontSize: '12px', color: '#666', margin: '0 0 15px 0' }}>
          Fetch sealed and unsealed surface layers from OpenStreetMap
        </p>

        {/* Location Settings */}
        <div className="section">
          <h3>Location Settings</h3>

          <p style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
            Enter coordinates manually or use{' '}
            <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>
              Google Maps <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </a>
            {' / '}
            <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>
              OpenStreetMap <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </a>
            {' '}to find coordinates.
          </p>

          <label>
            Latitude
            <input
              type="number"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value))}
              step="0.000001"
              min="-90"
              max="90"
            />
          </label>

          <label>
            Longitude
            <input
              type="number"
              value={lon}
              onChange={(e) => setLon(parseFloat(e.target.value))}
              step="0.000001"
              min="-180"
              max="180"
            />
          </label>

          <button
            onClick={() => {
              mapRef.current.flyTo({
                center: [lon, lat],
                zoom: 14
              })
            }}
            className="update-map-button"
            style={{ marginBottom: '12px' }}
          >
            <MapPin size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Update Map
          </button>

          <label>
            Area Size (km): {sizeKm}
            <input
              type="range"
              value={sizeKm}
              onChange={(e) => setSizeKm(parseFloat(e.target.value))}
              min="0.5"
              max="10"
              step="0.5"
            />
          </label>

          <button
            onClick={fetchLayers}
            disabled={loading}
            className="generate-button"
          >
            <Globe size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {loading ? 'Loading...' : 'Generate Layers'}
          </button>

          <button
            onClick={fetchTemperature}
            disabled={loading}
            className="generate-button"
            style={{ marginTop: '10px', backgroundColor: '#ff6b35' }}
          >
            <Thermometer size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {loading ? 'Loading...' : 'Fetch Temperature'}
          </button>

          {status && (
            <div className={`status ${status.includes('Error') ? 'error' : 'success'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Layer Controls */}
        {(sealedData || unsealedData) && (
          <div className="section">
            <h3>Surface Layer Controls</h3>

            <div className="layer-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showSealed}
                  onChange={(e) => setShowSealed(e.target.checked)}
                />
                <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Sealed Surfaces</span>
              </label>
              <label className="slider-label">
                Opacity: {sealedOpacity}%
                <input
                  type="range"
                  value={sealedOpacity}
                  onChange={(e) => setSealedOpacity(parseInt(e.target.value))}
                  min="0"
                  max="100"
                  disabled={!showSealed}
                />
              </label>
            </div>

            <div className="layer-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showUnsealed}
                  onChange={(e) => setShowUnsealed(e.target.checked)}
                />
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>Unsealed Surfaces</span>
              </label>
              <label className="slider-label">
                Opacity: {unsealedOpacity}%
                <input
                  type="range"
                  value={unsealedOpacity}
                  onChange={(e) => setUnsealedOpacity(parseInt(e.target.value))}
                  min="0"
                  max="100"
                  disabled={!showUnsealed}
                />
              </label>
            </div>

            {/* Legend for Surface Layers */}
            <div style={{ marginTop: '15px', fontSize: '11px', color: '#666' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#dc3545' }}>🔴 Sealed Surfaces:</strong>
                <div style={{ marginLeft: '15px', marginTop: '3px', lineHeight: '1.6' }}>
                  Buildings, Parking lots, Roads/Highways, Railways, Runways/Helipads,
                  Industrial/Commercial areas, Sports facilities (pitches, tracks), Construction sites
                </div>
              </div>
              <div>
                <strong style={{ color: '#28a745' }}>🟢 Unsealed Surfaces:</strong>
                <div style={{ marginLeft: '15px', marginTop: '3px', lineHeight: '1.6' }}>
                  Forests, Parks, Gardens, Grasslands, Farmland, Meadows, Orchards, Vineyards,
                  Wetlands, Beaches, Allotments, Cemeteries, Golf courses, Nature reserves
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Temperature Controls - INDEPENDENT SECTION */}
        {temperatureData && (
          <div className="section">
            <h3>Temperature Controls</h3>

            <div className="layer-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showTemperature}
                  onChange={(e) => setShowTemperature(e.target.checked)}
                />
                <span style={{ color: '#ff6b35', fontWeight: 'bold' }}>Show Temperature</span>
              </label>
              <label className="slider-label">
                Opacity: {temperatureOpacity}%
                <input
                  type="range"
                  value={temperatureOpacity}
                  onChange={(e) => setTemperatureOpacity(parseInt(e.target.value))}
                  min="0"
                  max="100"
                  disabled={!showTemperature}
                />
              </label>
            </div>

            {/* Temperature Scale Controls */}
            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #ddd' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
                🎨 Color Scale Range
              </div>
              <label className="slider-label">
                Min: {tempScaleMin}°C
                <input
                  type="range"
                  value={tempScaleMin}
                  onChange={(e) => setTempScaleMin(parseInt(e.target.value))}
                  min={tempStats ? Math.floor(tempStats.min - 5) : 0}
                  max={tempScaleMax - 1}
                />
              </label>
              <label className="slider-label">
                Max: {tempScaleMax}°C
                <input
                  type="range"
                  value={tempScaleMax}
                  onChange={(e) => setTempScaleMax(parseInt(e.target.value))}
                  min={tempScaleMin + 1}
                  max={tempStats ? Math.ceil(tempStats.max + 5) : 50}
                />
              </label>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>
                💡 Adjust to enhance color contrast
              </div>
            </div>

            {/* Temperature Statistics */}
            {tempStats && (
              <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', padding: '8px', backgroundColor: '#fff5f0', borderRadius: '4px' }}>
                <div><strong>Data Min:</strong> {tempStats.min.toFixed(1)}°C</div>
                <div><strong>Data Max:</strong> {tempStats.max.toFixed(1)}°C</div>
                <div><strong>Mean:</strong> {tempStats.mean.toFixed(1)}°C</div>
                <div style={{ marginTop: '4px', fontSize: '10px', color: '#999' }}>
                  <strong>Date:</strong> {tempStats.date}
                </div>
              </div>
            )}

            {/* Temperature Legend */}
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#666' }}>
              <strong style={{ color: '#ff6b35' }}>🌡️ Surface Temperature:</strong>
              <div style={{ marginLeft: '15px', marginTop: '6px' }}>
                <div style={{
                  height: '20px',
                  background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)',
                  borderRadius: '3px',
                  border: '1px solid #ddd'
                }}></div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '3px',
                  fontSize: '10px',
                  color: '#333',
                  fontWeight: 'bold'
                }}>
                  <span>{tempScaleMin}°C</span>
                  <span>{tempScaleMax}°C</span>
                </div>
                <div style={{ marginTop: '4px', fontSize: '10px', fontStyle: 'italic', color: '#999' }}>
                  Based on Landsat 8/9 thermal imagery
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feature Info Section */}
        {clickedFeature && (
          <div className="section">
            <h3>📍 Clicked Location ({Array.isArray(clickedFeature) ? clickedFeature.length : 1} feature{Array.isArray(clickedFeature) ? 's' : ''})</h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {(Array.isArray(clickedFeature) ? clickedFeature : [clickedFeature]).map((feature, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px',
                    marginBottom: idx < (Array.isArray(clickedFeature) ? clickedFeature.length : 1) - 1 ? '8px' : '0',
                    backgroundColor: feature.layer === 'Sealed' ? '#fff5f5' : '#f0fff4',
                    borderLeft: `4px solid ${feature.layer === 'Sealed' ? '#dc3545' : '#28a745'}`,
                    borderRadius: '4px'
                  }}
                >
                  <div style={{ marginBottom: '8px' }}>
                    <strong style={{
                      fontSize: '15px',
                      color: feature.layer === 'Sealed' ? '#dc3545' : '#28a745'
                    }}>
                      {idx + 1}. {feature.type}
                    </strong>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                    <strong>Surface Type:</strong> {feature.layer}
                  </div>
                  {feature.name && (
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      <strong>Name:</strong> {feature.name}
                    </div>
                  )}
                  {/* Show all properties */}
                  {feature.allProps && Object.keys(feature.allProps).length > 0 && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ fontSize: '11px', color: '#666', cursor: 'pointer' }}>
                        View all properties ({Object.keys(feature.allProps).length})
                      </summary>
                      <div style={{
                        marginTop: '6px',
                        padding: '8px',
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontFamily: 'monospace'
                      }}>
                        {Object.entries(feature.allProps).map(([key, value]) => (
                          <div key={key} style={{ marginBottom: '3px' }}>
                            <strong>{key}:</strong> {value}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '8px', fontStyle: 'italic' }}>
              💡 Click on any surface to see details
            </div>
          </div>
        )}

        {/* Download Section */}
        {(sealedData || unsealedData) && (
          <div className="section">
            <h3>Download Data (GeoJSON)</h3>

            {sealedData && (
              <button
                onClick={() => downloadGeoJSON(sealedData, `sealed_${lat}_${lon}.geojson`)}
                className="download-button sealed"
              >
                <Download size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Sealed Surfaces GeoJSON
              </button>
            )}

            {unsealedData && (
              <button
                onClick={() => downloadGeoJSON(unsealedData, `unsealed_${lat}_${lon}.geojson`)}
                className="download-button unsealed"
              >
                <Download size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Unsealed Surfaces GeoJSON
              </button>
            )}
          </div>
        )}

        {/* PNG Export Section */}
        {(sealedData || unsealedData) && (
          <div className="section">
            <h3>Export as PNG Image</h3>
            <p style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
              Export map view of the selected area as PNG
            </p>

            {sealedData && (
              <button
                onClick={downloadSealedPNG}
                className="download-button sealed"
                style={{ marginBottom: '8px' }}
              >
                <ImageIcon size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Sealed Only (PNG)
              </button>
            )}

            {unsealedData && (
              <button
                onClick={downloadUnsealedPNG}
                className="download-button unsealed"
                style={{ marginBottom: '8px' }}
              >
                <ImageIcon size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Unsealed Only (PNG)
              </button>
            )}

            <button
              onClick={downloadCombinedPNG}
              className="download-button"
              style={{
                backgroundColor: '#007bff',
                marginBottom: '8px'
              }}
            >
              <Globe size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Screenshot of View
            </button>
          </div>
        )}
      </div>

      <div id='map-container' ref={mapContainerRef}>
        {/* Center crosshair pointer */}
        <div className="map-crosshair">
          <div className="crosshair-circle"></div>
        </div>
      </div>
    </>
  )
}

export default App
