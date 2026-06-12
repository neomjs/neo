import {resolveAction, validateBatch} from '../../../src/vdom/util/DeltaGrammar.mjs';

const ACTIVE_TAPS = new Map(),
      DEFAULT_EPOCH = 'default',
      TAP_CONFIGS = {
          applyDeltas: {
              layer: 'main-pre-apply',
              getTarget() {
                  return globalThis.Neo
              },
              method: 'applyDeltas',
              wrap(capture, original) {
                  return function(windowId, deltas, ...args) {
                      capture.record(deltas, {windowId});
                      return original.call(this, windowId, deltas, ...args)
                  }
              }
          },
          helperReturn: {
              layer: 'vdom-pre-send',
              getTarget() {
                  return globalThis.Neo?.vdom?.Helper
              },
              method: 'update',
              wrap(capture, original) {
                  return function(...args) {
                      const result = original.apply(this, args);

                      if (result?.deltas) {
                          capture.record(result.deltas)
                      }

                      return result
                  }
              }
          }
      };

function assertLabel(label) {
    if (typeof label !== 'string' || label.length === 0) {
        throw new Error('DeltaCapture epoch labels must be non-empty strings')
    }
}

function getTapConfig(tap) {
    const config = TAP_CONFIGS[tap];

    if (!config) {
        throw new Error(`Unknown DeltaCapture tap "${tap}"`)
    }

    return config
}

function normalizeDeltas(deltas) {
    return Array.isArray(deltas) ? deltas.slice() : [deltas]
}

/**
 * Captures Neo's VDOM delta stream through one explicit test seam.
 *
 * @summary Creates a scoped test facade for recording and classifying VDOM delta batches.
 *
 * Migration map:
 * - Direct `Neo.applyDeltas` monkey-patches use `tap: 'applyDeltas'` for final app-worker boundary batches.
 * - Direct `VdomHelper.update()` return assertions use `tap: 'helperReturn'` for diff-engine intent batches.
 * - Component method return checks can wrap the update that produces the return and inspect the same epoch.
 * - Console-log delta harvesting should move to an explicit tap; log output is format-coupled and lossy.
 *
 * The captured record names its tap, layer, and windowId because the VDom pre-send stream is
 * attribution/intent, while the Main pre-apply stream is final batch truth. Batch boundaries are
 * preserved by default: the batch is the unit validated by `DeltaGrammar.validateBatch()`.
 * Taps without a window seam store `windowId: null` explicitly, keeping the record shape stable.
 *
 * Use `try/finally` or `test.afterEach()` to call `restore()` whenever a test installs a capture.
 *
 * @param {Object} opts
 * @param {'applyDeltas'|'helperReturn'} opts.tap The seam to wrap
 * @returns {Object} capture facade
 */
export function createDeltaCapture({tap} = {}) {
    const config = getTapConfig(tap),
          target = config.getTarget();

    if (!target || typeof target[config.method] !== 'function') {
        throw new Error(`DeltaCapture tap "${tap}" is unavailable; load the target seam before installing`)
    }

    if (ACTIVE_TAPS.has(tap)) {
        throw new Error(`DeltaCapture tap "${tap}" is already installed`)
    }

    let activeEpoch = DEFAULT_EPOCH,
        restored = false;

    const original = target[config.method],
          records = [],
          capture = {
              get activeEpoch() {
                  return activeEpoch
              },

              get records() {
                  return records.slice()
              },

              epoch(label) {
                  assertLabel(label);
                  activeEpoch = label;
                  return this
              },

              async window(label, fn) {
                  assertLabel(label);

                  if (typeof fn !== 'function') {
                      throw new Error('DeltaCapture.window() requires a callback function')
                  }

                  const previousEpoch = activeEpoch;

                  activeEpoch = label;

                  try {
                      return await fn()
                  } finally {
                      activeEpoch = previousEpoch
                  }
              },

              record(deltas, meta = {}) {
                  if (restored) {
                      return
                  }

                  records.push({
                      deltas  : normalizeDeltas(deltas),
                      epoch   : activeEpoch,
                      layer   : config.layer,
                      tap,
                      windowId: meta.windowId ?? null
                  })
              },

              recordsIn(label = activeEpoch) {
                  assertLabel(label);
                  return records.filter(record => record.epoch === label)
              },

              deltasIn(label = activeEpoch) {
                  return this.recordsIn(label).map(record => record.deltas.slice())
              },

              flatDeltasIn(label = activeEpoch) {
                  return this.deltasIn(label).flat()
              },

              opsIn(label = activeEpoch) {
                  return this.flatDeltasIn(label).reduce((counts, delta) => {
                      const action = resolveAction(delta);

                      counts[action] = (counts[action] || 0) + 1;

                      return counts
                  }, {})
              },

              findingsIn(label = activeEpoch, opts = {}) {
                  return this.deltasIn(label).map((batch, batchIndex) => ({
                      batchIndex,
                      ...validateBatch(batch, opts)
                  }))
              },

              restore() {
                  if (!restored) {
                      target[config.method] = original;
                      ACTIVE_TAPS.delete(tap);
                      restored = true
                  }
              }
          };

    target[config.method] = config.wrap(capture, original);
    ACTIVE_TAPS.set(tap, capture);

    return capture
}
