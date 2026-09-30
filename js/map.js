(() => {
  'use strict';

  const cfg = window.CT_FOOD_ACCESS_CONFIG || {};
  const USDA_SNAP_ENDPOINT = 'https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0/query';
  const defaultCenter = cfg.DEFAULT_CENTER || { lat: 41.7658, lng: -72.6734 };
  const radiusMiles = Number(cfg.SNAP_SEARCH_RADIUS_MILES || 10);
  const maxResults = Number(cfg.MAX_SNAP_RESULTS || 40);
  const maxGoogleEnrichments = Number(cfg.MAX_GOOGLE_ENRICHMENTS || 8);

  const state = {
    userLocation: null,
    stores: [],
    map: null,
    infoWindow: null,
    userMarker: null,
    markers: [],
    travelMode: 'DRIVING',
    selectedId: null,
    googleReady: false,
    Route: null,
    RouteMatrix: null,
    routePolylines: [],
    routedStoreId: null
  };

  const els = {
    map: document.getElementById('map'),
    fallback: document.getElementById('map-fallback'),
    list: document.getElementById('store-list'),
    count: document.getElementById('result-count'),
    recenter: document.getElementById('recenter-btn'),
    timeGrid: document.getElementById('time-grid'),
    date: document.getElementById('preferred-date'),
    time: document.getElementById('preferred-time'),
    routePanel: document.getElementById('route-panel'),
    routeSummary: document.getElementById('route-summary'),
    clearRoute: document.getElementById('clear-route-btn')
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setDefaultDate();
    bindControls();
    showMapFallbackIfNeeded();

    try {
      state.userLocation = await getUserLocation();
    } catch (err) {
      state.userLocation = defaultCenter;
      toast('Location permission was not available, so the Hartford demo location is being used.');
    }

    if (cfg.GOOGLE_MAPS_API_KEY) {
      try {
        await loadGoogleMaps();
        initGoogleMap();
        state.googleReady = true;
      } catch (err) {
        console.warn('Google Maps failed to load:', err);
        showFallbackMap();
        toast('Google Maps could not load. Showing SNAP results without the live map.');
      }
    } else {
      showFallbackMap();
    }

    await refreshStores();
  }

  function bindControls() {
    document.querySelectorAll('input[name="shop-time"]').forEach(input => {
      input.addEventListener('change', () => {
        const later = input.value === 'later' && input.checked;
        els.timeGrid.classList.toggle('enabled', later);
        els.timeGrid.setAttribute('aria-hidden', String(!later));
        renderStores();
        if (state.googleReady) enrichVisibleStores();
      });
    });

    [els.date, els.time].forEach(input => input.addEventListener('change', () => {
      renderStores();
      if (state.googleReady) enrichVisibleStores();
    }));

    document.querySelectorAll('.travel-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.travel-btn').forEach(other => {
          const active = other === btn;
          other.classList.toggle('active', active);
          other.setAttribute('aria-pressed', String(active));
        });
        state.travelMode = btn.dataset.mode;
        if (state.googleReady) await updateRouteMetrics();
        if (state.routedStoreId) {
          const routedStore = state.stores.find(s => s.id === state.routedStoreId);
          if (routedStore) await showRouteToStore(routedStore, { quiet: true });
        }
        sortStores();
        renderStores();
        renderMarkers();
      });
    });

    els.recenter?.addEventListener('click', () => {
      if (state.map && state.userLocation) {
        fitMapToStores();
      }
    });

    els.clearRoute?.addEventListener('click', clearRoute);
  }

  function setDefaultDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    els.date.value = local;
    els.date.min = local;
  }

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation is unavailable.'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        reject,
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 120000 }
      );
    });
  }

  function showMapFallbackIfNeeded() {
    if (!cfg.GOOGLE_MAPS_API_KEY) showFallbackMap();
  }

  function showFallbackMap() {
    els.map.hidden = true;
    els.fallback.hidden = false;
    els.recenter.hidden = true;
  }

  function loadGoogleMaps() {
    if (window.google?.maps) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const callback = '__ctFoodAccessGoogleMapsReady';
      window[callback] = () => {
        delete window[callback];
        resolve();
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.GOOGLE_MAPS_API_KEY)}&libraries=places&v=weekly&callback=${callback}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Google Maps script failed to load.'));
      document.head.appendChild(script);
    });
  }

  function initGoogleMap() {
    els.map.hidden = false;
    els.fallback.hidden = true;
    els.recenter.hidden = false;
    state.map = new google.maps.Map(els.map, {
      center: state.userLocation,
      zoom: 13,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: 'greedy'
    });
    state.infoWindow = new google.maps.InfoWindow();
    state.userMarker = new google.maps.Marker({
      map: state.map,
      position: state.userLocation,
      title: 'Your location',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#1479ed', fillOpacity: 1,
        strokeColor: '#ffffff', strokeWeight: 3,
        scale: 9
      },
      zIndex: 999
    });
  }

  async function refreshStores() {
    setLoading('Finding nearby SNAP/EBT retailers…');
    try {
      const raw = await queryUsdaSnap(state.userLocation);
      state.stores = raw
        .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .map(s => ({ ...s, straightMiles: haversine(state.userLocation.lat, state.userLocation.lng, s.lat, s.lng) }))
        .sort((a, b) => a.straightMiles - b.straightMiles)
        .slice(0, Math.min(maxResults, 20));

      if (!state.stores.length) {
        els.count.textContent = '0 stores';
        els.list.innerHTML = '<div class="empty-card">No SNAP retailers were returned within the current search radius.</div>';
        return;
      }

      if (state.googleReady) {
        renderMarkers();
        fitMapToStores();
        await Promise.allSettled([loadRoutesLibrary(), enrichVisibleStores()]);
        await updateRouteMetrics();
      }

      sortStores();
      renderStores();
      if (state.googleReady) renderMarkers();
    } catch (err) {
      console.error(err);
      els.count.textContent = 'Unavailable';
      els.list.innerHTML = '<div class="error-card"><strong>We could not load SNAP retailer data.</strong><br>Check your internet connection and try again.</div>';
    }
  }

  async function queryUsdaSnap(origin) {
    const params = new URLSearchParams({
      f: 'json',
      where: '1=1',
      geometry: `${origin.lng},${origin.lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(radiusMiles),
      units: 'esriSRUnit_StatuteMile',
      outFields: 'Record_ID,Store_Name,Store_Street_Address,City,State,Zip_Code,Store_Type,Latitude,Longitude,Incentive_Program',
      returnGeometry: 'false',
      resultRecordCount: String(maxResults)
    });

    const response = await fetch(`${USDA_SNAP_ENDPOINT}?${params.toString()}`);
    if (!response.ok) throw new Error(`USDA request failed (${response.status})`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'USDA ArcGIS query failed');

    return (data.features || []).map((feature, index) => {
      const a = feature.attributes || {};
      return {
        id: String(a.Record_ID ?? a.ObjectId ?? index),
        name: a.Store_Name || 'SNAP retailer',
        address: [a.Store_Street_Address, a.City, a.State, a.Zip_Code].filter(Boolean).join(', '),
        street: a.Store_Street_Address || '',
        city: a.City || '',
        state: a.State || '',
        zip: a.Zip_Code || '',
        type: a.Store_Type || 'Retailer',
        lat: Number(a.Latitude),
        lng: Number(a.Longitude),
        incentive: a.Incentive_Program || '',
        snapEligible: true,
        openStatus: 'unknown',
        hoursText: 'Hours not checked',
        googlePlaceId: null,
        routeMiles: null,
        routeMinutes: null
      };
    });
  }

  async function loadRoutesLibrary() {
    if (state.Route && state.RouteMatrix) return true;
    if (!state.googleReady || !google.maps.importLibrary) return false;
    try {
      const routesLib = await google.maps.importLibrary('routes');
      state.Route = routesLib.Route;
      state.RouteMatrix = routesLib.RouteMatrix;
      return Boolean(state.Route && state.RouteMatrix);
    } catch (err) {
      console.warn('Google Routes library failed to load:', err);
      return false;
    }
  }

  async function updateRouteMetrics() {
    if (!state.googleReady || !state.stores.length) return;
    const ready = await loadRoutesLibrary();
    if (!ready || !state.RouteMatrix) return;

    const destinations = state.stores.slice(0, 20).map(s => ({ lat: s.lat, lng: s.lng }));
    const request = {
      origins: [state.userLocation],
      destinations,
      travelMode: state.travelMode,
      units: google.maps.UnitSystem.IMPERIAL,
      fields: ['distanceMeters', 'durationMillis', 'condition']
    };

    if (state.travelMode === 'TRANSIT') {
      request.departureTime = routeDepartureTime();
    }

    try {
      const { matrix } = await state.RouteMatrix.computeRouteMatrix(request);
      const items = matrix?.rows?.[0]?.items || [];
      items.forEach((item, i) => {
        const store = state.stores[i];
        if (!store || item.condition !== 'ROUTE_EXISTS') return;
        if (Number.isFinite(item.distanceMeters)) store.routeMiles = item.distanceMeters / 1609.344;
        if (Number.isFinite(item.durationMillis)) store.routeMinutes = Math.max(1, Math.round(item.durationMillis / 60000));
      });
    } catch (err) {
      console.warn('Route matrix unavailable; using straight-line distance:', err);
    }
  }

  async function enrichVisibleStores() {
    if (!state.googleReady || !google.maps.places) return;
    const candidates = state.stores.slice(0, maxGoogleEnrichments);
    await Promise.allSettled(candidates.map(enrichStoreFromGoogle));
    renderStores();
    renderMarkers();
  }

  async function enrichStoreFromGoogle(store) {
    try {
      if (google.maps.places.Place?.searchByText) {
        const { Place } = google.maps.places;
        const request = {
          textQuery: `${store.name} ${store.street} ${store.city} ${store.state}`,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'regularOpeningHours', 'currentOpeningHours', 'businessStatus'],
          locationBias: { center: { lat: store.lat, lng: store.lng }, radius: 1200 },
          maxResultCount: 1
        };
        const result = await Place.searchByText(request);
        const place = result.places?.[0];
        if (!place) return;
        store.googlePlaceId = place.id || null;
        store.businessStatus = place.businessStatus || null;
        const opening = place.regularOpeningHours || place.currentOpeningHours;
        applyOpeningHours(store, opening);
      }
    } catch (err) {
      console.debug('Place enrichment failed for', store.name, err);
    }
  }

  function applyOpeningHours(store, openingHours) {
    if (!openingHours) {
      store.openStatus = 'unknown';
      store.hoursText = 'Hours unavailable';
      return;
    }

    const target = selectedDateTime();
    const periods = openingHours.periods || [];
    const isOpen = isOpenAt(periods, target);
    store.openStatus = isOpen === true ? 'open' : isOpen === false ? 'closed' : 'unknown';

    if (document.querySelector('input[name="shop-time"]:checked')?.value === 'now' && openingHours.isOpen) {
      try {
        const nowOpen = openingHours.isOpen();
        store.openStatus = nowOpen ? 'open' : 'closed';
      } catch (_) {}
    }

    store.hoursText = store.openStatus === 'open'
      ? 'Open at your selected time'
      : store.openStatus === 'closed'
        ? 'Closed at your selected time'
        : 'Hours unavailable';
  }

  function isOpenAt(periods, target) {
    if (!Array.isArray(periods) || !periods.length) return null;
    const targetWeekMinutes = target.getDay() * 1440 + target.getHours() * 60 + target.getMinutes();
    for (const period of periods) {
      if (!period.open) continue;
      const oDay = Number(period.open.day ?? period.open.dayOfWeek ?? 0);
      const oHour = Number(period.open.hour ?? 0);
      const oMin = Number(period.open.minute ?? 0);
      const openMin = oDay * 1440 + oHour * 60 + oMin;
      if (!period.close) return targetWeekMinutes >= openMin;
      const cDay = Number(period.close.day ?? period.close.dayOfWeek ?? oDay);
      const cHour = Number(period.close.hour ?? 0);
      const cMin = Number(period.close.minute ?? 0);
      let closeMin = cDay * 1440 + cHour * 60 + cMin;
      if (closeMin <= openMin) closeMin += 7 * 1440;
      let t = targetWeekMinutes;
      if (t < openMin && closeMin > 7 * 1440) t += 7 * 1440;
      if (t >= openMin && t < closeMin) return true;
    }
    return false;
  }

  function selectedDateTime() {
    const mode = document.querySelector('input[name="shop-time"]:checked')?.value;
    if (mode !== 'later') return new Date();
    const date = els.date.value || new Date().toISOString().slice(0, 10);
    const time = els.time.value || '18:00';
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  function sortStores() {
    state.stores.sort((a, b) => {
      const aOpen = a.openStatus === 'open' ? 0 : a.openStatus === 'unknown' ? 1 : 2;
      const bOpen = b.openStatus === 'open' ? 0 : b.openStatus === 'unknown' ? 1 : 2;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const ad = a.routeMinutes ?? a.routeMiles ?? a.straightMiles;
      const bd = b.routeMinutes ?? b.routeMiles ?? b.straightMiles;
      return ad - bd;
    });
  }

  function renderStores() {
    if (!state.stores.length) return;
    const visible = state.stores.slice(0, 10);
    els.count.textContent = `${visible.length} store${visible.length === 1 ? '' : 's'}`;
    els.list.innerHTML = visible.map((store, index) => {
      const miles = store.routeMiles ?? store.straightMiles;
      const routeLabel = store.routeMinutes ? `${store.routeMinutes} min` : 'approx.';
      const statusClass = store.openStatus;
      const hours = escapeHtml(store.hoursText || 'Hours unavailable');
      return `
        <article class="store-card ${state.selectedId === store.id ? 'selected' : ''}" data-id="${escapeAttr(store.id)}" tabindex="0" aria-label="${escapeAttr(store.name)}">
          <div class="store-rank">${index + 1}</div>
          <div class="store-main">
            <div class="store-name-row"><span class="store-name">${escapeHtml(store.name)}</span><span class="snap-tag">SNAP/EBT ✓</span></div>
            <div class="store-meta">${escapeHtml(store.type || 'Retailer')}</div>
            <div class="store-address" title="${escapeAttr(store.address)}">⌖ ${escapeHtml(store.address)}</div>
            <div class="store-hours ${statusClass}">◷ ${hours}</div>
          </div>
          <div class="store-side">
            <div class="store-distance">${miles.toFixed(1)} mi</div>
            <div class="store-duration">${routeLabel}</div>
          </div>
          <button class="direction-link" type="button" data-route-id="${escapeAttr(store.id)}" aria-label="Show directions to ${escapeAttr(store.name)} on this map">➤ Directions</button>
        </article>`;
    }).join('');

    els.list.querySelectorAll('.store-card').forEach(card => {
      const select = () => selectStore(card.dataset.id);
      card.addEventListener('click', e => {
        const routeButton = e.target.closest('[data-route-id]');
        if (routeButton) {
          e.stopPropagation();
          const store = state.stores.find(s => s.id === routeButton.dataset.routeId);
          if (store) showRouteToStore(store);
          return;
        }
        select();
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
    });
  }

  function renderMarkers() {
    if (!state.googleReady || !state.map) return;
    state.markers.forEach(m => m.setMap(null));
    state.markers = [];

    state.stores.slice(0, 10).forEach((store, index) => {
      const marker = new google.maps.Marker({
        map: state.map,
        position: { lat: store.lat, lng: store.lng },
        title: store.name,
        label: { text: String(index + 1), color: '#fff', fontWeight: '700' },
        icon: markerSymbol(store.openStatus, state.selectedId === store.id),
        zIndex: state.selectedId === store.id ? 500 : 100 - index
      });
      marker.storeId = store.id;
      marker.addListener('click', () => selectStore(store.id));
      state.markers.push(marker);
    });
  }

  function markerSymbol(status, selected) {
    const fill = status === 'closed' ? '#8795a5' : status === 'unknown' ? '#6c59cf' : '#0aa45a';
    return {
      path: 'M 0,0 C -8,-12 -16,-20 -16,-31 A 16,16 0 1,1 16,-31 C 16,-20 8,-12 0,0 z',
      fillColor: fill,
      fillOpacity: 1,
      strokeColor: selected ? '#12264b' : '#ffffff',
      strokeWeight: selected ? 3 : 2,
      scale: 1,
      labelOrigin: new google.maps.Point(0, -31),
      anchor: new google.maps.Point(0, 0)
    };
  }

  function selectStore(id) {
    const store = state.stores.find(s => s.id === id);
    if (!store) return;
    state.selectedId = id;
    renderStores();
    renderMarkers();
    if (!state.googleReady || !state.map) return;
    state.map.panTo({ lat: store.lat, lng: store.lng });
    const marker = state.markers.find(m => m.storeId === id);
    if (marker && state.infoWindow) {
      state.infoWindow.setContent(`
        <div class="info-window">
          <h3>${escapeHtml(store.name)}</h3>
          <p>${escapeHtml(store.type)}</p>
          <p class="iw-snap">SNAP/EBT authorized ✓</p>
          <p>${(store.routeMiles ?? store.straightMiles).toFixed(1)} mi${store.routeMinutes ? ` · ${store.routeMinutes} min` : ''}</p>
          <p>${escapeHtml(store.hoursText)}</p>
          <button type="button" class="iw-route-btn" data-route-id="${escapeAttr(store.id)}">Get directions</button>
        </div>`);
      google.maps.event.addListenerOnce(state.infoWindow, 'domready', () => {
        const btn = document.querySelector(`.iw-route-btn[data-route-id="${CSS.escape(String(store.id))}"]`);
        if (btn) btn.addEventListener('click', () => showRouteToStore(store));
      });
      state.infoWindow.open({ anchor: marker, map: state.map });
    }
  }

  function fitMapToStores() {
    if (!state.map || !state.stores.length) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(state.userLocation);
    // Zoom in on the closest stores: enough to show at least 5, without pulling out for far-away ones.
    const nearest = [...state.stores].sort((a, b) => a.straightMiles - b.straightMiles).slice(0, 5);
    nearest.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
    state.map.fitBounds(bounds, 55);
    // If the closest stores are all right next door, don't zoom in past street level.
    google.maps.event.addListenerOnce(state.map, 'idle', () => {
      if (state.map.getZoom() > 16) state.map.setZoom(16);
    });
  }

  async function showRouteToStore(store, options = {}) {
    if (!state.googleReady || !state.map) {
      if (!options.quiet) toast('Google Maps directions are not available yet.');
      return;
    }

    const ready = await loadRoutesLibrary();
    if (!ready || !state.Route) {
      if (!options.quiet) toast('Enable the Google Routes API for this API key to show directions.');
      return;
    }

    state.selectedId = store.id;
    state.routedStoreId = store.id;
    renderStores();
    renderMarkers();
    state.infoWindow?.close();
    clearRoutePolylines();

    const request = {
      origin: state.userLocation,
      destination: { lat: store.lat, lng: store.lng },
      travelMode: state.travelMode,
      units: google.maps.UnitSystem.IMPERIAL,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'localizedValues']
    };

    if (state.travelMode === 'TRANSIT') {
      request.departureTime = routeDepartureTime();
    }

    setRoutePanel(`Finding ${travelModeLabel()} directions to ${store.name}…`, true);

    try {
      const { routes } = await state.Route.computeRoutes(request);
      const route = routes?.[0];
      if (!route) throw new Error('ZERO_RESULTS: Google returned no route.');

      const polylines = route.createPolylines({
        polylineOptions: {
          strokeColor: '#126fe5',
          strokeOpacity: 0.92,
          strokeWeight: 6
        }
      });
      state.routePolylines = Array.isArray(polylines) ? polylines : [];
      state.routePolylines.forEach(polyline => polyline.setMap(state.map));

      if (route.viewport) {
        state.map.fitBounds(route.viewport, 55);
      } else if (route.path?.length) {
        const bounds = new google.maps.LatLngBounds();
        route.path.forEach(point => bounds.extend(point));
        state.map.fitBounds(bounds, 55);
      }

      const localized = route.localizedValues || {};
      const distance = localized.distanceMeters ||
        (Number.isFinite(route.distanceMeters) ? `${(route.distanceMeters / 1609.344).toFixed(1)} mi` : `${(store.routeMiles ?? store.straightMiles).toFixed(1)} mi`);
      const duration = localized.duration ||
        (Number.isFinite(route.durationMillis) ? formatDuration(route.durationMillis) : (store.routeMinutes ? `${store.routeMinutes} min` : ''));

      if (Number.isFinite(route.distanceMeters)) store.routeMiles = route.distanceMeters / 1609.344;
      if (Number.isFinite(route.durationMillis)) store.routeMinutes = Math.max(1, Math.round(route.durationMillis / 60000));

      const detail = [String(distance), String(duration), travelModeLabel()].filter(Boolean).join(' · ');
      setRoutePanel(`<strong>${escapeHtml(store.name)}</strong><span>${escapeHtml(detail)}</span>`, false, true);
      renderStores();
    } catch (err) {
      console.error('Route calculation failed:', err);
      state.routedStoreId = null;
      clearRoutePolylines();
      hideRoutePanel();
      const message = routeErrorMessage(err);
      if (!options.quiet) toast(message);
    }
  }

  function clearRoutePolylines() {
    state.routePolylines.forEach(polyline => {
      try { polyline.setMap(null); } catch (_) {}
    });
    state.routePolylines = [];
  }

  function clearRoute() {
    state.routedStoreId = null;
    clearRoutePolylines();
    hideRoutePanel();
    fitMapToStores();
  }

  function routeDepartureTime() {
    const chosen = selectedDateTime();
    const now = new Date();
    return chosen.getTime() < now.getTime() ? now : chosen;
  }

  function formatDuration(ms) {
    const minutes = Math.max(1, Math.round(ms / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
  }

  function routeErrorMessage(err) {
    const text = String(err?.message || err || '');
    if (/PERMISSION_DENIED|REQUEST_DENIED|API.*not.*enabled|403/i.test(text)) {
      return 'Directions need the Google Routes API enabled for this API key.';
    }
    if (/ZERO_RESULTS|no route/i.test(text)) {
      return `No ${travelModeLabel().toLowerCase()} route was found to this store.`;
    }
    if (/INVALID_ARGUMENT/i.test(text)) {
      return 'Google rejected this route request. Check the selected travel time and try again.';
    }
    return 'The route could not be loaded. Check that Routes API is enabled, then try again.';
  }

  function setRoutePanel(content, loading = false, html = false) {
    if (!els.routePanel || !els.routeSummary) return;
    els.routePanel.hidden = false;
    els.routePanel.classList.toggle('loading', loading);
    if (html) els.routeSummary.innerHTML = content;
    else els.routeSummary.textContent = content;
  }

  function hideRoutePanel() {
    if (els.routePanel) els.routePanel.hidden = true;
  }

  function travelModeLabel() {
    return state.travelMode === 'WALKING' ? 'Walking' : state.travelMode === 'TRANSIT' ? 'Bus/transit' : 'Driving';
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 3958.7613;
    const rad = d => d * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function setLoading(message) {
    els.count.textContent = 'Finding stores…';
    els.list.innerHTML = `<div class="loading-card"><span class="spinner" aria-hidden="true"></span><p>${escapeHtml(message)}</p></div>`;
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
})();
