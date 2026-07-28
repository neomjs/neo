import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

// Neo namespace bootstrap (entry-point invariant) — this is an operator-runnable driver, and the
// restorability probe it consumes reaches config-backed services.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';
import AiConfig        from '../../config.mjs';

import {verifyLatestBackupRestorable} from './restore.mjs';

/**
 * @module ai/scripts/maintenance/redeployPreflight
 * @summary Refuses a container-affecting deploy unless a verified, non-empty, restorable
 * pre-transition bundle exists — or the operator has explicitly declared initialization.
 *
 * ## What this can and cannot protect
 *
 * We own no destructive path. `DEPLOYMENT_RUNTIME_LIFECYCLE_OPERATIONS` is frozen to `['restart']`
 * and `docker compose down` appears in no script in this repository. The data loss that produced
 * this work came from an operator command driven by a tenant-authored checklist, and **no guard
 * here can intercept that.**
 *
 * So the refusal goes where we do have leverage: the reference deploy script is the CI-neutral
 * substrate teams adapt, so a preflight that exits non-zero there is inherited by everyone who
 * adapts it. It also correctly guards `up -d --build`, which recreates containers. A guarantee that
 * lives only in a runbook binds only readers of that runbook — and in the incident, the runbook that
 * was actually followed was one we do not own and cannot edit.
 *
 * ## Why an explicit initialization mode rather than a heuristic
 *
 * A genuine first deployment and a plane that was destroyed or relocated **both present as
 * absence**. Nothing about "no bundle here" says which one it is, so keying the refusal on absence
 * alone would block the very first legitimate deploy. The operator therefore DECLARES
 * initialization, and a durable marker records that this host has deployed before.
 *
 * The marker lives beside the bundles on the host bind-mount, which is precisely the mount
 * `docker compose down -v` does not touch. That is the point: it has to survive the operation whose
 * aftermath it exists to describe. `verifyLatestBackupRestorable` only enumerates `backup-*`
 * directories, so a dotfile marker can never be mistaken for a bundle.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Marker filename. A dotfile beside the bundles: same surviving mount, invisible to bundle
 * enumeration.
 * @type {String}
 */
export const INITIALIZATION_MARKER_FILENAME = '.deployment-initialized';

/**
 * Verdicts this preflight can return. `PROCEED_*` variants are distinct so a deploy log records WHY
 * it was allowed — "it proceeded" and "it proceeded because the operator declared a first install"
 * are different facts, and an audit that cannot tell them apart cannot answer whether a wipe was
 * authorised.
 * @type {Object}
 */
export const REDEPLOY_PREFLIGHT_DECISION = Object.freeze({
    PROCEED_INITIALIZING      : 'PROCEED_INITIALIZING',
    PROCEED_MARKER_RECOVERED  : 'PROCEED_MARKER_RECOVERED',
    PROCEED_VERIFIED          : 'PROCEED_VERIFIED',
    REFUSE_ALREADY_INITIALIZED: 'REFUSE_ALREADY_INITIALIZED',
    REFUSE_NO_VERIFIED_BUNDLE : 'REFUSE_NO_VERIFIED_BUNDLE'
});

/**
 * @summary The truth table. PURE — no filesystem, no config, no probe.
 *
 * Separated so the decision is testable without a deployment and reviewable without reading IO
 * plumbing. Every ambiguous state fails closed; the only paths that proceed are a declared
 * initialization, a verified bundle, or a verified bundle recovering a lost marker.
 *
 * @param {Object} options
 * @param {Boolean} options.markerPresent Whether this host has recorded a prior deployment.
 * @param {Boolean} options.initializeRequested Whether the operator passed the explicit flag.
 * @param {String} options.verdictCode A `verifyLatestBackupRestorable` code.
 * @returns {{decision: String, proceed: Boolean, writeMarker: Boolean, reason: String}}
 */
export function evaluateRedeployPreconditions({markerPresent, initializeRequested, verdictCode}) {
    const restorable = verdictCode === 'RESTORABLE';

    // Row 6 first. `--initialize` on a host that has already deployed is an operator mistake worth
    // catching, never a licence to wipe — checking it before the restorable fast-path is what stops
    // the escape hatch from becoming the bypass.
    if (markerPresent && initializeRequested) {
        return {
            decision   : REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED,
            proceed    : false,
            writeMarker: false,
            reason     : 'This host has deployed before, so --initialize cannot apply. Remove the flag to run an ordinary redeploy; if you intend to discard the existing plane, do that deliberately and separately.'
        }
    }

    // Row 1 — declared first deployment. The one path that proceeds without a bundle, and it
    // requires a human to have said so.
    if (initializeRequested) {
        return {
            decision   : REDEPLOY_PREFLIGHT_DECISION.PROCEED_INITIALIZING,
            proceed    : true,
            writeMarker: true,
            reason     : 'Initialization declared by the operator and no prior deployment is recorded on this host.'
        }
    }

    // Row 4 — the ordinary verified redeploy.
    if (markerPresent && restorable) {
        return {
            decision   : REDEPLOY_PREFLIGHT_DECISION.PROCEED_VERIFIED,
            proceed    : true,
            writeMarker: false,
            reason     : 'A verified, non-empty, restorable pre-transition bundle exists.'
        }
    }

    // Row 2 — no marker but a verified bundle. The bundle PROVES prior state, so the missing marker
    // is the anomaly rather than the deployment. Recorded rather than refused, otherwise a host that
    // lost its marker independently of its bundles could never deploy again.
    if (restorable) {
        return {
            decision   : REDEPLOY_PREFLIGHT_DECISION.PROCEED_MARKER_RECOVERED,
            proceed    : true,
            writeMarker: true,
            reason     : 'No initialization marker, but a verified restorable bundle proves a prior deployment; recording the marker.'
        }
    }

    // Rows 3 and 5 — every remaining state. Absent root, no bundles, empty bundle, torn bundle: all
    // indistinguishable from a destroyed or relocated plane, and this is the state the incident was
    // in. Fail closed.
    return {
        decision   : REDEPLOY_PREFLIGHT_DECISION.REFUSE_NO_VERIFIED_BUNDLE,
        proceed    : false,
        writeMarker: false,
        reason     : markerPresent
            ? `This host has deployed before and has no usable pre-transition bundle (${verdictCode}). Proceeding could cross into an unrecoverable plane.`
            : `No prior deployment is recorded and no usable bundle exists (${verdictCode}). This is indistinguishable from a destroyed or relocated plane. If this is genuinely a first install, pass --initialize to say so.`
    }
}

