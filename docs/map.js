// map.js — points renderer (events.geojson) with hover halo + click-to-open info card
document.addEventListener('DOMContentLoaded', async () => {
  // Pym: create if available; otherwise stay null
  let pymChild = null;
  try { if (window.pym) pymChild = new pym.Child(); } catch { }

  mapboxgl.accessToken = "pk.eyJ1IjoibWxub3ciLCJhIjoiY21oM21rM2RmMDg3bjJpcHg0MzRwa2NpZyJ9.drZktAF4o0TiL48lqEvD8g";

  // DOM
  const infoBox = document.getElementById('info-box');
  const legendEl = document.getElementById('legend');

  // Map
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mlnow/cm2tndow500co01pw3fho5d21', // keep your template style
    center: [-122.4243266, 37.7247071],  
    zoom: 10
  });

  // Helpers
  const key = v => (v == null ? '' : String(v).trim());
  const safe = (p, k) => key(p?.[k]);

  // Info box template
  function tplInfo(p = {}) {
    const event = safe(p, 'event') || 'Untitled';
    const date = safe(p, 'date');
    const time = safe(p, 'time');
    const when = [date, time].filter(Boolean).join(' • ');
    const desc = safe(p, 'description');
    return `
        <div class="info-title-row">
          <div class="event"><strong>${event}</strong></div>
          <div class="when">${when}</div>
        </div>
        ${desc ? `<div class="info-desc">${desc}</div>` : ``}
      `;
  }

  // UID for hover/selection
  function makeUID(props = {}) {
    return [safe(props, 'event'), safe(props, 'date'), safe(props, 'time')].join('||');
  }

  // Load data
  const DATA_URL = 'events.geojson';
  const gj = await fetch(DATA_URL).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${DATA_URL}`);
    return r.json();
  });

  // Precompute uid
  for (const f of (gj.features || [])) {
    if (!f.properties) f.properties = {};
    f.properties.__uid = makeUID(f.properties);
  }

  // Show/Hide box
  // Replace your current helpers with these
  const showInfoBox = () => {
    infoBox.style.display = 'block';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch { } });
  };
  const hideInfoBox = () => {
    infoBox.style.display = 'none';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch { } });
  };

  // Selection state
  let selectedUID = null;
  const clearSelection = () => {
    selectedUID = null;
    infoBox.innerHTML = '';
    hideInfoBox();
    try { map.setFilter('events-hover', ['==', ['get', '__uid'], '']); } catch { }
  };

  map.on('load', () => {
    map.addSource('events', { type: 'geojson', data: gj });

    // Base points
    map.addLayer({
      id: 'events-dots',
      type: 'circle',
      source: 'events',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 6.5],
        'circle-color': '#007DBC',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1
      }
    });

    // Hover halo
    map.addLayer({
      id: 'events-hover',
      type: 'circle',
      source: 'events',
      filter: ['==', ['get', '__uid'], ''],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3
      }
    });

    // Hover
    map.on('mousemove', 'events-dots', (e) => {
      if (!e.features?.length) return;
      const uid = e.features[0].properties?.__uid || '';
      map.setFilter('events-hover', ['==', ['get', '__uid'], uid]);
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'events-dots', () => {
      if (!selectedUID) map.setFilter('events-hover', ['==', ['get', '__uid'], '']);
      map.getCanvas().style.cursor = '';
    });

    // Click → open card
    map.on('click', 'events-dots', (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const props = f.properties || {};
      selectedUID = props.__uid || '';
      infoBox.innerHTML = tplInfo(props);
      map.setFilter('events-hover', ['==', ['get', '__uid'], selectedUID]);
      showInfoBox();
      map.getCanvas().style.cursor = 'pointer';
    });

    // Click background → clear
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['events-dots'] });
      if (!hit.length) clearSelection();
    });

    // ESC to clear
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSelection(); });

    // Keep labels above
    try {
      if (map.getLayer('road-label-navigation')) map.moveLayer('road-label-navigation');
      if (map.getLayer('settlement-subdivision-label')) map.moveLayer('settlement-subdivision-label');
      map.moveLayer('events-hover');
    } catch { }

    // Pym height sync
    (function robustPym() {
      const sendBurst = (ms = 1800, every = 150) => {
        const end = performance.now() + ms;
        const tick = () => {
          try { pymChild?.sendHeight(); } catch { }
          if (performance.now() < end) setTimeout(tick, every);
        };
        requestAnimationFrame(tick);
      };

      Promise.all([
        new Promise(r => map.once('idle', r)),
        (document.fonts?.ready ?? Promise.resolve())
      ]).then(() => {
        requestAnimationFrame(() => {
          try { pymChild?.sendHeight(); } catch { }
          sendBurst();
        });
      });

      let tId = null;
      const throttled = () => {
        if (tId) return;
        tId = setTimeout(() => { tId = null; try { pymChild?.sendHeight(); } catch { } }, 100);
      };

      new ResizeObserver(throttled).observe(document.body);
      const mo = new MutationObserver(throttled);
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });

      window.addEventListener('orientationchange', () => {
        setTimeout(() => { map.resize(); sendBurst(1000, 150); }, 200);
      });
    })();
  });

  // Relayout on window resize
  window.addEventListener('resize', () => map.resize());
});
