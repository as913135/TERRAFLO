/**
 * TerraFlow — Master Application Controller
 * Modeled after the clean, user-friendly architecture of TerraFlow (Emergent Preview)
 * Coordinates Dashboard KPIs, 2D/3D Map Viewport, Citizen Reports Board, and Subsurface Records Table.
 */

class TerraFlowApp {
  constructor() {
    this.currentTownId = 'india_national';
    this.currentTownData = null;
    this.riskResults = null;
    this.selectedPipe = null;
    this.activePage = 'dashboard'; // 'dashboard', 'map', 'reports', 'records'
    this.mapViewMode = '2d';       // '2d' or '3d'
    this.activeMapBase = 'hybrid'; // 'hybrid', 'terrain', 'dark'
    this.pendingRedirectPage = null;
    this.pendingAction = null;
    this.activeHindsightTab = 'recall';
    this.currentRecallFilter = 'all';

    // Utility Filters (Gas, Oil, Water, Fiber, Power, Sewer)
    this.utilityFilters = {
      gas_transmission: true,
      oil_petroleum: true,
      water_main: true,
      water_distribution: true,
      sewer_gravity: true,
      electric_11kv: true,
      telecom_fiber: true,
      stormwater_nullah: true
    };

    // Engines
    this.riskEngine = new TerraFlowRiskEngine();
    this.digSafetyEngine = new TerraFlowDigSafetyEngine(this.riskEngine);
    this.engine3D = null;
    this.engineGIS = null;
    this.isGoogleMapsActive = false;
  }

  init() {
    console.log('Mounting TerraFlow India Subsurface & Pipeline Intelligence...');

    // 1. Verify User Authentication & Clearance Gate
    this.checkAuthenticationState();

    // 2. Initialize 3D WebGL Engine
    this.engine3D = new TerraFlow3DSubsurfaceEngine('three-container', {
      onPipeSelect: (pipe) => this.selectPipe(pipe.id),
      onPipeHover: (pipe, event) => {},
      onReportClick: (report) => this.showReportDetails(report)
    });

    // 3. Initialize GIS Map Engine (Google Maps preferred, Leaflet fallback)
    const mapContainer = 'leaflet-map';
    const mapOptions = {
      onPipeSelect: (pipe) => this.selectPipe(pipe.id),
      onExcavationSitePicked: (lat, lng) => this.runExcavationCheckAt(lat, lng),
      onMapClickForReport: (latlng) => this.fillReportCoordinates(latlng)
    };

    if (typeof google !== 'undefined' && google.maps) {
      this.engineGIS = new TerraFlowGoogleMapsEngine(mapContainer, mapOptions);
      this.isGoogleMapsActive = true;
    } else {
      this.engineGIS = new TerraFlowGISMapEngine(mapContainer, mapOptions);
      this.isGoogleMapsActive = false;
      // Async Google Maps loader check
      let attempts = 0;
      const checker = setInterval(() => {
        attempts++;
        if (typeof google !== 'undefined' && google.maps) {
          clearInterval(checker);
          this.switchEngineToGoogleMaps();
        } else if (attempts > 15) {
          clearInterval(checker);
        }
      }, 400);
    }

    // 4. Bind Town & UI events
    this.bindEvents();

    // 5. Load Pan-India National Network as Default
    this.loadTown('india_national');

    // 6. Update Notification State
    if (window.notificationService) {
      window.notificationService.updateUIBadge();
    }
  }

  switchEngineToGoogleMaps() {
    if (this.isGoogleMapsActive) return;
    const mapContainer = 'leaflet-map';
    const elem = document.getElementById(mapContainer);
    if (elem) elem.innerHTML = '';

    const mapOptions = {
      onPipeSelect: (pipe) => this.selectPipe(pipe.id),
      onExcavationSitePicked: (lat, lng) => this.runExcavationCheckAt(lat, lng),
      onMapClickForReport: (latlng) => this.fillReportCoordinates(latlng)
    };

    this.engineGIS = new TerraFlowGoogleMapsEngine(mapContainer, mapOptions);
    this.isGoogleMapsActive = true;
    this.engineGIS.init();

    if (this.currentTownData) {
      this.engineGIS.loadTown(this.currentTownData, this.riskResults);
    }
  }

  loadTown(townId) {
    let data = (typeof INDIA_PIPELINE_DATA !== 'undefined' && INDIA_PIPELINE_DATA[townId]) || TERRAFLOW_TOWNS[townId];
    if (!data && window.customTownData && window.customTownData.id === townId) {
      data = window.customTownData;
    }
    if (!data) {
      data = (typeof INDIA_PIPELINE_DATA !== 'undefined' && INDIA_PIPELINE_DATA.india_national) || TERRAFLOW_TOWNS.india_national || TERRAFLOW_TOWNS.manali;
    }

    this.currentTownId = townId;
    this.currentTownData = data;

    // Update Town Selector Dropdown if present
    const townSelect = document.getElementById('town-select');
    if (townSelect && townSelect.value !== townId) {
      townSelect.value = townId;
    }

    // Environmental defaults
    this.riskEngine.setEnvironmentalConditions(data.rainfall_24h || 38, 65, false);

    // Evaluate Risk across network
    this.evaluateAndRender();
  }

  flyToLocation(lat, lng, zoom = 14) {
    this.switchPage('map');
    if (this.engineGIS && this.engineGIS.map) {
      if (typeof this.engineGIS.map.flyTo === 'function') {
        this.engineGIS.map.flyTo([lat, lng], zoom);
      } else if (typeof this.engineGIS.map.setCenter === 'function') {
        this.engineGIS.map.setCenter({ lat, lng });
        this.engineGIS.map.setZoom(zoom);
      }
    }
  }

  evaluateAndRender() {
    if (!this.currentTownData) return;

    // Run Explainable AI Risk Evaluation
    this.riskResults = this.riskEngine.evaluateNetwork(
      this.currentTownData.pipes,
      this.currentTownData.community_reports
    );

    // Update Dashboard KPIs
    this.updateDashboardKPIs();

    // Render Reports Page
    this.renderReportsPage();

    // Render Records Table
    this.renderRecordsTable();

    // Update Segment Counter on Map
    const countElem = document.getElementById('map-segment-counter');
    if (countElem) countElem.textContent = `${this.currentTownData.pipes.length} segments`;

    // Populate Location Picker Dropdown with all pipeline locations
    this.populateLocationPicker();

    // Load into GIS and 3D
    if (this.engineGIS) this.engineGIS.loadTown(this.currentTownData, this.riskResults);
    if (this.engine3D) this.engine3D.loadTownData(this.currentTownData, this.riskResults);

    if (this.selectedPipe) {
      this.selectPipe(this.selectedPipe.id);
    }
  }

