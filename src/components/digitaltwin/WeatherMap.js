'use client';
import { useEffect, useRef, useState } from 'react';
import { Maximize2, MapPin, AlertTriangle, X, Home, Repeat } from 'lucide-react';
import styles from './WeatherMap.module.css';

const TILE_PROVIDERS = {
  osm: {
    name: 'OpenStreetMap (Standard)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  esri: {
    name: 'Esri World Street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &copy; OpenStreetMap',
  },
};

// Known relative offsets for common landmark keywords
function resolveNodeLocation(title = '', location = '', idx, total, centerLat, centerLon) {
  const text = (title + ' ' + location).toLowerCase();

  if (text.includes('hadimba') || text.includes('dhungri') || text.includes('temple')) {
    return { lat: centerLat + 0.005, lon: centerLon - 0.009 };
  }
  if (text.includes('solang')) {
    return { lat: centerLat + 0.065, lon: centerLon - 0.025 };
  }
  if (text.includes('kasol') || text.includes('parvati')) {
    return { lat: centerLat - 0.180, lon: centerLon + 0.120 };
  }
  if (text.includes('atal') || text.includes('sissu') || text.includes('lahaul')) {
    return { lat: centerLat + 0.140, lon: centerLon - 0.045 };
  }
  if (text.includes('hotel') || text.includes('resort') || text.includes('spa') || text.includes('grace')) {
    return { lat: centerLat + 0.008, lon: centerLon + 0.006 };
  }
  if (text.includes('taxi') || text.includes('transfer')) {
    return { lat: centerLat - 0.015, lon: centerLon - 0.005 };
  }
  if (text.includes('station') || text.includes('vande') || text.includes('train') || text.includes('rail')) {
    return idx > total / 2 ? { lat: centerLat - 0.035, lon: centerLon - 0.018 } : { lat: centerLat - 0.030, lon: centerLon - 0.015 };
  }

  // Fallback: Compute a distinct sequential curve position so NO two pins stack on top of each other
  const angle = (idx / Math.max(1, total - 1)) * Math.PI * 1.3 - 0.65;
  const dist = 0.018 + idx * 0.016;
  const lat = centerLat + Math.sin(angle) * dist;
  const lon = centerLon + Math.cos(angle) * dist;
  return { lat, lon };
}

