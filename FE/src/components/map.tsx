import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Feature } from 'geojson';
import { DangerZone, 
  DrawCreateEvent, 
  DrawDeleteEvent, 
  View,  
  Coordinates } from '@/Types';
import { FeatureCollection, Point } from "geojson";
import { distance } from '@turf/turf';
import { polygon } from '@turf/turf'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_KEY || ''

interface MapProps {
  setDestinationCoords: (coords: Coordinates) => void;
  destinationCoords: [number, number] | null;
}

export default function Map({ setDestinationCoords, destinationCoords }: MapProps) {
  const waypointMarkers = useRef<mapboxgl.Marker[]>([]);
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const draw = useRef<MapboxDraw | null>(null)
  const destinationMarker = useRef<mapboxgl.Marker | null>(null)
  const unLabelRef = useRef<mapboxgl.Popup | null>(null)
  
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [dangerZones, setDangerZones] = useState<DangerZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDrawingMode, setIsDrawingMode] = useState<View>("Map")

  const addUNPolygon = (map: mapboxgl.Map) => {
    // Add source for UN polygon
    map.addSource('un-area', {
      'type': 'geojson',
      'data': {
        'type': 'Feature',
        'properties': {},
        'geometry': {
          'type': 'Polygon',
          'coordinates': [[
            [151.23349,-33.88233],
            [151.27742,-33.87606],
            [151.25872,-33.91023],
            [151.21668,-33.90553],
            [151.23349,-33.88233]
          ]]
        }
      }
    });

    // Add fill layer
    map.addLayer({
      'id': 'un-area-fill',
      'type': 'fill',
      'source': 'un-area',
      'layout': {},
      'paint': {
        'fill-color': '#0066ff',
        'fill-opacity': 0.3
      }
    });

    // Add outline layer
    map.addLayer({
      'id': 'un-area-outline',
      'type': 'line',
      'source': 'un-area',
      'layout': {},
      'paint': {
        'line-color': '#0066ff',
        'line-width': 2
      }
    });

    // Add persistent label
    const center: [number, number] = [151.2165, -33.8965];
    unLabelRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    })
      .setLngLat(center)
      .setHTML('<div class="font-bold text-blue-600">UNHCR</div>')
      .addTo(map);
  };

  const updateMapWithDangerZones = () => {
    if (!map.current || !draw.current) return;

    // Clear existing drawings
    const features = draw.current.getAll().features;
    features.forEach(feature => {
      const featureId = feature.id?.toString();
      if (featureId) {
        draw.current?.delete(featureId);
      }
    });
    console.log(dangerZones);
    // Add all danger zones to the map
    dangerZones.forEach(zone => {
      const newFeature: Feature = {
        id: zone.id,
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: zone.coordinates
        }
      };
      draw.current?.add(newFeature);
    });
  };


  useEffect(() => {
    if (map.current && draw.current) {
      updateMapWithDangerZones();
    }
  }, [dangerZones]);

  const generateExclusionPoints = async (
    zone: DangerZone,
    density: number = 5
  ): Promise<string[]> => {
    const poly = polygon(zone.coordinates);
    const bounds = poly.geometry.coordinates[0];
    const points: [number, number][] = [];
  
    // 1. Generate boundary points with dynamic density
    bounds.forEach((coord, i) => {
      if (i < bounds.length - 1) {
        const start = coord;
        const end = bounds[i + 1];
        
        const edgeLength = distance(start, end, { units: 'meters' });
        const stepCount = Math.ceil(edgeLength / density); // Points every 5m
  
        for (let j = 0; j <= stepCount; j++) {
          const ratio = j / stepCount;
          const lon = start[0] + (end[0] - start[0]) * ratio;
          const lat = start[1] + (end[1] - start[1]) * ratio;
          points.push([lon, lat]);
        }
      }
    });
    
    // 3. Spatial deduplication using precision-based hashing
    const snappedPoints: string[] = [];
  const grid = new Set<string>();
  const precision = 5; // ~1m precision (5 decimal places)

  // Process points in smaller chunks
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    try {
      const response = await fetch(
        `https://api.mapbox.com/matching/v5/mapbox/driving/${chunk
          .map(([lon, lat]) => `${lon},${lat}`)
          .join(";")}?access_token=${mapboxgl.accessToken}&geometries=geojson&radiuses=${Array(chunk.length).fill(25).join(";")}`
      );

      const data = await response.json();
      if (data.code === "Ok" && data.tracepoints) {
        data.tracepoints.forEach((tracepoint: any) => {
          if (tracepoint?.location) {
            const [lon, lat] = tracepoint.location;
            
            // Create more precise spatial hash
            const latKey = Math.round(lat * 10 ** precision);
            const lonKey = Math.round(lon * 10 ** precision);
            const key = `${latKey}|${lonKey}`;

            if (!grid.has(key)) {
              grid.add(key);
              snappedPoints.push(`point(${lon} ${lat})`);
            }
          }
        });
      }
    } catch (err) {
      console.error("Error processing points chunk:", err);
    }
  }

  return snappedPoints;
};
  

  // Place a marker when destinationCoords changes
  useEffect(() => {
    if (destinationMarker.current) {
      destinationMarker.current.remove();
      destinationMarker.current = null;
    }

    if (destinationCoords && map.current) {
      const currentZoom = map.current?.getZoom();

      destinationMarker.current = new mapboxgl.Marker({ color: '#FF0000' })
        .setLngLat(destinationCoords)
        .addTo(map.current);

      map.current.flyTo({ center: destinationCoords, zoom: currentZoom });
    }
  }, [destinationCoords]);

  useEffect(() => {
    if(destinationCoords){
      getRoute();
    }
    console.log(dangerZones);
  }, [dangerZones]);

  
  // Get user's location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setUserLocation([151.20800,-33.90117])
          setLoading(false)
        },
        (error) => {
          setError('Error getting location: ' + error.message)
          setLoading(false)
        }
      )
    } else {
      setError('Geolocation is not supported by your browser')
      setLoading(false)
    }
  }, []);
  
  const clearWaypointMarkers = () => {
    waypointMarkers.current.forEach(marker => marker.remove());
    waypointMarkers.current = [];
  };
  
  // Initialize map
  useEffect(() => {
    if (!map.current && userLocation && mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: userLocation,
        zoom: 4
      })
  
      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl())
  
      // Initialize draw control
      draw.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true
        },
        defaultMode: 'simple_select'
      })
  
      map.current.addControl(draw.current)
  
      // Add user location marker
      new mapboxgl.Marker({ color: '#0000FF' })
        .setLngLat([151.20800,-33.90117])
        .addTo(map.current)
      
      map.current.on('load', () => {
        addUNPolygon(map.current!);
      });
      
      // Add click handler for setting destination
      map.current.on('click', (e) => {
        
        if (draw.current?.getMode() === 'simple_select') {
          const currentZoom = map.current?.getZoom();
          const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]
            
          // Remove existing destination marker if it exists
          if (destinationMarker.current) {
            destinationMarker.current.remove()
          }
  
          // Create new destination marker
          destinationMarker.current = new mapboxgl.Marker({ color: '#FF0000' })
            .setLngLat(coords)
            .addTo(map.current!)
          if (!currentZoom) return;
          map.current?.setZoom(currentZoom);
          
          setDestinationCoords(coords)
          
        }
      })
  
      // Handle drawn polygons
      // Update the draw.create event handler
      map.current.on('draw.create', (e: DrawCreateEvent) => {
        const features = e.features;
        const newZones = features.map((feature: Feature) => {
          if (feature.geometry.type === 'Polygon') {
            return {
              id: feature.id as string,
              coordinates: feature.geometry.coordinates as number[][][],
            };
          }
          return null;
        }).filter((zone): zone is DangerZone => zone !== null);

        setDangerZones(prev => [...prev, ...newZones]);
        setIsDrawingMode("Map"); 
      });
        
  
      // Update the draw.delete event handler
      map.current.on('draw.delete', (e: DrawDeleteEvent) => {
        const deletedIds = e.features.map(feature => feature.id);
        setDangerZones(prev => prev.filter(zone => !deletedIds.includes(zone.id)));
      });
    }
  }, [userLocation, map.current]) 
  
  // Function to get route from Mapbox Directions API
  const getRoute = async () => {
    if (!userLocation || !destinationCoords) {
      setError('Please select a destination first')
      return
    } 

    try {
      clearWaypointMarkers();
        
      const exclusionPoints: string[] = [];
      for (const zone of dangerZones) {
        const zonePoints = await generateExclusionPoints(zone);
        exclusionPoints.push(...zonePoints);
      }
      
      const limitedPoints = (() => {
        const totalPoints = exclusionPoints.length;
        const desiredCount = 50;
        
        if (totalPoints <= desiredCount) {
          return exclusionPoints; // If there are 50 or fewer points, return them all
        }
        
        const step = Math.floor(totalPoints / desiredCount); // Calculate the step size
        return exclusionPoints.filter((_, index) => index % step === 0).slice(0, desiredCount); // Uniformly pick points
      })();
            
      // Create the exclusion string for the API
      const excludeString = limitedPoints.join(',');


      if (!map.current || (dangerZones.length > 0 && exclusionPoints.length === 0)) return;
        
      // Convert WKT points to GeoJSON format
      if(process.env.NEXT_PUBLIC_ENVIRONMENT === "development") {
        const exclusionGeoJSON: FeatureCollection<Point> = {
          type: "FeatureCollection",
          features: limitedPoints.map((wktPoint) => {
            const match = wktPoint.match(/point\(([^)]+)\)/i);
            if (!match) return null; // Skip invalid points
            const [lon, lat] = match[1].split(" ").map(Number);
            return {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [lon, lat],
              },
              properties: {}, // Include properties if needed
            };
          }).filter((feature) => feature !== null) as FeatureCollection<Point>["features"],
        };
          
        // Remove any existing exclusion points layer
        if (map.current.getLayer("exclusion-points")) {
          map.current.removeLayer("exclusion-points");
          map.current.removeSource("exclusion-points");
        }
          
        // Add the exclusion points layer
        map.current.addSource("exclusion-points", {
          type: "geojson",
          data: exclusionGeoJSON,
        });
      
        map.current.addLayer({
          id: "exclusion-points",
          type: "circle",
          source: "exclusion-points",
          paint: {
            "circle-radius": 5,
            "circle-color": "#FF0000", // Red color for exclusion points
            "circle-stroke-width": 1,
            "circle-stroke-color": "#FFFFFF",
          },
        });
          
        // Fit the map to show all exclusion points
        if(dangerZones.length !== 0) {
        const bounds = new mapboxgl.LngLatBounds();
          exclusionGeoJSON.features.forEach((feature) =>
            bounds.extend(feature.geometry.coordinates as [number, number])
          );
          map.current.fitBounds(bounds, { padding: 50 });
        }
      }
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation[0]},${userLocation[1]};${destinationCoords[0]},${destinationCoords[1]}?` +
        `geometries=geojson&alternatives=true${dangerZones.length === 0 ? `` : `&exclude=${encodeURIComponent(excludeString)}`}&access_token=${mapboxgl.accessToken}`
      );

      console.log(response);
      
      const data = await response.json()
      if (data.message) {
        alert("unable to get a route")
        console.error("API error:", data.message);
      }
  
      if (data.routes && data.routes[0]) {
        // Remove existing route line if it exists
        if (map.current?.getSource('route')) {
          map.current.removeLayer('route');
          map.current.removeSource('route');
        }

        // Add the route line to the map
        map.current?.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: data.routes[0].geometry
          }
        });

        map.current?.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3887be',
            'line-width': 5,
            'line-opacity': 0.75
          }
        });

        // Adjust map bounds to show entire route
        const coordinates = data.routes[0].geometry.coordinates;
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord: [number, number]) => {
          bounds.extend(coord);
        });

        map.current?.fitBounds(bounds, {
          padding: 50
        });
      }
    } catch (err) {
      setError('Error getting route')
      console.error(err)
    }
  }
  
  const toggleDrawingMode = () => {
    const newMode = isDrawingMode === "Map" ? "Draw" : "Map";
    setIsDrawingMode(newMode);
    if (draw.current) {
      // Use the correct mode strings without type assertion
      if (newMode === "Draw") {
        draw.current.changeMode('draw_polygon');
      } else {
        draw.current.changeMode('simple_select');
      }
    }
  };
  
  if (loading) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>
  }

  if (error) {
    return <div className="h-screen flex items-center justify-center text-red-500">{error}</div>
  }
  
  return (
    <main className="h-screen w-full relative">
      <div ref={mapContainer} className="h-full w-full" />
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <button
          onClick={toggleDrawingMode}
          className={`bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-700 transition-colors`}
        >
          {isDrawingMode === "Draw" ? 'Exit Drawing Mode' : 'Draw Danger Zone'}
        </button>
        {destinationCoords && (
          <button
            onClick={getRoute}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 transition-colors"
          >
            Navigate
          </button>
        )}
        {destinationCoords && (
          <button
            onClick={() => setDestinationCoords(null)}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 transition-colors"
          >
            Clear Destination
          </button>
        )}
      </div>
    </main>
  )
}