  updateDashboardKPIs() {
    const stats = this.riskResults.stats;
    const pipes = this.currentTownData.pipes || [];

    // Calculate total network km
    let totalKm = 0;
    pipes.forEach(p => {
      if (p.coords && p.coords.length > 1) {
        for (let i = 0; i < p.coords.length - 1; i++) {
          totalKm += this.riskEngine.haversineDistanceM(
            p.coords[i][0], p.coords[i][1],
            p.coords[i+1][0], p.coords[i+1][1]
          ) / 1000.0;
        }
      }
    });

    const unverifiedCount = pipes.filter(p => p.verification_status && (p.verification_status.includes('Unverified') || p.verification_status.includes('Estimated'))).length;
    const unverifiedPct = Math.round((unverifiedCount / (pipes.length || 1)) * 100);

    // Update KPI Elements
    const netKmElem = document.getElementById('kpi-net-km');
    if (netKmElem) netKmElem.textContent = `${Math.max(12.4, totalKm.toFixed(1))} km`;

    const netSubElem = document.getElementById('kpi-net-sub');
    if (netSubElem) netSubElem.textContent = `${pipes.length} segments · 3 utilities`;

    const highElem = document.getElementById('kpi-high-risk');
    if (highElem) highElem.textContent = stats.highRiskCount;

    const modElem = document.getElementById('kpi-mod-risk');
    if (modElem) modElem.textContent = stats.mediumRiskCount;

    const repElem = document.getElementById('kpi-open-rep');
    if (repElem) repElem.textContent = (this.currentTownData.community_reports || []).length;

    const unverElem = document.getElementById('kpi-unverified');
    if (unverElem) unverElem.textContent = `${unverifiedPct}%`;
  }