export default function WeatherMap({ simulation = {}, trip = {}, coords = null }) {
  const mapContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const layersGroupRef = useRef(null);

  const [providerKey, setProviderKey] = useState('osm');
  const [showRadar, setShowRadar] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Base coordinates for destination
  const centerLat = coords?.latitude || trip?.latitude || 32.2432;
  const centerLon = coords?.longitude || trip?.longitude || 77.1892;
  const destinationName = coords?.name || trip?.destination || 'Manali';

  const rawNodes = simulation.evaluatedNodes || [];
  const totalNodes = rawNodes.length;

  // Track frequency of visits to identical locations/hotels
  const titleCounts = {};
  rawNodes.forEach(n => {
    const cleanTitle = (n.title || '').replace(/\(.*\)/g, '').trim().toLowerCase();
    if (cleanTitle) {
      titleCounts[cleanTitle] = (titleCounts[cleanTitle] || 0) + 1;
    }
  });

  const evaluatedNodes = totalNodes > 0
    ? rawNodes.map((n, idx) => {
        const cleanTitle = (n.title || '').replace(/\(.*\)/g, '').trim().toLowerCase();
        const visitFrequency = titleCounts[cleanTitle] || 1;
        const isStayHub = n.type === 'hotel' || cleanTitle.includes('resort') || cleanTitle.includes('hotel') || cleanTitle.includes('stay') || cleanTitle.includes('spa') || cleanTitle.includes('grace');
        const isRepeatVisit = visitFrequency > 1;

        // Find all step numbers for this same location
        const sameLocationSteps = rawNodes
          .map((item, i) => ({ title: (item.title || '').replace(/\(.*\)/g, '').trim().toLowerCase(), step: i + 1 }))
          .filter(item => item.title === cleanTitle)
          .map(item => `#${item.step}`);

        const { lat, lon } = (n.latitude && n.longitude)
          ? { lat: n.latitude, lon: n.longitude }
          : resolveNodeLocation(n.title, n.location, idx, totalNodes, centerLat, centerLon);

        return {
          ...n,
          latitude: lat,
          longitude: lon,
          stopIndex: idx + 1,
          isStayHub,
          isRepeatVisit,
          visitFrequency,
          sameLocationSteps: sameLocationSteps.length > 1 ? sameLocationSteps.join(', ') : null,
        };
      })
    : [
        { id: 'b1', title: `${destinationName} Arrival Station`, type: 'train', latitude: centerLat - 0.03, longitude: centerLon - 0.015, bufferRemaining: 60, status: 'normal', stopIndex: 1 },
        { id: 'b2', title: `Grace Resort & Spa (${destinationName})`, type: 'hotel', latitude: centerLat + 0.008, longitude: centerLon + 0.006, bufferRemaining: 45, status: 'normal', stopIndex: 2, isStayHub: true, isRepeatVisit: true, sameLocationSteps: '#2, #8' },
        { id: 'b3', title: `Solang Valley Adventure`, type: 'activity', latitude: centerLat + 0.05, longitude: centerLon - 0.02, bufferRemaining: 90, status: 'normal', stopIndex: 3 },
      ];

  const rainfall = simulation.weatherScenario?.rainfall || 0;
  const isCascade = (simulation.criticalCount || 0) > 0;

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current || leafletMapRef.current) return;

      if (!document.getElementById('leaflet-css-cdn')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-cdn';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const L = (await import('leaflet')).default;
      if (!isMounted || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLon],
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      const tileConfig = TILE_PROVIDERS[providerKey];
      const tileLayer = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: 19,
        subdomains: 'abc',
      }).addTo(map);

      tileLayerRef.current = tileLayer;
      layersGroupRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;

      setTimeout(() => {
        if (isMounted && leafletMapRef.current) {
          leafletMapRef.current.invalidateSize();
        }
      }, 300);

      setMapLoaded(true);
    }

    initMap();

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [centerLat, centerLon]);

  // Update tile provider when dropdown changes
  useEffect(() => {
    if (!leafletMapRef.current || !tileLayerRef.current) return;

    import('leaflet').then((L) => {
      const tileConfig = TILE_PROVIDERS[providerKey];
      leafletMapRef.current.removeLayer(tileLayerRef.current);
      const newLayer = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: 19,
        subdomains: 'abc',
      }).addTo(leafletMapRef.current);
      tileLayerRef.current = newLayer;
    });
  }, [providerKey]);

  // Render Waypoint Pins, Stay Badges, Route Line, and Radar Overlay
  useEffect(() => {
    if (!leafletMapRef.current || !layersGroupRef.current || !mapLoaded) return;

    import('leaflet').then((L) => {
      layersGroupRef.current.clearLayers();

      const latLons = [];

      evaluatedNodes.forEach((node) => {
        const lat = node.latitude;
        const lon = node.longitude;
        const stepNum = node.stopIndex;
        latLons.push([lat, lon]);

        const pinColor = node.status === 'critical' ? '#EF4444' : node.status === 'warning' ? '#F59E0B' : '#10B981';
        const isStay = node.isStayHub;
        const isRepeat = node.isRepeatVisit;

        // Custom HTML Marker Pin displaying badge for Stay Hub or Repeat Visits
        const customIcon = L.divIcon({
          className: 'custom-geo-pin-wrapper',
          html: `
            <div style="position: relative; cursor: pointer;">
              ${isStay ? `
                <div style="
                  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
                  background: #7C3AED; color: #FFFFFF; font-size: 9px; font-weight: 900;
                  padding: 1px 6px; border-radius: 999px; border: 1.5px solid #FFFFFF;
                  white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.3); z-index: 10;
                ">
                  🏨 STAY HUB
                </div>
              ` : isRepeat ? `
                <div style="
                  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
                  background: #D97706; color: #FFFFFF; font-size: 9px; font-weight: 900;
                  padding: 1px 6px; border-radius: 999px; border: 1.5px solid #FFFFFF;
                  white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.3); z-index: 10;
                ">
                  🔄 REPEAT
                </div>
              ` : ''}

              <div style="
                width: 34px; height: 34px; border-radius: 50%;
                background: ${isStay ? '#7C3AED' : pinColor}; border: 3px solid #FFFFFF;
                display: flex; align-items: center; justify-content: center;
                color: #FFFFFF; font-weight: 900; font-size: 13px;
                box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                position: relative; z-index: ${100 - stepNum};
              ">
                ${stepNum}
              </div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([lat, lon], { icon: customIcon }).addTo(layersGroupRef.current);
        
        const popupExtra = isStay
          ? `<br/><span style="font-size: 11px; color: #7C3AED; font-weight: 800;">🏨 Multi-Night Stay Hub (${node.sameLocationSteps ? 'Stops ' + node.sameLocationSteps : 'Hotel Base'})</span>`
          : isRepeat
          ? `<br/><span style="font-size: 11px; color: #D97706; font-weight: 800;">🔄 Repeat Location (Visited at ${node.sameLocationSteps})</span>`
          : '';

        marker.bindPopup(`
          <div style="font-family: sans-serif; padding: 4px;">
            <strong style="font-size: 14px; color: #111827;">Stop #${stepNum}: ${node.title}</strong><br/>
            <span style="font-size: 12px; color: #4B5563;">Status: <b style="color:${pinColor};">${(node.status || 'NORMAL').toUpperCase()}</b></span><br/>
            <span style="font-size: 12px; color: #4B5563;">Buffer Margin: <b>${node.connectionBuffer || 60} min</b></span>
            ${popupExtra}
          </div>
        `);

        marker.on('click', () => {
          setSelectedNode(node);
          leafletMapRef.current?.panTo([lat, lon]);
        });
      });

      // Draw Polyline connecting waypoints
      if (latLons.length > 1) {
        L.polyline(latLons, {
          color: isCascade ? '#DC2626' : '#2563EB',
          weight: 4,
          dashArray: isCascade ? '8, 8' : undefined,
          opacity: 0.85,
        }).addTo(layersGroupRef.current);
      }

      // Draw GIS Radar Weather Overlay
      if (showRadar && latLons.length > 0) {
        const center = [centerLat, centerLon];
        const radarRadius = 5000 + Math.min(30000, rainfall * 400);
        const radarColor = rainfall > 40 ? '#DC2626' : rainfall > 15 ? '#F59E0B' : '#3B82F6';

        L.circle(center, {
          radius: radarRadius,
          color: radarColor,
          fillColor: radarColor,
          fillOpacity: Math.min(0.28, 0.08 + (rainfall / 250)),
          weight: 2,
        }).addTo(layersGroupRef.current);
      }

      // Fit map bounds smoothly around ALL waypoints
      if (latLons.length > 0) {
        leafletMapRef.current.fitBounds(latLons, { padding: [50, 50] });
        leafletMapRef.current.invalidateSize();
      }
    });
  }, [evaluatedNodes, providerKey, showRadar, rainfall, isCascade, mapLoaded, centerLat, centerLon]);

  const handleCenterRoute = () => {
    if (!leafletMapRef.current) return;
    const latLons = evaluatedNodes.map(n => [n.latitude, n.longitude]);
    if (latLons.length > 0) {
      leafletMapRef.current.fitBounds(latLons, { padding: [50, 50] });
      leafletMapRef.current.invalidateSize();
    }
  };

  return (
    <div className={styles.mapCard}>
      <div className={styles.mapHeader}>
        <div className={styles.mapTitleArea}>
          <span className={styles.gisBadge}>LIVE GIS ROUTE MAP</span>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, margin: 0, color: '#111827' }}>
            Interactive Route Map · {destinationName} ({evaluatedNodes.length} Stops)
          </h3>
        </div>

        <div className={styles.controlsGroup}>
          <select
            className={styles.providerSelect}
            value={providerKey}
            onChange={e => setProviderKey(e.target.value)}
          >
            {Object.entries(TILE_PROVIDERS).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>

          <button
            type="button"
            className={`${styles.mapActionBtn} ${showRadar ? styles.btnActive : ''}`}
            onClick={() => setShowRadar(p => !p)}
          >
            Rain Overlay ({rainfall} mm/h)
          </button>

          <button type="button" className={styles.mapActionBtn} onClick={handleCenterRoute}>
            <Maximize2 size={13} /> Center Map
          </button>
        </div>
      </div>

      {/* Leaflet Map Canvas Container */}
      <div ref={mapContainerRef} className={styles.leafletContainer} />

      {/* Waypoint Inspector Drawer */}
      {selectedNode && (
        <div className={styles.nodeInspector}>
          <div className={styles.inspectorHeader}>
            <div className={styles.inspectorTitle}>
              <MapPin size={18} color="#D97706" />
              <span>Stop #{selectedNode.stopIndex}: {selectedNode.title}</span>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setSelectedNode(null)}>
              <X size={18} />
            </button>
          </div>

          {/* Stay Hub / Repeat Visit Banner in Inspector Drawer */}
          {selectedNode.isStayHub && (
            <div style={{
              background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8,
              padding: '8px 12px', fontSize: '0.8125rem', color: '#5B21B6',
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            }}>
              <Home size={16} />
              <span>🏨 Hotel Accommodation &amp; Multi-Night Stay Hub {selectedNode.sameLocationSteps ? `(Visited at ${selectedNode.sameLocationSteps})` : ''}</span>
            </div>
          )}

          {selectedNode.isRepeatVisit && !selectedNode.isStayHub && (
            <div style={{
              background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8,
              padding: '8px 12px', fontSize: '0.8125rem', color: '#92400E',
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            }}>
              <Repeat size={16} />
              <span>🔄 Repeat Location Visit (Linked stops: {selectedNode.sameLocationSteps})</span>
            </div>
          )}

          <div className={styles.inspectorGrid}>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Category</div>
              <div className={styles.metricVal} style={{ textTransform: 'uppercase' }}>{selectedNode.type}</div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Location</div>
              <div className={styles.metricVal}>
                {selectedNode.latitude.toFixed(4)}°, {selectedNode.longitude.toFixed(4)}°
              </div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Safety Buffer</div>
              <div className={styles.metricVal}>{selectedNode.connectionBuffer || 60} min</div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Estimated Delay</div>
              <div className={styles.metricVal} style={{ color: selectedNode.simulatedDelay > 30 ? '#DC2626' : '#1F2937' }}>
                +{selectedNode.simulatedDelay || 0} min
              </div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Schedule Status</div>
              <div className={styles.metricVal} style={{ color: selectedNode.status === 'critical' ? '#DC2626' : selectedNode.status === 'warning' ? '#D97706' : '#059669' }}>
                {(selectedNode.status || 'NORMAL').toUpperCase()}
              </div>
            </div>
          </div>

          {selectedNode.status === 'critical' && (
            <div className={styles.reasonAlert}>
              <AlertTriangle size={16} />
              <span>{selectedNode.impactReason || 'Connection buffer exceeded due to severe weather. Reroute recommended.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
