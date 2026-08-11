/**
 * @plane host
 */
import fs              from 'fs-extra';
import path            from 'path';
import {execFile}      from 'node:child_process';
import {promisify}     from 'node:util';
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
 * pre-transition bundle exists — or the operator has explicitly declared initialization plus its
 * Compose project identity, and the Docker plane confirms that no primary-store volume exists for
 * that declared project.
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
 * A genuine first deployment and a plane whose backup root was destroyed or relocated **both
 * present as absence** on the host filesystem. Nothing about "no bundle here" says which one it is,
 * so keying the refusal on that absence alone would either block the first legitimate deploy or
 * fail open on an established plane. The operator therefore DECLARES initialization, while the
 * preflight also observes the independently durable Compose primary-store volume. The project
 * selector is part of that declaration: a defaulted or missing identity cannot authorize this path,
 * because project-scoped absence is not plane-wide absence on a multi-project host.
 *
 * The marker lives beside the bundles on the host bind-mount, which survives ordinary container
 * recreation. The primary store lives in a Docker named volume, a separate durability domain. A
 * read-only label query can therefore still prove prior plane state after the marker or entire
 * backup root is lost, without starting or exec-ing a probe container. `verifyLatestBackupRestorable`
 * only enumerates `backup-*` directories, so a dotfile marker can never be mistaken for a bundle.
 */

const __filename    = fileURLToPath(import.meta.url),
      execFileAsync = promisify(execFile);

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';
const COMPOSE_VOLUME_LABEL  = 'com.docker.compose.volume';

/**
 * Compose volume key that carries the Memory Core primary store.
 * @type {String}
 */
export const PRIMARY_STORE_VOLUME_NAME = 'shared-sqlite-data';

/**
 * Tri-state result for the read-only Docker-plane observation. Only `ABSENT` can authorize a
 * genuine first initialization; every unmeasurable or ambiguous result stays `UNKNOWN`.
 * @type {Object}
 */
export const PRIMARY_VOLUME_STATE = Object.freeze({
    ABSENT : 'absent',
    PRESENT: 'present',
    UNKNOWN: 'unknown'
});

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
    REFUSE_NO_VERIFIED_BUNDLE : 'REFUSE_NO_VERIFIED_BUNDLE',
    REFUSE_PLANE_STATE_UNKNOWN: 'REFUSE_PLANE_STATE_UNKNOWN'
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
 * @param {String|null} [options.primaryVolumeState=null] Docker primary-volume observation.
 * @param {String} options.verdictCode A `verifyLatestBackupRestorable` code.
 * @returns {{decision: String, proceed: Boolean, writeMarker: Boolean, reason: String}}
 */