  // --------------------------------------------------------------------------
  // Tab / Page Navigation
  // --------------------------------------------------------------------------
  switchPage(pageId) {
    // Public Access Control: Dashboard is open to public.
    // Map, Reports, and Records require an authenticated account.
    if (pageId !== 'dashboard' && window.authService && !window.authService.isAuthenticated()) {
      this.pendingRedirectPage = pageId;
      this.openAuthModal('signin');
      return;
    }

    this.activePage = pageId;

    // Update Nav Link styles
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-page') === pageId);
    });

    // Update Page View styles
    document.querySelectorAll('.page-view').forEach(view => {
      view.classList.remove('active-page');
    });

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active-page');

    // Trigger map resize when switching to Map tab
    if (pageId === 'map') {
      setTimeout(() => {
        if (this.engineGIS) this.engineGIS.invalidateSize();
        if (this.engine3D) this.engine3D.onResize();
      }, 50);
    }
  }

  // --------------------------------------------------------------------------
  // Map View Controls (2D / 3D, Utility Filters, Base layers)
  // --------------------------------------------------------------------------
  setMapViewMode(mode) {
    this.mapViewMode = mode;
    const mapElem = document.getElementById('leaflet-map');
    const threeElem = document.getElementById('three-container');
    const hud3D = document.getElementById('hud-3d-toolbar');
    const btn2D = document.getElementById('btn-view-2d');
    const btn3D = document.getElementById('btn-view-3d');

    if (mode === '2d') {
      mapElem.style.display = 'block';
      threeElem.style.display = 'none';
      if (hud3D) hud3D.style.display = 'none';
      if (btn2D) btn2D.classList.add('active');
      if (btn3D) btn3D.classList.remove('active');
      if (this.engineGIS) this.engineGIS.invalidateSize();
    } else {
      mapElem.style.display = 'none';
      threeElem.style.display = 'block';
      if (hud3D) hud3D.style.display = 'flex';
      if (btn2D) btn2D.classList.remove('active');
      if (btn3D) btn3D.classList.add('active');
      if (this.engine3D) {
        if (!this.engine3D.isInitialized) {
          this.engine3D.init();
        }
        this.engine3D.loadTownData(this.currentTownData, this.riskResults);
        this.engine3D.onResize();
        if (this.selectedPipe) {
          this.engine3D.flyCameraToPipe(this.selectedPipe.id);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Pipeline Location Writing & 3D Digital Twin Navigation
  // --------------------------------------------------------------------------
  populateLocationPicker() {
    const picker = document.getElementById('map-location-picker');
    if (!picker || !this.currentTownData) return;

    const pipes = this.currentTownData.pipes || [];
    let html = `<option value="">📍 Choose Pipeline Corridor / City to Inspect (${pipes.length} Available)...</option>`;

    pipes.forEach(p => {
      const firstCoord = p.coords && p.coords[0] ? p.coords[0] : [0, 0];
      const operator = p.operator ? p.operator.split(' ')[0] : 'Grid';
      html += `<option value="${p.id}">📍 [${operator}] ${p.name} — (${firstCoord[0].toFixed(2)}°N, ${firstCoord[1].toFixed(2)}°E)</option>`;
    });

    picker.innerHTML = html;
  }

  onLocationPickerChange(pipeId) {
    if (!pipeId) return;
    const pipe = (this.currentTownData.pipes || []).find(p => p.id === pipeId);
    if (!pipe) return;

    this.selectPipe(pipeId);

    const firstCoord = pipe.coords && pipe.coords[0] ? pipe.coords[0] : [0, 0];

    // Fly 2D map to location
    if (this.engineGIS && this.engineGIS.map) {
      if (typeof this.engineGIS.map.flyTo === 'function') {
        this.engineGIS.map.flyTo([firstCoord[0], firstCoord[1]], 14);
      } else if (typeof this.engineGIS.map.setCenter === 'function') {
        this.engineGIS.map.setCenter({ lat: firstCoord[0], lng: firstCoord[1] });
        this.engineGIS.map.setZoom(14);
      }
    }

    // Move 3D camera to location if in 3D mode
    if (this.engine3D) {
      this.engine3D.flyCameraToPipe(pipeId);
    }
  }

  inspectCurrentLocationPipe() {
    if (this.selectedPipe) {
      this.selectPipe(this.selectedPipe.id);
    }
  }

  set3DCameraPreset(preset) {
    if (this.engine3D) {
      this.engine3D.setCameraPreset(preset);
    }
    ['iso', 'cross', 'top'].forEach(id => {
      const btn = document.getElementById(`btn-3d-${id}`);
      if (btn) btn.classList.remove('active');
    });
    const map = { iso: 'btn-3d-iso', cross_section: 'btn-3d-cross', top_down: 'btn-3d-top' };
    const activeBtn = document.getElementById(map[preset]);
    if (activeBtn) activeBtn.classList.add('active');
  }

  set3DGroundOpacity(val) {
    if (this.engine3D) {
      this.engine3D.setGroundOpacity(val);
    }
  }

  toggle3DAutoRotate() {
    if (this.engine3D) {
      const active = this.engine3D.toggleAutoRotate();
      const btn = document.getElementById('btn-3d-rotate');
      if (btn) {
        btn.classList.toggle('active', active);
        btn.textContent = active ? '🔄 Auto-Orbit: ON' : '🔄 Auto-Orbit';
      }
    }
  }

  toggle3DLabels() {
    if (this.engine3D) {
      const visible = this.engine3D.toggleLabels();
      const btn = document.getElementById('btn-3d-labels');
      if (btn) {
        btn.classList.toggle('active', visible);
        btn.textContent = visible ? '🏷️ 3D Labels: ON' : '🏷️ 3D Labels: OFF';
      }
    }
  }

  toggle3DColorMode() {
    if (this.engine3D) {
      const newMode = (this.engine3D.colorMode === 'utility') ? 'risk' : 'utility';
      this.engine3D.setColorMode(newMode);
      const btn = document.getElementById('btn-3d-colormode');
      if (btn) {
        btn.textContent = newMode === 'risk' ? '🎨 Colored: AI Failure Risk' : '🎨 Colored: Utility';
      }
    }
  }

  toggleUtilityFilter(primaryType) {
    let typesToToggle = [primaryType];
    if (primaryType === 'water_main') typesToToggle.push('water_distribution');

    const currentlyActive = this.utilityFilters[primaryType];
    const newState = !currentlyActive;

    typesToToggle.forEach(t => {
      this.utilityFilters[t] = newState;
      if (this.engineGIS) this.engineGIS.setLayerFilter(t, newState);
    });

    // Update button visual
    const btnMap = {
      gas_transmission: 'btn-toggle-gas',
      oil_petroleum: 'btn-toggle-oil',
      water_main: 'btn-toggle-water',
      sewer_gravity: 'btn-toggle-sewer',
      electric_11kv: 'btn-toggle-cable',
      telecom_fiber: 'btn-toggle-fiber'
    };
    const btnId = btnMap[primaryType] || `btn-toggle-${primaryType}`;
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.className = newState ? 'hud-btn active' : 'hud-btn off';
    }
  }

  setMapBase(baseType) {
    this.activeMapBase = baseType;

    ['sat', 'terr', 'dark'].forEach(b => {
      const btn = document.getElementById(`btn-base-${b}`);
      if (btn) btn.classList.remove('active');
    });

    if (baseType === 'hybrid') document.getElementById('btn-base-sat').classList.add('active');
    else if (baseType === 'terrain') document.getElementById('btn-base-terr').classList.add('active');
    else document.getElementById('btn-base-dark').classList.add('active');

    if (this.engineGIS) {
      if (typeof this.engineGIS.setMapType === 'function') {
        this.engineGIS.setMapType(baseType);
      } else if (typeof this.engineGIS.setBaseMap === 'function') {
        this.engineGIS.setBaseMap(baseType);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Pipe Selection & Inspector Panel
  // --------------------------------------------------------------------------
  selectPipe(pipeId) {
    const pipe = this.currentTownData.pipes.find(p => p.id === pipeId);
    if (!pipe) return;

    this.selectedPipe = pipe;
    const risk = this.riskResults.byPipeId[pipe.id] || { totalScore: 30, tier: 'low', factors: {}, primaryFactors: [] };
    const meta = UTILITY_METADATA[pipe.utilityType] || { label: 'Utility Conduit', authority: 'Municipal Corporation' };

    // Highlight on 2D and 3D
    if (this.engineGIS) this.engineGIS.selectPipe(pipeId);
    if (this.engine3D) this.engine3D.highlightPipe(pipeId);

    // Update Live Location Written Banner
    const banner = document.getElementById('map-active-location-banner');
    const titleElem = document.getElementById('loc-banner-title');
    const subElem = document.getElementById('loc-banner-sub');
    const firstCoord = pipe.coords && pipe.coords[0] ? pipe.coords[0] : [0, 0];

    if (banner && titleElem && subElem) {
      titleElem.textContent = `📍 ${pipe.name}`;
      subElem.innerHTML = `
        <strong>Coordinates:</strong> ${firstCoord[0].toFixed(4)}° N, ${firstCoord[1].toFixed(4)}° E &bull;
        <strong>Depth:</strong> ${pipe.depth_m}m subterranean &bull;
        <strong>Diameter:</strong> ${pipe.diameter_mm}mm &bull;
        <strong>Authority:</strong> ${pipe.operator || 'National Grid'} &bull;
        <span style="color:${risk.tier === 'high' ? '#e11d48' : '#059669'}; font-weight:800;">Risk: ${risk.totalScore}/100</span>
      `;
      banner.style.display = 'flex';
    }

    const picker = document.getElementById('map-location-picker');
    if (picker && picker.value !== pipeId) {
      picker.value = pipeId;
    }

    // Populate Slide-out Panel
    document.getElementById('panel-pipe-type').textContent = meta.label;
    document.getElementById('panel-pipe-type').style.color = meta.color;
    document.getElementById('panel-pipe-name').textContent = pipe.name;
    document.getElementById('panel-pipe-id').textContent = pipe.id;

    const scoreElem = document.getElementById('panel-risk-score');
    scoreElem.textContent = `${risk.totalScore}/100`;
    scoreElem.style.color = risk.hexColor;

    const badgeElem = document.getElementById('panel-risk-badge');
    badgeElem.className = risk.tierBadgeClass;
    badgeElem.textContent = `${risk.tier.toUpperCase()} RISK`;

    document.getElementById('panel-pipe-depth').textContent = `${pipe.depth_m} meters`;
    document.getElementById('panel-pipe-dia').textContent = `${pipe.diameter_mm} mm`;
    document.getElementById('panel-pipe-mat').textContent = pipe.material;
    document.getElementById('panel-pipe-year').textContent = `${pipe.install_year} (${2024 - pipe.install_year} yrs)`;
    document.getElementById('panel-pipe-slope').textContent = `${pipe.slope_deg}° Incline`;
    document.getElementById('panel-pipe-pres').textContent = pipe.operating_pressure_bar ? `${pipe.operating_pressure_bar} bar` : 'Atmospheric';

    document.getElementById('panel-pipe-source').textContent = pipe.data_source;
    document.getElementById('panel-pipe-status').textContent = pipe.verification_status;
    document.getElementById('panel-pipe-auth').textContent = meta.authority;
    document.getElementById('panel-pipe-directive').textContent = risk.inspectionRecommendation;

    // Trigger Hindsight Recall & Intelligence for this Asset
    this.renderHindsightForAsset(pipe);

    // Show Panel
    document.getElementById('map-pipe-panel').classList.add('open');
  }

  // --------------------------------------------------------------------------
  // HINDSIGHT HISTORICAL INTELLIGENCE (Retain, Recall, Reflect)
  // --------------------------------------------------------------------------
  renderHindsightForAsset(pipe) {
    if (!window.hindsightEngine || !pipe) return;

    // Set default retain date to today
    const dateInput = document.getElementById('retain-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    // Set reflection question customized to this corridor
    const reflectQ = document.getElementById('hindsight-reflect-question');
    if (reflectQ) {
      reflectQ.value = `What recurring issues are documented for ${pipe.name}, and what evidence supports that conclusion?`;
    }

    // Automatically trigger Recall for the opened asset (Core Operation: Recall)
    const searchInput = document.getElementById('hindsight-recall-query');
    if (searchInput) {
      searchInput.value = '';
    }

    this.runHindsightRecallSearch();
  }

  switchHindsightTab(tab) {
    this.activeHindsightTab = tab;
    ['recall', 'reflect', 'retain'].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const view = document.getElementById(`hindsight-view-${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
      if (view) view.style.display = (t === tab) ? 'flex' : 'none';
    });

    if (tab === 'recall') {
      this.runHindsightRecallSearch();
    } else if (tab === 'reflect') {
      this.runHindsightReflect();
    }
  }

  setHindsightRecallFilter(filter) {
    this.currentRecallFilter = filter;
    ['all', 'corrosion', 'repair', 'inspection'].forEach(f => {
      const chip = document.getElementById(`chip-filter-${f}`);
      if (chip) chip.classList.toggle('active', f === filter);
    });

    this.runHindsightRecallSearch();
  }

  runHindsightRecallSearch() {
    if (!window.hindsightEngine) return;

    const queryInput = document.getElementById('hindsight-recall-query');
    const query = queryInput ? queryInput.value.trim() : '';
    const assetId = this.selectedPipe ? this.selectedPipe.id : null;
    const filterType = this.currentRecallFilter === 'all' ? null : this.currentRecallFilter;

    // Execute Hindsight Recall Operation
    const memories = window.hindsightEngine.recall({
      assetId: assetId,
      query: query,
      recordType: filterType,
      limit: 25
    });

    this.renderRecallFeed(memories, assetId, query);
  }

  renderRecallFeed(memories, assetId, query) {
    const feed = document.getElementById('hindsight-recall-feed');
    if (!feed) return;

    if (memories.length === 0) {
      feed.innerHTML = `
        <div style="padding:16px; text-align:center; background:var(--bg-card-subtle); border:1px dashed var(--border-subtle); border-radius:8px; font-size:11px; color:var(--text-muted);">
          No historical memories matched "${query || (assetId ? `asset ${assetId}` : 'filter')}".
          <div style="margin-top:6px;">
            <button class="btn-drawer-action" style="font-size:10px; padding:4px 8px;" onclick="window.app.switchHindsightTab('retain')">
              + Retain New Record for ${assetId || 'this asset'}
            </button>
          </div>
        </div>
      `;
      return;
    }

    feed.innerHTML = memories.map(m => {
      const isPending = m.followUpStatus === 'pending';
      const statusColor = isPending ? '#d97706' : '#059669';
      const statusBg = isPending ? '#fef3c7' : '#ecfdf5';

      return `
        <div class="hindsight-memory-card">
          <div class="hindsight-card-top">
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="hindsight-id-badge">${m.recordId}</span>
              <span style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">${m.recordType}</span>
            </div>
            <span class="hindsight-date">${m.eventDate}</span>
          </div>

          <p class="hindsight-summary">${m.sanitizedSummary}</p>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              ${(m.findings || []).slice(0, 3).map(f => `
                <span style="font-size:9px; background:#f1f5f9; color:#475569; padding:1px 6px; border-radius:4px; font-weight:600;">${f}</span>
              `).join('')}
            </div>
            <span style="font-size:9px; font-weight:700; background:${statusBg}; color:${statusColor}; padding:1px 6px; border-radius:4px; border:1px solid ${isPending ? '#fde68a' : '#a7f3d0'};">
              Follow-up: ${m.followUpStatus.toUpperCase()}
            </span>
          </div>

          <div class="hindsight-card-footer">
            <span class="hindsight-source-tag" title="${m.sourceReference}">Ref: ${m.sourceReference}</span>
            <button class="btn-view-auth-db" onclick="window.app.openAuthoritativeModal('${m.recordId}')">
              Authoritative DB &rarr;
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  runHindsightReflect() {
    if (!window.hindsightEngine) return;

    const qInput = document.getElementById('hindsight-reflect-question');
    const question = qInput ? qInput.value.trim() : 'What recurring issues are documented for this corridor, and what evidence supports that conclusion?';
    const assetId = this.selectedPipe ? this.selectedPipe.id : null;
    const corridor = this.selectedPipe ? this.selectedPipe.zone : null;

    // Execute Hindsight Reflect Operation
    const reflection = window.hindsightEngine.reflect({
      assetId: assetId,
      corridor: corridor,
      question: question
    });

    this.renderReflectResults(reflection);
  }

  renderReflectResults(reflection) {
    const container = document.getElementById('hindsight-reflect-results');
    if (!container) return;

    const themesHtml = reflection.recurringThemes.length > 0 
      ? reflection.recurringThemes.map(t => `
          <div class="hindsight-theme-badge">
            <span>⚠️</span>
            <strong>${t.label}</strong>
            <span style="background:#ffffff; color:#065f46; border-radius:10px; padding:0 5px; font-size:9px;">${t.count} records</span>
          </div>
        `).join('')
      : '<span style="font-size:11px; color:var(--text-dim);">No recurring failures flagged</span>';

    const citationsHtml = reflection.evidenceChain.length > 0
      ? reflection.evidenceChain.map(c => `
          <span class="hindsight-citation-pill" onclick="window.app.openAuthoritativeModal('${c.recordId}')" title="${c.summary}">
            ${c.citation} (${c.date})
          </span>
        `).join('')
      : 'None';

    const guidanceHtml = reflection.actionableGuidance.map(g => `
      <li style="margin-bottom:4px; font-size:11px; color:var(--text-main); line-height:1.4;">${g}</li>
    `).join('');

    container.innerHTML = `
      <div class="hindsight-reflect-card">
        <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between; align-items:center;">
          <span>Target: <strong style="color:var(--text-main);">${reflection.target}</strong></span>
          <span style="font-size:10px; background:var(--accent-mint-subtle); color:var(--accent-mint); padding:2px 6px; border-radius:4px; font-weight:700;">
            ${reflection.recalledCount} records synthesized
          </span>
        </div>

        <div>
          <span style="font-size:10px; font-weight:800; color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:4px;">Recurring Patterns Identified:</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">${themesHtml}</div>
        </div>

        <div style="background:var(--bg-card-subtle); border:1px solid var(--border-subtle); border-radius:8px; padding:10px;">
          <span style="font-size:10px; font-weight:800; color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:4px;">Synthesized Evidence Narrative:</span>
          <p style="font-size:11px; color:var(--text-main); line-height:1.5; white-space:pre-line;">${reflection.synthesisNarrative}</p>
        </div>

        <div>
          <span style="font-size:10px; font-weight:800; color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:4px;">Supporting Evidence Citations:</span>
          <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">${citationsHtml}</div>
        </div>

        <div>
          <span style="font-size:10px; font-weight:800; color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:4px;">Decision Support Recommendations:</span>
          <ul style="padding-left:18px; margin:0;">${guidanceHtml}</ul>
        </div>

        <!-- MANDATORY COMPLIANCE GUARDRAIL NOTICE -->
        <div class="hindsight-compliance-box">
          <strong>Decision Support Notice:</strong> ${reflection.complianceGuardrail.replace('⚠️ DECISION SUPPORT NOTICE: ', '')}
        </div>
      </div>
    `;
  }

  submitHindsightRetain(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!window.hindsightEngine) return;

    const assetId = this.selectedPipe ? this.selectedPipe.id : 'P-104';
    const assetName = this.selectedPipe ? this.selectedPipe.name : 'Asset P-104 Corridor';
    const corridor = this.selectedPipe ? (this.selectedPipe.zone || 'National Corridor') : 'Hazira-Vijaipur Northern Corridor';

    const type = document.getElementById('retain-type').value;
    const date = document.getElementById('retain-date').value || new Date().toISOString().slice(0, 10);
    const findingsRaw = document.getElementById('retain-findings').value.trim();
    const actionsRaw = document.getElementById('retain-actions').value.trim();
    const followup = document.getElementById('retain-followup').value;
    const source = document.getElementById('retain-source').value.trim() || 'GAIL Inspection Log';
    const authNotes = document.getElementById('retain-auth-notes').value.trim();

    const findings = findingsRaw.split(',').map(s => s.trim()).filter(Boolean);

    // Execute Core Operation: RETAIN
    const newMemory = window.hindsightEngine.retain({
      assetId: assetId,
      assetName: assetName,
      corridor: corridor,
      recordType: type,
      eventDate: date,
      findings: findings,
      actionsTaken: actionsRaw,
      followUpStatus: followup,
      severity: findingsRaw.toLowerCase().includes('corrosion') ? 'high' : 'medium',
      sourceReference: source,
      authoritativeData: {
        rawNotes: authNotes,
        potholeVerified: true,
        recordedByOfficer: 'Field Inspector (TerraFlow Verified)'
      }
    });

    alert(`✅ Memory Retained to Hindsight!\n\nStable Record ID: [${newMemory.recordId}]\nSanitized Summary: "${newMemory.sanitizedSummary}"\n\nFull authoritative record stored in TerraFlow's database.`);

    // Switch to recall tab to see newly stored memory immediately
    this.switchHindsightTab('recall');
  }

  openAuthoritativeModal(recordId) {
    if (!window.hindsightEngine) return;
    const record = window.hindsightEngine.getAuthoritativeRecord(recordId);
    if (!record) {
      alert(`Authoritative record ${recordId} not found in database.`);
      return;
    }

    const modal = document.getElementById('authoritative-record-modal');
    const titleElem = document.getElementById('auth-modal-title');
    const bodyElem = document.getElementById('auth-modal-body');

    if (titleElem) titleElem.textContent = `Authoritative Database Record: ${record.recordId}`;

    const authData = record.authoritativeData || {};
    let dataRows = '';
    for (const [k, v] of Object.entries(authData)) {
      if (typeof v === 'object') continue;
      dataRows += `
        <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #edf4f0; font-size:11px;">
          <span style="color:var(--text-dim); text-transform:capitalize;">${k.replace(/([A-Z])/g, ' $1')}:</span>
          <strong style="color:var(--text-main);">${v}</strong>
        </div>
      `;
    }

    if (bodyElem) {
      bodyElem.innerHTML = `
        <div style="background:var(--accent-mint-subtle); border:1.5px solid var(--border-mint); border-radius:10px; padding:12px; margin-bottom:14px;">
          <div style="font-size:10px; font-weight:800; color:var(--accent-mint); text-transform:uppercase;">Sanitized Memory Index Summary</div>
          <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-top:3px;">${record.sanitizedSummary}</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <div style="background:var(--bg-card-subtle); padding:10px; border-radius:8px; border:1px solid var(--border-subtle);">
            <span style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">Asset Identifier:</span>
            <div style="font-size:14px; font-weight:800; color:var(--text-main);">${record.assetId}</div>
            <div style="font-size:11px; color:var(--text-muted);">${record.assetName || ''}</div>
          </div>
          <div style="background:var(--bg-card-subtle); padding:10px; border-radius:8px; border:1px solid var(--border-subtle);">
            <span style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">Source Citation:</span>
            <div style="font-size:12px; font-weight:700; color:#0284c7; margin-top:2px;">${record.sourceReference}</div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">Event Date: ${record.eventDate}</div>
          </div>
        </div>

        <div style="background:#ffffff; border:1px solid var(--border-subtle); border-radius:10px; padding:12px; margin-bottom:10px;">
          <span style="font-size:10px; font-weight:800; color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:6px;">Authoritative Technical Audit Data</span>
          ${dataRows || '<div style="font-size:11px; color:var(--text-muted);">Authoritative data stored in local database.</div>'}
        </div>
      `;
    }

    if (modal) modal.classList.add('open');
  }

  closeAuthoritativeModal() {
    const modal = document.getElementById('authoritative-record-modal');
    if (modal) modal.classList.remove('open');
  }

  closePipeDetailPanel() {
    document.getElementById('map-pipe-panel').classList.remove('open');
    this.selectedPipe = null;
    if (this.engine3D) this.engine3D.clearSelection();
  }

  // --------------------------------------------------------------------------
  // PAGE 3: Citizen Reports Feed
  // --------------------------------------------------------------------------
  renderReportsPage() {
    const container = document.getElementById('reports-cards-grid');
    if (!container) return;

    container.innerHTML = '';
    const reports = this.currentTownData.community_reports || [];

    if (reports.length === 0) {
      container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#64748b;">No citizen reports logged for this area.</div>`;
      return;
    }

    reports.forEach(rep => {
      const card = document.createElement('div');
      card.className = 'report-card';

      let sevClass = rep.severity === 'critical' ? 'badge-high' : rep.severity === 'high' ? 'badge-high' : 'badge-mod';
      let icon = rep.type === 'wet_patch' ? '💧' : rep.type === 'road_subsidence' ? '⚠️' : rep.type === 'low_pressure' ? '📉' : '⚡';

      card.innerHTML = `
        <div class="report-card-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">${icon}</span>
            <div>
              <div class="report-title-text">${rep.title}</div>
              <div style="font-size:11px; color:#94a3b8;">${rep.hindi_title || ''}</div>
            </div>
          </div>
          <span class="${sevClass}">${rep.severity.toUpperCase()}</span>
        </div>

        <div class="report-desc-box">
          "${rep.description}"
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#64748b; font-family:monospace;">
          <span>📍 Lat: ${rep.lat.toFixed(4)}, Lng: ${rep.lng.toFixed(4)}</span>
          <span style="color:#38bdf8; font-weight:bold;">${rep.status}</span>
        </div>

        <div style="font-size:11px; color:#94a3b8; border-top:1px solid rgba(51,65,85,0.4); padding-top:8px;">
          <strong>Action: </strong><em>${rep.action_required}</em>
        </div>
      `;

      container.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // PAGE 4: Records Table & Search
  // --------------------------------------------------------------------------
  renderRecordsTable() {
    const tbody = document.getElementById('records-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const pipes = this.currentTownData.pipes || [];
    const countElem = document.getElementById('records-count-text');
    if (countElem) countElem.textContent = pipes.length;

    const townElem = document.getElementById('records-town-name');
    if (townElem) townElem.textContent = this.currentTownData.name;

    pipes.forEach(pipe => {
      const risk = this.riskResults ? (this.riskResults.byPipeId[pipe.id] || { totalScore: 30, tier: 'low' }) : { totalScore: 30, tier: 'low' };
      const tr = document.createElement('tr');
      tr.id = `rec-row-${pipe.id}`;

      let riskBadge = risk.tier === 'high' ? 'badge-high' : risk.tier === 'medium' ? 'badge-mod' : 'badge-low';

      tr.innerHTML = `
        <td style="font-family:monospace; color:#38bdf8; font-weight:700;">${pipe.id}</td>
        <td><strong>${pipe.name}</strong></td>
        <td><span style="color:${UTILITY_METADATA[pipe.utilityType].color}; font-weight:600;">${UTILITY_METADATA[pipe.utilityType].label}</span></td>
        <td>${pipe.depth_m}m</td>
        <td>${pipe.diameter_mm}mm</td>
        <td>${pipe.material}</td>
        <td>${pipe.install_year} (${2024 - pipe.install_year} yrs)</td>
        <td><span class="${riskBadge}">${risk.totalScore}/100</span></td>
        <td><span style="font-size:11px; color:${pipe.verification_status.includes('Unverified')?'#f59e0b':'#10b981'};">${pipe.verification_status}</span></td>
        <td>
          <button style="background:#0284c7; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;" onclick="window.app.jumpToPipeOnMap('${pipe.id}')">
            View on Map →
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  filterRecordsTable() {
    const query = (document.getElementById('records-search').value || '').toLowerCase();
    const rows = document.querySelectorAll('#records-table-body tr');

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  jumpToPipeOnMap(pipeId) {
    this.switchPage('map');
    this.selectPipe(pipeId);
  }

  // --------------------------------------------------------------------------
  // Modals (Report Incident & Excavation Safe Dig)
  // --------------------------------------------------------------------------
  openCommunityReportModal() {
    if (window.authService && !window.authService.isAuthenticated()) {
      this.pendingAction = () => this.openCommunityReportModal();
      this.openAuthModal('signin');
      return;
    }
    const modal = document.getElementById('report-modal');
    modal.classList.add('open');

    if (this.currentTownData) {
      document.getElementById('rep-lat').value = this.currentTownData.center[0].toFixed(5);
      document.getElementById('rep-lng').value = this.currentTownData.center[1].toFixed(5);
    }
  }

  closeCommunityReportModal() {
    document.getElementById('report-modal').classList.remove('open');
  }

  submitCommunityReport() {
    const title = document.getElementById('rep-title').value || 'Citizen Anomaly Flag';
    const type = document.getElementById('rep-type').value;
    const severity = document.getElementById('rep-severity').value;
    const lat = parseFloat(document.getElementById('rep-lat').value);
    const lng = parseFloat(document.getElementById('rep-lng').value);
    const desc = document.getElementById('rep-desc').value;

    const newReport = {
      id: `REP-USR-${Date.now().toString().slice(-4)}`,
      title: title,
      hindi_title: type === 'wet_patch' ? 'सड़क पर पानी का रिसाव' : type === 'road_subsidence' ? 'सड़क धसना / गड्ढा' : 'जल दबाव समस्या',
      type: type,
      lat: lat,
      lng: lng,
      elevation: this.currentTownData.elevation,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      reported_by: 'Citizen / Field Inspector (Live Submission)',
      severity: severity,
      description: desc,
      status: 'Logged & AI Recalculated',
      action_required: 'Priority Ground Verification Scheduled',
      photo: 'assets/sample_photos/wet_patch_manali.svg'
    };

    this.currentTownData.community_reports.unshift(newReport);
    this.evaluateAndRender();
    this.closeCommunityReportModal();

    // Trigger Hindsight Retain Operation (Trigger: new incident)
    if (window.hindsightEngine) {
      const nearestPipe = (this.currentTownData.pipes && this.currentTownData.pipes[0]) ? this.currentTownData.pipes[0].id : 'P-104';
      try {
        window.hindsightEngine.retain({
          assetId: nearestPipe,
          assetName: `${this.currentTownData.name} Corridor Asset`,
          corridor: this.currentTownData.name,
          recordType: 'incident',
          eventDate: newReport.date.slice(0, 10),
          findings: [type.replace('_', ' '), title],
          actionsTaken: 'Priority Ground Verification Scheduled',
          followUpStatus: 'pending',
          severity: severity === 'critical' ? 'high' : severity,
          sourceReference: `TerraFlow Incident Dispatch #${newReport.id}`,
          authoritativeData: {
            lat: lat,
            lng: lng,
            fullDescription: desc,
            reportedBy: newReport.reported_by,
            dispatchId: newReport.id
          }
        });
      } catch (err) {
        console.warn('Hindsight Retain on report error:', err);
      }
    }

    // Dispatch Native Chrome / Desktop Push Notification
    if (window.notificationService) {
      window.notificationService.dispatchIncidentAlert({
        id: newReport.id,
        title: newReport.title,
        location: `${this.currentTownData.name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        severity: severity,
        description: desc,
        lat: lat,
        lng: lng
      });
    }

    alert(`✅ Ground Incident Logged & Dispatched!\n\nTerraFlow AI has recalculated vulnerability scores and sent real-time incident notifications to verified operators.`);
  }

  // --------------------------------------------------------------------------
  // Security Clearance & Authentication Gate Methods
  // --------------------------------------------------------------------------
  checkAuthenticationState() {
    // Keep auth modal closed on initial load so the public Dashboard is immediately visible
    const gateElem = document.getElementById('auth-security-gate');
    if (gateElem) gateElem.style.display = 'none';

    this.renderUserProfileHeader();
  }

  renderUserProfileHeader() {
    const user = window.authService ? window.authService.currentUser : null;
    const container = document.getElementById('user-profile-header');
    if (!container) return;

    if (!user) {
      container.innerHTML = `
        <div class="auth-nav-buttons">
          <button class="btn-nav-signin" onclick="window.app.openAuthModal('signin')">Sign In</button>
          <button class="btn-nav-register" onclick="window.app.openAuthModal('register')">Create Account</button>
        </div>
      `;
      return;
    }

    const initials = user.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    container.innerHTML = `
      <div class="user-profile-widget" title="${user.clearance}">
        <div class="user-avatar-initials">${initials}</div>
        <div class="user-details-mini">
          <span class="user-name-text">${user.fullName}</span>
          <span class="user-dept-text">${user.organization.split(' ')[0]} &bull; Verified</span>
        </div>
        <button class="btn-signout" onclick="window.app.logout()" title="Sign Out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    `;
  }

  openAuthModal(tab = 'signin') {
    const gateElem = document.getElementById('auth-security-gate');
    if (gateElem) gateElem.style.display = 'flex';
    this.switchAuthTab(tab);
  }

  closeAuthModal() {
    const gateElem = document.getElementById('auth-security-gate');
    if (gateElem) gateElem.style.display = 'none';
    this.pendingRedirectPage = null;
    this.pendingAction = null;
  }

  handleAuthSuccess() {
    const gateElem = document.getElementById('auth-security-gate');
    if (gateElem) gateElem.style.display = 'none';
    this.renderUserProfileHeader();

    if (window.notificationService) {
      window.notificationService.updateUIBadge();
      window.notificationService.requestPermission();
    }

    if (this.pendingRedirectPage) {
      const target = this.pendingRedirectPage;
      this.pendingRedirectPage = null;
      this.switchPage(target);
    } else if (this.pendingAction) {
      const action = this.pendingAction;
      this.pendingAction = null;
      action();
    }
  }

  switchAuthTab(tab) {
    const btnSignin = document.getElementById('tab-btn-signin');
    const btnRegister = document.getElementById('tab-btn-register');
    const formSignin = document.getElementById('auth-form-signin');
    const formRegister = document.getElementById('auth-form-register');

    if (tab === 'signin') {
      if (btnSignin) btnSignin.classList.add('active');
      if (btnRegister) btnRegister.classList.remove('active');
      if (formSignin) formSignin.style.display = 'block';
      if (formRegister) formRegister.style.display = 'none';
    } else {
      if (btnSignin) btnSignin.classList.remove('active');
      if (btnRegister) btnRegister.classList.add('active');
      if (formSignin) formSignin.style.display = 'none';
      if (formRegister) formRegister.style.display = 'block';
      this.goToRegStep(1);
    }
  }

  goToRegStep(stepNum) {
    for (let i = 1; i <= 5; i++) {
      const stepElem = document.getElementById(`reg-step-${i}`);
      const nodeElem = document.getElementById(`wizard-node-${i}`);
      if (stepElem) stepElem.style.display = (i === stepNum) ? 'block' : 'none';
      if (nodeElem) {
        if (i === stepNum) {
          nodeElem.className = 'wizard-step-node active';
        } else if (i < stepNum) {
          nodeElem.className = 'wizard-step-node completed';
        } else {
          nodeElem.className = 'wizard-step-node';
        }
      }
    }
    window.authService.activeRegistration.step = stepNum;
  }

  async sendRegOtp() {
    const email = document.getElementById('reg-email').value.trim();
    const mobile = document.getElementById('reg-mobile').value.trim();

    if (!email || !email.includes('@')) {
      alert('Please enter a valid official email address.');
      return;
    }
    if (!mobile || mobile.length < 10) {
      alert('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    window.authService.activeRegistration.data.email = email;
    window.authService.activeRegistration.data.mobile = mobile;

    const btn = document.getElementById('btn-send-otp');
    if (btn) btn.innerText = 'Dispatching OTP...';

    await window.authService.sendVerificationOtp(email, mobile);
    if (btn) btn.innerText = 'Generate & Dispatch Real OTP →';

    const dispMobile = document.getElementById('otp-disp-mobile');
    const dispEmail = document.getElementById('otp-disp-email');
    if (dispMobile) dispMobile.innerText = `+91 ${mobile}`;
    if (dispEmail) dispEmail.innerText = email;

    this.goToRegStep(3);
  }

  verifyRegOtp() {
    const code = document.getElementById('reg-otp-combined').value.trim();
    const result = window.authService.verifyOtp(code);
    if (!result.success) {
      alert(result.message);
      return;
    }
    this.goToRegStep(4);
  }

  finalizeRegistration() {
    const pwd = document.getElementById('reg-password').value;
    const pwdConfirm = document.getElementById('reg-password-confirm').value;
    const pin = document.getElementById('reg-pin').value;

    if (!pwd || pwd.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    if (pwd !== pwdConfirm) {
      alert('Passwords do not match.');
      return;
    }
    if (!pin || pin.length !== 4) {
      alert('Please enter a 4-digit Security Clearance PIN.');
      return;
    }

    window.authService.activeRegistration.data.password = pwd;
    window.authService.activeRegistration.data.pin = pin;

    const user = window.authService.finalizeRegistration();

    // Populate Step 5 clearance card
    const certName = document.getElementById('cert-user-name');
    const certOrg = document.getElementById('cert-user-org');
    const certId = document.getElementById('cert-user-id');
    const certClear = document.getElementById('cert-user-clearance');

    if (certName) certName.innerText = user.fullName;
    if (certOrg) certOrg.innerText = user.organization;
    if (certId) certId.innerText = user.idNumber;
    if (certClear) certClear.innerText = user.clearance;

    this.goToRegStep(5);
  }

  unlockPlatformAfterRegistration() {
    this.handleAuthSuccess();
  }

  submitLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const idInput = document.getElementById('login-id').value.trim();
    const pwdInput = document.getElementById('login-pwd').value;

    const res = window.authService.login(idInput, pwdInput);
    if (!res.success) {
      alert(res.message);
      return;
    }

    this.handleAuthSuccess();
  }

  demoQuickLogin(role) {
    if (role === 'admin') {
      window.authService.login('admin@terraflow.gov.in', 'Password@123');
    } else {
      window.authService.login('priya.narayanan@jalshakti.gov.in', 'Password@123');
    }
    this.handleAuthSuccess();
  }

  logout() {
    window.authService.logout();
  }

  openDigSafetyModal() {
    if (window.authService && !window.authService.isAuthenticated()) {
      this.pendingAction = () => this.openDigSafetyModal();
      this.openAuthModal('signin');
      return;
    }
    document.getElementById('dig-modal').classList.add('open');
    const lat = this.selectedPipe ? this.selectedPipe.coords[0][0] : this.currentTownData.center[0];
    const lng = this.selectedPipe ? this.selectedPipe.coords[0][1] : this.currentTownData.center[1];

    document.getElementById('dig-lat').value = lat.toFixed(5);
    document.getElementById('dig-lng').value = lng.toFixed(5);
    this.runExcavationCheckAt(lat, lng);
  }

  closeDigSafetyModal() {
    document.getElementById('dig-modal').classList.remove('open');
  }

  recalcDigCheck() {
    const lat = parseFloat(document.getElementById('dig-lat').value);
    const lng = parseFloat(document.getElementById('dig-lng').value);
    this.runExcavationCheckAt(lat, lng);
  }

  runExcavationCheckAt(lat, lng) {
    const radiusM = parseFloat(document.getElementById('dig-radius').value || 40);
    const depthM = parseFloat(document.getElementById('dig-depth').value || 1.8);
    const title = document.getElementById('dig-project-title').value || 'Road Trenching Works';

    const result = this.digSafetyEngine.evaluateExcavationSite(
      {
        centerLat: lat,
        centerLng: lng,
        radiusM: radiusM,
        targetDepthM: depthM,
        projectTitle: title,
        contractorName: 'PWD Road Contractor'
      },
      this.currentTownData.pipes,
      this.riskResults,
      this.currentTownData.emergency_contacts
    );

    this.renderDigCheckResults(result);
    if (this.engineGIS) this.engineGIS.setExcavationMarker(lat, lng, radiusM);
  }

  renderDigCheckResults(res) {
    const container = document.getElementById('dig-results-body');
    if (!container) return;

    let bannerBadge = res.protocolStatus === 'HIGH_RISK_VERIFY_FIRST' ? 'badge-high' :
                      res.protocolStatus === 'CLEAR' ? 'badge-low' : 'badge-mod';

    let html = `
      <div style="background:var(--bg-card-subtle); border:1.5px solid var(--border-mint); padding:12px; border-radius:10px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span class="${bannerBadge}">${res.protocolStatus.replace(/_/g, ' ')}</span>
          <span style="font-size:11px; color:#94a3b8;">Max Risk: <strong style="color:#ef4444;">${res.highestRiskScore}/100</strong></span>
        </div>
        <p style="font-size:12px; color:var(--text-main); font-weight:700; margin-top:4px;">${res.summaryHeadline}</p>
        <p style="font-size:11px; color:var(--accent-mint); font-weight:700; margin-top:2px;">${res.permitRecommendation}</p>
      </div>

      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-dim); margin-bottom:6px;">
        Subsurface Utilities in Perimeter (${res.intersectingUtilities.length})
      </div>
    `;

    if (res.intersectingUtilities.length === 0) {
      html += `<p style="font-size:12px; color:#10b981;">No active utilities detected within ${res.excavationRadiusM}m.</p>`;
    } else {
      res.intersectingUtilities.forEach(u => {
        html += `
          <div style="background:var(--bg-card); border:1.5px solid var(--border-subtle); border-left:3.5px solid ${u.depthConflict ? '#e11d48' : '#059669'}; padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:11px;">
            <div style="display:flex; justify-content:space-between;">
              <strong style="color:var(--text-main);">${u.name}</strong>
              <span style="color:#f59e0b;">Depth: ${u.depthM}m (Conflict: ${u.depthConflict ? 'YES' : 'No'})</span>
            </div>
            <div style="color:#64748b; margin-top:2px;">
              ${u.pipeId} | Material: ${u.material} | Risk: ${u.riskScore}/100
            </div>
            <div style="color:var(--accent-mint); font-weight:600; margin-top:2px;">
              Department: <strong>${u.authority}</strong>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  showReportDetails(report) {
    alert(`📍 Ground Incident: ${report.title}\n\n• Date: ${report.date}\n• Severity: ${report.severity.toUpperCase()}\n• Description: "${report.description}"\n• Action: ${report.action_required}`);
  }

  // --------------------------------------------------------------------------
  // Event Bindings
  // --------------------------------------------------------------------------
  bindEvents() {
    const townSelect = document.getElementById('town-select');
    if (townSelect) {
      townSelect.addEventListener('change', (e) => {
        this.loadTown(e.target.value);
      });
    }
  }
}

// Global Launcher
window.addEventListener('DOMContentLoaded', () => {
  window.app = new TerraFlowApp();
  window.app.init();
});
