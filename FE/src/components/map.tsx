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
import { polygon, pointGrid, bbox} from '@turf/turf'

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
  
  const [isFetching, setIsFetching] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [dangerZones, setDangerZones] = useState<DangerZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDrawingMode, setIsDrawingMode] = useState<View>("Map")

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

  const fetchDangerZones = async () => {
    if (isFetching) return; // Prevent multiple simultaneous fetches
    
    try {
      setIsFetching(true);
      const response = await fetch('http://localhost:8000/get/');
      const data = await response.json();
      
      // Remove existing danger zone drawings
      if (draw.current) {
        const features = draw.current.getAll().features;
        features.forEach(feature => {
          // Only attempt to delete if we have a valid string ID
          const featureId = feature.id?.toString();
          if (featureId) {
            draw.current?.delete(featureId);
          }
        });
      }

      // Add new danger zone from API
      if (map.current && draw.current) {
        const newFeature: Feature = {
          id: data.id,
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: data.coordinates
          }
        };
        
        draw.current.add(newFeature);
        
        // Update danger zones state
        setDangerZones([{
          id: data.id,
          coordinates: data.coordinates
        }]);
      }
    } catch (error) {
      console.error('Error fetching danger zones:', error);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (map.current && draw.current) {
      updateMapWithDangerZones();
    }
  }, [dangerZones]);

  useEffect(() => {
    fetchDangerZones();
    const interval = setInterval(fetchDangerZones, 55000);
    return () => clearInterval(interval);
  }, []);

  const generateExclusionPoints = async (
    zone: DangerZone,
    density: number = 20
  ): Promise<string[]> => {
    const poly = polygon(zone.coordinates);
    const bounds = poly.geometry.coordinates[0];
    const points: [number, number][] = [];
  
    // Generate boundary points
    bounds.forEach((coord, i) => {
      if (i < bounds.length - 1) {
        const start = bounds[i];
        const end = bounds[i + 1];
        for (let j = 0; j <= density; j++) {
          const ratio = j / density;
          const lon = start[0] + (end[0] - start[0]) * ratio;
          const lat = start[1] + (end[1] - start[1]) * ratio;
          points.push([lon, lat]);
        }
      }
    });
  
    // Calculate the bounding box for the polygon
    const boundingBox = bbox(poly);
  
    // Generate grid points inside the polygon
    const gridPoints = pointGrid(boundingBox, density / 1000, { units: "kilometers" });
    gridPoints.features.forEach((feature) => {
      const [lon, lat] = feature.geometry.coordinates;
      points.push([lon, lat]);
    });
  
    console.log("Generated raw points:", points);
  
    const snappedPoints: string[] = [];
    const roadPointCount: Record<string, number> = {};
  
    // Process points in chunks to avoid exceeding API limits
    for (let i = 0; i < points.length; i += 50) {
      const chunk = points.slice(i, i + 50);
      try {
        const response = await fetch(
          `https://api.mapbox.com/matching/v5/mapbox/driving/${chunk
            .map(([lon, lat]) => `${lon},${lat}`)
            .join(";")}?access_token=${mapboxgl.accessToken}&geometries=geojson`
        );
  
        const data = await response.json();
  
        if (data.code === "Ok" && data.tracepoints) {
          data.tracepoints.forEach((tracepoint: any, index: number) => {
            if (tracepoint) {
              const { location, matchings } = tracepoint;
              const roadName = matchings?.[0]?.name || `unknown-${index}`;
  
              if (!roadPointCount[roadName]) roadPointCount[roadName] = 0;
  
              // Limit to 2 points per road
              if (roadPointCount[roadName] < 2) {
                roadPointCount[roadName]++;
                snappedPoints.push(`point(${location[0]} ${location[1]})`);
              }
            } else {
              //console.warn(`Tracepoint at index ${index} is null.`);
            }
          });
        } else {
          console.warn("Map Matching API returned no matches or an error:", data.message || data);
        }
      } catch (err) {
        console.error("Error fetching Map Matching API:", err);
      }
    }
    return snappedPoints;
  };
  
  

  // Place a marker when destinationCoords changes
  useEffect(() => {
    if (destinationCoords && map.current) {
      // Remove existing destination marker
      if (destinationMarker.current) {
        destinationMarker.current.remove();
      }
      const currentZoom = map.current?.getZoom();

      // Add new destination marker
      destinationMarker.current = new mapboxgl.Marker({ color: '#FF0000' })
        .setLngLat(destinationCoords)
        .addTo(map.current);

      // Optionally center the map on the destination
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
          setUserLocation([longitude, latitude])
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
  }, [])
  
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
        zoom: 12
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
        .setLngLat(userLocation)
        .addTo(map.current)
      
      
  
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
    setIsDrawingMode(isDrawingMode === "Map" ? "Draw":"Map");
    if (draw.current) {
      draw.current.changeMode(isDrawingMode === "Draw" ? 'simple_select' : 'draw_polygon' as string);
    }
    console.log(isDrawingMode, draw.current?.getMode());
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
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={toggleDrawingMode}
          className={`bg-${isDrawingMode === "Draw" ? 'red' : 'purple'}-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-${isDrawingMode === "Draw" ? 'red' : 'purple'}-600 transition-colors`}
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
      </div>
    </main>
  )
}