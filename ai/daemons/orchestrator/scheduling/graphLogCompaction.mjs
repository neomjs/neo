/**
 * @summary Projects task state + config into a due trigger for GraphLog compaction.
 *
 * The orchestrator owns cadence only. Compaction safety, cursor handling, batching,
 * WAL checkpointing, and optional VACUUM behavior remain inside
 * `ai/scripts/maintenance/compactGraphLog.mjs`.
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
    const lastRunAt = state['graphlog-compaction']?.lastRunAt || 0;

    if (enabled && graphLogCompactionIntervalMs > 0 && now - lastRunAt >= graphLogCompactionIntervalMs) {
        return {
            taskName: 'graphlog-compaction',
            source  : 'periodic-sweep',
            reason  : `periodic-graphlog-compaction:${graphLogCompactionIntervalMs}`
        };
    }

    return null;
}
