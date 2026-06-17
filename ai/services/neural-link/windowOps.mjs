/**
 * @summary Resolve Neural Link window-operation targets from Bridge session metadata.
 *
 * Window write operations must address a known live window, not a client-asserted arbitrary target.
 * This helper stays side-effect-free so tests can validate the routing/fail-loud contract without
 * connecting the Neural Link Bridge singleton.
 *
 * @param {Object} options
 * @param {Map<String,Object>} options.sessionData The Bridge session metadata map.
 * @param {String} [options.sessionId]             Optional App Worker session scope.
 * @param {String} options.windowId                The logical window id from topology.
 * @returns {Object} `{sessionId, window}` for the single matching known window.
 * @throws {Error} When the window id is missing, unknown, scoped out, or ambiguous.
 */
export function resolveWindowTarget({sessionData, sessionId, windowId}) {
    if (!windowId || typeof windowId !== 'string') {
        throw new Error('windowId is required.')
    }

    const matches = [];

    for (const [candidateSessionId, meta] of sessionData.entries()) {
        if (sessionId && candidateSessionId !== sessionId) {
            continue
        }

        const windows = meta?.windows;

        if (!windows) {
            continue
        }

        const win = typeof windows.get === 'function' ?
            windows.get(windowId) :
            Array.isArray(windows) ?
                windows.find(item => item?.id === windowId) :
                windows[windowId];

        if (win) {
            matches.push({
                sessionId: candidateSessionId,
                window   : win
            })
        }
    }

    if (matches.length === 0) {
        throw new Error(sessionId ?
            `Unknown windowId '${windowId}' for session '${sessionId}'.` :
            `Unknown windowId '${windowId}'.`
        )
    }

    if (matches.length > 1) {
        throw new Error(
            `Ambiguous windowId '${windowId}' across ${matches.length} sessions: pass an explicit sessionId.`
        )
    }

    return matches[0]
}