export function evaluateRedeployPreconditions({
    markerPresent,
    initializeRequested,
    primaryVolumeState = null,
    verdictCode
}) {
    const restorable = verdictCode === 'RESTORABLE';

    if (initializeRequested) {
        const priorEvidence = [];

        if (markerPresent) {
            priorEvidence.push('the initialization marker')
        }
        if (restorable) {
            priorEvidence.push('a verified restorable bundle')
        }
        if (primaryVolumeState === PRIMARY_VOLUME_STATE.PRESENT) {
            priorEvidence.push('the Compose-labeled primary-store volume')
        }

        // Destructive-path ordering is load-bearing: every proof of prior state must win BEFORE the
        // initialization proceed branch. The old ordering consulted only the marker and ignored even
        // a RESTORABLE bundle when the marker was missing.
        if (priorEvidence.length > 0) {
            return {
                decision   : REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED,
                proceed    : false,
                writeMarker: false,
                reason     : `--initialize cannot apply because prior deployment is proven by ${priorEvidence.join(', ')}. Remove the flag to run an ordinary redeploy; if you intend to discard the existing plane, do that deliberately and separately.`
            }
        }

        // `absent` is the sole authorizing observation. Missing, malformed, ambiguous, and failed
        // observations all remain unknown and fail closed under a distinct audit code.
        if (primaryVolumeState !== PRIMARY_VOLUME_STATE.ABSENT) {
            return {
                decision   : REDEPLOY_PREFLIGHT_DECISION.REFUSE_PLANE_STATE_UNKNOWN,
                proceed    : false,
                writeMarker: false,
                reason     : `--initialize requires proof that the Compose primary-store volume is absent; observed ${primaryVolumeState ?? 'no result'}. No plane mutation is authorized.`
            }
        }

        // Declared first deployment: no marker, no restorable bundle, and the independent Docker
        // plane observer positively measured that the primary-store volume does not exist.
        return {
            decision   : REDEPLOY_PREFLIGHT_DECISION.PROCEED_INITIALIZING,
            proceed    : true,
            writeMarker: true,
            reason     : 'Initialization declared by the operator; no marker or restorable bundle exists, and the Compose primary-store volume is absent.'
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
 * @summary Observes the Compose primary-store volume using read-only Docker metadata operations.
 *
 * The lookup first narrows by BOTH canonical Compose labels, then inspects the single match and
 * verifies those labels exactly. Zero matches is a measured absence for the declared project.
 * Multiple matches, malformed labels, command failures, and missing project identity remain unknown
 * and can never authorize initialization.
 *
 * @param {Object} [options]
 * @param {String} [options.composeProject] Expected Compose project label.
 * @param {Function} [options.execFileFn=execFileAsync] Promise-based `execFile` seam.
 * @returns {Promise<Object>} Tri-state observation with bounded audit metadata.
 */
export async function observePrimaryStoreVolume({composeProject, execFileFn = execFileAsync} = {}) {
    const project = typeof composeProject === 'string' ? composeProject.trim() : '';

    if (!project) {
        return {
            state : PRIMARY_VOLUME_STATE.UNKNOWN,
            reason: 'compose-project-unavailable'
        }
    }

    const commandOptions = {
        encoding : 'utf8',
        maxBuffer: 64 * 1024,
        timeout  : 5000
    };

    try {
        const listResult = await execFileFn('docker', [
                  'volume',
                  'ls',
                  '--quiet',
                  '--filter',
                  `label=${COMPOSE_PROJECT_LABEL}=${project}`,
                  '--filter',
                  `label=${COMPOSE_VOLUME_LABEL}=${PRIMARY_STORE_VOLUME_NAME}`
              ], commandOptions),
              matches = String(listResult.stdout ?? '')
                  .split(/\r?\n/)
                  .map(item => item.trim())
                  .filter(Boolean);

        if (matches.length === 0) {
            return {
                matchCount: 0,
                reason    : 'volume-not-found',
                state     : PRIMARY_VOLUME_STATE.ABSENT
            }
        }

        if (matches.length !== 1) {
            return {
                matchCount: matches.length,
                reason    : 'volume-match-ambiguous',
                state     : PRIMARY_VOLUME_STATE.UNKNOWN
            }
        }

        const volumeName    = matches[0],
              inspectResult = await execFileFn('docker', [
                  'volume',
                  'inspect',
                  '--format',
                  '{{json .Labels}}',
                  volumeName
              ], commandOptions);

        let labels;

        try {
            labels = JSON.parse(String(inspectResult.stdout ?? '').trim())
        } catch {
            return {
                matchCount: 1,
                reason    : 'volume-labels-malformed',
                state     : PRIMARY_VOLUME_STATE.UNKNOWN,
                volumeName
            }
        }

        if (!labels || Array.isArray(labels) || typeof labels !== 'object') {
            return {
                matchCount: 1,
                reason    : 'volume-labels-malformed',
                state     : PRIMARY_VOLUME_STATE.UNKNOWN,
                volumeName
            }
        }

        if (labels[COMPOSE_PROJECT_LABEL] !== project ||
            labels[COMPOSE_VOLUME_LABEL] !== PRIMARY_STORE_VOLUME_NAME) {
            return {
                matchCount: 1,
                reason    : 'volume-label-mismatch',
                state     : PRIMARY_VOLUME_STATE.UNKNOWN,
                volumeName
            }
        }

        return {
            matchCount: 1,
            reason    : 'volume-labels-verified',
            state     : PRIMARY_VOLUME_STATE.PRESENT,
            volumeName
        }
    } catch (error) {
        return {
            errorCode: error && typeof error.code === 'string' ? error.code : null,
            reason   : 'docker-volume-query-failed',
            state    : PRIMARY_VOLUME_STATE.UNKNOWN
        }
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
 * @param {String} [options.composeProject] Compose project used for the exact volume-label lookup.
 * @param {Boolean} [options.initializeRequested=false] Explicit initialization declaration.
 * @param {Object} [options.logger=console] Log sink.
 * @param {Function} [options.probeFn=verifyLatestBackupRestorable] Probe seam.
 * @param {Function} [options.primaryVolumeProbeFn=observePrimaryStoreVolume] Docker observer seam.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<Object>}
 */
export async function runRedeployPreflight({
    backupRoot,
    composeProject,
    initializeRequested  = false,
    logger               = console,
    probeFn              = verifyLatestBackupRestorable,
    primaryVolumeProbeFn = observePrimaryStoreVolume,
    fsModule             = fs
} = {}) {
    const resolvedRoot  = backupRoot ?? AiConfig.backupPath,
          markerPresent = await readInitializationMarker({backupRoot: resolvedRoot, fsModule}),
          verdict       = await probeFn({backupRoot: resolvedRoot, logger}),
          primaryVolume = initializeRequested
              ? await primaryVolumeProbeFn({composeProject})
              : {reason: 'not-required-for-ordinary-redeploy', state: null},
          outcome       = evaluateRedeployPreconditions({
              initializeRequested,
              markerPresent,
              primaryVolumeState: primaryVolume.state,
              verdictCode       : verdict.code
          });

    if (outcome.proceed && outcome.writeMarker) {
        await writeInitializationMarker({backupRoot: resolvedRoot, decision: outcome.decision, fsModule});
    }

    return {
        ...outcome,
        backupRoot             : resolvedRoot,
        bundleRoot             : verdict.bundleRoot ?? null,
        composeProject         : composeProject ?? null,
        markerPresent,
        primaryVolumeErrorCode : primaryVolume.errorCode ?? null,
        primaryVolumeMatchCount: primaryVolume.matchCount ?? null,
        primaryVolumeName      : primaryVolume.volumeName ?? null,
        primaryVolumeReason    : primaryVolume.reason,
        primaryVolumeState     : primaryVolume.state,
        // The probe's own verdict travels with the decision so a deploy log records WHY, not just
        // whether. `rowTotal` is what `RESTORABLE` was decided on.
        verdictCode  : verdict.code,
        verdictReason: verdict.reason ?? null,
        rowTotal     : verdict.rowTotal ?? null
    }
}

/**
 * @summary Reads a required value from a two-token CLI option.
 * @param {String[]} argv CLI argument vector without the executable and script path.
 * @param {String} option Option name, including its leading dashes.
 * @returns {String|null}
 */
function readCliOption(argv, option) {
    const index = argv.indexOf(option),
          value = index === -1 ? null : argv[index + 1];

    return typeof value === 'string' && value.length > 0 && !value.startsWith('--') ? value : null
}

/**
 * @summary CLI entrypoint. Exit 0 proceeds; exit 1 refuses.
 * @returns {Promise<void>}
 */
async function main() {
    const args                = process.argv.slice(2),
          initializeRequested = args.includes('--initialize'),
          asJson              = args.includes('--json'),
          composeProject      = readCliOption(args, '--compose-project'),
          result              = await runRedeployPreflight({composeProject, initializeRequested});

    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`[preflight] ${result.decision}`);
        console.log(`[preflight] ${result.reason}`);
        console.log(`[preflight] bundle root: ${result.backupRoot} (marker ${result.markerPresent ? 'present' : 'absent'}, probe ${result.verdictCode}${result.rowTotal === null ? '' : `, ${result.rowTotal} rows`})`);
        if (result.primaryVolumeState !== null) {
            console.log(`[preflight] primary volume: ${result.primaryVolumeState} (${result.primaryVolumeReason}${result.primaryVolumeName === null ? '' : `, ${result.primaryVolumeName}`})`);
        }
    }

    if (!result.proceed) {
        console.error('[preflight] REFUSING to proceed. A read-only Docker metadata query may have run; no container lifecycle mutation was invoked.');
        process.exit(1);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    main().catch(error => {
        // A preflight that cannot decide must REFUSE. Failing open here would make an unreadable
        // bundle root indistinguishable from a verified one, which is the whole defect inverted.
        console.error(`[preflight] FATAL: ${error.message}`);
        console.error('[preflight] REFUSING to proceed. A read-only Docker metadata query may have run; no container lifecycle mutation was invoked.');
        process.exit(1);
    });
}
