/**
 * ============================================================================
 * ENDURANCE (SOAK) CRUD TEST — 30 minutes
 * ============================================================================
 */

import { sleep, check } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate, Gauge } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

import {
  createTravelPlan,
  getTravelPlan,
  updateTravelPlanSuccess,
  updateTravelPlanConflict,
  deleteTravelPlan,
  verifyPlanDeleted,
  thinkTime,
} from './utils/api-client.js';

import {
  generateTravelPlan,
  generateTravelPlanUpdate,
} from './utils/data-generator.js';

import { DEFAULT_THRESHOLDS } from './config/endpoints.js';

// ============================================================================
// METRICS
// ============================================================================

// average time of each iteration
const soakIterationDuration = new Trend('soak_iteration_duration');

// was there an error on iteration
const soakIterationErrors = new Rate('soak_iteration_errors');

// degradation mark: latency > 2000ms
const soakLatencyBreakpoint = new Gauge('soak_latency_breakpoint');

// number of active VUs (to catch balancing)
const soakActiveVus = new Trend('soak_active_vus');

// ============================================================================
// CONFIG
// ============================================================================
export const options = {
  tags: { test_type: 'soak' },

  stages: [
    { duration: '2m', target: 100 },
    { duration: '30m', target: 100 },
    { duration: '2m', target: 0 },
  ],

  thresholds: {
    ...DEFAULT_THRESHOLDS,

    // Soak-specific expected behavior:
    'soak_iteration_errors': ['rate<0.02'],     //  <2% errors in 30 minutes — normal
    'soak_latency_breakpoint': ['value<1'],     // should not exceed 1 (latency does not decrease)
    'checks': ['rate>0.95'],                    // API behavior stability
  }
};

// ============================================================================
// MAIN SOAK TEST SCENARIO
// ============================================================================
export default function () {
  const start = Date.now();
  soakActiveVus.add(exec.instance.vusActive);

  let planId = null;
  let failed = false;

  try {
    // -----------------------------------------------------------
    // 1. CREATE
    // -----------------------------------------------------------
    const created = createTravelPlan(generateTravelPlan());
    check(created, { 'created OK (201)': (v) => v && v.id }) || (failed = true);
    if (!created) return;
    planId = created.id;

    thinkTime(0.2, 0.5);

    // -----------------------------------------------------------
    // 2. GET
    // -----------------------------------------------------------
    const fresh = getTravelPlan(planId);
    check(fresh, { 'retrieved OK (200)': (v) => v && v.id }) || (failed = true);
    if (!fresh) return;
    const version = fresh.version;

    thinkTime(0.2, 0.5);

    // -----------------------------------------------------------
    // 3. UPDATE (SUCCESS)
    // -----------------------------------------------------------
    const updated = updateTravelPlanSuccess(
      planId,
      generateTravelPlanUpdate(version)
    );

    check(updated, { 'update OK (200)': (u) => u && u.version === version + 1 }) || (failed = true);

    thinkTime(0.2, 0.5);

    // -----------------------------------------------------------
    // 4. UPDATE (EXPECTED CONFLICT)
    // -----------------------------------------------------------
    const conflict = updateTravelPlanConflict(
      planId,
      generateTravelPlanUpdate(version)
    );

    check(conflict, { 'conflict OK (409)': (c) => c === true });

    thinkTime(0.2, 0.5);

    // -----------------------------------------------------------
    // 5. DELETE
    // -----------------------------------------------------------
    const deleted = deleteTravelPlan(planId);
    check(deleted, { 'deleted OK (204)': (d) => d === true }) || (failed = true);

    thinkTime(0.2, 0.5);

    // -----------------------------------------------------------
    // 6. VERIFY DELETE
    // -----------------------------------------------------------
    const gone = verifyPlanDeleted(planId);
    check(gone, { 'verify deleted OK (404)': (v) => v === true }) || (failed = true);

  } catch (e) {
    failed = true;
    console.error('SOAK ERROR:', e.message);
  }

  const latency = Date.now() - start;

  soakIterationDuration.add(latency);
  soakIterationErrors.add(failed ? 1 : 0);

  // Degradation = latency > 2 seconds
  soakLatencyBreakpoint.add(latency > 2000 ? 1 : 0);

  sleep(0.2);
}

// ============================================================================
// SUMMARY
// ============================================================================
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
