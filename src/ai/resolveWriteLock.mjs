import {deriveSubtreePath} from './deriveSubtreePath.mjs';

/**
 * @summary Resolve a write request's enforcement decision — skip (legacy), deny (fail-closed), or lock.
 *
 * The decision layer between a parsed Neural Link write request and `Neo.ai.WriteGuard.requestWrite`. Given
 * the request `context` (the Bridge-stamped `{agentId, sessionId}` writer pair, or `null` for a bare /
 * legacy frame — see {@link Neo.ai.parseAgentEnvelope}), the target component id, and an injected `parentOf`
 * lookup, it returns a **decision**, never a side effect — so the four security-critical outcomes are
 * unit-provable in isolation, with no live heap, socket, or `WriteGuard`.
 *
 * Outcomes — fail-closed by construction; **only a fully-valid agent request produces a lock**:
 * - **`context` absent** (`null` / `undefined` / non-object): `{enforced: false}` — a legacy / non-agent
 *   request writes unguarded. The multi-writer regime only governs identified agent writes, and an absent
 *   context is not an agent-controllable bypass: the Bridge stamps the `agent_message` envelope on every
 *   authenticated-agent frame, so a frame that reaches the Client *without* a context is one the Bridge did
 *   not attribute to an agent (genuinely non-agent / legacy).
 * - **`context` present, identity incomplete** (`agentId` or `sessionId` missing / non-string / empty):
 *   `{enforced: true, lock: null, reason: 'incomplete-identity'}` — the caller denies without mutating. A
 *   half-stamped writer pair must never acquire a lock (`LockRegistry` keys on the full pair), so it fails
 *   closed. A present-but-malformed object context (missing both fields, wrong shape) lands here too —
 *   denied, not silently treated as legacy.
 * - **`context` present, target unresolvable** (`deriveSubtreePath` → `null`: malformed / cyclic id):
 *   `{enforced: true, lock: null, reason: 'unresolvable-target'}` — deny without mutating; never lock on a
 *   path that is not a sound absolute root→node path (a relative / corrupt path would mis-compute overlap).
 * - **`context` present, identity + target valid**: `{enforced: true, lock: {agentId, sessionId,
 *   subtreePath}}` — the exact descriptor `WriteGuard.requestWrite` consumes.
 *
 * Pure: `parentOf` is injected exactly as {@link Neo.ai.deriveSubtreePath} takes it, so the derivation and
 * every decision branch are testable against a mock tree. It decides *what lock* (or *deny* / *skip*);
 * holding the lock + conflict detection stay in `WriteGuard` / `LockRegistry`, and acting on the decision
 * (mutate vs deny) stays in the write service that calls this.
 *
 * @param {Object|null} context   The request context: `{agentId, sessionId}` for an agent request, or
 *                                `null` / `undefined` for a bare / legacy frame.
 * @param {String} componentId    The target component id (the write's subtree node).
 * @param {Function} parentOf     `(id: String) => String|null|undefined` — the parent id of `id`, injected
 *                                (the wiring supplies `id => Neo.getComponent(id)?.parentId`).
 * @returns {{enforced: Boolean, lock: (Object|null), reason: (String|undefined)}}
 *   `enforced:false` ⇒ write unguarded (legacy). `enforced:true` with `lock` ⇒ pass `lock` to
 *   `WriteGuard.requestWrite`. `enforced:true` with `lock:null` ⇒ deny without mutating; `reason` names why
 *   (`'incomplete-identity'` | `'unresolvable-target'`).
 */
export function resolveWriteLock(context, componentId, parentOf) {
    // Bare / legacy frame (no Bridge-attributed agent) — the multi-writer regime does not apply: write unguarded.
    if (context === null || typeof context !== 'object') {
        return {enforced: false, lock: null}
    }

    const
        {agentId, sessionId} = context,
        validAgentId   = typeof agentId   === 'string' && agentId.length   > 0,
        validSessionId = typeof sessionId === 'string' && sessionId.length > 0;

    // An identified write is enforced; a malformed / half-stamped writer pair fails closed (never locks).
    if (!validAgentId || !validSessionId) {
        return {enforced: true, lock: null, reason: 'incomplete-identity'}
    }

    const subtreePath = deriveSubtreePath(componentId, parentOf);

    // A target that does not resolve to a sound absolute path fails closed rather than locking a corrupt path.
    if (subtreePath === null) {
        return {enforced: true, lock: null, reason: 'unresolvable-target'}
    }

    return {enforced: true, lock: {agentId, sessionId, subtreePath}}
}
