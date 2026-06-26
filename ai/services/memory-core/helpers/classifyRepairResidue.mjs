import crypto from 'crypto';

/**
 * @module ai/services/memory-core/helpers/classifyRepairResidue
 * @summary Pure decider for a Memory Core repair's terminal-vs-escalate outcome — the heart of the
 * accepted-loss recovery contract. Given a repair's unrecoverable residue + a durable operator
 * acknowledgement, it returns whether the residue is `accepted-loss` (every row terminally-unrecoverable
 * AND the ack fingerprint matches the live residue) or must `escalate` (any transient/unknown reason, or
 * an un-acknowledged / stale ack). This is what stops a fully-recovered store whose only residue is a
 * genuinely-unembeddable, operator-acknowledged row from paging "repair failed" forever — without ever
 * silently accepting transient or unacknowledged loss.
 *
 * Pure + deterministic: the fingerprint is a stable hash over the SORTED residue (ids + reasons) + the
 * recovery-strategy version + provider/context budget + the terminality-policy set, so a changed residue, a
 * new strategy (e.g. oversized docs becoming embeddable), a provider/context change, OR a terminality-policy
 * change all invalidate a stale ack by construction. No I/O, no mutation, no time/randomness — the durable
 * ack record and the defrag-outcome wiring are separate leaves that consume this decision.
 */

export const TERMINAL_REASONS = Object.freeze(['embedding-context-exceeded', 'document-absent']);

/**
 * @summary Computes a stable, order-independent fingerprint over a repair's residue, recovery context,
 * and terminality policy.
 *
 * Identical inputs in ANY residue order produce an identical digest; a changed id/reason, strategy version,
 * provider, context budget, OR terminality-policy (`terminalReasons`) set produces a different digest — so a
 * policy / capability change invalidates a stale ack by construction, not only a residue change. Each row is
 * encoded as a JSON tuple (text-safe — never a raw control byte), so the helper stays a normal text source.
 *
 * @param {Object} options
 * @param {Array<Object>} options.residue `[{id, reason}]` unrecoverable rows.
 * @param {String} [options.strategyVersion='']
 * @param {String} [options.provider='']
 * @param {Number|String} [options.contextBudget='']
 * @param {Array<String>} [options.terminalReasons=[]] The terminality-policy set the residue was judged terminal under.
 * @returns {String} A hex SHA-256 digest.
 */
export function computeResidueFingerprint({residue = [], strategyVersion = '', provider = '', contextBudget = '', terminalReasons = []} = {}) {
    const rows = (Array.isArray(residue) ? residue : [])
        .map(row => JSON.stringify([row?.id ?? null, row?.reason ?? null]))
        .sort();

    const policy = [...(Array.isArray(terminalReasons) ? terminalReasons : [])].sort();

    return crypto.createHash('sha256')
        .update(JSON.stringify({rows, strategyVersion, provider, contextBudget: String(contextBudget), policy}))
        .digest('hex');
}

/**
 * @summary Classifies a repair's unrecoverable residue as `accepted-loss`, `escalate`, or `no-residue`.
 *
 * Pure — no I/O. `escalate` if ANY residue reason is not terminal (transient/unknown always escalates);
 * else `accepted-loss` iff a durable `ack` is present and its fingerprint matches the live residue (under the
 * SAME terminality policy), else `escalate` (un-acknowledged, stale, or policy-changed). Empty residue →
 * `no-residue` (the caller treats it as clean).
 *
 * @param {Object} options
 * @param {Array<Object>} options.residue `[{id, reason}]` unrecoverable rows.
 * @param {Object} [options.ack] The durable acknowledgement `{fingerprint}` (or absent/null).
 * @param {String} [options.strategyVersion]
 * @param {String} [options.provider]
 * @param {Number|String} [options.contextBudget]
 * @param {Array<String>} [options.terminalReasons=TERMINAL_REASONS]
 * @returns {Object} `{outcome, reasonCode, fingerprint, nonTerminalReasons}`.
 */
export function classifyRepairResidue({residue, ack, strategyVersion, provider, contextBudget, terminalReasons = TERMINAL_REASONS} = {}) {
    const rows = Array.isArray(residue) ? residue : [];

    if (rows.length === 0) {
        return {outcome: 'no-residue', reasonCode: 'no-residue', fingerprint: null, nonTerminalReasons: []};
    }

    const nonTerminalReasons = [...new Set(rows
        .map(row => row?.reason)
        .filter(reason => !terminalReasons.includes(reason)))];

    if (nonTerminalReasons.length > 0) {
        return {outcome: 'escalate', reasonCode: 'transient-or-unknown-unrecoverable', fingerprint: null, nonTerminalReasons};
    }

    const fingerprint = computeResidueFingerprint({residue: rows, strategyVersion, provider, contextBudget, terminalReasons});

    if (ack && ack.fingerprint === fingerprint) {
        return {outcome: 'accepted-loss', reasonCode: 'terminal-residue-acknowledged', fingerprint, nonTerminalReasons: []};
    }

    return {outcome: 'escalate', reasonCode: 'unacknowledged-or-stale-terminal-residue', fingerprint, nonTerminalReasons: []};
}
