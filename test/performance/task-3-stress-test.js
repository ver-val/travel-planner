/**
 * ============================================================================
 * STRESS CRUD TEST (Final Professional Version)
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
const activeVusMetric = new Trend('stress_active_vus');
const iterationErrors = new Rate('stress_iteration_errors');
const iterationDuration = new Trend('stress_iteration_duration');
const optimisticLockConflicts = new Rate('optimistic_lock_conflicts');
const stressLatencyBreakpoint = new Gauge('stress_latency_breakpoint');

// ============================================================================
// STRESS SCENARIO CONFIG
// ============================================================================
export const options = {
  tags: { test_type: 'stress' },

  stages: [
    { duration: '1m', target: 200 },
    { duration: '1m', target: 400 },
    { duration: '1m', target: 600 },
    { duration: '1m', target: 800 },
    { duration: '1m', target: 1000 },
    { duration: '1m', target: 1200 }, 
    { duration: '1m', target: 1500 }, 
    { duration: '5m', target: 0 }, // recovery
  ],

  thresholds: {
    ...DEFAULT_THRESHOLDS,
    checks: ['rate>0.90'],                  
    'stress_iteration_errors': ['rate<0.10'],
    'stress_latency_breakpoint': ['value<1'],
    'optimistic_lock_conflicts': ['rate>0'],
  },
};

// ============================================================================
// STRESS CRUD SCENARIO
// ============================================================================
export default function () {
  const start = Date.now();
  activeVusMetric.add(exec.instance.vusActive);

  let planId = null;
  let iterationFailed = false;

  try {
    // -----------------------------------------------------------
    // 1. CREATE (WRITE)
    // -----------------------------------------------------------
    const created = createTravelPlan(generateTravelPlan());
    check(created, { 'created OK (201)': (p) => p && p.id }) || (iterationFailed = true);
    if (!created) return;

    planId = created.id;

    thinkTime(0.05, 0.1);

    // -----------------------------------------------------------
    // 2. GET (READ)
    // -----------------------------------------------------------
    const fresh = getTravelPlan(planId);
    check(fresh, { 'retrieved OK (200)': (p) => p && p.version >= 1 }) || (iterationFailed = true);
    if (!fresh) return;

    const version = fresh.version;

    thinkTime(0.05, 0.1);

    // -----------------------------------------------------------
    // 3. UPDATE SUCCESS (WRITE 200)
    // -----------------------------------------------------------
    const updated = updateTravelPlanSuccess(
      planId,
      generateTravelPlanUpdate(version)
    );

    check(updated, {
      'update OK (200)': (u) => u && u.version === version + 1,
    }) || (iterationFailed = true);

    const newVersion = updated.version;

    thinkTime(0.03, 0.08);

    // -----------------------------------------------------------
    // 4. UPDATE CONFLICT (WRITE 409 — expected)
    // -----------------------------------------------------------
    const conflict = updateTravelPlanConflict(
      planId,
      generateTravelPlanUpdate(version)
    );

    optimisticLockConflicts.add(conflict === true);

    check(conflict, {
      'conflict OK (409)': (c) => c === true,
    });

    thinkTime(0.03, 0.08);

    // -----------------------------------------------------------
    // 5. DELETE (WRITE)
    // -----------------------------------------------------------
    const deleted = deleteTravelPlan(planId);
    check(deleted, { 'deleted OK (204)': (v) => v === true }) || (iterationFailed = true);

    thinkTime(0.03, 0.08);

    // -----------------------------------------------------------
    // 6. VERIFY DELETE (READ After Delete)
    // -----------------------------------------------------------
    const gone = verifyPlanDeleted(planId);
    check(gone, { 'verify deleted OK (404)': (v) => v === true }) || (iterationFailed = true);

  } catch (err) {
    iterationFailed = true;
    console.error('STRESS CRUD ERROR:', err.message);
  }

  // breakpoint: latency > 3000ms is considered a failure point
  const latency = Date.now() - start;
  stressLatencyBreakpoint.add(latency > 3000 ? 1 : 0);

  iterationErrors.add(iterationFailed ? 1 : 0);
  iterationDuration.add(latency);

  sleep(0.05);
}

// ============================================================================
// SUMMARY
// ============================================================================
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
