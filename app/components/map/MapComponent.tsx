'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, LoadScript, Marker, Circle, DrawingManager, Polygon } from '@react-google-maps/api';
import Navbar from './Navbar';
import MapControls from './MapControls';
import CreateMenu from './CreateMenu';
import ZoomControls from './ZoomControls';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot } from '@fortawesome/free-solid-svg-icons';
import SearchBox from './SearchBox';

type MapType = 'hybrid' | 'satellite' | 'roadmap' | 'terrain';

const libraries: ("places" | "drawing" | "geometry")[] = ["places", "drawing", "geometry"];

const polygonColor = '#00C853'; // Bright green color
const polygonFillOpacity = 0.3;
const strokeColor = '#00C853';
const strokeWeight = 2;

const LOCATION_MARKER_PATH = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z";

const mapStyles = {
  container: {
    width: '100%',
    height: 'calc(100vh - 48px)',
    position: 'relative' as const
  },
  map: {
    width: '100%',
    height: '100%'
  }
};

const defaultCenter = {
  lat: 27.342860470286933, 
  lng: 75.79046143662488,
};

const MARKER_ROTATION = 180; // Rotation in degrees

const MapComponent = () => {
  const [isClient, setIsClient] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = useState<MapType>('hybrid');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [userLocation, setUserLocation] = useState<google.maps.LatLng | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  
  // Add new state variables for drawing
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [fieldPolygons, setFieldPolygons] = useState<google.maps.Polygon[]>([]);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  // Create a ref to store the DistanceOverlay class
  const DistanceOverlayRef = useRef<any>(null);

  // Map event handlers
  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);

    // Create the DistanceOverlay class after Google Maps is loaded
    class DistanceOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private content: string;
      private div: HTMLDivElement | null;
      private angle: number;
      private onDistanceChange: (newDistance: number) => void;

      constructor(
        position: google.maps.LatLng, 
        content: string, 
        angle: number,
        onDistanceChange: (newDistance: number) => void
      ) {
        super();
        this.position = position;
        this.content = content;
        this.div = null;
        this.angle = angle;
        this.onDistanceChange = onDistanceChange;
      }

      onAdd() {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        
        // Extract the numeric value from content
        const numericValue = parseFloat(this.content.replace(/[^0-9.]/g, ''));
        const unit = this.content.includes('km') ? 'km' : 'm';
        
        div.innerHTML = `
          <div style="
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            text-align: center;
            min-width: 50px;
            transform: translate(-50%, -150%) rotate(${this.angle}deg);
            transform-origin: center bottom;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            white-space: nowrap;
            cursor: pointer;
          ">
            <input
              type="number"
              value="${numericValue}"
              step="${unit === 'km' ? '0.01' : '1'}"
              min="0"
              style="
                width: 50px;
                background: transparent;
                border: none;
                color: white;
                font-size: 12px;
                text-align: right;
                outline: none;
                padding: 0;
              "
            />${unit}
          </div>
        `;

        // Add input event listener
        const input = div.querySelector('input');
        if (input) {
          input.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const newValue = parseFloat(target.value);
            if (!isNaN(newValue)) {
              // Convert to meters if in km
              const meters = unit === 'km' ? newValue * 1000 : newValue;
              this.onDistanceChange(meters);
            }
          });

          // Prevent propagation of click events to avoid map clicks
          input.addEventListener('click', (e) => {
            e.stopPropagation();
          });
        }

        this.div = div;
        const panes = this.getPanes();
        panes?.overlayLayer.appendChild(div);
      }

      draw() {
        if (!this.div) return;
        const overlayProjection = this.getProjection();
        const point = overlayProjection.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = point.x + 'px';
          this.div.style.top = point.y + 'px';
        }
      }

      onRemove() {
        if (this.div) {
          this.div.parentNode?.removeChild(this.div);
          this.div = null;
        }
      }
    }

    // Store the class in the ref
    DistanceOverlayRef.current = DistanceOverlay;
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Map controls handlers
  const handleToggleMapType = useCallback(() => {
    setMapType(prev => {
      switch (prev) {
        case 'hybrid': return 'satellite';
        case 'satellite': return 'roadmap';
        case 'roadmap': return 'terrain';
        case 'terrain': return 'hybrid';
        default: return 'hybrid';
      }
    });
  }, []);

  const handleLocationClick = useCallback(() => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = new google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          setUserLocation(newLocation);
          if (map) {
            map.panTo(newLocation);
            map.setZoom(18);
          }
          setIsLocating(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setIsLocating(false);
          alert('Unable to get your location. Please check your location permissions.');
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      alert('Geolocation is not supported by your browser');
      setIsLocating(false);
    }
  }, [map]);

  const handleToggleFullscreen = useCallback(() => {
    const elem = document.documentElement;
    if (!isFullscreen) {
      elem.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const handleZoomIn = useCallback(() => {
    if (map) {
      map.setZoom((map.getZoom() || 15) + 1);
    }
  }, [map]);

  const handleZoomOut = useCallback(() => {
    if (map) {
      map.setZoom((map.getZoom() || 15) - 1);
    }
  }, [map]);

  // Create menu handlers
  const handleCreateOption = useCallback((option: 'import' | 'field' | 'distance' | 'marker') => {
    setShowCreateMenu(false);
    // Handle different creation options here
    switch (option) {
      case 'import':
        // Handle import
        break;
      case 'field':
        // Enable our custom drawing mode instead of using DrawingManager
        setIsDrawingMode(true);
        break;
      case 'distance':
        // Handle distance measurement
        break;
      case 'marker':
        // Handle marker placement
        break;
    }
  }, []);

  // Handle place selection from search
  const handlePlaceSelect = useCallback((location: google.maps.LatLng) => {
    if (map) {
      map.panTo(location);
      map.setZoom(18);
    }
  }, [map]);

  // Map options
  const mapOptions = useMemo(() => ({
    mapTypeId: mapType,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: false,
    scaleControl: true,
    rotateControl: false,
    panControl: false,
    scrollwheel: true,
    clickableIcons: false,
    disableDefaultUI: true,
    tilt: 0,
    gestureHandling: 'cooperative',
    draggableCursor: 'grab',
    draggingCursor: 'move',
  }), [mapType]);

  // Add drawing manager load handler
  const onDrawingManagerLoad = useCallback((drawingManager: google.maps.drawing.DrawingManager) => {
    drawingManagerRef.current = drawingManager;
  }, []);

  // Add polygon complete handler
  const onPolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    // Add the new polygon to our state
    setFieldPolygons(prev => [...prev, polygon]);
    
    // Disable drawing mode after polygon is complete
    setIsDrawingMode(false);
    
    // Create draggable vertex markers for the completed polygon
    const path = polygon.getPath();
    const vertexMarkers: google.maps.Marker[] = [];
    
    // Function to add/update edge markers for the polygon
    const addEdgeMarkers = () => {
      // Remove existing edge markers
      const oldMarkers = polygon.get('edgeMarkers') || [];
      oldMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
        marker.setMap(null);
      });

      // Create new edge markers
      const newEdgeMarkers: (google.maps.Marker | google.maps.OverlayView)[] = [];
      const path = polygon.getPath();
      
      for (let i = 0; i < path.getLength(); i++) {
        const p1 = path.getAt(i);
        const p2 = path.getAt((i + 1) % path.getLength());
        
        // Add edge marker logic here...
        // (Keep your existing edge marker creation code)
      }
      
      polygon.set('edgeMarkers', newEdgeMarkers);
    };
    
    for (let i = 0; i < path.getLength(); i++) {
      const vertex = path.getAt(i);
      const marker = new google.maps.Marker({
        position: vertex,
        map: map,
        icon: {
          path: LOCATION_MARKER_PATH,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          scale: 2,
          anchor: new google.maps.Point(12, 23),
        },
        draggable: true,
        zIndex: 2
      });

      // Add drag listeners to update the polygon shape while dragging
      marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        path.setAt(i, e.latLng);
        addEdgeMarkers();
      });

      vertexMarkers.push(marker);
    }

    // Store vertex markers with the polygon for cleanup
    polygon.set('vertexMarkers', vertexMarkers);

    // Add listener to update vertex markers when polygon is modified
    google.maps.event.addListener(polygon.getPath(), 'insert_at', (index: number) => {
      const vertex = path.getAt(index);
      if (!vertex) return;
      
      const marker = new google.maps.Marker({
        position: vertex,
        map: map,
        icon: {
          path: LOCATION_MARKER_PATH,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          scale: 2,
          anchor: new google.maps.Point(12, 23),
        },
        draggable: true,
        zIndex: 2
      });

      marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        path.setAt(index, e.latLng);
        addEdgeMarkers();
      });

      const markers = polygon.get('vertexMarkers') || [];
      markers.splice(index, 0, marker);
      polygon.set('vertexMarkers', markers);
    });

    // Add edge markers initially
    addEdgeMarkers();
    
    // Rest of your polygon click listener code...
  }, [map]);

  // Add a new function to handle auto-closing polygon
  const setupAutoClosePolygon = useCallback(() => {
    if (!map) return;
    
    // Create a temporary polyline to track vertices
    let tempPolyline: google.maps.Polyline | null = null;
    let vertices: google.maps.LatLng[] = [];
    let vertexMarkers: google.maps.Marker[] = [];
    let edgeMarkers: (google.maps.Marker | google.maps.OverlayView)[] = [];
    let mapClickListener: google.maps.MapsEventListener | null = null;
    let mapDblClickListener: google.maps.MapsEventListener | null = null;

    // Update the color scheme for vertices, edges, and polygons
    const polygonColor = '#00C853'; // Bright green color
    const polygonFillOpacity = 0.3;
    const strokeColor = '#00C853';
    const strokeWeight = 2;

    // Function to update edge markers
    const updateEdgeMarkers = () => {
      // Remove existing edge markers
      edgeMarkers.forEach(marker => {
        if (marker instanceof google.maps.Marker) {
          marker.setMap(null);
        } else {
          marker.setMap(null);
        }
      });
      edgeMarkers = [];

      // Add new edge markers if we have at least 2 vertices
      if (vertices.length >= 2) {
        for (let i = 0; i < vertices.length; i++) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % vertices.length];

          // Calculate midpoint
          const midLat = (p1.lat() + p2.lat()) / 2;
          const midLng = (p1.lng() + p2.lng()) / 2;
          const midpoint = new google.maps.LatLng(midLat, midLng);

          // Calculate initial distance
          const distance = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
          const distanceText = distance < 1000 
            ? `${Math.round(distance)}m`
            : `${(distance / 1000).toFixed(2)}km`;

          // Calculate angle between points
          let angle = Math.atan2(
            p2.lng() - p1.lng(),
            p2.lat() - p1.lat()
          ) * (180 / Math.PI);

          // Adjust angle to keep text readable (not upside down)
          if (angle < -90 || angle > 90) {
            angle += 180;
          }

          // Handler for distance changes
          const handleDistanceChange = (newDistance: number) => {
            // Calculate the ratio of new distance to current distance
            const currentDistance = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
            const ratio = newDistance / currentDistance;

            // Calculate new position for p2 by extending the line
            const lat = p1.lat() + (p2.lat() - p1.lat()) * ratio;
            const lng = p1.lng() + (p2.lng() - p1.lng()) * ratio;
            const newPosition = new google.maps.LatLng(lat, lng);

            // Update vertex position
            vertices[(i + 1) % vertices.length] = newPosition;
            vertexMarkers[(i + 1) % vertices.length].setPosition(newPosition);

            // Update polyline
            if (tempPolyline) {
              const path = vertices.slice();
              if (vertices.length >= 3) {
                path.push(vertices[0]);
              }
              tempPolyline.setPath(path);
            }

            // Update all edge markers
            updateEdgeMarkers();
          };

          // Create overlay with distance change handler
          const overlay = new DistanceOverlayRef.current(
            midpoint, 
            distanceText, 
            angle,
            handleDistanceChange
          );
          overlay.setMap(map);
          edgeMarkers.push(overlay as google.maps.Marker | google.maps.OverlayView);

          // Create marker at midpoint
          const marker = new google.maps.Marker({
            position: midpoint,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,  // Change back to circle for initial state
              scale: 5,
              fillColor: '#FFFFFF',
              fillOpacity: 0.5,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
            draggable: true,
            zIndex: 2
          });

          let dragMarker: google.maps.Marker | null = null;

          marker.addListener('dragstart', () => {
            const position = marker.getPosition();
            if (!position) return;  // Early return if no position
            
            // Create the red location marker for drag state
            dragMarker = new google.maps.Marker({
              position: position,  // Use the validated position
              map: map,
              icon: {
                path: LOCATION_MARKER_PATH,
                fillColor: '#FF0000',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                scale: 2,
                anchor: new google.maps.Point(12, 23),
                rotation: MARKER_ROTATION
              },
              zIndex: 3
            });
            
            // Hide the original circle marker during drag
            marker.setOpacity(0);
            
            // Store the original position and vertices
            marker.set('originalPosition', position);  // Use the validated position
            marker.set('originalVertices', [...vertices]);
            
            // Create a temporary vertex at the edge position
            const tempVertices = [...vertices];
            tempVertices.splice(i + 1, 0, position);  // Use the validated position
            vertices = tempVertices;
            marker.set('tempVertexIndex', i + 1);
          });

          marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng || !tempPolyline) return;
            
            // Update drag marker position
            if (dragMarker) {
              dragMarker.setPosition(e.latLng);
            }
            
            const tempVertexIndex = marker.get('tempVertexIndex');
            if (tempVertexIndex !== undefined) {
              vertices[tempVertexIndex] = e.latLng;
              const path = vertices.slice();
              if (path.length >= 3) {
                path.push(path[0]);
              }
              tempPolyline.setPath(path);
            }
          });

          marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
            // Remove the drag marker and show original marker
            if (dragMarker) {
              dragMarker.setMap(null);
              dragMarker = null;
            }
            
            // Show the original marker
            marker.setOpacity(1);
            
            if (!e.latLng) return;
            
            const tempVertexIndex = marker.get('tempVertexIndex');
            if (tempVertexIndex !== undefined) {
              // Update the final position of the temporary vertex
              vertices[tempVertexIndex] = e.latLng;
              
              // Create vertex marker for the new point with circle icon initially
              const vertexMarker = new google.maps.Marker({
                position: e.latLng,
                map: map,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 7,
                  fillColor: '#FFFFFF',
                  fillOpacity: 0.5,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2,
                },
                draggable: true,
                zIndex: 2
              });

              let newDragMarker: google.maps.Marker | null = null;
              
              // Add drag listeners to the new vertex marker
              vertexMarker.addListener('dragstart', () => {
                // Create red marker for drag
                newDragMarker = new google.maps.Marker({
                  position: vertexMarker.getPosition(),
                  map: map,
                  icon: {
                    path: LOCATION_MARKER_PATH,
                    fillColor: '#FF0000',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 1,
                    scale: 2,
                    anchor: new google.maps.Point(12, 23),
                    rotation: MARKER_ROTATION
                  },
                  zIndex: 3
                });
                vertexMarker.setOpacity(0);
              });

              vertexMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
                if (!e.latLng) return;
                const index = vertexMarkers.indexOf(vertexMarker);
                if (index !== -1) {
                  vertices[index] = e.latLng;
                  if (newDragMarker) {
                    newDragMarker.setPosition(e.latLng);
                  }
                  if (tempPolyline) {
                    const path = vertices.slice();
                    if (vertices.length >= 3) {
                      path.push(vertices[0]);
                    }
                    tempPolyline.setPath(path);
                  }
                  updateEdgeMarkers();
                }
              });

              vertexMarker.addListener('dragend', () => {
                if (newDragMarker) {
                  newDragMarker.setMap(null);
                  newDragMarker = null;
                }
                vertexMarker.setOpacity(1);
              });
              
              vertexMarkers.splice(tempVertexIndex, 0, vertexMarker);
              
              // Update polyline path
              if (tempPolyline) {
                const path = vertices.slice();
                if (vertices.length >= 3) {
                  path.push(vertices[0]);
                }
                tempPolyline.setPath(path);
              }
              
              // Remove all existing edge markers and their overlays
              edgeMarkers.forEach(marker => {
                if (marker instanceof google.maps.Marker) {
                  marker.setMap(null);
                } else {
                  marker.setMap(null);
                }
              });
              edgeMarkers = [];
              
              // Remove the current edge marker
              marker.setMap(null);
              
              // Update edge markers with fresh ones
              updateEdgeMarkers();
            }
          });

          edgeMarkers.push(marker as google.maps.Marker | google.maps.OverlayView);
        }
      }
    };
    
    const startDrawing = () => {
      // Create a polyline to track vertices
      tempPolyline = new google.maps.Polyline({
        map: map,
        path: [],
        strokeColor: strokeColor,  // Use the green color
        strokeWeight: strokeWeight
      });
      
      vertices = [];
      vertexMarkers = [];
      edgeMarkers = [];
      
      // Add click listener to map
      mapClickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng || !tempPolyline) return;
        
        vertices.push(e.latLng);
        
        // Create a marker for this vertex with circle icon (during drawing)
        const marker = new google.maps.Marker({
          position: e.latLng,
          map: map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#FFFFFF',
            fillOpacity: 0.5,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
          draggable: true,
          zIndex: 2
        });

        let dragMarker: google.maps.Marker | null = null;

        // Show red location marker during drag
        marker.addListener('dragstart', () => {
          // Create the red location marker
          dragMarker = new google.maps.Marker({
            position: marker.getPosition(),
            map: map,
            icon: {
              path: LOCATION_MARKER_PATH,
              fillColor: '#FF0000',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: 2,
              anchor: new google.maps.Point(12, 23),
              rotation: MARKER_ROTATION
            },
            zIndex: 3
          });
          marker.setOpacity(0);
        });

        marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          // Update vertex position and drag marker position
          const index = vertexMarkers.indexOf(marker);
          if (index !== -1) {
            vertices[index] = e.latLng;
            if (dragMarker) {
              dragMarker.setPosition(e.latLng);
            }
            if (tempPolyline) {
              const path = vertices.slice();
              if (vertices.length >= 3) {
                path.push(vertices[0]);
              }
              tempPolyline.setPath(path);
            }
            updateEdgeMarkers();
          }
        });

        marker.addListener('dragend', () => {
          // Remove the drag marker and show original marker
          if (dragMarker) {
            dragMarker.setMap(null);
            dragMarker = null;
          }
          marker.setOpacity(1);
        });
        
        vertexMarkers.push(marker);
        
        // Update polyline path
        const path = vertices.slice();
        if (vertices.length >= 3) {
          path.push(vertices[0]); // Close the polygon
        }
        tempPolyline.setPath(path);
        
        // Update edge markers
        updateEdgeMarkers();
      });
      
      // Rest of the drawing code...
      mapDblClickListener = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        if (vertices.length >= 3) {
          // Create final polygon
          const polygon = new google.maps.Polygon({
            map: map,
            paths: vertices,
            strokeColor: strokeColor,  // Use the green color
            strokeWeight: strokeWeight,
            fillColor: polygonColor,  // Use the green color
            fillOpacity: polygonFillOpacity,
            editable: true,
            draggable: true
          });
          
          // Clean up
          if (tempPolyline) {
            tempPolyline.setMap(null);
            tempPolyline = null;
          }
          
          // Remove all temporary markers
          vertexMarkers.forEach(marker => marker.setMap(null));
          edgeMarkers.forEach(marker => marker.setMap(null));
          vertexMarkers = [];
          edgeMarkers = [];
          
          if (mapClickListener) {
            google.maps.event.removeListener(mapClickListener);
            mapClickListener = null;
          }
          
          if (mapDblClickListener) {
            google.maps.event.removeListener(mapDblClickListener);
            mapDblClickListener = null;
          }
          
          // Call the polygon complete handler
          onPolygonComplete(polygon);
        }
      });
    };
    
    // Start drawing when drawing mode is enabled
    if (isDrawingMode) {
      startDrawing();
    }
    
    // Clean up when drawing mode is disabled
    return () => {
      if (tempPolyline) {
        tempPolyline.setMap(null);
      }
      if (vertexMarkers.length > 0) {
        vertexMarkers.forEach(marker => marker.setMap(null));
      }
      if (edgeMarkers.length > 0) {
        edgeMarkers.forEach(marker => marker.setMap(null));
      }
      if (mapClickListener) {
        google.maps.event.removeListener(mapClickListener);
      }
      if (mapDblClickListener) {
        google.maps.event.removeListener(mapDblClickListener);
      }
    };
  }, [map, isDrawingMode, onPolygonComplete]);

  // Use effect to setup auto-close polygon when drawing mode changes
  useEffect(() => {
    const cleanup = setupAutoClosePolygon();
    return cleanup;
  }, [setupAutoClosePolygon, isDrawingMode]);

  // Client-side effect
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div>Loading map...</div>
      </div>
    );
  }

  return (
    <LoadScript
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
      libraries={libraries}
    >
      <div className="flex flex-col h-screen w-full">
        <Navbar onPlaceSelect={handlePlaceSelect} />
        <div style={mapStyles.container}>
          <GoogleMap
            mapContainerStyle={mapStyles.map}
            center={defaultCenter}
            zoom={15}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={mapOptions}
          >
            {/* User location marker */}
            {userLocation && (
              <>
                <Marker
                  position={userLocation}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                  }}
                  zIndex={1000}
                />
                <Circle
                  center={userLocation}
                  radius={20}
                  options={{
                    fillColor: '#4285F4',
                    fillOpacity: 0.2,
                    strokeColor: '#4285F4',
                    strokeOpacity: 0.5,
                    strokeWeight: 1,
                  }}
                />
              </>
            )}
            
            {/* We're not using DrawingManager anymore for our custom implementation */}
            
            {/* Display existing field polygons */}
            {fieldPolygons.map((polygon, index) => (
              <Polygon
                key={index}
                paths={polygon.getPath().getArray()}
                options={{
                  fillColor: polygonColor,  // Use the green color
                  fillOpacity: polygonFillOpacity,
                  strokeColor: strokeColor,  // Use the green color
                  strokeWeight: strokeWeight,
                  clickable: true,
                  editable: true,
                  draggable: true,
                  zIndex: 1,
                }}
                onClick={(e: google.maps.PolyMouseEvent) => {
                  // Check if the click is on an edge (not on a vertex)
                  if (e.edge !== undefined && e.vertex === undefined && e.latLng) {
                    // Get the path of the polygon
                    const path = polygon.getPath();
                    
                    // Insert a new vertex at the clicked edge
                    path.insertAt(e.edge + 1, e.latLng);
                  }
                }}
              />
            ))}
          </GoogleMap>
        </div>

        <MapControls
          currentMapType={mapType}
          onMapTypeChange={setMapType}
          onLocationClick={handleLocationClick}
          onToggleFullscreen={handleToggleFullscreen}
          isLocating={isLocating}
        />

        <CreateMenu
          showMenu={showCreateMenu}
          onToggleMenu={() => setShowCreateMenu(!showCreateMenu)}
          onOptionSelect={handleCreateOption}
        />

        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      </div>
    </LoadScript>
  );
};

export default MapComponent;