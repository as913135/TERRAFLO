/**
 * TerraFlow - Hindsight Historical Intelligence Engine
 * Provides three central operations: Retain, Recall, and Reflect.
 * 
 * 1. RETAIN — Record what happened (Trigger: new incident, inspection, repair, or verified outcome).
 *    Stores a sanitized summary with a stable record ID and source reference, keeping the full
 *    authoritative record in TerraFlow's database.
 * 
 * 2. RECALL — Find relevant history (Trigger: user opens an asset or searches for a historical problem).
 *    Multi-strategy retrieval over relevant stored facts, matching concepts described in different
 *    words or connected to a time period.
 * 
 * 3. REFLECT — Synthesize historical evidence (Trigger: operator asks a question requiring several historical records).
 *    Synthesizes relevant memories and returns supporting references.
 *    COMPLIANCE GUARDRAIL: Treats the result strictly as decision support, NOT proof that an asset is currently safe or unsafe.
 */

class TerraFlowHindsightEngine {
  constructor() {
    this.storageKey = 'terraflow_hindsight_memories';
    this.authoritativeDbKey = 'terraflow_hindsight_authoritative_db';
    this.memories = [];
    this.authoritativeDb = {};

    // Semantic dictionary for multi-strategy concept expansion
    this.conceptGraph = {
      corrosion: [
        'corrosion', 'corroded', 'rust', 'pitting', 'wall loss', 'metal loss', 
        'wall thinning', 'oxidation', 'metal degradation', 'cathodic disbondment', 
        'coating failure', 'external pitting', 'internal loss', 'anode decay'
      ],
      repair: [
        'repair', 'repaired', 'sleeve', 'composite wrap', 'patch', 'clamp', 
        'welded sleeve', 'replacement', 'rehabilitation', 'joint reinforcement', 
        'mending', 're-sealed', 'serviced', 're-laid'
      ],
      inspection: [
        'inspection', 'inspected', 'pig', 'smart pig', 'mfl', 'ultrasonic', 
        'gauge', 'pothole', 'ground truthing', 'visual audit', 'ndt', 
        'acoustic survey', 'caliper survey', 'cctv scan'
      ],
      leak: [
        'leak', 'burst', 'seepage', 'rupture', 'pinhole', 'wet patch', 
        'pressure drop', 'water bubbling', 'escaping gas', 'hydrocarbon odor', 
        'fissure', 'crack'
      ],
      subsidence: [
        'subsidence', 'dhasna', 'sinkhole', 'soil creep', 'slope shear', 
        'road collapse', 'ground settlement', 'landslide', 'excavation strike'
      ]
    };

    this.initDatabase();
  }

  /**
   * Initializes Hindsight memory index & authoritative database.
   * Pre-seeds authentic baseline records including the benchmark asset P-104.
   */
  initDatabase() {
    let savedMemories = null;
    let savedDb = null;

    try {
      savedMemories = JSON.parse(localStorage.getItem(this.storageKey));
      savedDb = JSON.parse(localStorage.getItem(this.authoritativeDbKey));
    } catch (e) {
      savedMemories = null;
    }

    if (savedMemories && Array.isArray(savedMemories) && savedMemories.length > 0) {
      this.memories = savedMemories;
      this.authoritativeDb = savedDb || {};
    } else {
      this.seedDefaultHistoricalRecords();
    }

    // Also attempt background sync with backend server if available
    this.syncWithBackend();
  }

