/**
 * WorkComposer RBAC - Shadow Diagnostics Collector
 * 
 * Non-blocking, in-memory telemetry buffer and metrics aggregator
 * for observing policy divergences in Phase 3B.
 */

import { EventEmitter } from 'events';
import { DIVERGENCE_TYPES, SHADOW_SEVERITY } from './policyTypes.js';

export class ShadowCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxBufferSize = options.maxBufferSize || 1000;
    this.buffer = [];
    this.stats = {
      totalEvaluated: 0,
      matches: 0,
      divergences: {
        total: 0,
        shadowDenyAuthAllow: 0,
        shadowAllowAuthDeny: 0,
        shadowError: 0,
      },
      conflictStatesObserved: {},
      highRiskEvents: [],
    };
  }

  /**
   * Records a diagnostic comparison.
   *
   * @param {Object} diagnostic
   * @returns {Object} Recorded diagnostic
   */
  record(diagnostic) {
    if (!diagnostic || typeof diagnostic !== 'object') {
      return null;
    }

    const frozenDiag = Object.isFrozen(diagnostic)
      ? diagnostic
      : Object.freeze({ ...diagnostic });

    this.stats.totalEvaluated += 1;

    // Track conflict states seen in incoming traffic
    const cState = frozenDiag.effectiveContext?.conflictState || 'UNKNOWN';
    this.stats.conflictStatesObserved[cState] =
      (this.stats.conflictStatesObserved[cState] || 0) + 1;

    if (frozenDiag.comparison?.divergence === DIVERGENCE_TYPES.MATCH) {
      this.stats.matches += 1;
    } else {
      this.stats.divergences.total += 1;

      if (frozenDiag.comparison?.divergence === DIVERGENCE_TYPES.SHADOW_DENY_AUTH_ALLOW) {
        this.stats.divergences.shadowDenyAuthAllow += 1;
      } else if (frozenDiag.comparison?.divergence === DIVERGENCE_TYPES.SHADOW_ALLOW_AUTH_DENY) {
        this.stats.divergences.shadowAllowAuthDeny += 1;
      } else if (frozenDiag.comparison?.divergence === DIVERGENCE_TYPES.SHADOW_ERROR) {
        this.stats.divergences.shadowError += 1;
      }

      // Track high/critical risk events (e.g. privilege leaks where legacy allowed but shadow denied)
      if (
        frozenDiag.comparison?.severity === SHADOW_SEVERITY.HIGH ||
        frozenDiag.comparison?.severity === SHADOW_SEVERITY.CRITICAL
      ) {
        this.stats.highRiskEvents.push(frozenDiag);
        if (this.stats.highRiskEvents.length > 200) {
          this.stats.highRiskEvents.shift();
        }
        this.emit('high-risk', frozenDiag);
      }

      this.emit('divergence', frozenDiag);
    }

    // Add to circular buffer
    this.buffer.push(frozenDiag);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    this.emit('diagnostic', frozenDiag);
    return frozenDiag;
  }

  /**
   * Queries recorded diagnostics with optional filtering and pagination.
   */
  getDiagnostics(options = {}) {
    const {
      divergence = null,
      severity = null,
      userId = null,
      route = null,
      limit = 100,
      offset = 0,
    } = options;

    let items = this.buffer;

    if (divergence) {
      items = items.filter(d => d.comparison?.divergence === divergence);
    }
    if (severity) {
      items = items.filter(d => d.comparison?.severity === severity);
    }
    if (userId) {
      items = items.filter(d => d.principal?.userId === userId);
    }
    if (route) {
      items = items.filter(d => d.route === route || d.path?.includes(route));
    }

    return items.slice(offset, offset + limit);
  }

  /**
   * Computes high-level telemetry and divergence summary.
   */
  getSummary() {
    const total = this.stats.totalEvaluated;
    const matchRate = total > 0 ? (this.stats.matches / total) * 100 : 100;
    const divergenceRate = total > 0 ? (this.stats.divergences.total / total) * 100 : 0;

    return {
      totalEvaluated: total,
      matches: this.stats.matches,
      matchRatePercent: Number(matchRate.toFixed(2)),
      divergences: {
        ...this.stats.divergences,
        divergenceRatePercent: Number(divergenceRate.toFixed(2)),
      },
      conflictStatesObserved: { ...this.stats.conflictStatesObserved },
      highRiskCount: this.stats.highRiskEvents.length,
      bufferSize: this.buffer.length,
      maxBufferSize: this.maxBufferSize,
    };
  }

  /**
   * Clears the buffer and resets statistics (for testing).
   */
  clear() {
    this.buffer = [];
    this.stats = {
      totalEvaluated: 0,
      matches: 0,
      divergences: {
        total: 0,
        shadowDenyAuthAllow: 0,
        shadowAllowAuthDeny: 0,
        shadowError: 0,
      },
      conflictStatesObserved: {},
      highRiskEvents: [],
    };
  }
}

// Global default collector instance for app runtime
export const defaultShadowCollector = new ShadowCollector();
