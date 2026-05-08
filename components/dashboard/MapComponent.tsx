'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { CadastreResult } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

function createMarkerIcon(color: string, isSelected: boolean = false): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ${isSelected ? 'border-color: #f59e0b; border-width: 3px;' : ''}
    "></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

const defaultIcon = createMarkerIcon('#2563eb'); // blue-600
const selectedIcon = createMarkerIcon('#2563eb', true); // blue-600 with gold border

interface MapComponentProps {
  onPolygonCreated: (coordinates: number[][]) => void;
  results?: CadastreResult[];
  selectedResults?: Set<number>;
  onMarkerClick?: (index: number) => void;
  autoFitBounds?: boolean;
}

function DrawControl({ onPolygonCreated }: { onPolygonCreated: (coordinates: number[][]) => void }) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
        },
        rectangle: {},
        circle: false,
        polyline: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);

      const geoJSON = layer.toGeoJSON();
      const coordinates = geoJSON.geometry.coordinates[0];
      onPolygonCreated(coordinates);
    });

    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
      map.off(L.Draw.Event.CREATED);
    };
  }, [map, onPolygonCreated]);

  return null;
}

function MarkersLayer({ results, selectedResults, onMarkerClick, autoFitBounds = true }: {
  results: CadastreResult[],
  selectedResults?: Set<number>,
  onMarkerClick?: (index: number) => void,
  autoFitBounds?: boolean
}) {
  const map = useMap();
  const prevMarkersHashRef = useRef<string>('');

  const markers = useMemo(() => {
    const markersData: Array<{ position: [number, number], result: CadastreResult, index: number }> = [];

    results.forEach((result, index) => {
      result.proprietes.forEach((prop) => {
        if (prop.latitude && prop.longitude) {
          markersData.push({
            position: [prop.latitude, prop.longitude],
            result,
            index
          });
        }
      });
    });

    return markersData;
  }, [results]);

  useEffect(() => {
    if (markers.length > 0) {
      const currentHash = markers.map(m => m.position.join(',')).join('|');
      if (currentHash !== prevMarkersHashRef.current) {
        prevMarkersHashRef.current = currentHash;
        if (autoFitBounds) {
          const bounds = L.latLngBounds(markers.map(m => m.position));
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        }
      }
    } else {
      prevMarkersHashRef.current = '';
    }
  }, [markers, map, autoFitBounds]);

  return (
    <>
      {markers.map((marker, idx) => {
        const isSelected = selectedResults?.has(marker.index);
        return (
          <Marker
            key={`${marker.index}-${idx}`}
            position={marker.position}
            icon={isSelected ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => {
                if (onMarkerClick) {
                  onMarkerClick(marker.index);
                }
              }
            }}
          >
            <Popup>
              <div className="p-2 min-w-[200px]">
                <h3 className="font-semibold text-sm mb-2">
                  {marker.result.proprietaire.denomination}
                </h3>
                <div className="space-y-1 text-xs">
                  <p className="text-gray-600">
                    {marker.result.proprietaire.adresse}
                  </p>
                  <p className="text-gray-600">
                    {marker.result.proprietaire.code_postal} {marker.result.proprietaire.ville}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {marker.result.nombre_adresses} adresse{marker.result.nombre_adresses > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {marker.result.nombre_lots} lot{marker.result.nombre_lots > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {marker.result.entreprise && (
                    <p className="text-blue-600 text-xs mt-2">
                      SIREN: {marker.result.entreprise.siren}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function MapComponent({ onPolygonCreated, results = [], selectedResults, onMarkerClick, autoFitBounds = true }: MapComponentProps) {
  const markerCount = results.reduce((sum, r) => sum + r.proprietes.filter(p => p.latitude && p.longitude).length, 0);

  return (
    <div className="relative h-full w-full">
      {markerCount > 0 && (
        <div className="absolute top-4 left-4 z-[1000] bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-md border">
          <p className="text-sm font-medium">
            {markerCount} marqueur{markerCount > 1 ? 's' : ''}
          </p>
        </div>
      )}
      <MapContainer
        center={[46.603354, 1.888334]}
        zoom={7}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <DrawControl onPolygonCreated={onPolygonCreated} />
        {results.length > 0 && (
          <MarkersLayer
            results={results}
            selectedResults={selectedResults}
            onMarkerClick={onMarkerClick}
            autoFitBounds={autoFitBounds}
          />
        )}
      </MapContainer>
    </div>
  );
}
