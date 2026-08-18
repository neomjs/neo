import {assertStorableProfileRecord, isStaleProfile, rehydrateProfile} from './connectionProfiles.mjs';

/**
 * @module apps/agentos/fleet/instanceRosterStorage
 * @summary (De)serialization policy for the configured-instances roster — the persistence HALF of
 * the C1 profile contract, kept as a pure worker-realm module so the storage transport (the
 * main-thread LocalStorage addon) stays a caller concern and every revive path is unit-testable
 * without a browser.
 *
 * The roster persists ONLY what `assertStorableProfileRecord` admits: validated, credential-free,
 * pane-renderable records (the closed-schema guard runs again on every load, so a hand-edited or
 * corrupted storage value cannot smuggle fields past the contract). Stale records (older
 * `contractVersion`) re-derive through `rehydrateProfile`; a record the CURRENT contract refuses
 * is dropped LOUDLY into the result's `dropped` list — refuse-and-report, never silent loss and
 * never a crashed boot over one bad row.
 *
 * Storage-key discipline: one versioned key, owned here, so consumers never invent their own.
 */

/**
 * The single localStorage key for the instances roster. Versioned independently of the record
 * contract: record-level drift heals via `rehydrateProfile`, a KEY bump is reserved for envelope
 * shape changes.
 * @type {String}
 */
export const INSTANCE_ROSTER_STORAGE_KEY = 'agentosFleetInstances.v1';

/**
 * @summary Serialize validated profile records for storage. Every record passes the closed-schema
 * guard AGAIN before it leaves — serialization is a write path, and the guard is the write gate.
 * @param {Object[]} records Profile records (C1-validated shapes).
 * @returns {String} the JSON envelope for {@link INSTANCE_ROSTER_STORAGE_KEY}.
 */
export function serializeInstanceRoster(records = []) {
    return JSON.stringify(records.map(record => assertStorableProfileRecord({...record})))
}

/**
 * @summary Revive the stored roster: parse, guard, rehydrate stale rows, and report every drop
 * with its reason. Fail-open to EMPTY on a malformed envelope (a broken storage value must not
 * brick the switcher), fail-loud per ROW on contract refusals.
 * @param {String|null} json The raw storage value, or `null`/`undefined` when the key is absent.
 * @returns {{records: Object[], dropped: Object[]}} `records` = validated current-contract rows;
 *     `dropped` = `{record, reason}` per refused row — the caller's honest-absence surface.
 */
export function reviveInstanceRoster(json) {
    let parsed;

    try {
        parsed = JSON.parse(json)
    } catch {
        return {records: [], dropped: []}
    }

    if (!Array.isArray(parsed)) {
        return {records: [], dropped: []}
    }

    const
        records = [],
        dropped = [];

    parsed.forEach(row => {
        try {
            records.push(isStaleProfile(row) ? rehydrateProfile(row) : assertStorableProfileRecord({...row}))
        } catch (error) {
            dropped.push({record: row, reason: error?.message ?? String(error)})
        }
    });

    return {records, dropped}
}
