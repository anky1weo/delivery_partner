import { useEffect, useRef } from 'react';

/**
 * MapComponent — Leaflet map that renders markers/routes and reports clicks.
 * All state is managed by the PARENT. This component is purely presentational + eventing.
 *
 * Props:
 *  - pickups: Array of { lat, lng, label? }   (multiple pickup points)
 *  - destination: { lat, lng, label? } | null
 *  - routeCoords: [[lat,lng], ...] | null      (polyline from OSRM)
 *  - onMapClick: (latlng) => void               (reports raw click {lat, lng})
 *  - height: CSS height string
 *  - center: [lat, lng]
 *  - zoom: number
 */
export default function MapComponent({
  pickups = [],
  destination = null,
  routeCoords = null,
  onMapClick = null,
  height = '300px',
  center = [23.2599, 77.4126],
  zoom = 12,
}) {
  const containerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // ── Initialise map ONCE ──
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return;
    if (typeof L === 'undefined') return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
    }).setView(center, zoom);

    L.tileLayer(
      'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }
    ).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Layer group for markers + route — we clear & redraw on every data change
    layerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // ── Click handler (always up-to-date via ref trick) ──
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handler = (e) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    };
    map.on('click', handler);
    return () => map.off('click', handler);
  }, []);

  // ── Re-draw markers + route whenever data props change ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    const lg = layerGroupRef.current;
    if (!map || !lg) return;

    lg.clearLayers();

    const allBounds = [];

    // Draw pickup markers
    pickups.forEach((p, idx) => {
      const icon = makeIcon('pickup', idx + 1, pickups.length > 1);
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(lg);
      if (p.label) marker.bindTooltip(p.label, { permanent: false, direction: 'top', offset: [0, -30] });
      allBounds.push([p.lat, p.lng]);
    });

    // Draw destination marker
    if (destination) {
      const icon = makeIcon('destination');
      const marker = L.marker([destination.lat, destination.lng], { icon }).addTo(lg);
      if (destination.label) marker.bindTooltip(destination.label, { permanent: false, direction: 'top', offset: [0, -30] });
      allBounds.push([destination.lat, destination.lng]);
    }

    // Draw route polyline
    if (routeCoords && routeCoords.length >= 2) {
      // shadow
      L.polyline(routeCoords, { color: '#000', weight: 7, opacity: 0.15, lineJoin: 'round', lineCap: 'round' }).addTo(lg);
      // main
      L.polyline(routeCoords, { color: '#138808', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(lg);
      // animated dashes
      L.polyline(routeCoords, { color: '#fff', weight: 3, opacity: 0.35, dashArray: '12, 20', lineJoin: 'round' }).addTo(lg);
    }

    // Fit bounds
    if (allBounds.length >= 2) {
      map.fitBounds(allBounds, { padding: [50, 50], animate: true, duration: 0.6 });
    } else if (allBounds.length === 1) {
      map.setView(allBounds[0], 14, { animate: true });
    }
  }, [pickups, destination, routeCoords]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: '100%',
        borderRadius: 'inherit',
        background: '#1a1a1a',
        overflow: 'hidden',
        zIndex: 1,
        cursor: 'crosshair',
      }}
    />
  );
}

// ── Helper: build Leaflet divIcon ──
function makeIcon(type, number = 1, showNumber = false) {
  const isPickup = type === 'pickup';
  const color = isPickup ? '#138808' : '#FF9933';
  const label = isPickup ? (showNumber ? `📍 Pickup ${number}` : '📍 Pickup') : '🏁 Drop-off';
  const shadow = isPickup ? 'rgba(19,136,8,0.4)' : 'rgba(255,153,51,0.4)';

  return L.divIcon({
    className: 'custom-marker-icon',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="background:${color};color:#fff;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;font-family:'Inter',sans-serif;white-space:nowrap;box-shadow:0 4px 12px ${shadow};margin-bottom:4px;letter-spacing:.3px">${label}</div>
        <div style="width:16px;height:16px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px ${shadow},0 4px 8px rgba(0,0,0,.2);animation:markerPulse 2s ease-in-out infinite"></div>
        <div style="width:2px;height:6px;background:${color};opacity:.5"></div>
      </div>`,
    iconSize: [90, 55],
    iconAnchor: [45, 50],
  });
}
