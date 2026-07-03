/**
 * @summary Resolve the target session for an outbound Neural Link call, deprecating silent auto-targeting.
 *
 * Pure target-resolution rule for `ConnectionService.call()`, extracted as a side-effect-free function so it
 * is testable without standing up the Bridge-connected service singleton.
 *
 * An explicit `sessionId` is always honored. With no explicit target the legacy path auto-picked the
 * most-recently-connected session — safe for a single writer, but a silent cross-writer footgun once two
 * agents share the Bridge (a call meant for one session could land on whichever connected last). So when
 * **more than one** session is live an explicit target is now mandatory and this throws rather than guessing;
 * a single live session still resolves implicitly (back-compatible), and zero live sessions throws as before.
 *
 * @param {String|null} sessionId    The explicit target session id, or a falsy value to resolve implicitly.
 * @param {String[]} liveSessionIds  Currently-live session ids (e.g. `[...connectionService.sessionData.keys()]`).
 * @returns {String} The resolved target session id.
 * @throws {Error} When no explicit target is given and either zero or more-than-one sessions are live.
 */
export function resolveCallTarget(sessionId, liveSessionIds) {
    if (sessionId) {
        return sessionId
    }

    if (liveSessionIds.length === 0) {
        throw new Error('No active App Worker sessions found.')
    }

    if (liveSessionIds.length > 1) {
        throw new Error(
            `Auto-targeting is disabled with ${liveSessionIds.length} live sessions: pass an explicit ` +
            'sessionId. Silent most-recent targeting is unsafe with concurrent writers.'
        )
    }

    return liveSessionIds[0]
}
