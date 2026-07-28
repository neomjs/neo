import {HEAL_LEDGER_FILENAME} from './healEventLedgerStore.mjs';

/**
 * @module ai/services/memory-core/helpers/incidentLedgerBundle
 * @summary Stable LOGICAL member names for the incident ledgers inside a backup bundle, decoupled
 * from wherever those ledgers happen to live on a given host.
 *
 * ## Why this is not just `path.basename(source)`
 *
 * The first version of the ledger bundling stored each ledger under the basename of its SOURCE path
 * and looked it up on restore under the basename of its DESTINATION path. Both are derived from
 * `orchestrator.recoveryActuator.healAttemptsPath`, which is an env-relocatable full path — so a
 * deployment that pointed it at `custom-attempts.json` produced a bundle containing
 * `custom-attempts.json`, and a restore under the default configuration looked for
 * `heal-attempts.json`, found nothing, and reported `source absent`.
 *
 * That failure is silent and it fails in the worst direction: the restore reports success having
 * restored no incident record, which is the same "evidence nobody can retrieve" problem the bundling
 * exists to fix, reintroduced one layer down. A bundle member name must be a property of the BUNDLE
 * FORMAT, never of the host that happened to write it.
 *
 * This module is deliberately its own file rather than more surface on `offHostSyncStore`: that store
 * already owns receipt persistence plus config validation, and bundle-layout naming is a third
 * concern. Keeping it separate is cheaper than splitting a grab-bag later.
 */

/**
 * Bundle-relative member names for the three incident ledgers. `healEvents` reuses the ledger's own
 * filename because that name is already a format constant rather than a host path; the other two are
 * pinned here.
 * @type {{healAttempts: String, healEvents: String, recoveryRuns: String}}
 */
export const INCIDENT_LEDGER_BUNDLE_MEMBERS = Object.freeze({
    healAttempts: 'heal-attempts.json',
    healEvents  : HEAL_LEDGER_FILENAME,
    recoveryRuns: 'recovery-runs'
});
