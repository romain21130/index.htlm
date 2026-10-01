/* RM Ultimate Dashboard v6.7
 * Single-file Home Assistant custom card. No external dependency.
 * 2.5D/WebGL companion + smooth gate timeline + ambient mode + weather.
 */

class RMUltimateDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._built = false;
    this._raf = 0;
    this._lastFrame = performance.now();
    this._lastActivity = Date.now();
    this._ambient = false;
    this._gate = { progress: 0, from: 0, to: 0, start: 0, duration: 20500, moving: false, dir: null };
    this._lastGateHaState = null;
    this._forecast = [];
    this._forecastTimer = null;
    this._hourBoundaryTimer = null;
    this._weatherEntity = null;
    this._exactWeatherCurrent = null;
    this._exactWeatherFetchedAt = 0;
    this._motion = {
      requesting: false,
      ready: false,
      unsupported: false,
      pendingGesture: false,
      stream: null,
      timer: null,
      prev: null,
      hits: 0,
      cooldownUntil: 0,
      toastTimer: null,
      lastScore: 0,
    };
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        if (this._config.motion_wake !== false) this._initMotionDetector(false);
      }
    };
    this._onActivity = this._onActivity.bind(this);
    this._loop = this._loop.bind(this);
  }

  setConfig(config) {
    this._config = {
      gate_entity: 'cover.10028e9559_motor_control',
      weather_entity: null,
      location_label: 'Saint-Seine-en-Bâche · 21130',
      weather_latitude: 47.1208333333,
      weather_longitude: 5.3716666667,
      camera_entity: null,
      idle_seconds: 30,
      motion_wake: true,
      motion_sample_ms: 320,
      motion_threshold: 0.10,
      wake_on_gate: true,
      wake_entities: [],
      gate_seconds: 20.5,
      ...config,
    };
    if (this._built) this._applyConfig();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._updateFromHass();
  }

  getCardSize() { return 12; }

  connectedCallback() {
    if (this._built) this._start();
  }

  disconnectedCallback() {
    this._stop();
  }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card class="rm-shell">
        <div class="ambient-halo halo-a"></div>
        <div class="ambient-halo halo-b"></div>
        <div class="layout">
          <section class="left-col">
            <div class="camera-card" id="cameraCard">
              <div class="topbar">
                <div class="clock-wrap">
                  <div class="clock" id="clock">--:--</div>
                  <div class="date" id="date">—</div>
                </div>
                <div class="weather-now" id="weatherNow">
                  <span class="weather-icon">◌</span><span class="weather-temp">—</span>
                </div>
              </div>
              <div class="camera-stage" id="cameraStage">
                <div class="camera-placeholder" id="cameraPlaceholder">
                  <div class="camera-orb">⌾</div>
                  <div class="camera-title">SONNETTE</div>
                  <div class="camera-sub">Caméra à venir</div>
                </div>
              </div>
              <div class="forecast" id="forecast">
                <div class="forecast-label">24H</div>
                <div class="forecast-empty">Prévisions météo</div>
              </div>
            </div>
            <div class="light-row">
              <button class="soft-card light-card" data-placeholder="couloir">
                <span class="bulb">◉</span><span><b>COULOIR</b><small>À venir</small></span>
              </button>
              <button class="soft-card light-card" data-placeholder="exterieur">
                <span class="bulb outdoor">◉</span><span><b>EXTÉRIEUR</b><small>À venir</small></span>
              </button>
            </div>
          </section>

          <section class="right-col controls" id="controls">
            <div class="gate-card" id="gateCard">
              <div class="gate-visual" id="gateVisual">
                <div class="gate-track"></div>
                <div class="post p1"></div><div class="post p2"></div>
                <div class="leaf l1" id="gateL"></div><div class="leaf l2" id="gateR"></div>
              </div>
              <div class="gate-copy"><b>PORTAIL</b><small id="gateState">—</small></div>
            </div>
            <button class="action open" id="openBtn"><span class="act-icon">↔</span><b>OUVRIR</b></button>
            <button class="action stop" id="stopBtn"><span class="act-icon">■</span><b>STOP</b></button>
            <button class="action close" id="closeBtn"><span class="act-icon">↦↤</span><b>FERMER</b></button>
          </section>
        </div>

        <canvas id="companion" class="companion"></canvas>
        <video id="motionVideo" class="motion-video" muted playsinline autoplay></video>
        <canvas id="motionCanvas" class="motion-canvas" width="32" height="24"></canvas>
        <div class="motion-toast" id="motionToast"></div>
        <div class="ambient-badge" id="ambientBadge">MODE AMBIANT</div>
      </ha-card>
    `;

    this.$ = (s) => this.shadowRoot.querySelector(s);
    this._els = {
      shell: this.$('.rm-shell'), clock: this.$('#clock'), date: this.$('#date'), weather: this.$('#weatherNow'),
      forecast: this.$('#forecast'), cameraCard: this.$('#cameraCard'), cameraStage: this.$('#cameraStage'),
      gateCard: this.$('#gateCard'), gateState: this.$('#gateState'), gateL: this.$('#gateL'), gateR: this.$('#gateR'),
      openBtn: this.$('#openBtn'), stopBtn: this.$('#stopBtn'), closeBtn: this.$('#closeBtn'),
      canvas: this.$('#companion'), ambientBadge: this.$('#ambientBadge'),
      motionVideo: this.$('#motionVideo'), motionCanvas: this.$('#motionCanvas'), motionToast: this.$('#motionToast'),
      lightLeft: this.$('[data-placeholder="couloir"]'), lightRight: this.$('[data-placeholder="exterieur"]')
    };

    this._els.openBtn.addEventListener('click', () => this._commandGate('open'));
    this._els.stopBtn.addEventListener('click', () => this._commandGate('stop'));
    this._els.closeBtn.addEventListener('click', () => this._commandGate('close'));

    ['pointerdown','touchstart','keydown'].forEach(evt => document.addEventListener(evt, this._onActivity, { passive: true }));
    this._renderer = new RMCompanionRenderer(this._els.canvas, () => this._getAnchors());
    document.addEventListener('visibilitychange', this._visibilityHandler);
    this._start();
    this._applyConfig();
  }

  _applyConfig() {
    this._gate.duration = Number(this._config.gate_seconds || 20.5) * 1000;
  }

  _start() {
    if (!this._raf) {
      this._lastFrame = performance.now();
      this._raf = requestAnimationFrame(this._loop);
    }
    if (!this._forecastTimer) {
      // Refresh often enough that a transient provider/API miss does not leave the dashboard blank.
      this._forecastTimer = setInterval(() => this._fetchForecast(), 5 * 60 * 1000);
      setTimeout(() => this._fetchForecast(), 900);
      setTimeout(() => this._fetchForecast(), 7000);
    }
    if (!this._hourBoundaryTimer) {
      // Rolling 24 h window: move exactly one hour at each clock-hour boundary.
      const armNextHour = () => {
        const now = new Date();
        const next = new Date(now);
        next.setHours(now.getHours() + 1, 0, 2, 0);
        const delay = Math.max(1000, next.getTime() - now.getTime());
        this._hourBoundaryTimer = setTimeout(async () => {
          this._hourBoundaryTimer = null;
          await this._fetchForecast();
          this._renderForecast();
          armNextHour();
        }, delay);
      };
      armNextHour();
    }
    if (this._config.motion_wake !== false) {
      setTimeout(() => this._initMotionDetector(false), 1200);
    }
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._forecastTimer) clearInterval(this._forecastTimer);
    this._forecastTimer = null;
    if (this._hourBoundaryTimer) clearTimeout(this._hourBoundaryTimer);
    this._hourBoundaryTimer = null;
    ['pointerdown','touchstart','keydown'].forEach(evt => document.removeEventListener(evt, this._onActivity));
    document.removeEventListener('visibilitychange', this._visibilityHandler);
    this._stopMotionDetector();
    if (this._renderer) this._renderer.destroy();
  }

  _onActivity(ev) {
    this._lastActivity = Date.now();
    if (this._config.motion_wake !== false && !this._motion.ready) this._initMotionDetector(true);
    if (this._ambient) this._setAmbient(false);

    if (this._renderer) {
      if (ev && typeof ev.clientX === 'number') this._renderer.notice(ev.clientX, ev.clientY);
      // Any direct interaction takes priority over decorative activity:
      // the companion parks itself in a safe corner and waits.
      this._renderer.enterStandby(6500);
    }
  }

  _setAmbient(v) {
    this._ambient = v;
    this._els.shell.classList.toggle('ambient', v);
    this._renderer.setAmbient(v);
  }

  _showMotionToast(text, kind = 'ok', ms = 2400) {
    const el = this._els?.motionToast;
    if (!el) return;
    if (this._motion.toastTimer) clearTimeout(this._motion.toastTimer);
    el.textContent = text;
    el.className = `motion-toast show ${kind}`;
    this._motion.toastTimer = setTimeout(() => {
      el.className = 'motion-toast';
    }, ms);
  }

  async _initMotionDetector(userGesture = false) {
    if (this._config.motion_wake === false || this._motion.ready || this._motion.requesting || this._motion.unsupported) return;

    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') {
      this._motion.unsupported = true;
      return;
    }

    this._motion.requesting = true;
    try {
      const stream = await md.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 160, max: 320 },
          height: { ideal: 120, max: 240 },
          frameRate: { ideal: 5, max: 8 }
        }
      });

      const video = this._els.motionVideo;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try { await video.play(); } catch (e) {}

      this._motion.stream = stream;
      this._motion.ready = true;
      this._motion.pendingGesture = false;
      this._motion.prev = null;
      this._motion.hits = 0;
      this._motion.cooldownUntil = Date.now() + 1600;

      const ms = Math.max(220, Number(this._config.motion_sample_ms || 320));
      if (this._motion.timer) clearInterval(this._motion.timer);
      this._motion.timer = setInterval(() => this._sampleMotion(), ms);

      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          this._motion.ready = false;
          this._motion.stream = null;
          if (this._motion.timer) clearInterval(this._motion.timer);
          this._motion.timer = null;
        }, { once: true });
      }

      this._showMotionToast('Détection de présence active', 'ok', 2300);
    } catch (err) {
      const name = err?.name || '';
      // iOS/WKWebView can require a real user gesture before granting the camera.
      // In that case, quietly retry at the next touch instead of breaking the dashboard.
      if (!userGesture && (name === 'NotAllowedError' || name === 'SecurityError')) {
        this._motion.pendingGesture = true;
      } else {
        const security = name === 'SecurityError' || name === 'NotAllowedError';
        // Camera wake is optional. If iOS/WKWebView blocks it, fail silently
        // and keep the rest of the dashboard untouched.
        if (!security) this._motion.unsupported = true;
      }
    } finally {
      this._motion.requesting = false;
    }
  }

  _stopMotionDetector() {
    if (this._motion?.timer) clearInterval(this._motion.timer);
    if (this._motion) this._motion.timer = null;
    if (this._motion?.stream) {
      for (const track of this._motion.stream.getTracks()) {
        try { track.stop(); } catch (e) {}
      }
    }
    if (this._motion) {
      this._motion.stream = null;
      this._motion.ready = false;
      this._motion.prev = null;
      this._motion.hits = 0;
    }
    if (this._els?.motionVideo) this._els.motionVideo.srcObject = null;
  }

  _sampleMotion() {
    if (!this._motion.ready || !this._els?.motionVideo || !this._els?.motionCanvas) return;
    const video = this._els.motionVideo;
    if (video.readyState < 2 || video.videoWidth < 2 || video.videoHeight < 2) return;

    const canvas = this._els.motionCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const n = canvas.width * canvas.height;
      const cur = new Uint8Array(n);
      let mean = 0;

      for (let i = 0, p = 0; p < n; p++, i += 4) {
        // Integer approximation of luma. Cheap enough for the Air 2.
        const y = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
        cur[p] = y;
        mean += y;
      }
      mean /= n;

      const prevPack = this._motion.prev;
      this._motion.prev = { frame: cur, mean };
      if (!prevPack) return;

      let changed = 0;
      let sum = 0;
      const prev = prevPack.frame;
      const prevMean = prevPack.mean;
      for (let i = 0; i < n; i++) {
        // Remove global exposure changes, then count local scene changes.
        const diff = Math.abs((cur[i] - mean) - (prev[i] - prevMean));
        sum += diff;
        if (diff > 18) changed++;
      }

      const ratio = changed / n;
      const avg = sum / n;
      const rawScore = Math.max(ratio, Math.min(1, avg / 42) * 0.55);
      this._motion.lastScore = this._motion.lastScore * 0.58 + rawScore * 0.42;

      const base = Math.max(0.05, Number(this._config.motion_threshold || 0.10));
      // Slightly more sensitive while ambient; stricter while already awake to avoid camera noise
      // keeping the screen permanently active.
      const threshold = this._ambient ? base : Math.min(0.28, base + 0.055);

      if (this._motion.lastScore >= threshold) this._motion.hits = Math.min(4, this._motion.hits + 1);
      else this._motion.hits = Math.max(0, this._motion.hits - 1);

      const now = Date.now();
      if (this._motion.hits >= 2 && now >= this._motion.cooldownUntil) {
        this._motion.cooldownUntil = now + 1700;
        this._motion.hits = 0;
        this._lastActivity = now;
        if (this._ambient) {
          this._setAmbient(false);
          // Person approaching: wake cleanly, but do not treat it as a screen tap.
          if (this._renderer?.enterStandby) this._renderer.enterStandby(2200);
        }
      }
    } catch (e) {
      // A transient frame/canvas error must never break the dashboard loop.
    }
  }

  _loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this._lastFrame) / 1000));
    this._lastFrame = now;
    if (!this.isConnected) { this._raf = 0; return; }

    const idleMs = Number(this._config.idle_seconds || 30) * 1000;
    if (!this._ambient && Date.now() - this._lastActivity >= idleMs) this._setAmbient(true);

    this._updateClock();
    this._updateGateAnimation(now);
    this._renderer.update(dt, now / 1000, this._gate);
    this._raf = requestAnimationFrame(this._loop);
  }

  _updateClock() {
    const d = new Date();
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (this._els.clock.textContent !== hm) this._els.clock.textContent = hm;
    const ds = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
    const nice = ds.charAt(0).toUpperCase() + ds.slice(1);
    if (this._els.date.textContent !== nice) this._els.date.textContent = nice;
  }

  _findWeatherEntity() {
    const states = this._hass?.states || {};

    // If the user explicitly configured an entity, use it while it exists.
    if (this._config.weather_entity && states[this._config.weather_entity]) {
      this._weatherEntity = this._config.weather_entity;
      return this._weatherEntity;
    }

    // Re-score every time instead of pinning forever to an entity that may have
    // become temporarily unavailable. Prefer an available entity with a real temp.
    const ids = Object.keys(states).filter(x => x.startsWith('weather.'));
    const scored = ids.map(id => {
      const st = states[id];
      const available = st?.state && !['unknown','unavailable'].includes(st.state);
      const hasTemp = Number.isFinite(Number(st?.attributes?.temperature));
      let score = 0;
      if (available) score += 20;
      if (hasTemp) score += 20;
      if (st?.attributes?.temperature_unit) score += 3;
      // Keep the previously good entity as a tie-breaker, not as a hard lock.
      if (id === this._weatherEntity) score += 1;
      return { id, score };
    }).sort((a,b) => b.score-a.score);

    this._weatherEntity = scored[0]?.id || null;
    return this._weatherEntity;
  }

  _updateFromHass() {
    if (!this._hass || !this._built) return;

    // V6.3: the dashboard weather is pinned to the commune coordinates, not to
    // Home Assistant's global home coordinates. This prevents a misleading
    // location label when the HA weather entity was configured elsewhere.
    if (this._exactWeatherCurrent) {
      this._renderExactCurrentWeather();
    } else {
      const wid = this._findWeatherEntity();
      if (wid) {
        const w = this._hass.states[wid];
        const t = Number(w?.attributes?.temperature);
        const mdi = this._weatherMdi(w?.state);
        const temp = Number.isFinite(t) ? `${Math.round(t)}°` : '—';
        const condition = this._weatherLabel(w?.state);
        const location = this._config.location_label || 'Saint-Seine-en-Bâche · 21130';
        this._els.weather.innerHTML = `
          <div class="weather-mainline">
            <ha-icon class="weather-icon" icon="${mdi}"></ha-icon>
            <span class="weather-temp">${temp}</span>
          </div>
          <div class="weather-meta">
            <span class="weather-condition">${condition}</span>
            <span class="weather-location"><ha-icon icon="mdi:map-marker-outline"></ha-icon>${location}</span>
          </div>`;
      } else {
        const location = this._config.location_label || 'Saint-Seine-en-Bâche · 21130';
        this._els.weather.innerHTML = `
          <div class="weather-mainline"><ha-icon class="weather-icon" icon="mdi:weather-partly-cloudy"></ha-icon><span class="weather-temp">—</span></div>
          <div class="weather-meta"><span class="weather-condition">Météo</span><span class="weather-location"><ha-icon icon="mdi:map-marker-outline"></ha-icon>${location}</span></div>`;
      }
    }

    const gid = this._config.gate_entity;
    const g = this._hass.states[gid];
    if (g) this._onGateHaState(g.state);
  }

  _onGateHaState(state) {
    const prev = this._lastGateHaState;
    this._lastGateHaState = state;

    // Hardware/remote gate activity is also a useful wake source when the iPad
    // camera is unavailable. A real transition wakes the dashboard immediately.
    if (this._config.wake_on_gate !== false && prev && state !== prev && ['opening','closing'].includes(state)) {
      this._lastActivity = Date.now();
      if (this._ambient) this._setAmbient(false);
      if (this._renderer?.enterStandby) this._renderer.enterStandby(2200);
    }

    if (!this._gate.moving) {
      if (state === 'open') this._gate.progress = 1;
      else if (state === 'closed') this._gate.progress = 0;
      else if (state === 'opening' && prev !== 'opening') this._startGateMotion('open', true);
      else if (state === 'closing' && prev !== 'closing') this._startGateMotion('close', true);
    }
    this._renderGateState(state);
  }

  _renderGateState(state) {
    const labels = { open:'Ouvert', closed:'Fermé', opening:'Ouverture…', closing:'Fermeture…', unavailable:'Indisponible', unknown:'État inconnu' };
    let txt = labels[state] || state || '—';
    if (this._gate.moving) txt = this._gate.dir === 'open' ? 'Ouverture…' : 'Fermeture…';
    this._els.gateState.textContent = txt;
    this._els.gateCard.classList.toggle('moving', this._gate.moving);
  }

  _startGateMotion(dir, external = false) {
    const now = performance.now();
    const p = this._gate.progress;
    this._gate.from = p;
    this._gate.to = dir === 'open' ? 1 : 0;
    this._gate.start = now;
    const full = Number(this._config.gate_seconds || 20.5) * 1000;
    this._gate.motionDuration = Math.max(250, full * Math.abs(this._gate.to - p));
    this._gate.moving = true;
    this._gate.dir = dir;
    this._renderer.gateEvent(dir, this._gate.motionDuration / 1000, external);
  }

  _updateGateAnimation(now) {
    if (this._gate.moving) {
      const f = Math.min(1, Math.max(0, (now - this._gate.start) / this._gate.motionDuration));
      // Strictly linear movement: no early arrival, no CSS rerender jump.
      this._gate.progress = this._gate.from + (this._gate.to - this._gate.from) * f;
      if (f >= 1) {
        this._gate.progress = this._gate.to;
        this._gate.moving = false;
        this._renderer.gateFinished(this._gate.dir);
        this._gate.dir = null;
      }
    }
    const px = 18 * this._gate.progress;
    this._els.gateL.style.transform = `translate3d(${-px}px,0,0)`;
    this._els.gateR.style.transform = `translate3d(${px}px,0,0)`;
    const state = this._hass?.states?.[this._config.gate_entity]?.state;
    this._renderGateState(state);
  }

  async _commandGate(dir) {
    if (!this._hass) return;
    this._lastActivity = Date.now();
    this._setAmbient(false);
    this._haptic(dir === 'stop' ? 'medium' : 'light');
    if (dir === 'stop') {
      this._gate.moving = false;
      this._gate.dir = null;
      this._renderer.gateEvent('stop', 2.2, false);
      await this._hass.callService('cover','stop_cover',{ entity_id: this._config.gate_entity });
      return;
    }
    this._startGateMotion(dir, false);
    await this._hass.callService('cover', dir === 'open' ? 'open_cover' : 'close_cover', { entity_id: this._config.gate_entity });
  }

  _haptic(kind) {
    try {
      this.dispatchEvent(new CustomEvent('haptic', { detail: kind, bubbles: true, composed: true }));
      if (navigator.vibrate) navigator.vibrate(kind === 'medium' ? 16 : 9);
    } catch(e) {}
  }

  _renderExactCurrentWeather() {
    const c = this._exactWeatherCurrent;
    if (!c || !this._els?.weather) return;
    const temp = Number.isFinite(Number(c.temperature)) ? `${Math.round(Number(c.temperature))}°` : '—';
    const mdi = this._weatherMdi(c.condition);
    const condition = this._weatherLabel(c.condition);
    const location = this._config.location_label || 'Saint-Seine-en-Bâche · 21130';
    this._els.weather.innerHTML = `
      <div class="weather-mainline">
        <ha-icon class="weather-icon" icon="${mdi}"></ha-icon>
        <span class="weather-temp">${temp}</span>
      </div>
      <div class="weather-meta">
        <span class="weather-condition">${condition}</span>
        <span class="weather-location"><ha-icon icon="mdi:map-marker-check-outline"></ha-icon>${location}</span>
      </div>`;
  }

  _wmoToCondition(code, isDay = 1) {
    const c = Number(code);
    if (c === 0) return isDay ? 'sunny' : 'clear-night';
    if (c === 1 || c === 2) return 'partlycloudy';
    if (c === 3) return 'cloudy';
    if (c === 45 || c === 48) return 'fog';
    if ([51,53,55,56,57,61,63,66,80,81].includes(c)) return 'rainy';
    if ([65,67,82].includes(c)) return 'pouring';
    if ([71,73,75,77,85,86].includes(c)) return 'snowy';
    if (c === 95) return 'lightning';
    if (c === 96 || c === 99) return 'lightning-rainy';
    return 'partlycloudy';
  }

  async _fetchSaintSeineWeather() {
    const lat = Number(this._config.weather_latitude ?? 47.1208333333);
    const lon = Number(this._config.weather_longitude ?? 5.3716666667);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      timezone: 'Europe/Paris',
      forecast_days: '2',
      current: 'temperature_2m,weather_code,is_day',
      hourly: 'temperature_2m,weather_code,precipitation_probability,sunshine_duration,is_day'
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return false;
      const data = await response.json();
      const current = data?.current;
      const hourly = data?.hourly;
      if (!current || !hourly || !Array.isArray(hourly.time) || !hourly.time.length) return false;

      this._exactWeatherCurrent = {
        temperature: Number(current.temperature_2m),
        condition: this._wmoToCondition(current.weather_code, Number(current.is_day ?? 1))
      };
      this._exactWeatherFetchedAt = Date.now();
      this._renderExactCurrentWeather();

      const now = Date.now() - 30 * 60 * 1000;
      const forecast = hourly.time.map((time, i) => {
        const dt = new Date(time);
        if (!Number.isFinite(dt.getTime()) || dt.getTime() < now) return null;
        const sunSec = Number(hourly.sunshine_duration?.[i] ?? 0);
        return {
          datetime: time,
          temperature: Number(hourly.temperature_2m?.[i]),
          precipitation_probability: Number(hourly.precipitation_probability?.[i]),
          condition: this._wmoToCondition(hourly.weather_code?.[i], Number(hourly.is_day?.[i] ?? 1)),
          sunshine_duration: Number.isFinite(sunSec) ? sunSec : 0
        };
      }).filter(Boolean).slice(0, 48);

      if (!forecast.length) return false;
      this._forecast = forecast;
      this._saveForecastCache('open-meteo:saint-seine-en-bache', forecast);
      this._renderForecast();
      try {
        localStorage.setItem('rm_exact_weather_current', JSON.stringify({
          savedAt: Date.now(),
          current: this._exactWeatherCurrent
        }));
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  _restoreExactWeatherCache() {
    try {
      const cached = JSON.parse(localStorage.getItem('rm_exact_weather_current') || 'null');
      if (!cached?.current) return false;
      if (Date.now() - Number(cached.savedAt || 0) > 6 * 60 * 60 * 1000) return false;
      this._exactWeatherCurrent = cached.current;
      this._renderExactCurrentWeather();
      return true;
    } catch (e) {
      return false;
    }
  }

  async _fetchForecast() {
    if (!this._hass) return;

    // Primary source: exact Saint-Seine-en-Bâche coordinates. If the internet
    // call fails, fall back to the existing Home Assistant weather entity.
    const exactOk = await this._fetchSaintSeineWeather();
    if (exactOk) return;
    if (!this._exactWeatherCurrent) this._restoreExactWeatherCache();

    const wid = this._findWeatherEntity();

    if (!wid) {
      // Keep the last good forecast on screen instead of flashing blank.
      if (!this._forecast.length) {
        this._restoreForecastCache();
      }
      if (!this._forecast.length) {
        this._els.forecast.innerHTML = `<div class="forecast-label">24H</div><div class="forecast-empty">Météo indisponible</div>`;
      }
      return;
    }

    const fromResponse = (r) =>
      r?.response?.[wid]?.forecast ||
      r?.[wid]?.forecast ||
      [];

    const viaCallService = async (type) => {
      const r = await this._hass.callService(
        'weather',
        'get_forecasts',
        { type },
        { entity_id: wid },
        true,
        true
      );
      return fromResponse(r);
    };

    const viaWebSocket = async (type) => {
      const r = await this._hass.callWS({
        type: 'call_service',
        domain: 'weather',
        service: 'get_forecasts',
        service_data: { type },
        target: { entity_id: wid },
        return_response: true
      });
      return fromResponse(r);
    };

    let data = [];

    // 1) Normal frontend API. 2) Direct WebSocket fallback. 3) Legacy attr fallback.
    try {
      data = await viaCallService('hourly');
    } catch (e) {}

    if (!Array.isArray(data) || !data.length) {
      try {
        data = await viaWebSocket('hourly');
      } catch (e) {}
    }

    if (!Array.isArray(data) || !data.length) {
      const attr = this._hass.states[wid]?.attributes?.forecast;
      if (Array.isArray(attr) && attr.length) data = attr;
    }

    if (Array.isArray(data) && data.length) {
      this._forecast = data.slice(0,48);
      this._saveForecastCache(wid, this._forecast);
      this._renderForecast();
      return;
    }

    // Provider/API can occasionally miss a request. Never destroy a valid forecast
    // because of one failed call; restore the previous good data instead.
    if (!this._forecast.length) this._restoreForecastCache();
    if (this._forecast.length) {
      this._renderForecast();
    } else {
      this._els.forecast.innerHTML = `<div class="forecast-label">24H</div><div class="forecast-empty">Prévisions en attente</div>`;
    }
  }

  _saveForecastCache(entityId, forecast) {
    try {
      localStorage.setItem('rm_weather_forecast_cache', JSON.stringify({
        entityId,
        savedAt: Date.now(),
        forecast
      }));
    } catch (e) {}
  }

  _restoreForecastCache() {
    try {
      const cached = JSON.parse(localStorage.getItem('rm_weather_forecast_cache') || 'null');
      if (!cached || !Array.isArray(cached.forecast) || !cached.forecast.length) return false;
      // Cache is only a resilience fallback; discard it after 6 hours.
      if (Date.now() - Number(cached.savedAt || 0) > 6 * 60 * 60 * 1000) return false;
      this._forecast = cached.forecast.slice(0,48);
      return true;
    } catch (e) {
      return false;
    }
  }

  _renderForecast() {
    if (!this._forecast.length || !this._els?.forecast) return;

    // True rolling 24-hour window. At 10:00 => 10:00..09:00 tomorrow;
    // at 11:00 => 11:00..10:00 tomorrow. No fixed 4-slot snapshot anymore.
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);
    const startMs = hourStart.getTime();

    const timeline = this._forecast
      .filter(x => x?.datetime && new Date(x.datetime).getTime() >= startMs)
      .sort((a,b) => new Date(a.datetime) - new Date(b.datetime))
      .slice(0, 24);

    if (!timeline.length) return;

    const outlook = this._sunOutlook(timeline);
    const temps = timeline.map(x => Number(x.temperature)).filter(Number.isFinite);
    const tMin = temps.length ? Math.min(...temps) : 0;
    const tMax = temps.length ? Math.max(...temps) : 1;
    const span = Math.max(1, tMax - tMin);

    // V6.7: thermal profile without a connected SVG/canvas line. Each hourly
    // temperature marker moves vertically according to the real 24 h range.
    // This keeps the evolution instantly readable while avoiding the doubled
    // curve artefact seen on the old iPad WebView.

    const cells = timeline.map((x, i) => {
      const d = new Date(x.datetime);
      const h = `${String(d.getHours()).padStart(2,'0')}h`;
      const tempNum = Number(x.temperature);
      const temp = Number.isFinite(tempNum) ? `${Math.round(tempNum)}°` : '—';
      const tempNorm = Number.isFinite(tempNum) ? Math.max(0, Math.min(1, (tempNum - tMin) / span)) : .5;
      // 82% = cold/low, 18% = warm/high within the thermal lane.
      const tempY = Math.round(82 - tempNorm * 64);
      const rain = Number.isFinite(Number(x.precipitation_probability)) ? Math.max(0, Math.min(100, Math.round(Number(x.precipitation_probability)))) : 0;
      const mdi = this._weatherMdi(x.condition);
      const cls = ['sunny','partlycloudy'].includes(x.condition) ? ' sun' : (rain >= 35 || ['rainy','pouring','lightning-rainy'].includes(x.condition) ? ' wet' : '');
      const major = i % 3 === 0 ? ' major' : '';
      return `
        <div class="hour-cell${cls}${major}${i===0?' now':''}" style="--rain:${rain/100};--temp-y:${tempY}%">
          <span class="hour-label">${h}</span>
          <div class="temp-lane">
            <span class="temp-stem"></span>
            <span class="temp-marker"><b>${temp}</b></span>
          </div>
          <ha-icon class="hour-icon" icon="${mdi}"></ha-icon>
          <span class="hour-rain">${rain >= 20 ? `${rain}%` : ''}</span>
        </div>`;
    }).join('');

    const end = new Date(timeline[timeline.length - 1].datetime);
    const endLabel = end.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}).replace(':00','h');

    this._els.forecast.innerHTML = `
      <div class="forecast-head">
        <div class="sun-outlook ${outlook.cls}">
          <ha-icon icon="${outlook.icon}"></ha-icon>
          <div><strong>${outlook.title}</strong><span>${outlook.detail}</span></div>
        </div>
        <div class="rolling-copy"><strong>24 H GLISSANTES</strong><span>maintenant → ${endLabel}</span></div>
      </div>
      <div class="timeline-wrap">
        <div class="hour-grid">${cells}</div>
      </div>`;
  }

  _sunOutlook(forecast) {
    const now = new Date();
    const todayKey = now.toLocaleDateString('sv-SE');
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
    const tomorrowKey = tomorrow.toLocaleDateString('sv-SE');

    const usableFor = (key) => forecast.filter(x => {
      if (!x?.datetime) return false;
      const d = new Date(x.datetime);
      const hour = d.getHours();
      return d.toLocaleDateString('sv-SE') === key && hour >= 7 && hour <= 20 && d.getTime() >= Date.now() - 30*60*1000;
    });

    let label = 'AUJ.';
    let list = usableFor(todayKey);
    if (list.length < 2) { label = 'DEMAIN'; list = usableFor(tomorrowKey); }
    if (!list.length) list = forecast.slice(0,12);

    // Open-Meteo gives predicted sunshine seconds per hour. Prefer that over
    // interpreting the icon alone; it answers the user's real question: will
    // there actually be sun during the day?
    const hasSunDuration = list.some(x => Number.isFinite(Number(x.sunshine_duration)) && Number(x.sunshine_duration) > 0);
    const sunny = hasSunDuration
      ? list.filter(x => Number(x.sunshine_duration || 0) >= 2700)
      : list.filter(x => x.condition === 'sunny');
    const bright = hasSunDuration
      ? list.filter(x => Number(x.sunshine_duration || 0) >= 900)
      : list.filter(x => ['sunny','partlycloudy'].includes(x.condition));
    const wet = list.filter(x => ['rainy','pouring','lightning-rainy','lightning','hail'].includes(x.condition));

    const hr = x => new Date(x.datetime).toLocaleTimeString('fr-FR',{hour:'2-digit'}).replace(' h','h').replace(':00','h');
    const range = arr => arr.length ? `${hr(arr[0])}–${hr(arr[arr.length-1])}` : '';

    if (sunny.length >= 2) {
      const sec = sunny.reduce((a,x) => a + Number(x.sunshine_duration || 3600), 0);
      const hours = Math.max(1, Math.round(sec / 3600));
      return { cls:'sunny', icon:'mdi:weather-sunny', title:`${label} Soleil`, detail:`${range(sunny)} · ≈ ${hours} h de soleil` };
    }
    if (bright.length >= 2) {
      return { cls:'bright', icon:'mdi:weather-partly-cloudy', title:`${label} Éclaircies`, detail:`${range(bright)} · soleil par moments` };
    }
    if (wet.length >= Math.max(2, Math.ceil(list.length/3))) {
      return { cls:'wet', icon:'mdi:weather-rainy', title:`${label} Peu de soleil`, detail:'pluie / ciel chargé dominant' };
    }
    return { cls:'cloudy', icon:'mdi:weather-cloudy', title:`${label} Peu de soleil`, detail:'ciel plutôt couvert' };
  }

  _weatherMdi(state) {
    return ({
      sunny:'mdi:weather-sunny', cloudy:'mdi:weather-cloudy', partlycloudy:'mdi:weather-partly-cloudy',
      rainy:'mdi:weather-rainy', pouring:'mdi:weather-pouring', snowy:'mdi:weather-snowy',
      fog:'mdi:weather-fog', windy:'mdi:weather-windy', 'windy-variant':'mdi:weather-windy-variant',
      'clear-night':'mdi:weather-night', lightning:'mdi:weather-lightning', 'lightning-rainy':'mdi:weather-lightning-rainy',
      hail:'mdi:weather-hail', 'snowy-rainy':'mdi:weather-snowy-rainy'
    })[state] || 'mdi:weather-partly-cloudy';
  }

  _weatherGlyph(state) {
    return ({ sunny:'☀', cloudy:'☁', partlycloudy:'◒', rainy:'☂', pouring:'☔', snowy:'❄', fog:'≋', windy:'≈', 'windy-variant':'≈', 'clear-night':'☾', lightning:'ϟ', 'lightning-rainy':'ϟ', hail:'◇' })[state] || '◌';
  }

  _weatherLabel(state) {
    return ({ sunny:'Clair', cloudy:'Nuageux', partlycloudy:'Éclaircies', rainy:'Pluie', pouring:'Forte pluie', snowy:'Neige', fog:'Brouillard', windy:'Vent', 'windy-variant':'Vent', 'clear-night':'Nuit claire', lightning:'Orage', 'lightning-rainy':'Orage', hail:'Grêle' })[state] || 'Météo';
  }

  _getAnchors() {
    const host = this._els.shell.getBoundingClientRect();
    const cam = this._els.cameraCard.getBoundingClientRect();
    const gate = this._els.gateCard.getBoundingClientRect();
    const ll = this._els.lightLeft.getBoundingClientRect();
    const lr = this._els.lightRight.getBoundingClientRect();
    const rel = r => ({ x:r.left-host.left, y:r.top-host.top, w:r.width, h:r.height });
    return { host:{w:host.width,h:host.height}, camera:rel(cam), gate:rel(gate), lightLeft:rel(ll), lightRight:rel(lr) };
  }

  _css() { return `
    :host{display:block;width:100%;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;}
    ha-card.rm-shell{position:relative;overflow:hidden;border:0;background:transparent;box-shadow:none;padding:0;height:min(650px,calc(100vh - 18px));min-height:552px;color:#253E4C;}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) 218px;gap:12px;height:100%;position:relative;z-index:2;}
    .left-col{display:grid;grid-template-rows:minmax(0,1fr) 105px;gap:12px;min-width:0;}
    .camera-card,.gate-card,.action,.soft-card{border-radius:18px;border:1px solid rgba(49,94,120,.055);box-shadow:0 8px 24px rgba(35,62,76,.065);}
    .camera-card{position:relative;overflow:hidden;background:linear-gradient(145deg,#EDF2F5 0%,#E6EDF1 54%,#EAF0F3 100%);transition:filter .8s ease,background .8s ease,box-shadow .8s ease;}
    .topbar{position:absolute;left:28px;right:28px;top:22px;display:flex;justify-content:space-between;z-index:4;}
    .clock{font-size:48px;font-weight:300;letter-spacing:-2px;line-height:1;transition:transform .9s cubic-bezier(.22,.61,.36,1),font-size .9s ease;transform-origin:left top;}
    .date{font-size:14px;color:#687A84;margin-top:7px;font-weight:500;}
    .weather-now{display:flex;flex-direction:column;align-items:flex-end;gap:3px;color:#315E78;transition:transform .8s ease,opacity .8s ease;min-width:170px}.weather-mainline{display:flex;align-items:center;justify-content:flex-end;gap:7px}.weather-icon{width:28px;height:28px;color:#315E78}.weather-temp{font-size:23px;font-weight:700;letter-spacing:-.5px}.weather-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;line-height:1}.weather-condition{font-size:10px;font-weight:700;color:#607985}.weather-location{display:flex;align-items:center;gap:3px;font-size:9px;font-weight:600;color:#80919A;white-space:nowrap}.weather-location ha-icon{width:11px;height:11px;color:#607985}
    .camera-stage{position:absolute;inset:104px 20px 126px 20px;display:grid;place-items:center;z-index:1;}
    .camera-placeholder{text-align:center;transition:opacity .8s ease,transform .8s ease}.camera-orb{width:88px;height:88px;border:1px solid rgba(49,94,120,.22);border-radius:50%;display:grid;place-items:center;margin:auto;font-size:42px;color:#315E78;background:rgba(255,255,255,.28);box-shadow:inset 0 0 28px rgba(49,94,120,.04),0 0 0 0 rgba(62,119,151,0);animation:orb 6.8s ease-in-out infinite}.camera-title{margin-top:14px;font-size:18px;font-weight:700;letter-spacing:1.7px}.camera-sub{font-size:13px;color:#77858B;margin-top:4px}
    @keyframes orb{50%{transform:scale(1.045);box-shadow:inset 0 0 28px rgba(49,94,120,.08),0 0 26px 4px rgba(78,139,172,.09)}}
    .forecast{position:absolute;left:24px;right:24px;bottom:14px;height:104px;border-radius:15px;background:rgba(255,255,255,.54);border:1px solid rgba(49,94,120,.09);padding:7px 10px 7px;z-index:4;transition:background .8s ease,transform .8s ease,box-shadow .8s ease;box-shadow:0 6px 18px rgba(35,62,76,.035);overflow:hidden;box-sizing:border-box}.forecast-empty{font-size:12px;color:#77858B;height:100%;display:grid;place-items:center}.forecast-head{height:26px;display:flex;align-items:center;justify-content:space-between;gap:10px;position:relative;z-index:3}.sun-outlook{display:flex;align-items:center;gap:7px;min-width:0}.sun-outlook>ha-icon{width:20px;height:20px;flex:0 0 auto}.sun-outlook div{display:flex;flex-direction:column;min-width:0;line-height:1.02}.sun-outlook strong{font-size:9px;letter-spacing:.35px;color:#304852;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sun-outlook span{font-size:7.5px;color:#758790;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sun-outlook.sunny>ha-icon,.sun-outlook.bright>ha-icon{color:#C99527}.sun-outlook.wet>ha-icon{color:#4B7F9D}.sun-outlook.cloudy>ha-icon{color:#70838E}.rolling-copy{display:flex;flex-direction:column;align-items:flex-end;line-height:1.05;white-space:nowrap}.rolling-copy strong{font-size:8px;letter-spacing:.9px;color:#4F7489}.rolling-copy span{font-size:7px;color:#89979E;margin-top:2px}.timeline-wrap{height:64px;position:relative;margin-top:1px}.hour-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(24,minmax(0,1fr));z-index:2}.hour-cell{position:relative;min-width:0;border-left:1px solid rgba(49,94,120,.028);overflow:visible}.hour-cell:first-child{border-left:0}.hour-cell.major{border-left-color:rgba(49,94,120,.085)}.hour-cell::after{content:"";position:absolute;bottom:1px;left:22%;right:22%;height:2px;border-radius:2px;background:#4B7F9D;opacity:calc(var(--rain) * .72)}.hour-cell.now{background:linear-gradient(180deg,rgba(49,94,120,.07),rgba(49,94,120,0));border-radius:6px}.hour-label{position:absolute;top:0;left:0;right:0;text-align:center;font-size:6.5px;color:#7C8E98;line-height:1;font-weight:600}.temp-lane{position:absolute;left:3px;right:3px;top:9px;height:34px;border-radius:7px;background:linear-gradient(180deg,rgba(201,149,39,.035),rgba(75,127,157,.025));overflow:visible}.temp-stem{position:absolute;left:50%;bottom:2px;width:1px;height:calc(100% - var(--temp-y));background:linear-gradient(180deg,rgba(75,127,157,.18),rgba(75,127,157,.03));transform:translateX(-50%);border-radius:2px}.temp-marker{position:absolute;left:50%;top:var(--temp-y);transform:translate(-50%,-50%);min-width:22px;height:15px;padding:0 3px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.92);border:1px solid rgba(49,94,120,.10);box-shadow:0 2px 7px rgba(35,62,76,.06);transition:top .45s cubic-bezier(.22,.61,.36,1)}.temp-marker::after{content:"";position:absolute;left:50%;bottom:-3px;width:5px;height:5px;border-radius:50%;background:#4B7F9D;transform:translateX(-50%);box-shadow:0 0 0 2px rgba(75,127,157,.10)}.temp-marker b{font-size:8.3px;color:#294654;line-height:1;font-weight:800;letter-spacing:-.2px}.hour-cell.sun .temp-marker::after{background:#C99527}.hour-cell.wet .temp-marker::after{background:#3C7B9B}.hour-icon{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:12px;height:12px;color:#4F7184}.hour-cell.sun .hour-icon{color:#C99527}.hour-cell.wet .hour-icon{color:#3C7B9B}.hour-rain{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:5.8px;color:#4E7D95;line-height:1;font-weight:600}.ambient .forecast{background:rgba(255,255,255,.78);transform:translateY(-4px);opacity:.97;box-shadow:0 10px 28px rgba(35,62,76,.07)}
    .light-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.soft-card{border:0;background:#F2F4F5;display:flex;align-items:center;text-align:left;padding:0 23px;gap:17px;color:#304852}.soft-card .bulb{font-size:35px;color:#C99527;filter:drop-shadow(0 2px 4px rgba(201,149,39,.16))}.soft-card b{display:block;font-size:17px}.soft-card small{display:block;font-size:13px;color:#77858B;margin-top:5px}
    .right-col{display:grid;grid-template-rows:repeat(4,1fr);gap:12px;min-width:0}.gate-card{background:#E7EDF1;display:grid;grid-template-columns:102px 1fr;align-items:center;padding:0 10px;transition:box-shadow .4s ease;overflow:hidden}.gate-card.moving{box-shadow:0 8px 28px rgba(49,94,120,.18),inset 0 0 0 1px rgba(49,94,120,.14)}.gate-copy{position:relative;z-index:3;min-width:0;padding-left:2px}.gate-copy b{display:block;font-size:18px}.gate-copy small{display:block;font-size:13px;color:#687A84;margin-top:5px}
    .gate-visual{position:relative;width:92px;height:60px;overflow:hidden;border-radius:10px;isolation:isolate}.gate-track{position:absolute;left:4px;right:4px;bottom:5px;height:2px;border-radius:3px;background:rgba(49,94,120,.32)}.post{position:absolute;top:4px;width:4px;height:51px;border-radius:3px;background:linear-gradient(#44758f,#284e64)}.p1{left:3px}.p2{right:3px}.leaf{position:absolute;top:11px;width:35px;height:39px;border-radius:5px;border:1.5px solid rgba(49,94,120,.82);background:repeating-linear-gradient(90deg,rgba(49,94,120,.09) 0 3px,transparent 3px 9px),linear-gradient(180deg,rgba(255,255,255,.68),rgba(49,94,120,.04));will-change:transform;box-shadow:0 3px 7px rgba(35,62,76,.06)}.l1{left:12px}.l2{right:12px}
    .action{border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .14s ease,box-shadow .3s ease,filter .3s ease}.action:active{transform:scale(.965)}.action b{font-size:18px}.act-icon{font-size:31px;line-height:1}.open{background:#EDF2F5;color:#253E4C}.open .act-icon{color:#315E78}.stop{background:#F1F3F4;color:#5A4938}.stop .act-icon{color:#D07A19}.close{background:#F1F3F4;color:#543F3F}.close .act-icon{color:#B54A4A}
    .companion{position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none;transform:translateZ(0)}
    .ambient-halo{position:absolute;border-radius:50%;filter:blur(1px);pointer-events:none;z-index:1;opacity:.35;transition:opacity 1s ease,transform 1s ease}.halo-a{width:58%;height:72%;left:4%;top:2%;background:radial-gradient(circle,rgba(79,142,176,.13),rgba(79,142,176,0) 69%);animation:haloA 12s ease-in-out infinite alternate}.halo-b{width:35%;height:60%;right:8%;bottom:-5%;background:radial-gradient(circle,rgba(49,94,120,.09),rgba(49,94,120,0) 70%);animation:haloB 15s ease-in-out infinite alternate}@keyframes haloA{to{transform:translate3d(9%,4%,0) scale(1.09);opacity:.55}}@keyframes haloB{to{transform:translate3d(-7%,-3%,0) scale(1.08);opacity:.5}}
    .motion-video{position:absolute;left:-4px;top:-4px;width:2px;height:2px;opacity:.001;pointer-events:none;z-index:-2;object-fit:cover}.motion-canvas{position:absolute;left:-4px;top:-4px;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-3}.motion-toast{position:absolute;left:50%;top:46px;z-index:12;transform:translate(-50%,-7px);opacity:0;pointer-events:none;padding:6px 10px;border-radius:12px;font-size:8px;font-weight:750;letter-spacing:.35px;color:#3E5B69;background:rgba(255,255,255,.88);border:1px solid rgba(49,94,120,.10);box-shadow:0 8px 24px rgba(35,62,76,.10);transition:opacity .35s ease,transform .35s ease;white-space:nowrap}.motion-toast.show{opacity:.95;transform:translate(-50%,0)}.motion-toast.ok::before{content:"●";color:#4B91AE;margin-right:6px}.motion-toast.warn::before{content:"●";color:#C99527;margin-right:6px}
    .ambient-badge{position:absolute;left:50%;top:18px;z-index:6;font-size:9px;letter-spacing:1.5px;font-weight:800;color:#4f7489;background:rgba(255,255,255,.48);padding:5px 8px;border-radius:10px;opacity:0;transform:translate(-50%,-4px);transition:opacity .7s ease,transform .7s ease;pointer-events:none;white-space:nowrap}
    .camera-card::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(180deg,rgba(18,42,56,0),rgba(18,42,56,0));opacity:0;transition:opacity 1s ease,background 1s ease}.ambient .ambient-badge{opacity:.92;transform:translate(-50%,0)}.ambient .controls{opacity:.22;filter:saturate(.45);transform:translateX(5px) scale(.985)}.controls{transition:opacity .75s ease,filter .75s ease,transform .75s ease}.ambient .camera-card{background:linear-gradient(145deg,#DDE9EF 0%,#D3E1E8 55%,#DEE9EE 100%);box-shadow:0 14px 40px rgba(41,83,107,.18),inset 0 0 0 1px rgba(65,123,154,.18)}.ambient .camera-card::after{opacity:1;background:linear-gradient(180deg,rgba(21,49,65,.04),rgba(21,49,65,.13))}.ambient .clock{transform:scale(1.34) translateY(4px);color:#17384B;text-shadow:0 5px 18px rgba(49,94,120,.12)}.ambient .date{opacity:.82;transform:translateY(16px);transition:transform .9s ease,opacity .9s ease}.date{transition:transform .6s ease,opacity .6s ease}.ambient .weather-now{transform:scale(1.08);opacity:.9}.ambient .camera-placeholder{opacity:.22;transform:scale(.92)}.ambient .halo-a,.ambient .halo-b{opacity:1;filter:blur(3px)}.ambient .light-row{opacity:.28;filter:saturate(.55)}.light-row{transition:opacity .75s ease,filter .75s ease}
    @media(max-width:850px){.layout{grid-template-columns:minmax(0,1fr) 202px}.clock{font-size:43px}.right-col{gap:10px}.layout,.left-col{gap:10px}}
  `; }
}

/* --------------------------------------------------------------------------
 * Procedural WebGL companion.
 * True 3D geometry (ellipsoids), spring-based motion, articulated limbs.
 * -------------------------------------------------------------------------- */
class RMCompanionRenderer {
  constructor(canvas, anchorProvider) {
    this.canvas = canvas;
    this.anchorProvider = anchorProvider;
    this.gl = canvas.getContext('webgl', { alpha:true, antialias:true, premultipliedAlpha:true }) || canvas.getContext('experimental-webgl');
    this.ok = !!this.gl;
    this.scale = 0.58;
    this.ambient = false;
    this.t = 0;
    this.root = { x:120, y:330, vx:0, vy:0 };
    this.look = { x:0, y:0, t:0 };
    this.scene = 'idle';
    this.sceneUntil = 0;
    this.nextIdle = 1.0;
    this.lastIdle = '';
    this.lastOpen = '';
    this.lastClose = '';
    this.travel = null;
    this.surface = 'camera';
    this.pendingScene = null;
    this.pendingSceneDuration = null;
    this.gateActive = false;
    this.gateDir = null;
    this.placed = false;

    // "Waiting" mode after any direct interaction with the screen.
    this.standbyUntil = 0;
    this.standbyActive = false;

    // Spontaneous activity engine.
    this.sceneStart = 0;
    this.lastActivityScene = '';
    this.activityOffsetX = 0;
    this.activityOffsetY = 0;
    this.activityCatalog = [
      // Sport
      'football','basketball','tennis','golf','boxing','weights','jumprope',
      'pushups','yoga','skateboard','sprint','juggle',
      // Nature / outdoor
      'mushrooms','fishing','camping','gardening','picnic','birdwatch',
      'stargaze','kite','butterfly',
      // Vehicles / movement
      'motorcycle','airplane','helicopter','scooter','rocket','drone',
      // Creative / everyday
      'painting','guitar','reading','coffee','photo','cooking','magic',
      'telescope','cleaning','build','danceparty','napbag'
    ];

    this.joints = {};
    const names = ['bodyZ','bodyX','bodyY','bodyLift','headZ','headX','headY','headLift','armL','armR','foreL','foreR','legL','legR','kneeL','kneeR'];
    names.forEach(n => this.joints[n] = {v:0,vel:0,target:0});
    if (this.ok) this._initGL();
  }

  destroy(){ if(this.gl){ const ext=this.gl.getExtension('WEBGL_lose_context'); if(ext) ext.loseContext(); } }
  setAmbient(v){
    this.ambient=v;
    if(v && !this.gateActive){
      const rails=this._rails();
      const r=rails.lightRight || rails.camera;
      this._goTo({x:r.maxX-14,y:r.y,surface:r.name}, 'rest', true);
    } else if(!v && !this.gateActive){
      this.nextIdle=this.t+.4;
    }
  }
  notice(x,y){ this.look={x,y,t:performance.now()+2300}; }

  enterStandby(ms=6500){
    this._ensurePlaced();
    this.standbyUntil = Math.max(this.standbyUntil, this.t + ms/1000);
    this.standbyActive = true;
    this.gateActive = false;
    this.gateDir = null;
    this.travel = null;
    this.pendingScene = null;

    const rails = this._rails();
    // Bottom-left safe corner: visible, out of the controls and future camera center.
    const r = rails.lightLeft || rails.camera;
    const target = {
      x: Math.min(r.maxX - 16, r.minX + 18),
      y: r.y,
      surface: r.name
    };
    this.pendingSceneDuration = Math.max(1.5, ms/1000);
    this._goTo(target, 'standby', true, 170);
  }

  _activityDuration(scene){
    const long = new Set([
      'fishing','mushrooms','camping','gardening','picnic','stargaze',
      'motorcycle','airplane','helicopter','painting','reading','cooking',
      'telescope','build','birdwatch'
    ]);
    const medium = new Set([
      'football','basketball','tennis','golf','boxing','weights','jumprope',
      'pushups','yoga','skateboard','sprint','juggle','kite','butterfly',
      'scooter','rocket','drone','guitar','coffee','photo','magic',
      'cleaning','danceparty','napbag'
    ]);
    if (long.has(scene)) return 8.0 + Math.random()*4.0;
    if (medium.has(scene)) return 5.5 + Math.random()*3.5;
    return 4.0 + Math.random()*2.0;
  }

  _activitySurface(scene, rails){
    // Activities "live" on the lower edges of the cards, never in the middle.
    const lowerLeft = rails.lightLeft || rails.camera;
    const lowerRight = rails.lightRight || rails.camera;
    const cam = rails.camera;

    if (['fishing','mushrooms','camping','gardening','picnic','kite','butterfly'].includes(scene))
      return Math.random()>.5 ? lowerLeft : lowerRight;

    if (['motorcycle','scooter','skateboard','sprint','football','basketball','tennis','golf','boxing','weights','jumprope','pushups','yoga'].includes(scene))
      return Math.random()>.5 ? lowerLeft : lowerRight;

    if (['airplane','helicopter','rocket','drone','stargaze','telescope','birdwatch'].includes(scene))
      return cam;

    return Math.random()>.55 ? lowerRight : lowerLeft;
  }

  _chooseActivity(calm=false){
    if (this.gateActive || this.travel || this.standbyActive) return;

    const rails = this._rails();
    const quiet = [
      'mushrooms','fishing','picnic','birdwatch','stargaze','reading','coffee',
      'photo','painting','telescope','gardening','napbag'
    ];
    const pool = calm ? quiet : this.activityCatalog;
    const scene = this._randDifferent(pool, this.lastActivityScene);
    this.lastActivityScene = scene;

    const r = this._activitySurface(scene, rails);
    const span = Math.max(12, r.maxX-r.minX);
    const x = r.minX + span*(0.18 + Math.random()*0.64);

    const duration = this._activityDuration(scene);
    this.pendingSceneDuration = duration;
    this._goTo({x, y:r.y, surface:r.name}, scene, false, calm?78:100);
  }

  _rails(){
    const a=this.anchorProvider();
    const foot=31*this.scale;
    const mk=(name,r,pad=34)=>({name, minX:r.x+pad, maxX:r.x+r.w-pad, y:r.y+r.h-foot-2});
    return {
      camera:mk('camera',a.camera,52),
      lightLeft:mk('lightLeft',a.lightLeft,34),
      lightRight:mk('lightRight',a.lightRight,34),
      gate:mk('gate',a.gate,25),
      anchors:a
    };
  }

  _ensurePlaced(){
    if(this.placed) return;
    const r=this._rails().camera;
    this.root.x=r.minX+Math.max(20,(r.maxX-r.minX)*.16);
    this.root.y=r.y;
    this.surface='camera';
    this.placed=true;
  }

  _randDifferent(arr,last){
    const c=arr.filter(x=>x!==last);
    return c[Math.floor(Math.random()*c.length)] || arr[0];
  }

  _startTravel(target, afterScene, forcedHop=false, speed=95){
    this._ensurePlaced();
    const dx=target.x-this.root.x, dy=target.y-this.root.y;
    const dist=Math.hypot(dx,dy);
    const cross=target.surface!==this.surface || Math.abs(dy)>5;
    const jump=forcedHop || cross;
    const duration=Math.max(.55, Math.min(3.2, dist/(jump?145:speed)));
    this.travel={
      x0:this.root.x,y0:this.root.y,x1:target.x,y1:target.y,
      start:this.t,duration,jump,jumpHeight:jump?Math.min(34,18+dist*.035):0,
      surface:target.surface,afterScene
    };
    this.pendingScene=afterScene;
    this.scene=jump?'hop':'walk';
    this.sceneUntil=this.t+duration;
  }

  _goTo(target, afterScene, forcedHop=false, speed=95){
    const dist=Math.hypot(target.x-this.root.x,target.y-this.root.y);
    if(dist<8){
      this.root.x=target.x; this.root.y=target.y; this.surface=target.surface;
      this.travel=null; this.scene=afterScene; this.sceneStart=this.t;
      const d=this.pendingSceneDuration;
      this.sceneUntil=this.t+(Number.isFinite(d)?d:((this.ambient?6:3.8)+Math.random()*2.5));
      this.pendingSceneDuration=null;
      return;
    }
    this._startTravel(target,afterScene,forcedHop,speed);
  }

  _updateTravel(){
    if(!this.travel) return;
    const tr=this.travel;
    const p=Math.max(0,Math.min(1,(this.t-tr.start)/tr.duration));
    const e=p*p*(3-2*p);
    this.root.x=tr.x0+(tr.x1-tr.x0)*e;
    const base=tr.y0+(tr.y1-tr.y0)*e;
    this.root.y=base-(tr.jump?Math.sin(Math.PI*p)*tr.jumpHeight:0);
    this.root.vx=(tr.x1-tr.x0)/tr.duration;
    this.root.vy=(tr.y1-tr.y0)/tr.duration;
    if(p>=1){
      this.root.x=tr.x1; this.root.y=tr.y1; this.root.vx=0; this.root.vy=0;
      this.surface=tr.surface;
      const next=tr.afterScene || 'idle';
      this.travel=null;
      this.scene=next;
      this.sceneStart=this.t;
      const d=this.pendingSceneDuration;
      this.sceneUntil=this.t+(Number.isFinite(d)?d:((this.ambient?6:3.4)+Math.random()*2.8));
      this.pendingSceneDuration=null;
      this.nextIdle=this.sceneUntil+.25;
    }
  }

  gateEvent(dir, duration, external){
    this._ensurePlaced();

    // If the action comes from this screen, the user interaction has priority:
    // the companion gets out of the way and waits in its corner for the whole motion.
    if (!external) {
      this.gateActive = false;
      this.gateDir = null;
      this.enterStandby((dir === 'stop' ? 3200 : Math.max(6500, duration*1000 + 900)));
      return;
    }

    // External/remote gate movement: the companion may react theatrically,
    // but it stays on the card edge and never covers the gate drawing.
    const openScenes=['push','ride','run','hang','surf','direct','boost','inspect','cheer','peek','sitgate','hopgate'];
    const closeScenes=['guide','duck','race','marshal','pull','watch','salute','skate','brace','check','hopaway','cling'];
    const stopScenes=['brake','surprised','freeze','stumble'];
    const arr=dir==='open'?openScenes:dir==='close'?closeScenes:stopScenes;
    const key=dir==='open'?'lastOpen':dir==='close'?'lastClose':null;
    const s=this._randDifferent(arr,key?this[key]:'');
    if(key) this[key]=s;

    this.gateActive=true;
    this.gateDir=dir;

    const rails=this._rails();
    const gr=rails.gate;
    // Put him on the far lower edge of the portal card.
    const safeX=gr.maxX-10;
    this.pendingSceneDuration = Math.max(2, duration);
    this._goTo({x:safeX,y:gr.y,surface:'gate'},s,true,150);
  }

  gateFinished(dir){
    this.gateActive=false;
    this.gateDir=null;
    if (this.standbyActive || this.t < this.standbyUntil) {
      this.scene='standby';
      this.sceneStart=this.t;
      this.sceneUntil=Math.max(this.sceneUntil,this.standbyUntil);
      return;
    }
    this.scene='celebrate';
    this.sceneStart=this.t;
    this.sceneUntil=this.t+1.7;
    this.nextIdle=this.sceneUntil+.35;
  }

  _initGL(){
    const gl=this.gl;
    const vs=`attribute vec3 aP;attribute vec3 aN;uniform mat4 uM;uniform mat4 uVP;uniform mat3 uNM;varying vec3 vN;varying vec3 vW;void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=normalize(uNM*aN);gl_Position=uVP*w;}`;
    const fs=`precision mediump float;varying vec3 vN;varying vec3 vW;uniform vec4 uC;uniform vec3 uL;uniform float uE;void main(){vec3 n=normalize(vN);vec3 l=normalize(uL);float d=max(dot(n,l),0.0);vec3 v=normalize(vec3(0.0,0.0,80.0)-vW);vec3 h=normalize(l+v);float s=pow(max(dot(n,h),0.0),28.0);vec3 c=uC.rgb*(0.42+0.58*d)+vec3(1.0)*s*0.28+uC.rgb*uE;gl_FragColor=vec4(c,uC.a);}`;
    const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s};
    this.prog=gl.createProgram();gl.attachShader(this.prog,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.prog,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.prog);gl.useProgram(this.prog);
    this.loc={p:gl.getAttribLocation(this.prog,'aP'),n:gl.getAttribLocation(this.prog,'aN'),m:gl.getUniformLocation(this.prog,'uM'),vp:gl.getUniformLocation(this.prog,'uVP'),nm:gl.getUniformLocation(this.prog,'uNM'),c:gl.getUniformLocation(this.prog,'uC'),l:gl.getUniformLocation(this.prog,'uL'),e:gl.getUniformLocation(this.prog,'uE')};
    const mesh=this._sphere(18,14);this.count=mesh.idx.length;
    this.pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.pos),gl.STATIC_DRAW);
    this.nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.nb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.norm),gl.STATIC_DRAW);
    this.ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.idx),gl.STATIC_DRAW);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  }
  _sphere(seg,ring){const p=[],n=[],idx=[];for(let y=0;y<=ring;y++){const v=y/ring,ph=v*Math.PI;for(let x=0;x<=seg;x++){const u=x/seg,th=u*Math.PI*2;const sx=Math.sin(ph)*Math.cos(th),sy=Math.cos(ph),sz=Math.sin(ph)*Math.sin(th);p.push(sx,sy,sz);n.push(sx,sy,sz)}}for(let y=0;y<ring;y++)for(let x=0;x<seg;x++){const a=y*(seg+1)+x,b=a+seg+1;idx.push(a,b,a+1,b,b+1,a+1)}return{pos:p,norm:n,idx}}

  update(dt,t,gate){
    if(!this.ok)return;
    this.t=t; this._resize(); this._ensurePlaced(); this._updateTravel();
    this._behavior(dt,t,gate); this._spring(dt); this._draw(t);
  }
  _resize(){const r=this.canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);const w=Math.max(2,Math.round(r.width*d)),h=Math.max(2,Math.round(r.height*d));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h)}this.cssW=r.width;this.cssH=r.height;}

  _chooseIdle(calm=false){
    if(this.gateActive || this.travel) return;
    const rails=this._rails();
    const normal=['clock','weather','perch','wave','inspectui','peek','stretch','littlehop','sit','lookaround','tap','dance','scan','crouch','salute','camera','rest'];
    const quiet=['perch','sit','lookaround','scan','rest','weather','clock','camera'];
    const arr=calm?quiet:normal;
    const s=this._randDifferent(arr,this.lastIdle); this.lastIdle=s;
    let r=rails.camera, x=(r.minX+r.maxX)/2;
    if(['sit','rest','perch','tap'].includes(s)){
      r=Math.random()>.5?rails.lightLeft:rails.lightRight;
      x=r.minX+(r.maxX-r.minX)*(0.25+Math.random()*.5);
    } else if(s==='clock') { r=rails.camera; x=r.minX+38; }
    else if(s==='weather') { r=rails.camera; x=r.maxX-38; }
    else if(s==='camera'||s==='scan'||s==='inspectui') { r=rails.camera; x=r.minX+(r.maxX-r.minX)*(0.45+Math.random()*.25); }
    else { r=rails.camera; x=r.minX+Math.random()*(r.maxX-r.minX); }
    this._goTo({x,y:r.y,surface:r.name},s,false,calm?72:90);
  }

  _behavior(dt,t,gate){
    if(this.gateActive && this.gateDir==='stop' && !this.travel && t>this.sceneUntil){
      this.gateActive=false; this.gateDir=null; this.nextIdle=t+.2;
    }

    if (this.standbyActive && t >= this.standbyUntil) {
      this.standbyActive = false;
      this.scene = 'idle';
      this.sceneStart = t;
      this.sceneUntil = t + .25;
      this.nextIdle = t + .25;
    }

    if (this.standbyActive && !this.travel) {
      this.scene = 'standby';
      this.sceneUntil = Math.max(this.sceneUntil, this.standbyUntil);
    }

    if(!this.gateActive && !this.travel && !this.standbyActive && t>this.sceneUntil) {
      // Most of the time he starts a real spontaneous activity;
      // sometimes he just does a short "character" gesture.
      if (Math.random() < (this.ambient ? .86 : .78)) this._chooseActivity(this.ambient);
      else this._chooseIdle(this.ambient);
    }

    const q=(name,val)=>this.joints[name].target=val;
    const all={bodyZ:0,bodyX:0,bodyY:0,bodyLift:0,headZ:0,headX:0,headY:0,headLift:0,armL:.04,armR:-.04,foreL:.08,foreR:-.08,legL:.03,legR:-.03,kneeL:0,kneeR:0};
    Object.entries(all).forEach(([k,v])=>q(k,v));

    const s=this.scene, ph=t*2.4;
    this.activityOffsetX = 0;
    this.activityOffsetY = 0;

    // Activities that actually travel along the card edge while they happen.
    if(!this.travel){
      if(['motorcycle','scooter','skateboard','sprint'].includes(s)) {
        this.activityOffsetX = Math.sin(t*.72) * 22;
      } else if(['airplane','helicopter','rocket','drone','kite','butterfly'].includes(s)) {
        this.activityOffsetX = Math.sin(t*.55) * 18;
        this.activityOffsetY = -Math.abs(Math.sin(t*.9)) * 5;
      } else if(['football','basketball','tennis','golf'].includes(s)) {
        this.activityOffsetX = Math.sin(t*.95) * 8;
      }
    }

    // Feet planted by default: breathing is tiny and mainly in head/torso, not whole-body hovering.
    if(!this.travel){q('bodyLift',-0.35-Math.sin(t*1.65)*0.22);q('headLift',Math.sin(t*1.35)*0.35);q('headZ',Math.sin(t*.7)*.025);}

    if(s==='walk'){
      const g=Math.sin(t*11.5), step=Math.abs(Math.sin(t*11.5));
      q('bodyLift',-1.1*step); q('bodyZ',Math.max(-.10,Math.min(.10,this.root.vx*.0014)));
      q('armL',g*.62);q('armR',-g*.62);q('foreL',-.10+g*.13);q('foreR',.10-g*.13);
      q('legL',-g*.55);q('legR',g*.55);q('kneeL',Math.max(0,g)*.75);q('kneeR',Math.max(0,-g)*.75);
      q('headZ',-g*.025);
    }
    else if(s==='hop'){
      q('armL',.75);q('armR',-.75);q('foreL',.2);q('foreR',-.2);q('legL',.20);q('legR',-.20);q('kneeL',.72);q('kneeR',.72);q('bodyX',-.10);
    }
    else if(s==='wave'||s==='salute'){q('armR',-1.35+Math.sin(ph*2)*.20);q('foreR',-.72+Math.sin(ph*2)*.16);q('headZ',-.10)}
    else if(s==='clock'){q('headZ',-.19);q('headY',-.30);q('armR',-.68);q('foreR',-.45)}
    else if(s==='weather'){q('headZ',.16);q('headY',.30);q('armL',.78);q('foreL',.42)}
    else if(s==='perch'||s==='sit'||s==='rest'||s==='sitgate'){q('bodyLift',2.2);q('legL',.92);q('legR',-.92);q('kneeL',1.28);q('kneeR',1.28);q('armL',.25);q('armR',-.25);q('headZ',Math.sin(ph*.55)*.06)}
    else if(s==='stretch'){q('armL',-1.55);q('armR',1.55);q('foreL',-.2);q('foreR',.2);q('bodyX',-.12);q('bodyLift',-1.8)}
    else if(s==='dance'){q('bodyLift',-Math.abs(Math.sin(ph*2))*3.0);q('bodyZ',Math.sin(ph*2)*.22);q('armL',.95+Math.sin(ph)*.58);q('armR',-.95+Math.cos(ph)*.58);q('legL',Math.sin(ph)*.62);q('legR',Math.cos(ph)*.62)}
    else if(s==='scan'||s==='inspectui'||s==='inspect'||s==='check'||s==='watch'||s==='camera'){q('headZ',Math.sin(ph*.65)*.20);q('headY',Math.sin(ph*.5)*.32);q('armR',-.58);q('foreR',-.55)}
    else if(s==='crouch'||s==='duck'){q('bodyLift',5);q('legL',.25);q('legR',-.25);q('kneeL',1.05);q('kneeR',1.05);q('bodyX',.18)}
    else if(s==='littlehop'||s==='hopgate'||s==='hopaway'||s==='surprised'){q('bodyLift',-Math.abs(Math.sin(ph*1.6))*5);q('armL',.92);q('armR',-.92);q('legL',.25);q('legR',-.25);q('kneeL',.62);q('kneeR',.62)}
    else if(s==='push'||s==='boost'||s==='brace'){q('bodyZ',-.20);q('bodyX',.20);q('armL',-1.08);q('armR',1.08);q('foreL',-.38);q('foreR',.38);q('legL',.35);q('legR',-.35);q('kneeL',.52);q('kneeR',.52)}
    else if(s==='ride'||s==='surf'||s==='skate'){q('bodyLift',-Math.abs(Math.sin(ph*1.4))*1.8);q('bodyZ',Math.sin(ph*1.4)*.13);q('bodyX',-.14);q('armL',.90);q('armR',-.90);q('legL',.72);q('legR',-.72);q('kneeL',.72);q('kneeR',.72)}
    else if(s==='hang'||s==='cling'){q('armL',-1.67);q('armR',1.67);q('foreL',-.28);q('foreR',.28);q('legL',Math.sin(ph)*.36);q('legR',-Math.sin(ph)*.36);q('bodyLift',2)}
    else if(s==='direct'||s==='guide'||s==='marshal'){q('armR',-1.18+Math.sin(ph)*.28);q('foreR',-.44);q('armL',.38);q('headZ',-.08)}
    else if(s==='cheer'||s==='celebrate'){q('bodyLift',-Math.abs(Math.sin(ph*1.5))*3.0);q('armL',-1.45+Math.sin(ph*1.5)*.15);q('armR',1.45-Math.sin(ph*1.5)*.15);q('legL',.15);q('legR',-.15)}
    else if(s==='pull'||s==='brake'){q('bodyZ',.22);q('bodyX',-.14);q('armL',.98);q('armR',-.98);q('foreL',.58);q('foreR',-.58);q('kneeL',.48);q('kneeR',.48)}
    else if(s==='race'||s==='run'){const g=Math.sin(t*13);q('bodyLift',-Math.abs(g)*2.1);q('bodyZ',-.15);q('armL',g*.95);q('armR',-g*.95);q('legL',-g*.82);q('legR',g*.82);q('kneeL',Math.max(0,g)*.82);q('kneeR',Math.max(0,-g)*.82)}
    else if(s==='freeze'){q('bodyX',-.05);q('headZ',.18)}
    else if(s==='stumble'){q('bodyLift',-Math.abs(Math.sin(ph*2))*2.4);q('bodyZ',Math.sin(ph*2)*.30);q('armL',.95);q('armR',-.35);q('legL',.58);q('legR',-.2)}
    else if(s==='peek'){q('headZ',-.30);q('headY',-.35);q('bodyZ',-.10)}
    else if(s==='tap'){q('bodyZ',-.08);q('armR',-.78+Math.sin(ph*2)*.15);q('foreR',-.65);q('headZ',-.12)}
    else if(s==='lookaround'){q('headZ',Math.sin(ph*.65)*.18);q('headY',Math.sin(ph*.45)*.33)}
    else if(s==='standby'){
      q('bodyLift',1.8);q('legL',.78);q('legR',-.78);q('kneeL',1.12);q('kneeR',1.12);
      q('armL',.14);q('armR',-.14);q('foreL',.12);q('foreR',-.12);
      q('headZ',Math.sin(ph*.35)*.045);q('headY',-.12);
    }
    else if(s==='football'){
      const g=Math.sin(t*9.8); q('bodyZ',-.10);q('bodyLift',-Math.abs(g)*1.2);
      q('armL',g*.55);q('armR',-g*.55);q('legL',-g*.48);q('legR',g*.70);
      q('kneeL',Math.max(0,g)*.55);q('kneeR',Math.max(0,-g)*.88);
    }
    else if(s==='basketball'){
      q('bodyLift',-Math.abs(Math.sin(ph*1.6))*1.5);q('kneeL',.35);q('kneeR',.35);
      q('armR',-.72+Math.sin(ph*2.2)*.22);q('foreR',-.72+Math.sin(ph*2.2)*.35);
      q('armL',.26);q('headZ',-.05);
    }
    else if(s==='tennis'||s==='golf'){
      const swing=Math.sin(ph*.85);
      q('bodyZ',swing*.24);q('bodyY',swing*.18);
      q('armR',-1.05+swing*.85);q('foreR',-.48+swing*.38);
      q('armL',.52-swing*.38);q('kneeL',.22);q('kneeR',.18);
    }
    else if(s==='boxing'){
      const hit=Math.sin(ph*2.8);
      q('bodyZ',hit*.13);q('kneeL',.32);q('kneeR',.32);
      q('armL',.25+Math.max(0,hit)*.75);q('foreL',.25+Math.max(0,hit)*.55);
      q('armR',-.25-Math.max(0,-hit)*.75);q('foreR',-.25-Math.max(0,-hit)*.55);
    }
    else if(s==='weights'){
      const curl=(Math.sin(ph*1.4)+1)*.5;
      q('armL',.55);q('armR',-.55);q('foreL',.1-curl*1.15);q('foreR',-.1+curl*1.15);
      q('kneeL',.18);q('kneeR',.18);q('bodyLift',-curl*.7);
    }
    else if(s==='jumprope'){
      const j=Math.abs(Math.sin(ph*2.1));
      q('bodyLift',-j*4.3);q('armL',.82);q('armR',-.82);q('foreL',Math.sin(ph*2.1)*.55);q('foreR',-Math.sin(ph*2.1)*.55);
      q('legL',.08);q('legR',-.08);q('kneeL',.34);q('kneeR',.34);
    }
    else if(s==='pushups'){
      const p=(Math.sin(ph*1.7)+1)*.5;
      q('bodyX',.82);q('bodyLift',5+p*2.3);q('armL',-.82+p*.42);q('armR',.82-p*.42);
      q('foreL',-.55);q('foreR',.55);q('legL',-.08);q('legR',.08);
    }
    else if(s==='yoga'){
      q('armL',-1.42);q('armR',1.42);q('foreL',-.12);q('foreR',.12);
      q('legL',.72);q('legR',-.18);q('kneeL',.82);q('bodyZ',Math.sin(ph*.35)*.045);
    }
    else if(s==='skateboard'){
      q('bodyZ',Math.sin(ph*.65)*.18);q('bodyX',-.12);q('armL',.92);q('armR',-.92);
      q('legL',.48);q('legR',-.48);q('kneeL',.58);q('kneeR',.58);q('bodyLift',-Math.abs(Math.sin(ph))*1.0);
    }
    else if(s==='sprint'){
      const g=Math.sin(t*15.2);q('bodyZ',-.18);q('bodyLift',-Math.abs(g)*2.2);
      q('armL',g*1.0);q('armR',-g*1.0);q('legL',-g*.92);q('legR',g*.92);
      q('kneeL',Math.max(0,g)*.95);q('kneeR',Math.max(0,-g)*.95);
    }
    else if(s==='juggle'){
      q('armL',.55+Math.sin(ph*1.9)*.38);q('armR',-.55+Math.cos(ph*1.9)*.38);
      q('foreL',-.35+Math.cos(ph*1.9)*.25);q('foreR',.35+Math.sin(ph*1.9)*.25);q('headZ',Math.sin(ph*.8)*.08);
    }
    else if(s==='mushrooms'||s==='gardening'){
      const pick=(Math.sin(ph*.9)+1)*.5;
      q('bodyX',.28);q('bodyLift',3.2+pick*1.4);q('kneeL',.92);q('kneeR',.92);
      q('armR',-.55-pick*.52);q('foreR',-.48);q('headX',.18);q('headZ',-.08);
    }
    else if(s==='fishing'){
      q('bodyLift',1.9);q('legL',.80);q('legR',-.80);q('kneeL',1.1);q('kneeR',1.1);
      q('armR',-1.08);q('foreR',-.40);q('armL',.42);q('foreL',.35);q('headZ',-.08+Math.sin(ph*.45)*.035);
    }
    else if(s==='camping'||s==='picnic'||s==='napbag'){
      q('bodyLift',2.5);q('legL',.95);q('legR',-.95);q('kneeL',1.25);q('kneeR',1.25);
      q('armL',.18);q('armR',-.18);q('headZ',s==='napbag'?.18:Math.sin(ph*.35)*.04);
    }
    else if(s==='birdwatch'||s==='stargaze'||s==='telescope'){
      q('headX',-.22);q('headY',.08);q('armL',.72);q('armR',-.72);q('foreL',-.65);q('foreR',.65);
      q('bodyZ',-.06);
    }
    else if(s==='kite'){
      q('headX',-.18);q('armR',-1.18);q('foreR',-.55);q('armL',.35);q('bodyZ',-.12);
    }
    else if(s==='butterfly'){
      q('headZ',Math.sin(ph*.7)*.22);q('headY',Math.sin(ph*.5)*.30);q('armR',-.32+Math.sin(ph)*.24);q('foreR',-.35);
    }
    else if(s==='motorcycle'||s==='scooter'){
      q('bodyX',-.20);q('bodyZ',-.08);q('armL',-.75);q('armR',.75);q('foreL',-.20);q('foreR',.20);
      q('legL',.82);q('legR',-.82);q('kneeL',1.0);q('kneeR',1.0);q('headX',-.05);
    }
    else if(s==='airplane'||s==='helicopter'||s==='rocket'){
      q('bodyX',-.05);q('armL',-1.48);q('armR',1.48);q('foreL',-.05);q('foreR',.05);
      q('legL',.18);q('legR',-.18);q('bodyZ',Math.sin(ph*.55)*.10);q('bodyLift',-Math.abs(Math.sin(ph*.7))*1.3);
    }
    else if(s==='drone'){
      q('headX',-.10);q('headZ',Math.sin(ph*.45)*.08);q('armL',.52);q('armR',-.52);q('foreL',-.45);q('foreR',.45);
    }
    else if(s==='painting'){
      q('armR',-.74+Math.sin(ph*1.25)*.34);q('foreR',-.58+Math.cos(ph*1.25)*.18);q('armL',.34);q('headZ',-.08);
    }
    else if(s==='guitar'){
      q('armL',.72);q('foreL',-.52);q('armR',-.62+Math.sin(ph*2.1)*.16);q('foreR',-.42);q('bodyZ',Math.sin(ph*.45)*.08);
    }
    else if(s==='reading'){
      q('bodyLift',2.0);q('legL',.82);q('legR',-.82);q('kneeL',1.15);q('kneeR',1.15);
      q('armL',.48);q('armR',-.48);q('foreL',-.62);q('foreR',.62);q('headX',.12);
    }
    else if(s==='coffee'){
      q('bodyLift',1.8);q('legL',.76);q('legR',-.76);q('kneeL',1.05);q('kneeR',1.05);
      q('armR',-.52);q('foreR',-1.05+Math.sin(ph*.45)*.08);q('headX',.05);
    }
    else if(s==='photo'){
      q('armL',.78);q('armR',-.78);q('foreL',-.78);q('foreR',.78);q('headX',-.04);
    }
    else if(s==='cooking'){
      q('bodyX',.08);q('armL',.48+Math.sin(ph*1.5)*.22);q('armR',-.48+Math.cos(ph*1.5)*.22);
      q('foreL',-.36);q('foreR',.36);q('headX',.10);
    }
    else if(s==='magic'){
      q('armL',-1.12+Math.sin(ph)*.28);q('armR',1.12-Math.cos(ph)*.28);q('foreL',-.22);q('foreR',.22);
      q('bodyLift',-Math.abs(Math.sin(ph*.9))*1.6);
    }
    else if(s==='cleaning'){
      q('bodyX',.16);q('armR',-.92+Math.sin(ph*1.5)*.25);q('foreR',-.42);q('armL',.25);q('kneeL',.30);q('kneeR',.30);
    }
    else if(s==='build'){
      q('bodyX',.18);q('armR',-.72+Math.sin(ph*2.2)*.28);q('foreR',-.72);q('armL',.38);q('headX',.12);
    }
    else if(s==='danceparty'){
      q('bodyLift',-Math.abs(Math.sin(ph*2.2))*3.2);q('bodyZ',Math.sin(ph*1.6)*.28);
      q('armL',1.05+Math.sin(ph)*.55);q('armR',-1.05+Math.cos(ph)*.55);
      q('legL',Math.sin(ph*1.2)*.62);q('legR',Math.cos(ph*1.2)*.62);
    }

    if(this.look.t>performance.now()){
      const a=this.anchorProvider(), dx=(this.look.x-(a.host.w/2))/Math.max(1,a.host.w),dy=(this.look.y-(a.host.h/2))/Math.max(1,a.host.h);
      q('headY',Math.max(-.45,Math.min(.45,dx*.7)));q('headX',Math.max(-.30,Math.min(.30,-dy*.55)));
    }
  }


  _spring(dt){for(const j of Object.values(this.joints)){const k=48,d=11;const a=(j.target-j.v)*k-j.vel*d;j.vel+=a*dt;j.v+=j.vel*dt}}

  _isActivityScene(s){
    return this.activityCatalog.includes(s);
  }

  _propAlpha(){
    if(!this._isActivityScene(this.scene)) return 0;
    const age=Math.max(0,this.t-(this.sceneStart||this.t));
    const rem=Math.max(0,(this.sceneUntil||this.t)-this.t);
    return Math.max(0,Math.min(1,age*3.4,rem*3.0));
  }

  _drawMaterializeFX(x,y,alpha,t){
    if(alpha<=0 || alpha>=.98) return;
    const c=[.32,.91,1,Math.min(.9,alpha*.95)];
    for(let i=0;i<7;i++){
      const a=t*3.2+i*Math.PI*2/7;
      const rr=12+Math.sin(t*4+i)*3;
      this._mesh(M4.compose(
        x+Math.cos(a)*rr*this.scale,
        y-10*this.scale+Math.sin(a)*rr*.55*this.scale,
        6,0,0,0,
        .75*this.scale,.75*this.scale,.75*this.scale
      ),c,.85);
    }
  }

  _drawActivityProp(body,x,y,sc,t){
    const s=this.scene;
    const a=this._propAlpha();
    if(a<=0) return;

    const C={
      blue:[.08,.50,.72,a], cyan:[.35,.92,1,a], white:[.95,.98,1,a],
      dark:[.05,.12,.16,a], red:[.85,.18,.17,a], orange:[.95,.48,.08,a],
      yellow:[.95,.72,.12,a], green:[.20,.62,.28,a], brown:[.46,.28,.14,a],
      purple:[.48,.28,.74,a], gray:[.38,.45,.50,a], pink:[.96,.45,.62,a]
    };
    const W=(dx,dy,dz,rx,ry,rz,sx,sy,sz,c=C.white,e=0)=>
      this._mesh(M4.compose(x+dx*sc,y+dy*sc,dz,rx,ry,rz,sx*sc,sy*sc,sz*sc),c,e);

    this._drawMaterializeFX(x,y,a,t);

    if(s==='football'){
      W(15,12,8,0,0,0,4.8,4.8,4.8,C.white,.08);
      W(15,12,12,0,0,0,1.5,1.5,1.5,C.dark,.04);
    }
    else if(s==='basketball'){
      W(14,3,8,0,0,0,5.2,5.2,5.2,C.orange,.08);
      W(14,3,13,0,0,0,1.0,1.0,1.0,C.dark,0);
    }
    else if(s==='tennis'){
      W(13,-2,7,0,0,-.35,1.2,10,1.2,C.gray,0);
      W(17,-12,8,0,0,-.35,6.2,7.7,1.3,C.blue,.12);
      W(23,8,8,0,0,0,2.0,2.0,2.0,C.yellow,.08);
    }
    else if(s==='golf'){
      W(14,-1,6,0,0,-.28,.9,15,.9,C.gray,0);
      W(19,12,7,0,0,-.28,4.0,1.6,2.0,C.dark,.03);
      W(24,13,7,0,0,0,1.9,1.9,1.9,C.white,.06);
    }
    else if(s==='boxing'){
      W(-13,-4,10,0,0,0,4.4,4.8,4.6,C.red,.08);
      W(13,-4,10,0,0,0,4.4,4.8,4.6,C.red,.08);
    }
    else if(s==='weights'){
      for(const dx of [-13,13]){
        W(dx,1,8,0,0,0,.9,7,.9,C.gray,0);
        W(dx,-6,8,0,0,0,3.5,2.2,3.5,C.dark,.02);
        W(dx,8,8,0,0,0,3.5,2.2,3.5,C.dark,.02);
      }
    }
    else if(s==='jumprope'){
      for(let i=0;i<10;i++){
        const u=i/9, ang=-Math.PI*.08+u*Math.PI*1.16;
        W(Math.cos(ang)*18,5+Math.sin(ang)*17,3,0,0,0,.65,.65,.65,C.cyan,.55);
      }
      W(-16,-1,7,0,0,0,1.2,4.2,1.2,C.blue,.08);
      W(16,-1,7,0,0,0,1.2,4.2,1.2,C.blue,.08);
    }
    else if(s==='pushups'||s==='yoga'){
      W(0,17,1,0,0,0,19,2.0,7,C.blue,.03);
    }
    else if(s==='skateboard'){
      W(0,15,4,0,0,0,15,1.8,4,C.dark,.03);
      W(-10,18,6,0,0,0,2.2,2.2,2.2,C.gray,0);
      W(10,18,6,0,0,0,2.2,2.2,2.2,C.gray,0);
    }
    else if(s==='juggle'){
      for(let i=0;i<3;i++){
        const aa=t*2.6+i*Math.PI*2/3;
        W(Math.cos(aa)*9,-11+Math.sin(aa)*9,9,0,0,0,2.4,2.4,2.4,[.3+.2*i,.75,.95,a],.18);
      }
    }
    else if(s==='mushrooms'){
      // Basket
      W(13,11,4,0,0,0,7,4,6,C.brown,.02);
      W(13,5,4,0,0,0,5,1,5,C.brown,.02);
      for(const [dx,dy] of [[-13,12],[-6,14],[2,13],[9,15]]){
        W(dx,dy,4,0,0,0,1.3,3.1,1.3,C.white,0);
        W(dx,dy-3.4,5,0,0,0,3.0,1.6,3.0,Math.random()>.5?C.red:C.orange,.05);
      }
    }
    else if(s==='fishing'){
      W(13,-5,6,0,0,-.55,.75,21,.75,C.brown,0);
      for(let i=0;i<8;i++) W(21+i*1.3,7+i*.6,3,0,0,0,.45,.45,.45,C.cyan,.45);
      W(31,14,3,0,0,0,1.7,1.7,1.7,C.red,.08);
      if(Math.sin(t*.8)>.55) W(35,17,3,0,0,.3,4.2,2.0,1.4,C.blue,.05);
    }
    else if(s==='camping'){
      W(18,9,2,0,0,-.20,12,9,6,C.green,.02);
      W(18,4,2,0,0,.20,12,9,6,C.green,.02);
      W(18,15,2,0,0,0,13,1,7,C.dark,0);
    }
    else if(s==='gardening'){
      W(15,11,5,0,0,0,6,4,5,C.blue,.06);
      W(21,7,5,0,0,-.55,5,1.2,1.2,C.blue,.06);
      W(-14,14,3,0,0,0,5,2.2,5,C.brown,.02);
      W(-14,9,3,0,0,0,1.1,8,1.1,C.green,.1);
      W(-18,6,3,0,0,.5,3.5,1.2,1.4,C.green,.08);
      W(-10,6,3,0,0,-.5,3.5,1.2,1.4,C.green,.08);
    }
    else if(s==='picnic'){
      W(0,17,1,0,0,0,17,1.0,9,C.red,.02);
      W(12,11,4,0,0,0,6,4,6,C.brown,.02);
      W(-9,13,4,0,0,0,3.2,3.2,3.2,C.orange,.04);
    }
    else if(s==='birdwatch'){
      W(-4,-6,10,0,0,0,3.0,5.5,4.0,C.dark,.02);
      W(4,-6,10,0,0,0,3.0,5.5,4.0,C.dark,.02);
    }
    else if(s==='stargaze'||s==='telescope'){
      W(13,-4,4,0,0,-.65,3.3,12,3.3,C.dark,.04);
      W(18,6,2,0,0,-.15,.8,10,.8,C.gray,0);
      W(10,8,2,0,0,.2,.8,10,.8,C.gray,0);
    }
    else if(s==='kite'){
      W(27,-20,6,0,0,.75,5.5,7.5,1.0,C.purple,.12);
      for(let i=0;i<11;i++) W(12+i*1.5,-3-i*1.55,2,0,0,0,.35,.35,.35,C.cyan,.45);
    }
    else if(s==='butterfly'){
      for(const dx of [14,25]){
        W(dx,-12,7,0,0,.45,3.5,1.4,.8,C.pink,.12);
        W(dx+3,-12,7,0,0,-.45,3.5,1.4,.8,C.purple,.12);
      }
    }
    else if(s==='motorcycle'||s==='scooter'){
      const bx=8, by=13;
      W(bx-12,by,4,0,0,0,5.2,5.2,2.2,C.dark,.02);
      W(bx+12,by,4,0,0,0,5.2,5.2,2.2,C.dark,.02);
      W(bx,by-4,6,0,0,0,12,3.2,4.5,s==='motorcycle'?C.blue:C.gray,.08);
      W(bx+7,by-12,6,0,0,-.38,.9,8,.9,C.gray,0);
      if(s==='motorcycle') W(bx-3,by-9,7,0,0,0,5.5,3.0,4.2,C.white,.05);
    }
    else if(s==='airplane'){
      W(8,-4,6,0,0,-.10,17,3.4,4.0,C.white,.06);
      W(8,-3,6,0,0,-.10,6.5,1.0,16,C.blue,.06);
      W(-8,-5,6,0,0,-.10,4,1,7,C.blue,.05);
    }
    else if(s==='helicopter'){
      W(7,-3,6,0,0,0,10,5.2,5.2,C.white,.05);
      W(22,-3,6,0,0,0,12,1.2,1.2,C.gray,0);
      W(7,-12,8,0,0,Math.sin(t*8)*.25,17,.55,.7,C.dark,.02);
      W(27,-3,7,0,0,Math.sin(t*9)*.4,.7,5,.7,C.dark,.02);
    }
    else if(s==='rocket'){
      W(8,-8,7,0,0,-.10,5.5,14,5.5,C.white,.06);
      W(8,-19,8,0,0,0,3.3,3.3,3.3,C.blue,.12);
      W(8,7,6,0,0,0,3.0,7.0,3.0,C.orange,.45);
    }
    else if(s==='drone'){
      W(10,-4,7,0,0,0,6,2.5,6,C.dark,.04);
      for(const [dx,dy] of [[-10,-10],[10,-10],[-10,10],[10,10]]){
        W(10+dx,-4+dy*.35,7,0,0,0,8,.45,.8,C.gray,0);
        W(10+dx*1.4,-4+dy*.5,7,0,0,t*7,4.8,.35,1.0,C.blue,.15);
      }
    }
    else if(s==='painting'){
      W(17,-2,3,0,0,0,9,12,1.0,C.brown,.01);
      W(17,-5,5,0,0,0,7.5,8.5,.8,C.white,.03);
      W(15,-7,6,0,0,0,2.0,1.0,.6,C.blue,.2);
      W(20,-2,6,0,0,0,2.0,1.0,.6,C.yellow,.15);
    }
    else if(s==='guitar'){
      W(12,1,6,0,0,-.35,6.5,8.5,3.5,C.brown,.04);
      W(20,-8,6,0,0,-.35,1.4,10,1.4,C.brown,.02);
      W(12,1,9,0,0,0,1.7,1.7,1.7,C.dark,0);
    }
    else if(s==='reading'){
      W(0,-3,7,0,0,0,8,5.8,.7,C.blue,.03);
      W(8,-3,7,0,0,0,8,5.8,.7,C.white,.02);
    }
    else if(s==='coffee'){
      W(12,-2,7,0,0,0,3.8,5.2,3.8,C.white,.04);
      W(17,-2,7,0,0,0,2.2,2.8,1.0,C.white,.04);
      for(let i=0;i<4;i++) W(10+i*2,-10-i*2,4,0,0,0,.5,2.0,.5,C.white,.08);
    }
    else if(s==='photo'){
      W(10,-8,8,0,0,0,8,5.8,3.0,C.dark,.04);
      W(10,-8,12,0,0,0,3.2,3.2,2.2,C.blue,.18);
    }
    else if(s==='cooking'){
      W(14,5,5,0,0,0,9,3.0,9,C.dark,.03);
      W(23,2,5,0,0,-.35,8,1.2,1.2,C.gray,0);
      W(12,-6,6,0,0,Math.sin(t*2)*.2,1.0,8,1.0,C.gray,0);
    }
    else if(s==='magic'){
      W(11,7,5,0,0,0,7,3,7,C.dark,.03);
      W(11,2,5,0,0,0,4.5,4,4.5,C.dark,.03);
      for(let i=0;i<7;i++){
        const aa=t*2+i;
        W(11+Math.cos(aa)*10,-7+Math.sin(aa*1.2)*8,8,0,0,0,.7,.7,.7,C.cyan,.85);
      }
    }
    else if(s==='cleaning'){
      W(15,-2,4,0,0,-.45,.8,18,.8,C.brown,0);
      W(21,12,5,0,0,-.45,7,2.5,4,C.yellow,.03);
    }
    else if(s==='build'){
      W(14,11,5,0,0,0,8,5,6,C.red,.03);
      W(8,-3,6,0,0,-.55,1.2,10,1.2,C.gray,0);
      W(11,-11,7,0,0,-.55,4.8,2.2,2.8,C.gray,.02);
    }
    else if(s==='danceparty'){
      W(-15,11,3,0,0,0,5.5,8,4,C.dark,.04);
      W(25,11,3,0,0,0,5.5,8,4,C.dark,.04);
      W(-15,7,7,0,0,0,2.0,2.0,1.5,C.blue,.3);
      W(25,7,7,0,0,0,2.0,2.0,1.5,C.blue,.3);
    }
    else if(s==='napbag'){
      W(0,14,1,0,0,0,16,2.0,7,C.blue,.03);
      W(-11,8,3,0,0,0,5,3.5,5,C.white,.02);
    }
  }

  _draw(t){
    const gl=this.gl,w=this.cssW||1,h=this.cssH||1;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.pb);gl.enableVertexAttribArray(this.loc.p);gl.vertexAttribPointer(this.loc.p,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,this.nb);gl.enableVertexAttribArray(this.loc.n);gl.vertexAttribPointer(this.loc.n,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ib);
    const vp=M4.ortho(0,w,h,0,-120,120);gl.uniformMatrix4fv(this.loc.vp,false,vp);gl.uniform3f(this.loc.l,-.35,-.55,.76);
    const J=this.joints, sc=this.scale, x=this.root.x+this.activityOffsetX,y=this.root.y+this.activityOffsetY+J.bodyLift.v;
    const body=M4.compose(x,y,0,J.bodyX.v,J.bodyY.v,J.bodyZ.v,sc,sc,sc);
    this._mesh(M4.compose(x,y+31*sc,-8,0,0,0,11*sc,2.3*sc,2.4),[.10,.18,.22,.09],0);
    this._limb(body,-7,12,J.legL.v,J.kneeL.v,true);this._limb(body,7,12,J.legR.v,J.kneeR.v,false);
    this._arm(body,-13,-4,J.armL.v,J.foreL.v,true);this._arm(body,13,-4,J.armR.v,J.foreR.v,false);
    this._mesh(M4.mul(body,M4.scale(12.5,15.5,8.2)),[.94,.97,.99,1],.05);
    this._mesh(M4.mul(body,M4.compose(0,2,7.1,0,0,0,5.7,6.6,1.2)),[.08,.50,.72,1],.15);
    this._mesh(M4.mul(body,M4.compose(0,2,8.3,0,0,0,2.0,2.0,.8)),[.42,.90,1,1],.65);
    let head=M4.mul(body,M4.compose(0,-22+J.headLift.v,1,J.headX.v,J.headY.v,J.headZ.v,1,1,1));
    this._mesh(M4.mul(head,M4.scale(17.5,13.2,10.2)),[.96,.98,1,1],.08);
    this._mesh(M4.mul(head,M4.compose(0,0,8.7,0,0,0,13.7,7.6,2.2)),[.015,.075,.105,1],.08);
    const blink=(Math.sin(t*.93)>0.985)?0.18:1;const gazeX=Math.sin(t*.37)*.6;
    this._mesh(M4.mul(head,M4.compose(-5.2+gazeX,-.2,10.7,0,0,0,1.85,3.0*blink,1)),[.32,.91,1,1],.95);
    this._mesh(M4.mul(head,M4.compose(5.2+gazeX,-.2,10.7,0,0,0,1.85,3.0*blink,1)),[.32,.91,1,1],.95);
    this._mesh(M4.mul(head,M4.compose(-16.5,0,1.0,0,0,0,2.6,5.7,4.0)),[.06,.48,.72,1],.15);
    this._mesh(M4.mul(head,M4.compose(16.5,0,1.0,0,0,0,2.6,5.7,4.0)),[.06,.48,.72,1],.15);

    // Props are procedurally materialised by the companion itself.
    this._drawActivityProp(body,x,y,sc,t);
  }

  _arm(body,sx,sy,a,e,left){const sh=this._point(body,[sx,sy,0]);const L1=11,L2=9;const a1=a+(left?-.15:.15),ex=sh[0]+Math.sin(a1)*L1*this.scale,ey=sh[1]+Math.cos(a1)*L1*this.scale;const a2=a1+e,hx=ex+Math.sin(a2)*L2*this.scale,hy=ey+Math.cos(a2)*L2*this.scale;const m1x=(sh[0]+ex)/2,m1y=(sh[1]+ey)/2,m2x=(ex+hx)/2,m2y=(ey+hy)/2;this._mesh(M4.compose(m1x,m1y,0,0,0,-a1,3.2*this.scale,L1*.52*this.scale,3.2*this.scale),[.94,.97,.99,1],.04);this._mesh(M4.compose(m2x,m2y,.3,0,0,-a2,2.9*this.scale,L2*.52*this.scale,2.9*this.scale),[.92,.96,.98,1],.04);this._mesh(M4.compose(ex,ey,.6,0,0,0,3.1*this.scale,3.1*this.scale,3.1*this.scale),[.06,.48,.72,1],.12);this._mesh(M4.compose(hx,hy,1,0,0,0,3.4*this.scale,3.7*this.scale,3.4*this.scale),[.96,.98,1,1],.05);this._mesh(M4.compose(sh[0],sh[1],1,0,0,0,3.5*this.scale,3.5*this.scale,3.5*this.scale),[.06,.48,.72,1],.12)}
  _limb(body,sx,sy,a,k,left){const hip=this._point(body,[sx,sy,0]),L1=11,L2=11;const a1=a,knx=hip[0]+Math.sin(a1)*L1*this.scale,kny=hip[1]+Math.cos(a1)*L1*this.scale;const a2=a1+(left?1:-1)*k*.45,fx=knx+Math.sin(a2)*L2*this.scale,fy=kny+Math.cos(a2)*L2*this.scale;const m1x=(hip[0]+knx)/2,m1y=(hip[1]+kny)/2,m2x=(knx+fx)/2,m2y=(kny+fy)/2;this._mesh(M4.compose(m1x,m1y,0,0,0,-a1,3.5*this.scale,L1*.52*this.scale,3.5*this.scale),[.94,.97,.99,1],.04);this._mesh(M4.compose(m2x,m2y,.2,0,0,-a2,3.2*this.scale,L2*.52*this.scale,3.2*this.scale),[.92,.96,.98,1],.04);this._mesh(M4.compose(knx,kny,.5,0,0,0,3.2*this.scale,3.2*this.scale,3.2*this.scale),[.06,.48,.72,1],.12);this._mesh(M4.compose(fx,fy+2*this.scale,2,0,0,0,5.2*this.scale,3.6*this.scale,6.0*this.scale),[.96,.98,1,1],.05);this._mesh(M4.compose(hip[0],hip[1],1,0,0,0,3.8*this.scale,3.8*this.scale,3.8*this.scale),[.06,.48,.72,1],.12)}
  _point(m,p){const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y=m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14];return[x,y,z]}
  _mesh(m,c,e){const gl=this.gl;gl.uniformMatrix4fv(this.loc.m,false,m);gl.uniformMatrix3fv(this.loc.nm,false,new Float32Array([m[0],m[1],m[2],m[4],m[5],m[6],m[8],m[9],m[10]]));gl.uniform4f(this.loc.c,c[0],c[1],c[2],c[3]);gl.uniform1f(this.loc.e,e||0);gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0)}
}

const M4={
  I(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])},
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3]}return o},
  translate(x,y,z){const m=this.I();m[12]=x;m[13]=y;m[14]=z;return m},scale(x,y,z){const m=this.I();m[0]=x;m[5]=y;m[10]=z;return m},
  rx(a){const m=this.I(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m},ry(a){const m=this.I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m},rz(a){const m=this.I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m},
  compose(x,y,z,rx,ry,rz,sx,sy,sz){let m=this.translate(x,y,z);m=this.mul(m,this.rz(rz||0));m=this.mul(m,this.ry(ry||0));m=this.mul(m,this.rx(rx||0));return this.mul(m,this.scale(sx||1,sy||1,sz||1))},
  ortho(l,r,b,t,n,f){const m=this.I();m[0]=2/(r-l);m[5]=2/(t-b);m[10]=-2/(f-n);m[12]=-(r+l)/(r-l);m[13]=-(t+b)/(t-b);m[14]=-(f+n)/(f-n);return m}
};

if (!customElements.get('rm-ultimate-dashboard')) customElements.define('rm-ultimate-dashboard', RMUltimateDashboard);
window.customCards = window.customCards || [];
window.customCards.push({ type:'rm-ultimate-dashboard', name:'RM Ultimate Dashboard', description:'Dashboard mural RM v6.5 - compagnon 3D, météo 24 h, mode ambiant et réveil par mouvement iPad', preview:false });
console.info('%c RM Ultimate Dashboard v6.5 ','background:#315E78;color:white;border-radius:6px;padding:3px 7px');
