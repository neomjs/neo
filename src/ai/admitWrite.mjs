import {resolveWriteLock} from './resolveWriteLock.mjs';

/**
 * @summary Admit or deny a Neural Link write — the seam that joins the write-lock *decision* to the heap *authority*.
 *
 * The single enforcement step a write-class service runs before it mutates. It composes the two halves of the
 * multi-writer regime: {@link Neo.ai.resolveWriteLock} decides *what lock* a request needs (or that it is legacy /
 * undecidable), and the injected `writeGuard` ({@link Neo.ai.WriteGuard}) *acquires and holds* that lock — denying a
 * cross-writer overlap. The result includes the guard's fenced `acquisition` receipt when enforced admission
 * succeeds; the operation owner retains that receipt to begin/end in-flight protection and conditionally release
 * only its own generation. Acting on the verdict — mutate vs throw — stays in the caller, so this remains a pure
 * function over its inputs and is unit-provable with a stub guard.
 *
 * Fail-closed by construction — only a fully-valid, non-conflicting agent request (or a genuinely legacy one) admits:
 * - **decision not enforced** (`context` absent → legacy / non-agent frame): `{admitted: true,
 *   acquisition: null}` — write unguarded.
 * - **enforced, no lock** (incomplete identity / unresolvable target): `{admitted: false, reason}` — deny, no mutate;
 *   `reason` is `resolveWriteLock`'s (`'incomplete-identity'` | `'unresolvable-target'`).
 * - **enforced, lock, but no `writeGuard`**: `{admitted: false, reason: 'no-write-guard'}` — a misconfiguration where
 *   enforcement is required but no heap authority exists denies rather than silently mutating (never fail open).
 * - **enforced, lock, guard grants** (no overlap, or same-writer re-entrant): `{admitted: true, acquisition}` — the
 *   lock is now **held** and the caller owns the scoped fenced receipt.
 * - **enforced, lock, guard denies**: `{admitted: false, reason, conflict}` — a cross-writer overlap reports
 *   `reason: 'conflict'` plus the guard's defensive holder copy; an unavailable lease clock/config reports the
 *   guard's precise fail-closed error code with no false conflict.
 *
 * @param {Object}        params
 * @param {Object|null}   params.context     The Bridge-stamped `{agentId, sessionId}` writer pair, or `null` /
 *                                            `undefined` for a bare / legacy frame (see {@link Neo.ai.parseAgentEnvelope}).
 * @param {String}        params.componentId The target component id (the write's subtree node).
 * @param {Function}      params.parentOf    `(id: String) => String|null|undefined` — injected parent lookup, exactly
 *                                            as {@link Neo.ai.deriveSubtreePath} consumes it (`id => Neo.getComponent(id)?.parentId`).
 * @param {Object}        params.writeGuard  The heap's {@link Neo.ai.WriteGuard} instance (`requestWrite(lock) →
 *                                            {granted, conflict, errors, acquisition}`). Required only when enforced.
 * @returns {{admitted: Boolean, reason: (String|null), conflict: (Object|null), acquisition: (Object|null)}}
 *   `admitted:true` ⇒ the caller may mutate (the lock, if any, is held). `admitted:false` ⇒ the caller must NOT mutate;
 *   `reason` names why and `conflict` (when present) is the overlapping holder.
 */
export function admitWrite({context, componentId, parentOf, writeGuard}) {
    const decision = resolveWriteLock(context, componentId, parentOf);

    // Legacy / non-agent frame — the multi-writer regime does not apply; write unguarded.
    if (!decision.enforced) {
        return {admitted: true, reason: null, conflict: null, acquisition: null}
    }

    // Enforced, but identity / target is undecidable — fail closed (deny, no mutate).
    if (!decision.lock) {
        return {admitted: false, reason: decision.reason, conflict: null, acquisition: null}
    }

    // Enforced with a valid lock, but no heap authority to hold it — fail closed rather than mutate unguarded.
    if (!writeGuard) {
        return {admitted: false, reason: 'no-write-guard', conflict: null, acquisition: null}
    }

    // Acquire-and-hold; a cross-writer overlap is denied with a copy of the conflicting holder.
    const {granted, conflict, errors=[], acquisition} = writeGuard.requestWrite(decision.lock);

    return granted
        ? {admitted: true,  reason: null,       conflict: null, acquisition: acquisition || null}
        : {
            admitted   : false,
            reason     : conflict ? 'conflict' : errors[0] || 'write-guard-denied',
            conflict   : conflict || null,
            acquisition: null
        }
}
