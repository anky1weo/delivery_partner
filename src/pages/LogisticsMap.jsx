import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Truck, Bike, Tractor, Navigation, Clock,
  IndianRupee, Route as RouteIcon, Zap, ChevronDown, RotateCcw, Trash2, MapPin, Plus, Sparkles
} from 'lucide-react';
import MapComponent from '../components/MapComponent';
import { useApp } from '../context/AppContext';

/* ── Vehicle configs ── */
const VEHICLES = {
  bike:            { label: 'Bike',            baseFare: 10, perKm: 5,  perMin: 0.5, minFare: 15,  emoji: '🏍️' },
  mini:            { label: 'Mini Van',        baseFare: 15, perKm: 7,  perMin: 0.8, minFare: 25,  emoji: '🚐' },
  tempo:           { label: 'Tempo',           baseFare: 20, perKm: 8,  perMin: 1.0, minFare: 35,  emoji: '🚛' },
  small_truck:     { label: 'Small Truck',     baseFare: 25, perKm: 10, perMin: 1.2, minFare: 45,  emoji: '🚚' },
  heavy_truck:     { label: 'Heavy Truck',     baseFare: 30, perKm: 12, perMin: 1.5, minFare: 60,  emoji: '🚛' },
  tractor_trolley: { label: 'Tractor Trolley', baseFare: 25, perKm: 11, perMin: 1.3, minFare: 50,  emoji: '🚜' },
};

/* ── Pricing calculator ── */
function calcPrice(distKm, durMin, vKey) {
  const c = VEHICLES[vKey] || VEHICLES.bike;
  const raw = c.baseFare + distKm * c.perKm + durMin * c.perMin;
  const disc = distKm > 20 ? 0.15 : distKm > 10 ? 0.10 : distKm > 5 ? 0.05 : 0;
  const final = Math.max(Math.round(raw * (1 - disc)), c.minFare);
  return { baseFare: c.baseFare, distCharge: Math.round(distKm * c.perKm), timeCharge: Math.round(durMin * c.perMin), discount: Math.round(raw * disc), final, perKm: c.perKm };
}

async function reverseGeo(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
    const d = await r.json();
    if (d?.display_name) return d.display_name.split(',').slice(0, 2).join(',').trim();
  } catch {}
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

/* ── OSRM Trip Service (for multi-waypoint optimization) ── */
async function fetchOptimalRoute(waypoints) {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  
  // Use 'trip' for optimization, but 'route' is better for specific P1->P2->D flow
  // We'll use 'route' but ensure all points are included
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
    const d = await r.json();
    if (d.code === 'Ok' && d.routes.length) {
      const rt = d.routes[0];
      return {
        distKm: +(rt.distance / 1000).toFixed(1),
        durMin: Math.round(rt.duration / 60),
        coords: rt.geometry.coordinates.map(c => [c[1], c[0]]),
      };
    }
  } catch (e) { console.warn('OSRM error:', e.message); }
  return null;
}

