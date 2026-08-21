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
 * @returns {{records: Object[], dropped: Object[], envelope: String}} `records` = validated
 *     current-contract rows; `dropped` = `{record, reason}` per refused row; `envelope` = one of
 *     `absent` | `ok` | `unparseable` | `not-an-array`. Fail-open and fail-SILENT are different
 *     things, and only the first was ever chosen: an envelope failure yields an empty `dropped`, so
 *     a caller warning per dropped row has nothing to warn about while the operator's whole roster
 *     silently disappears behind a UI that looks like a fresh install.
 */
export function reviveInstanceRoster(json) {
    let parsed;

    // An unset key is not damage, and it is the most common state. It must be classified BEFORE the
    // parse, because both of its shapes would otherwise be reported as corruption: `JSON.parse(null)`
    // yields `null` and lands in `not-an-array`, while `JSON.parse(undefined)` throws and lands in
    // `unparseable`. A warning that fires on every fresh install is one operators learn to ignore,
    // which would cost the real signal this envelope field exists to carry.
    //
    // ABSENCE IS THE CARRIER'S WORD, not a falsy family. LocalStorage answers a missing key with
    // `null`, so `''` is a value somebody STORED and `JSON.parse('')` throws — it is corruption, and
    // admitting it here would rebuild the conflation this function exists to remove, one state over.
    // `undefined` stays only because no carrier can hand back a stored `undefined`.
    if (json === null || json === undefined) {
        return {records: [], dropped: [], envelope: 'absent'}
    }

    try {
        parsed = JSON.parse(json)
    } catch {
        return {records: [], dropped: [], envelope: 'unparseable'}
    }

    if (!Array.isArray(parsed)) {
        return {records: [], dropped: [], envelope: 'not-an-array'}
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

    return {records, dropped, envelope: 'ok'}
}