/**
 * @summary Reads the initialization marker.
 * @param {Object} options
 * @param {String} options.backupRoot Bundle root on the surviving host mount.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<Boolean>}
 */
export async function readInitializationMarker({backupRoot, fsModule = fs}) {
    return fsModule.pathExists(path.join(backupRoot, INITIALIZATION_MARKER_FILENAME))
}

/**
 * @summary Records that this host has deployed, so a later absence is informative.
 * @param {Object} options
 * @param {String} options.backupRoot Bundle root on the surviving host mount.
 * @param {String} options.decision Decision that authorised the write.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<void>}
 */
export async function writeInitializationMarker({backupRoot, decision, fsModule = fs}) {
    await fsModule.ensureDir(backupRoot);
    await fsModule.writeJson(
        path.join(backupRoot, INITIALIZATION_MARKER_FILENAME),
        {decision, initializedAt: new Date().toISOString()},
        {spaces: 2}
    )
}

/**
 * @summary Runs the preflight: probe, marker, decision, and the marker write on success.
 *
 * The marker is written only AFTER the decision authorises it, and never on a refusal — a refused
 * deploy must leave the host exactly as it found it, or the next run would read a marker recording a
 * deployment that never happened.
 *
 * @param {Object} [options]
 * @param {String} [options.backupRoot] Bundle root. Defaults to the resolved leaf.
 * @param {Boolean} [options.initializeRequested=false] Explicit initialization declaration.
 * @param {Object} [options.logger=console] Log sink.
 * @param {Function} [options.probeFn=verifyLatestBackupRestorable] Probe seam.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<Object>}
 */
export async function runRedeployPreflight({
    backupRoot,
    initializeRequested = false,
    logger              = console,
    probeFn             = verifyLatestBackupRestorable,
    fsModule            = fs
} = {}) {
    const resolvedRoot  = backupRoot ?? AiConfig.backupPath,
          markerPresent = await readInitializationMarker({backupRoot: resolvedRoot, fsModule}),
          verdict       = await probeFn({backupRoot: resolvedRoot, logger}),
          outcome       = evaluateRedeployPreconditions({
              initializeRequested,
              markerPresent,
              verdictCode: verdict.code
          });

    if (outcome.proceed && outcome.writeMarker) {
        await writeInitializationMarker({backupRoot: resolvedRoot, decision: outcome.decision, fsModule});
    }

    return {
        ...outcome,
        backupRoot: resolvedRoot,
        bundleRoot: verdict.bundleRoot ?? null,
        markerPresent,
        // The probe's own verdict travels with the decision so a deploy log records WHY, not just
        // whether. `rowTotal` is what `RESTORABLE` was decided on.
        verdictCode  : verdict.code,
        verdictReason: verdict.reason ?? null,
        rowTotal     : verdict.rowTotal ?? null
    }
}

/**
 * @summary CLI entrypoint. Exit 0 proceeds; exit 1 refuses.
 * @returns {Promise<void>}
 */
async function main() {
    const initializeRequested = process.argv.includes('--initialize'),
          asJson              = process.argv.includes('--json'),
          result              = await runRedeployPreflight({initializeRequested});

    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`[preflight] ${result.decision}`);
        console.log(`[preflight] ${result.reason}`);
        console.log(`[preflight] bundle root: ${result.backupRoot} (marker ${result.markerPresent ? 'present' : 'absent'}, probe ${result.verdictCode}${result.rowTotal === null ? '' : `, ${result.rowTotal} rows`})`);
    }

    if (!result.proceed) {
        console.error('[preflight] REFUSING to proceed. Docker was NOT invoked.');
        process.exit(1);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    main().catch(error => {
        // A preflight that cannot decide must REFUSE. Failing open here would make an unreadable
        // bundle root indistinguishable from a verified one, which is the whole defect inverted.
        console.error(`[preflight] FATAL: ${error.message}`);
        console.error('[preflight] REFUSING to proceed. Docker was NOT invoked.');
        process.exit(1);
    });
}