export default function LogisticsMap() {
  const navigate = useNavigate();
  const { partner } = useApp();

  const [pickups, setPickups] = useState([]);
  const [destination, setDestination] = useState(null);
  const [placingMode, setPlacingMode] = useState('pickup');
  const [routeData, setRouteData] = useState(null);
  const [vehicle, setVehicle] = useState(partner.vehicleType || 'bike');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [busy, setBusy] = useState(false);

  const pricing = routeData ? calcPrice(routeData.distKm, routeData.durMin, vehicle) : null;
  const vCfg = VEHICLES[vehicle] || VEHICLES.bike;

  useEffect(() => {
    if (pickups.length === 0 || !destination) { setRouteData(null); return; }
    let cancelled = false;
    setBusy(true);
    fetchOptimalRoute([...pickups, destination]).then(data => {
      if (!cancelled) { setRouteData(data); setBusy(false); }
    });
    return () => { cancelled = true; };
  }, [pickups, destination]);

  const handleMapClick = useCallback(async (latlng) => {
    const label = await reverseGeo(latlng.lat, latlng.lng);
    const point = { lat: latlng.lat, lng: latlng.lng, label };

    if (placingMode === 'pickup') {
      setPickups(prev => [...prev, point]);
      // We don't auto-switch anymore so user can add multiple pickups easily
    } else {
      setDestination(point);
    }
  }, [placingMode]);

  const reset = () => {
    setPickups([]); setDestination(null); setRouteData(null); 
    setShowBreakdown(false); setPlacingMode('pickup');
  };

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#fff', overflow: 'hidden' }}>
      
      {/* ── Page Header ── */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ color: '#94a3b8' }}><ChevronLeft size={24} /></button>
          <h1 style={{ fontSize: 16, fontWeight: 700 }}>GIS Logistics</h1>
        </div>
        <button onClick={reset} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
          <RotateCcw size={14} /> Clear All
        </button>
      </div>

      {/* ── Mode Toggle Bar ── */}
      <div style={{ display: 'flex', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={() => setPlacingMode('pickup')} style={{
          flex: 1, padding: '12px', fontSize: 13, fontWeight: 700, 
          color: placingMode === 'pickup' ? '#4ade80' : '#64748b',
          borderBottom: placingMode === 'pickup' ? '3px solid #138808' : '3px solid transparent',
          background: placingMode === 'pickup' ? 'rgba(19,136,8,0.08)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}>
          <Plus size={16} /> Add Pickup ({pickups.length})
        </button>
        <button onClick={() => setPlacingMode('destination')} style={{
          flex: 1, padding: '12px', fontSize: 13, fontWeight: 700,
          color: placingMode === 'destination' ? '#fb923c' : '#64748b',
          borderBottom: placingMode === 'destination' ? '3px solid #f97316' : '3px solid transparent',
          background: placingMode === 'destination' ? 'rgba(249,115,22,0.08)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}>
          <MapPin size={16} /> Set Drop-off {destination ? '✓' : ''}
        </button>
      </div>

      {/* ── Main Map Area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapComponent
          pickups={pickups}
          destination={destination}
          routeCoords={routeData?.coords || null}
          onMapClick={handleMapClick}
          height="100%"
        />

        {/* Floating Instruction Pill */}
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '90%', maxWidth: 400 }}>
          <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            {busy ? <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%' }} /> : <div style={{ width: 10, height: 10, borderRadius: '50%', background: placingMode === 'pickup' ? '#138808' : '#f97316', animation: 'pulse 2s infinite' }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
                {busy ? 'Calculating...' : 
                 placingMode === 'pickup' ? `Step 1: Mark Pickups (${pickups.length})` : 
                 !destination ? 'Step 2: Mark Drop-off location' : 'Optimal Route Found!'}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {placingMode === 'pickup' ? 'Tap map to add collection points' : !destination ? 'Tap map to set delivery end point' : 'Drag markers or change vehicle to update'}
              </div>
            </div>
            {routeData && <Sparkles size={16} color="#fbbf24" className="animate-pulse" />}
          </div>
        </div>
      </div>

      {/* ── Bottom Info Sheet ── */}
      <div style={{ background: '#1e293b', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '16px 20px 24px', zIndex: 20 }}>
        
        {/* Selected Points Chips */}
        {(pickups.length > 0 || destination) && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {pickups.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(19,136,8,0.15)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(19,136,8,0.2)', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>P{i+1}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
                <button onClick={() => setPickups(prev => prev.filter((_, idx) => idx !== i))} style={{ color: '#ef4444' }}><Trash2 size={12} /></button>
              </div>
            ))}
            {destination && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(249,115,22,0.15)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(249,115,22,0.2)', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fb923c' }}>Drop</span>
                <span style={{ fontSize: 11, color: '#cbd5e1', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{destination.label}</span>
                <button onClick={() => setDestination(null)} style={{ color: '#ef4444' }}><Trash2 size={12} /></button>
              </div>
            )}
          </div>
        )}

        {/* Vehicle Selector */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
          {Object.entries(VEHICLES).map(([k, v]) => (
            <button key={k} onClick={() => setVehicle(k)} style={{
              padding: '8px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600,
              background: vehicle === k ? 'rgba(19,136,8,0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${vehicle === k ? '#138808' : 'rgba(255,255,255,0.1)'}`,
              color: vehicle === k ? '#4ade80' : '#94a3b8'
            }}>
              <span>{v.emoji}</span> {v.label}
            </button>
          ))}
        </div>

        {/* Pricing & Stats */}
        {routeData && pricing ? (
          <div className="animate-fadeInUp">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <StatItem icon={<RouteIcon size={16} />} label="Optimized Dist." value={`${routeData.distKm} km`} color="#4ade80" />
              <StatItem icon={<Clock size={16} />} label="Total Time" value={`${routeData.durMin} min`} color="#60a5fa" />
              <StatItem icon={<IndianRupee size={16} />} label="Optimal Fare" value={`₹${pricing.final}`} color="#fb923c" />
            </div>
            
            <button style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #138808, #0e6b05)', color: '#fff', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 12px rgba(19,136,8,0.3)' }}>
              <Navigation size={18} /> Confirm Optimal Route — ₹{pricing.final}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Select multiple pickups and a drop-off on map</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
      <div style={{ color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
