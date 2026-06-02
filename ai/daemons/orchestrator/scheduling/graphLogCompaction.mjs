/**
 * @summary Builds the recurring GraphLog compaction trigger for Orchestrator scheduling.
 *
 * The orchestrator owns cadence only. Compaction safety, cursor handling, batching,
 * WAL checkpointing, and optional VACUUM behavior remain inside
 * `ai/scripts/maintenance/compactGraphLog.mjs`.
 *
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last recorded task start timestamp.
 * @param {Number} options.intervalMs Cadence interval; `0` disables.
 * @param {Boolean} [options.enabled=true] Runtime lane enable flag.
 * @returns {Object|null}
 */
export function buildGraphLogCompactionTrigger({
    now,
    lastRunAt,
    intervalMs,
    enabled = true
}) {
    if (enabled && intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'graphlog-compaction',
            source  : 'periodic-sweep',
            reason  : `periodic-graphlog-compaction:${intervalMs}`
        };
    }
    return null;
}

/**
 * @summary Projects task state + config into a due trigger for GraphLog compaction.
 *
 * @param {Object} options
 * @param {Object} options.state Orchestrator task state map.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.graphLogCompactionIntervalMs Cadence interval.
 * @param {Boolean} [options.enabled=true] Runtime lane enable flag.
 * @returns {Object|null}
 */
export function getDueTask({
    state,
    now,
    graphLogCompactionIntervalMs,
    enabled = true
}) {
    return buildGraphLogCompactionTrigger({
        now,
        lastRunAt : state['graphlog-compaction']?.lastRunAt || 0,
        intervalMs: graphLogCompactionIntervalMs,
        enabled
    });
}
