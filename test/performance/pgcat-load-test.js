/**
 * ============================================================================
 * READ-HEAVY CRUD LOAD TEST
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
const iterationDuration = new Trend('crud_iteration_duration');
const iterationErrors = new Rate('crud_iteration_errors');
const activeVusMetric = new Trend('crud_active_vus');
const optimisticLockConflicts = new Rate('optimistic_lock_conflicts');

// ============================================================================
// LOAD CONFIG
// ============================================================================
export const options = {
  stages: [
    { duration: '5m', target: 500 },
    { duration: '10m', target: 500 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    checks: ['rate>0.95'],
    crud_iteration_errors: ['rate<0.05'],
    optimistic_lock_conflicts: ['rate>0'],
  },
};

// ============================================================================
// MAIN TEST
// ============================================================================
export default function () {
  const start = Date.now();
  activeVusMetric.add(exec.instance.vusActive);

  let planId = null;
  let failed = false;

  try {
    // ============================================================
    // 1. CREATE (20%)
    // ============================================================
    const payload = generateTravelPlan();
    const created = createTravelPlan(payload);

    check(created, { 'created OK': (p) => p && p.id });
    if (!created) throw new Error('Create failed');

    planId = created.id;
    thinkTime(0.1, 0.3);

    // ============================================================
    // 2. MULTI-READ BLOCK (5–7 reads)
    // ============================================================
    for (let i = 0; i < 6; i++) {
      const fresh = getTravelPlan(planId);

      check(fresh, {
        [`read ${i} OK`]: (p) => p && p.version >= 1,
      });

      if (!fresh) throw new Error(`Read ${i} failed`);
      thinkTime(0.1, 0.2);
    }

    // Забираємо версію для оновлень
    const freshLatest = getTravelPlan(planId);
    const version = freshLatest.version;

    thinkTime(0.1, 0.3);

    // ============================================================
    // 3. LIGHT UPDATE (10%)
    // ============================================================
    const updatePayload = generateTravelPlanUpdate(version);
    const updated = updateTravelPlanSuccess(planId, updatePayload);

    check(updated, {
      'update succeeded (200)': (u) => u && u.version === version + 1,
    });

    const newVersion = updated.version;
    thinkTime(0.1, 0.2);

    // ============================================================
    // 4. EXTRA READS AFTER UPDATE (3 reads)
    // ============================================================
    for (let i = 0; i < 3; i++) {
      const after = getTravelPlan(planId);

      check(after, {
        [`post-update read ${i} OK`]: (p) => p && p.version === newVersion,
      });

      thinkTime(0.1, 0.2);
    }

    // ============================================================
    // 5. CONFLICT UPDATE (409)
    // ============================================================
    const conflictPayload = generateTravelPlanUpdate(version);
    const conflict = updateTravelPlanConflict(planId, conflictPayload);

    optimisticLockConflicts.add(conflict === true);

    check(conflict, {
      'conflict OK (409)': (c) => c === true,
    });

    thinkTime(0.1, 0.2);


    // ============================================================
    // 6. DELETE
    // ============================================================
    const deleted = deleteTravelPlan(planId);

    check(deleted, {
      'deleted OK (204)': (d) => d === true,
    });

    thinkTime(0.1, 0.2);

    // ============================================================
    // 7. VERIFY DELETE (404)
    // ============================================================
    const gone = verifyPlanDeleted(planId);

    check(gone, {
      'verify deleted OK (404)': (v) => v === true,
    });

  } catch (err) {
    failed = true;
    console.error('READ-HEAVY iteration error:', err.message);
  }

  iterationErrors.add(failed ? 1 : 0);
  iterationDuration.add(Date.now() - start);
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
