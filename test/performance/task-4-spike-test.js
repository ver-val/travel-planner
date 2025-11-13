/**
 * ============================================================================
 * SPIKE TEST
 * ============================================================================
 */

import { sleep, check } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate } from 'k6/metrics';
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
const iterationDuration = new Trend('spike_iteration_duration');
const iterationErrors = new Rate('spike_iteration_errors');
const activeVusMetric = new Trend('spike_active_vus');
const optimisticLockConflicts = new Rate('optimistic_lock_conflicts');

// ============================================================================
// SPIKE CONFIG
// ============================================================================
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '2m', target: 2000 },
    { duration: '1m', target: 0 },
  ],

  thresholds: {
    ...DEFAULT_THRESHOLDS,

    // spike allows for a higher percentage of errors
    'checks': ['rate>0.85'],

    // total errors per iteration
    'spike_iteration_errors': ['rate<0.20'],

    // lock conflicts
    'optimistic_lock_conflicts': ['rate>0'],

    // spike response time
    'spike_iteration_duration': ['p(95)<8000'],
  },
};

// ============================================================================
// MAIN SPIKE SCENARIO
// ============================================================================
export default function () {
  const start = Date.now();
  activeVusMetric.add(exec.instance.vusActive);

  let planId = null;
  let failed = false;

  try {
    // ============================================================
    // 1. CREATE
    // ============================================================
    const created = createTravelPlan(generateTravelPlan());

    check(created, { 'created OK': (p) => p && p.id }) || (failed = true);
    if (!created) throw new Error('Create failed');

    planId = created.id;
    thinkTime(0.05, 0.2);

    // ============================================================
    // 2. GET
    // ============================================================
    const fresh = getTravelPlan(planId);
    check(fresh, { 'retrieved OK': (p) => p && p.version >= 1 }) || (failed = true);
    if (!fresh) throw new Error('Get failed');

    const version = fresh.version;
    thinkTime(0.05, 0.2);

    // ============================================================
    // 3. SUCCESS UPDATE (200)
    // ============================================================
    const updatePayload = generateTravelPlanUpdate(version);
    const updated = updateTravelPlanSuccess(planId, updatePayload);

    check(updated, {
      'update succeeded (200)': (u) => u && u.version === version + 1,
    }) || (failed = true);

    const newVersion = updated.version;
    thinkTime(0.05, 0.15);

    // ============================================================
    // 4. EXPECTED CONFLICT (409)
    // ============================================================
    const conflict = updateTravelPlanConflict(planId, updatePayload);

    optimisticLockConflicts.add(conflict === true);

    check(conflict, {
      'conflict OK (409)': (c) => c === true,
    });

    thinkTime(0.05, 0.15);

    // ============================================================
    // 5. DELETE
    // ============================================================
    const deleted = deleteTravelPlan(planId);
    check(deleted, { 'deleted OK (204)': (d) => d === true }) || (failed = true);

    thinkTime(0.05, 0.15);

    // ============================================================
    // 6. VERIFY DELETE
    // ============================================================
    const gone = verifyPlanDeleted(planId);
    check(gone, { 'verify deleted OK (404)': (v) => v === true }) || (failed = true);

  } catch (err) {
    failed = true;
    console.error('SPIKE ERROR:', err.message);
  }

  iterationErrors.add(failed ? 1 : 0);
  iterationDuration.add(Date.now() - start);
  sleep(0.1);
}

// ============================================================================
// SUMMARY
// ============================================================================
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
