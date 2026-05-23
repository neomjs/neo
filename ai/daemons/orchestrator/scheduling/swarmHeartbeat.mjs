/**
 * Swarm-heartbeat due-trigger projection. Returns a trigger descriptor when the
 * configured interval has elapsed since `lastRunAt`; null otherwise. Pure function.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the swarm-heartbeat lane (`{lastRunAt}`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.swarmHeartbeatIntervalMs Periodic interval; `<= 0` disables.
 * @returns {Object|null} A swarm-heartbeat task trigger or null when no work is due.
 */
export function getDueTask({state, now, swarmHeartbeatIntervalMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;
    if (swarmHeartbeatIntervalMs > 0 && now - lastRunAt >= swarmHeartbeatIntervalMs) {
        return {
            taskName: 'swarm-heartbeat',
            source  : 'periodic-heartbeat',
            reason  : `periodic-heartbeat:${swarmHeartbeatIntervalMs}`
        };
    }
    return null;
}