  seedDefaultHistoricalRecords() {
    this.memories = [];
    this.authoritativeDb = {};

    const seeds = [
      // 1. BENCHMARK ASSET P-104 (GAIL Northern Corridor Feeder)
      {
        recordId: 'INS-204',
        assetId: 'P-104',
        assetName: 'Asset P-104 — Hazira-Vijaipur Northern Feed Corridor',
        corridor: 'Hazira-Vijaipur Northern Corridor',
        recordType: 'inspection',
        eventDate: '2024-10-12',
        sanitizedSummary: 'Inspection INS-204, on 12 October, confirmed corrosion at asset P-104. Repair completed on 15 October; follow-up inspection is pending.',
        findings: ['corrosion', 'wall thinning 14%', 'external localized pitting'],
        actionsTaken: 'Composite sleeve wrap installed on 15 October; seal coating reapplied.',
        followUpStatus: 'pending',
        severity: 'medium',
        sourceReference: 'GAIL Technical Inspection Report INS-204 (In-Line MFL PIG Run)',
        authoritativeData: {
          inspectorName: 'Er. Vikramaditya Singh, Lead Integrity Inspector',
          stationSector: 'Vadodara-Indore Section KM 84.2',
          soilCondition: 'Moist alluvial scree with seasonal runoff',
          cathodicVoltageMv: -780,
          defectDepthMm: 1.25,
          pipeNominalWallMm: 9.52,
          notes: 'MFL high-resolution tool flagged 14% wall loss at 6 oclock invert. Surface grit blasted, composite carbon-wrap sleeve cured at ambient temperature. Follow-up ultrasonic re-scan scheduled for Q1 2025.'
        }
      },
      {
        recordId: 'REP-104',
        assetId: 'P-104',
        assetName: 'Asset P-104 — Hazira-Vijaipur Northern Feed Corridor',
        corridor: 'Hazira-Vijaipur Northern Corridor',
        recordType: 'repair',
        eventDate: '2023-08-20',
        sanitizedSummary: 'Repair REP-104, on 20 August 2023, reinforced circumferential weld with welded split sleeve following micro-fissure detection at asset P-104.',
        findings: ['weld micro-fissure', 'slope joint shear stress'],
        actionsTaken: 'Welded Type-B pressure-containing sleeve installed and radiographed.',
        followUpStatus: 'completed',
        severity: 'high',
        sourceReference: 'Central Maintenance Repair Work Order #REP-104',
        authoritativeData: {
          contractor: 'GAIL Field Engineering Group',
          weldRadiographyReport: 'RT-2023-882-PASS',
          hydrostaticTestPressureBar: 104.0,
          notes: 'Circumferential stress relief performed. Coating restored with high-density polyurethane wrap.'
        }
      },
      {
        recordId: 'INS-178',
        assetId: 'P-104',
        assetName: 'Asset P-104 — Hazira-Vijaipur Northern Feed Corridor',
        corridor: 'Hazira-Vijaipur Northern Corridor',
        recordType: 'inspection',
        eventDate: '2023-02-14',
        sanitizedSummary: 'Inspection INS-178, on 14 February 2023, flagged cathodic protection disbondment and early corrosion initiation at asset P-104 invert.',
        findings: ['coating disbondment', 'early stage corrosion', 'soil moisture pooling'],
        actionsTaken: 'Sacrificial zinc anode bed replenished; localized recoating completed.',
        followUpStatus: 'completed',
        severity: 'low',
        sourceReference: 'Cathodic Protection Annual Field Survey #INS-178',
        authoritativeData: {
          inspectorName: 'Cathodic Systems Engineer S. Murthy',
          soilResistivityOhmM: 18.5,
          notes: 'Groundwater saturation after winter rain caused localized polarization drop. Zinc ribbon anode augmented.'
        }
      },

      // 2. GAIL HAZIRA-VIJAIPUR-JAGDISHPUR (HVJ-001 / HVJ-002)
      {
        recordId: 'INS-GAIL-202',
        assetId: 'IND-GAS-HVJ-001',
        assetName: 'GAIL Hazira-Vijaipur-Jagdishpur (HVJ) Gas Trunk (Hazira to Vijaipur)',
        corridor: 'Western Petrochemical & National Energy Corridor',
        recordType: 'inspection',
        eventDate: '2024-06-18',
        sanitizedSummary: 'Inspection INS-GAIL-202 confirmed superficial soil-induced oxidation near Ankleshwar river crossing at asset IND-GAS-HVJ-001. Monitored; wall loss within tolerance.',
        findings: ['superficial oxidation', 'river scour proximity'],
        actionsTaken: 'Erosion control rip-rap boulders placed along bank; continuous cathodic logging enabled.',
        followUpStatus: 'monitoring',
        severity: 'low',
        sourceReference: 'GAIL SCADA & River Crossing Integrity Audit #202',
        authoritativeData: {
          surveyType: 'Direct Current Voltage Gradient (DCVG)',
          riverCrossingDepthM: 3.8
        }
      },
      {
        recordId: 'REP-GAIL-044',
        assetId: 'IND-GAS-HVJ-001',
        assetName: 'GAIL Hazira-Vijaipur-Jagdishpur (HVJ) Gas Trunk (Hazira to Vijaipur)',
        corridor: 'Western Petrochemical & National Energy Corridor',
        recordType: 'repair',
        eventDate: '2023-11-12',
        sanitizedSummary: 'Repair REP-GAIL-044 replaced high-pressure isolation valve actuator and calibrated telemetry at Vadodara Compressor Station for asset IND-GAS-HVJ-001.',
        findings: ['actuator seal weep', 'calibration drift'],
        actionsTaken: 'Class 600 emergency shut-down ball valve rebuilt with hydrogen-rated seals.',
        followUpStatus: 'completed',
        severity: 'medium',
        sourceReference: 'Vadodara Compressor Station Overhaul Log #044',
        authoritativeData: {
          workPermit: 'GAIL-VAD-PTW-2023-9912',
          testedPressureBar: 88.0
        }
      },

      // 3. IOCL SALAYA-MATHURA PIPELINE (SMPL-005)
      {
        recordId: 'INS-IOCL-341',
        assetId: 'IND-OIL-SMPL-005',
        assetName: 'IOCL Salaya-Mathura Crude Oil Pipeline (SMPL)',
        corridor: 'Salaya-Viramgam-Mathura Crude Corridor',
        recordType: 'inspection',
        eventDate: '2024-03-05',
        sanitizedSummary: 'Inspection INS-IOCL-341 detected mechanical dent and surface gouge caused by unauthorized farm trenching near Viramgam at asset IND-OIL-SMPL-005. Type-A structural sleeve fitted.',
        findings: ['third party dent', 'mechanical gouge', 'unauthorized excavation'],
        actionsTaken: 'Reinforcing steel sleeve welded; pipeline ROW markers re-installed.',
        followUpStatus: 'completed',
        severity: 'high',
        sourceReference: 'IOCL Pipelines Division Line Patrol Incident Report #341',
        authoritativeData: {
          dentDepthPct: 4.2,
          patrolOfficer: 'Inspector Harish Patel, Viramgam Base'
        }
      },

      // 4. DELHI JAL BOARD (DJB-008)
      {
        recordId: 'REP-DJB-088',
        assetId: 'IND-WTR-DJB-008',
        assetName: 'Delhi Jal Board Sonia Vihar & Ring Road Bulk Water Transmission',
        corridor: 'Delhi NCR Subsurface Corridor',
        recordType: 'repair',
        eventDate: '2024-07-22',
        sanitizedSummary: 'Repair REP-DJB-088 sealed high-volume gasket flange leak and replaced corroded high-tensile bolts under Kashmere Gate Ring Road for asset IND-WTR-DJB-008.',
        findings: ['flange gasket failure', 'bolt galvanic corrosion', 'subsurface wet patch'],
        actionsTaken: 'EPDM drinking-water grade gasket installed; heavy zinc-plated fasteners torqued to spec.',
        followUpStatus: 'completed',
        severity: 'high',
        sourceReference: 'Delhi Jal Board Central Maintenance Division Work Ticket #088',
        authoritativeData: {
          waterLossRateLpm: 1800,
          trafficDiversionDurationHours: 6
        }
      },

      // 5. MANALI MALL ROAD POTABLE MAIN (MNL-WTR-001)
      {
        recordId: 'INS-MNL-019',
        assetId: 'MNL-WTR-001',
        assetName: 'Mall Road Potable Feeder Main',
        corridor: 'Manali Mall Road Commercial Corridor',
        recordType: 'inspection',
        eventDate: '2023-09-10',
        sanitizedSummary: 'Inspection INS-MNL-019 confirmed joint displacement and lead-wool packing washout due to heavy monsoon road subsidence near Mall Road bus stand for asset MNL-WTR-001.',
        findings: ['joint displacement', 'packing washout', 'road subsidence', 'dhasna'],
        actionsTaken: 'Mechanical flexible joint clamp fitted; backfilled with crushed basalt scree.',
        followUpStatus: 'completed',
        severity: 'high',
        sourceReference: 'Jal Shakti Vibhag (Kullu Division) Monsoon Emergency Log #019',
        authoritativeData: {
          jointDeflectionDeg: 4.5,
          excavationDepthM: 1.4
        }
      }
    ];

    seeds.forEach(s => {
      this.memories.push({
        recordId: s.recordId,
        assetId: s.assetId,
        assetName: s.assetName,
        corridor: s.corridor,
        recordType: s.recordType,
        eventDate: s.eventDate,
        sanitizedSummary: s.sanitizedSummary,
        findings: s.findings,
        actionsTaken: s.actionsTaken,
        followUpStatus: s.followUpStatus,
        severity: s.severity,
        sourceReference: s.sourceReference,
        loggedAt: s.eventDate + 'T10:00:00Z'
      });

      this.authoritativeDb[s.recordId] = {
        recordId: s.recordId,
        assetId: s.assetId,
        assetName: s.assetName,
        corridor: s.corridor,
        recordType: s.recordType,
        eventDate: s.eventDate,
        sanitizedSummary: s.sanitizedSummary,
        sourceReference: s.sourceReference,
        authoritativeData: s.authoritativeData || {}
      };
    });

    this.persist();
  }

  persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.memories));
      localStorage.setItem(this.authoritativeDbKey, JSON.stringify(this.authoritativeDb));
    } catch (e) {
      console.warn('[Hindsight] LocalStorage persist notice:', e);
    }
  }

  async syncWithBackend() {
    try {
      const resp = await fetch('/api/hindsight/records');
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.memories) && data.memories.length > 0) {
          // Merge remote memories
          data.memories.forEach(rm => {
            if (!this.memories.find(m => m.recordId === rm.recordId)) {
              this.memories.unshift(rm);
            }
          });
          if (data.authoritativeDb) {
            this.authoritativeDb = { ...this.authoritativeDb, ...data.authoritativeDb };
          }
          this.persist();
        }
      }
    } catch (e) {
      // Backend sync optional in standalone/offline mode
    }
  }

  // ==========================================================================
  // OPERATION 1: RETAIN — Record what happened
  // ==========================================================================
  /**
   * Retain: extracts, sanitizes, assigns stable record ID, stores memory summary,
   * and preserves the full authoritative record in TerraFlow's database.
   * 
   * Trigger: a new incident, inspection, repair, or verified outcome.
   * Example: "Inspection INS-204, on 12 October, confirmed corrosion at asset P-104.
   *           Repair completed on 15 October; follow-up inspection is pending."
   * 
   * @param {Object} input - Event parameters
   * @returns {Object} Newly retained memory item
   */
  retain({
    assetId,
    assetName = '',
    corridor = '',
    recordType = 'inspection', // 'inspection' | 'repair' | 'incident' | 'verification' | 'monitoring'
    eventDate = null,
    findings = [],
    actionsTaken = '',
    followUpStatus = 'completed', // 'completed' | 'pending' | 'scheduled' | 'monitoring'
    severity = 'medium',
    sourceReference = 'Operator Field Submission',
    authoritativeData = {},
    customSummary = null
  }) {
    if (!assetId) {
      throw new Error('Hindsight Retain requires a valid assetId (e.g. P-104)');
    }

    const dateStr = eventDate || new Date().toISOString().slice(0, 10);
    const dateFormatted = this.formatDateReadable(dateStr);

    // Generate stable record ID if not provided (e.g. INS-205, REP-105, INC-301)
    const typePrefix = recordType.slice(0, 3).toUpperCase();
    const existingCount = this.memories.filter(m => m.recordType === recordType).length;
    const stableRecordId = `${typePrefix}-${Date.now().toString().slice(-4)}`;

    // Build or sanitize summary
    let sanitizedSummary = customSummary;
    if (!sanitizedSummary) {
      const typeCap = recordType.charAt(0).toUpperCase() + recordType.slice(1);
      const findingsStr = Array.isArray(findings) && findings.length > 0 
        ? findings.join(', ') 
        : 'operational anomaly';
      
      const actionsStr = actionsTaken 
        ? `Repair/Action: ${actionsTaken}` 
        : 'Remediation completed';

      sanitizedSummary = `${typeCap} ${stableRecordId}, on ${dateFormatted}, confirmed ${findingsStr} at asset ${assetId}. ${actionsStr}; follow-up inspection is ${followUpStatus}.`;
    }

    // Normalized memory item
    const memoryItem = {
      recordId: stableRecordId,
      assetId: assetId,
      assetName: assetName || `Asset ${assetId}`,
      corridor: corridor || 'National Pipeline Corridor',
      recordType: recordType,
      eventDate: dateStr,
      sanitizedSummary: sanitizedSummary,
      findings: Array.isArray(findings) ? findings : [findings],
      actionsTaken: actionsTaken,
      followUpStatus: followUpStatus,
      severity: severity,
      sourceReference: sourceReference,
      loggedAt: new Date().toISOString()
    };

    // Store in memory index
    this.memories.unshift(memoryItem);

    // Keep full authoritative record in database
    this.authoritativeDb[stableRecordId] = {
      recordId: stableRecordId,
      assetId: assetId,
      assetName: memoryItem.assetName,
      corridor: memoryItem.corridor,
      recordType: recordType,
      eventDate: dateStr,
      sanitizedSummary: sanitizedSummary,
      sourceReference: sourceReference,
      authoritativeData: {
        ...authoritativeData,
        retainedAt: new Date().toISOString(),
        retainedBy: 'TerraFlow Verified System',
        findingsRaw: findings,
        actionsRaw: actionsTaken
      }
    };

    this.persist();

    // Async sync with Python backend
    fetch('/api/hindsight/retain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memory: memoryItem,
        authoritativeRecord: this.authoritativeDb[stableRecordId]
      })
    }).catch(() => {});

    // Notify listeners
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('terraflow:hindsight:retained', { detail: memoryItem }));
      } catch (e) {}
    }

    console.log(`[Hindsight Retain] Stable Memory Created [${stableRecordId}]: "${sanitizedSummary}"`);
    return memoryItem;
  }

  // ==========================================================================
  // OPERATION 2: RECALL — Find relevant history
  // ==========================================================================
  /**
   * Recall: multi-strategy retrieval over stored memories.
   * Matches exact asset identifiers, corridor groupings, time periods,
   * and concept synonyms (e.g. matching "rust" to "corrosion", "sleeve" to "repair").
   * 
   * Trigger: a user opens an asset or searches for a historical problem.
   * Example: "Show previous corrosion findings and repairs for asset P-104."
   * 
   * @param {Object} criteria - Search and filter parameters
   * @returns {Array} Ranked list of recalled memory items with similarity scores
   */
  recall({
    assetId = null,
    query = '',
    corridor = null,
    recordType = null,
    timeRange = 'all', // '30d' | '1y' | '5y' | 'all'
    limit = 20
  } = {}) {
    let results = [...this.memories];

    // 1. Asset Filter (exact or substring, case-insensitive)
    if (assetId) {
      const cleanAsset = assetId.trim().toUpperCase();
      results = results.filter(m => m.assetId.toUpperCase().includes(cleanAsset));
    }

    // 2. Corridor Filter
    if (corridor) {
      const cleanCorridor = corridor.trim().toLowerCase();
      results = results.filter(m => m.corridor.toLowerCase().includes(cleanCorridor));
    }

    // 3. Record Type Filter
    if (recordType && recordType !== 'all') {
      results = results.filter(m => m.recordType === recordType);
    }

    // 4. Temporal / Time-Period Filtering
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      let cutoffDays = 36500; // all
      if (timeRange === '30d') cutoffDays = 30;
      else if (timeRange === '1y') cutoffDays = 365;
      else if (timeRange === '5y') cutoffDays = 1825;

      const cutoffTime = now.getTime() - (cutoffDays * 24 * 60 * 60 * 1000);
      results = results.filter(m => {
        const eventTime = new Date(m.eventDate).getTime();
        return eventTime >= cutoffTime;
      });
    }

    // 5. Multi-Strategy Semantic & Concept-Graph Retrieval on Query
    if (query && query.trim().length > 0) {
      const queryLower = query.toLowerCase();
      const queryTokens = queryLower.split(/\W+/).filter(t => t.length > 2);

      // Expand query tokens with semantic synonyms
      const expandedConcepts = new Set(queryTokens);
      queryTokens.forEach(token => {
        for (const [key, synList] of Object.entries(this.conceptGraph)) {
          if (synList.some(s => s.includes(token) || token.includes(s))) {
            synList.forEach(syn => expandedConcepts.add(syn));
          }
        }
      });

      // Score and rank each memory
      const scoredResults = results.map(item => {
        let score = 0;
        const textToSearch = [
          item.sanitizedSummary,
          item.assetId,
          item.assetName,
          item.sourceReference,
          item.recordId,
          item.recordType,
          item.actionsTaken,
          ...(item.findings || [])
        ].join(' ').toLowerCase();

        // Check token and synonym matches
        expandedConcepts.forEach(concept => {
          if (textToSearch.includes(concept)) {
            score += concept.length > 4 ? 3 : 1.5;
          }
        });

        // Exact query phrase bonus
        if (textToSearch.includes(queryLower)) {
          score += 10;
        }

        // Exact asset match bonus
        if (assetId && item.assetId.toLowerCase() === assetId.toLowerCase()) {
          score += 5;
        }

        // Recency bonus (more recent events slightly boosted)
        const ageYears = (Date.now() - new Date(item.eventDate).getTime()) / (365 * 24 * 3600 * 1000);
        score += Math.max(0, 3 - ageYears * 0.5);

        return { ...item, recallRelevanceScore: Number(score.toFixed(2)) };
      });

      // Filter non-relevant items and sort by score descending
      results = scoredResults
        .filter(item => item.recallRelevanceScore > 0)
        .sort((a, b) => b.recallRelevanceScore - a.recallRelevanceScore);
    } else {
      // Default: sort chronologically descending (newest first)
      results.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
    }

    return results.slice(0, limit);
  }

  // ==========================================================================
  // OPERATION 3: REFLECT — Synthesize historical evidence
  // ==========================================================================
  /**
   * Reflect: synthesizes historical evidence across recalled memories.
   * Analyzes recurring problems, establishes supporting evidence chains with citations,
   * and provides actionable decision-support guidance.
   * 
   * Trigger: an operator asks a question requiring several historical records.
   * Example: "What recurring issues are documented for this corridor, and what evidence supports that conclusion?"
   * 
   * COMPLIANCE REQUIREMENT: Treat the result as decision support, not proof that an asset is currently unsafe or safe.
   * 
   * @param {Object} params - Target asset, corridor, and question prompt
   * @returns {Object} Structured reflection with citations, recurring patterns, and decision support
   */
  reflect({
    assetId = null,
    corridor = null,
    question = 'What recurring issues are documented for this corridor, and what evidence supports that conclusion?',
    timeRange = 'all'
  } = {}) {
    // 1. Gather relevant memories via broad Recall
    const recalledMemories = this.recall({
      assetId: assetId,
      corridor: corridor,
      timeRange: timeRange,
      limit: 50
    });

    const targetLabel = assetId 
      ? `Asset ${assetId}` 
      : corridor 
        ? `Corridor "${corridor}"` 
        : 'Selected Infrastructure Corridor';

    if (recalledMemories.length === 0) {
      return {
        question: question,
        target: targetLabel,
        recalledCount: 0,
        recurringThemes: [],
        synthesisNarrative: `No historical records were found matching ${targetLabel}. There are no documented past incidents, inspections, or repairs on file for this specific identifier.`,
        evidenceChain: [],
        actionableGuidance: [
          'Perform baseline non-destructive ultrasonic wall thickness scan.',
          'Verify cathodic protection potential and soil resistivity.',
          'Log initial baseline inspection via Hindsight Retain.'
        ],
        complianceGuardrail: '⚠️ DECISION SUPPORT NOTICE: Absence of historical records does not prove an asset is currently safe. Physical field verification and non-destructive potholing remain mandatory prior to ground breaking.'
      };
    }

    // 2. Synthesize Recurring Issues & Patterns
    const issueCounts = {
      corrosion: { count: 0, label: 'Corrosion & Wall Thinning', recordIds: [], severity: 'medium' },
      repairs: { count: 0, label: 'Sleeve & Flange Repairs', recordIds: [], severity: 'medium' },
      leaks: { count: 0, label: 'Flange Seepage & Gasket Leaks', recordIds: [], severity: 'high' },
      subsidence: { count: 0, label: 'Slope Shear & Ground Subsidence', recordIds: [], severity: 'high' },
      thirdParty: { count: 0, label: 'Third-Party Mechanical Damage', recordIds: [], severity: 'high' }
    };

    const pendingFollowUps = [];

    recalledMemories.forEach(m => {
      const text = (m.sanitizedSummary + ' ' + (m.findings || []).join(' ')).toLowerCase();
      
      if (this.conceptGraph.corrosion.some(w => text.includes(w))) {
        issueCounts.corrosion.count++;
        issueCounts.corrosion.recordIds.push(m.recordId);
      }
      if (this.conceptGraph.repair.some(w => text.includes(w))) {
        issueCounts.repairs.count++;
        issueCounts.repairs.recordIds.push(m.recordId);
      }
      if (this.conceptGraph.leak.some(w => text.includes(w))) {
        issueCounts.leaks.count++;
        issueCounts.leaks.recordIds.push(m.recordId);
      }
      if (this.conceptGraph.subsidence.some(w => text.includes(w))) {
        issueCounts.subsidence.count++;
        issueCounts.subsidence.recordIds.push(m.recordId);
      }
      if (text.includes('third party') || text.includes('unauthorized') || text.includes('excavation strike') || text.includes('gouge')) {
        issueCounts.thirdParty.count++;
        issueCounts.thirdParty.recordIds.push(m.recordId);
      }

      if (m.followUpStatus === 'pending' || m.followUpStatus === 'scheduled') {
        pendingFollowUps.push({
          recordId: m.recordId,
          eventDate: m.eventDate,
          summary: m.sanitizedSummary
        });
      }
    });

    // Formulate recurring themes
    const recurringThemes = Object.values(issueCounts)
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    // 3. Build Evidence Chain Citations
    const evidenceChain = recalledMemories.map(m => ({
      citation: `[${m.recordId}]`,
      recordId: m.recordId,
      date: m.eventDate,
      summary: m.sanitizedSummary,
      source: m.sourceReference,
      status: m.followUpStatus
    }));

    // 4. Formulate Evidence-Based Synthesis Narrative
    let narrative = `Analysis of ${recalledMemories.length} historical record(s) for ${targetLabel} demonstrates clear recurring patterns:\n\n`;

    if (issueCounts.corrosion.count > 0) {
      narrative += `• Corrosion Vulnerability: Documented in ${issueCounts.corrosion.count} historical record(s) ${issueCounts.corrosion.recordIds.map(id => `[${id}]`).join(', ')}. Findings indicate localized external pitting and wall thinning associated with saturated soil contact and cathodic polarization variance.\n`;
    }

    if (issueCounts.repairs.count > 0) {
      narrative += `• Structural Interventions: Historical records cite ${issueCounts.repairs.count} structural repair(s) ${issueCounts.repairs.recordIds.map(id => `[${id}]`).join(', ')}, predominantly utilizing reinforced composite wraps and welded pressure-containing sleeves.\n`;
    }

    if (issueCounts.subsidence.count > 0 || issueCounts.leaks.count > 0) {
      narrative += `• Ground & Seepage Incidents: Evidence documents ground movement and joint stress events, notably where terrain slope or heavy monsoon saturation creates shear loading.\n`;
    }

    if (pendingFollowUps.length > 0) {
      narrative += `\n⚠️ Critical Pending Action: ${pendingFollowUps.length} follow-up inspection(s) remain actively PENDING, specifically referenced in ${pendingFollowUps.map(p => `[${p.recordId}]`).join(', ')}.\n`;
    }

    // 5. Actionable Guidance for Decision Support
    const actionableGuidance = [];
    if (pendingFollowUps.length > 0) {
      actionableGuidance.push(`Execute pending follow-up inspection cited in ${pendingFollowUps.map(p => `[${p.recordId}]`).join(', ')} before clearing new excavation.`);
    }
    if (issueCounts.corrosion.count >= 2) {
      actionableGuidance.push(`Prioritize In-Line Inspection (MFL PIG) or direct ultrasonic thickness gauging across joint sectors.`);
      actionableGuidance.push(`Audit cathodic protection test stations and replenish sacrificial zinc anode beds.`);
    }
    if (issueCounts.subsidence.count > 0) {
      actionableGuidance.push(`Verify geotechnical slope stability and inspect for joint creep deflection.`);
    }
    actionableGuidance.push(`Conduct non-destructive vacuum potholing to physically confirm pipe wall integrity prior to mechanical digging.`);

    // 6. Return Synthesis Object with Mandatory Compliance Guardrail
    return {
      question: question,
      target: targetLabel,
      recalledCount: recalledMemories.length,
      recurringThemes: recurringThemes,
      synthesisNarrative: narrative,
      evidenceChain: evidenceChain,
      actionableGuidance: actionableGuidance,
      pendingFollowUps: pendingFollowUps,
      complianceGuardrail: '⚠️ DECISION SUPPORT NOTICE: Hindsight reflection synthesizes historical evidence from stored memories. It provides operational decision support and does NOT prove that an asset is currently safe or unsafe. Mandatory non-destructive potholing and physical field verification are required before excavation or maintenance.'
    };
  }

  // ==========================================================================
  // Helper & Database Inspection Methods
  // ==========================================================================
  getAuthoritativeRecord(recordId) {
    return this.authoritativeDb[recordId] || null;
  }

  formatDateReadable(isoDateStr) {
    try {
      const d = new Date(isoDateStr);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return isoDateStr;
    }
  }

  getAllRecords() {
    return [...this.memories];
  }
}

// Global Singleton
if (typeof window !== 'undefined') {
  window.hindsightEngine = new TerraFlowHindsightEngine();
}
