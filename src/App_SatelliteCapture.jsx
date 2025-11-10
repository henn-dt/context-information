import { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'

import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css'

const INITIAL_CENTER = [6.843066, 51.17196] // [lon, lat]
const INITIAL_ZOOM = 14.95

// Your Forma bbox (example - replace with actual values)
const FORMA_BBOX = {
  west: -979.021118164062,
  south: -920.721313476562,
  east: 977.978881835938,
  north: 920.278686523438
}

const FORMA_REF_POINT = [51.17196, 6.843066] // [lat, lon]

function App() {
  const mapRef = useRef()
  const mapContainerRef = useRef()

  const [center, setCenter] = useState(INITIAL_CENTER)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [capturedImage, setCapturedImage] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 1280, height: 1280 })

  useEffect(() => {
    mapboxgl.accessToken = 'pk.eyJ1IjoiYWJjaGFpMjUiLCJhIjoiY21ncDl3cnB6MjYzZjJpc2c1bm8zcHFseiJ9.DHY38ZTBczp4mxIJthZDOg'
    
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      center: center,
      zoom: zoom,
      style: 'mapbox://styles/mapbox/satellite-v9',
      preserveDrawingBuffer: true, // CRITICAL for capturing images!
      attributionControl: false // Remove attribution like Forma does
    });

    mapRef.current.on('move', () => {
      const mapCenter = mapRef.current.getCenter()
      const mapZoom = mapRef.current.getZoom()
      setCenter([mapCenter.lng, mapCenter.lat])
      setZoom(mapZoom)
    })

    return () => {
      mapRef.current.remove()
    }
  }, [])

  // Calculate image dimensions based on bbox aspect ratio (like Forma does)
  const calculateImageDimensions = (bbox, maxSize = 1280) => {
    const bboxWidth = Math.abs(bbox.east - bbox.west)
    const bboxHeight = Math.abs(bbox.north - bbox.south)
    const aspectRatio = bboxWidth / bboxHeight
    
    let width, height
    
    if (aspectRatio > 1) {
      width = maxSize
      height = Math.round(maxSize / aspectRatio)
    } else {
      height = maxSize
      width = Math.round(maxSize * aspectRatio)
    }
    
    return { width, height }
  }

  // Transform UTM bbox to lat/lon
  const transformBboxToLatLon = (utmBbox, refPoint) => {
    const [refLat, refLon] = refPoint
    
    // Meters per degree at this latitude
    const metersPerDegreeLat = 111320
    const metersPerDegreeLon = 111320 * Math.cos(refLat * Math.PI / 180)
    
    // Convert bbox offsets to lat/lon
    const westLon = refLon + (utmBbox.west / metersPerDegreeLon)
    const eastLon = refLon + (utmBbox.east / metersPerDegreeLon)
    const southLat = refLat + (utmBbox.south / metersPerDegreeLat)
    const northLat = refLat + (utmBbox.north / metersPerDegreeLat)
    
    const center = {
      lat: (southLat + northLat) / 2,
      lon: (westLon + eastLon) / 2
    }
    
    return { center }
  }

  // Capture image from current map view (Simple method)
  const captureCurrentView = () => {
    if (!mapRef.current) return
    
    const canvas = mapRef.current.getCanvas()
    const dataURL = canvas.toDataURL('image/png')
    setCapturedImage(dataURL)
    console.log('✅ Image captured from current view')
  }

  // Capture image with specific parameters (Like Forma does)
  const captureFormaStyleImage = async () => {
    // Calculate dimensions based on bbox
    const dimensions = calculateImageDimensions(FORMA_BBOX)
    setImageSize(dimensions)
    
    // Transform bbox to lat/lon
    const transformed = transformBboxToLatLon(FORMA_BBOX, FORMA_REF_POINT)
    
    console.log('Creating off-screen map for capture...')
    console.log('Dimensions:', dimensions)
    console.log('Center:', transformed.center)
    console.log('Zoom:', zoom)
    
    // Create hidden container
    const container = document.createElement('div')
    container.style.width = `${dimensions.width}px`
    container.style.height = `${dimensions.height}px`
    container.style.position = 'absolute'
    container.style.left = '-9999px'
    document.body.appendChild(container)
    
    // Create temporary map for capture
    const tempMap = new mapboxgl.Map({
      container: container,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [transformed.center.lon, transformed.center.lat],
      zoom: zoom,
      preserveDrawingBuffer: true,
      attributionControl: false,
      interactive: false
    })
    
    // Wait for map to load and capture
    tempMap.on('load', () => {
      // Wait for all tiles to load
      tempMap.on('idle', () => {
        const canvas = tempMap.getCanvas()
        const dataURL = canvas.toDataURL('image/png')
        setCapturedImage(dataURL)
        
        // Cleanup
        tempMap.remove()
        document.body.removeChild(container)
        
        console.log('✅ Forma-style image captured!')
        console.log(`Image size: ${dimensions.width}×${dimensions.height}`)
      })
    })
  }

  // Download captured image
  const downloadImage = () => {
    if (!capturedImage) return
    
    const link = document.createElement('a')
    link.download = `satellite_tile_${zoom.toFixed(2)}_${Date.now()}.png`
    link.href = capturedImage
    link.click()
    console.log('✅ Image downloaded')
  }

  const handleReset = () => {
    mapRef.current.flyTo({
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM
    })
  }

  return (
    <>
      <div className="sidebar">
        Longitude: {center[0].toFixed(6)} | Latitude: {center[1].toFixed(6)} | Zoom: {zoom.toFixed(2)}
      </div>
      
      <div className="controls" style={{
        position: 'absolute',
        top: '60px',
        left: '10px',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <button className='reset-button' onClick={handleReset}>
          🔄 Reset View
        </button>
        
        <button 
          onClick={captureCurrentView}
          style={{
            padding: '10px 15px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📸 Capture Current View
        </button>
        
        <button 
          onClick={captureFormaStyleImage}
          style={{
            padding: '10px 15px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🎯 Capture Forma-Style Image
        </button>
        
        {capturedImage && (
          <button 
            onClick={downloadImage}
            style={{
              padding: '10px 15px',
              backgroundColor: '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            💾 Download Image
          </button>
        )}
      </div>
      
      <div id='map-container' ref={mapContainerRef}/>
      
      {capturedImage && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          zIndex: 1,
          backgroundColor: 'white',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          maxWidth: '300px'
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
            Captured Image Preview ({imageSize.width}×{imageSize.height})
          </h4>
          <img 
            src={capturedImage} 
            alt="Captured satellite view" 
            style={{ 
              width: '100%', 
              border: '1px solid #ddd',
              borderRadius: '4px'
            }} 
          />
        </div>
      )}
    </>
  )
}

export default App