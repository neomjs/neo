/**
 * @summary Pure deployment-profile mode gate and off-host durability posture derivation.
 *
 * Kept free of Agent OS config imports for the same reason as `heavyMaintenanceLeasePrimitives`:
 * a shared pure FUNCTION is ordinary reuse, whereas a second module reading `AiConfig` would be a
 * second resolution path able to disagree with the first. The test is direction — a helper the
 * caller declares FROM is fine; one an entrypoint calls INSTEAD of reading the resolved leaf is the
 * duplicate resolver. Every caller reads its own leaves at its use site and passes them in.
 *
 * ## Why a posture exists at all
 *
 * Off-host sync cannot be defaulted ON. Enablement is a non-empty
 * `maintenance.backup.offHostSync.command` naming an executable, and no default command is
 * knowable for a given deployment — one team syncs with `aws`, another `rclone`, another a bespoke
 * script. A default naming a binary absent from the image would fail on every deployment.
 *
 * So the deployment declares the REQUIREMENT (`orchestrator.cloudOnly.offHostBackupRequired`) and
 * this module reports whether it is MET. That converts a silently-benign reading into a checkable
 * claim: `offHostSync.status: 'disabled'` on a cloud deployment is not a neutral fact, it is an
 * unmet durability requirement — and today it is indistinguishable from a deliberate opt-out.
 * A posture that cannot tell those two apart is an instrument answering about the wrong subject.
 *
 * @module ai/daemons/orchestrator/services/deploymentDurabilityPosture
 */

/**
 * Upper bound for the human-readable `reason`.
 *
 * The reason is now assembled from FIXED sentences per posture and never interpolates config
 * content, so the bound is defence-in-depth rather than the primary control.
 *
 * An earlier revision of this file claimed *"Credential VALUES never reach here: the off-host
 * contract keeps secrets in the process environment and the config carries only allowlisted env
 * NAMES."* That was reasoning about `envAllowlist` and it was wrong about `argv`: a hostile-config
 * probe fed `argv: ['--password=ghp_…{bad}']`, the validator echoed the offending token into its
 * prose, and the token appeared verbatim in the projected posture that `inspect_deployment` returns.
 * The claim was a convention, not an enforced property — which is exactly why the enforcement now
 * lives in the code path and a witness test asserts it.
 * @type {Number}
 */
export const MAX_POSTURE_REASON_LENGTH = 240;

/**
 * The closed set of durability postures — every value any producer may emit in the snapshot's
 * `maintenance.durability.posture` field.
 *
 * `configured` is deliberately not named "satisfied": the config declaring a sync command attests
 * intent, never that the last sync succeeded — that is the backup receipt's `offHostSync.status`,
 * and conflating the two would let a declaration stand in as evidence of an outcome.
 *
 * An earlier revision also listed `unreadable`, for a caller that caught any throw while reading
 * config. That caller is gone: a missing leaf or programming defect must fail loud rather than be
 * laundered into a diagnostic value a consumer cannot distinguish from a real deployment condition.
 * With no producer left, keeping it would be the mirror of the mistake that put it here — an enum
 * advertising a state the system cannot actually be in.
 * @type {String[]}
 */
export const DURABILITY_POSTURES = Object.freeze([
    'configured',
    'not-required',
    'opted-out',
    'unmet'
]);

/**
 * Applies the cloud-profile deployment default to a `cloudOnly`-style tri-state config value.
 * `null`/`undefined` means "use the deployment-profile default" (cloud = true, local = false);
 * an explicit boolean overrides. This is the single home for that rule — `Orchestrator`'s
 * `resolveCloudOnlyEnabled` delegates here rather than restating it.
 *
 * @param {Boolean|null|undefined} configValue Raw tri-state leaf value.
 * @param {String} deploymentMode Resolved `orchestrator.deploymentMode`.
 * @returns {Boolean}
 */
export function resolveCloudOnlyDefault(configValue, deploymentMode) {
    if (configValue != null) return configValue;
    return deploymentMode === 'cloud';
}

/**
 * Bounds a posture reason without splitting a multi-byte character.
 * @param {String} reason
 * @returns {String}
 */
function boundReason(reason) {
    const text = String(reason ?? '');
    return text.length <= MAX_POSTURE_REASON_LENGTH ? text : `${text.slice(0, MAX_POSTURE_REASON_LENGTH - 1)}…`;
}

/**
 * Derives the off-host durability posture from resolved config plus the off-host contract's own
 * validation outcome.
 *
 * The validation outcome is INJECTED rather than computed here, so this module never becomes a
 * second implementation of the enablement predicate: `validateOffHostSyncConfig` in
 * `ai/scripts/maintenance/offHostSync.mjs` owns that contract (it is the module the owning ticket
 * assigned it to, because the keys are plain nested values inside the `maintenance` object leaf).
 *
 * A configured-but-INVALID hook resolves to `unmet` when required, not `configured` — a malformed
 * command will never run, so reporting it as configured would be the same wrong-subject error this
 * posture exists to remove. The reason names the validation error in that case.
 *
 * @param {Object} options
 * @param {String} options.deploymentMode Resolved `orchestrator.deploymentMode`.
 * @param {Boolean|null|undefined} options.offHostBackupRequired Resolved
 * `orchestrator.cloudOnly.offHostBackupRequired` (tri-state; `null` = profile default).
 * @param {{enabled: Boolean, error: String|null}} options.validationOutcome The result of
 * `validateOffHostSyncConfig` against `maintenance.backup.offHostSync`.
 * @returns {{cloudDeployment: Boolean, offHostBackupRequired: Boolean, offHostSyncConfigured: Boolean, offHostSyncConfigValid: Boolean, posture: String, reason: String}}
 */
export function resolveDurabilityPosture({deploymentMode, offHostBackupRequired, validationOutcome} = {}) {
    const
        cloudDeployment = deploymentMode === 'cloud',
        configured      = validationOutcome?.enabled === true,
        configValid     = !validationOutcome?.error,
        required        = resolveCloudOnlyDefault(offHostBackupRequired, deploymentMode),
        // An explicit `false` is a HUMAN decision and stays distinguishable from the profile
        // default; that distinction is the whole point — an unconfigured hook nobody noticed must
        // not read the same as one somebody deliberately switched off.
        optedOut        = offHostBackupRequired === false;

    let posture, reason;

    if (configured) {
        posture = 'configured';
        reason  = 'An off-host sync command is configured; the backup receipt reports whether it last succeeded.';
    } else if (!configValid) {
        // Invalid config is reported even when the deployment does not require off-host backup:
        // a malformed hook is a defect regardless of whether anything depends on it.
        //
        // The validator's PROSE is deliberately not interpolated here. It echoes the offending token,
        // and an operator can put a credential in `argv`, so quoting it would publish that value on a
        // remotely readable surface. `configErrorCode` below classifies the defect instead; the prose
        // stays available to whoever holds the config locally.
        posture = required ? 'unmet' : 'not-required';
        reason  = 'The off-host sync config is invalid and will never run; see `configErrorCode` for the defect class.';
    } else if (optedOut) {
        posture = 'opted-out';
        reason  = 'Off-host backup is explicitly not required for this deployment (deliberate opt-out).';
    } else if (required) {
        posture = 'unmet';
        reason  = cloudDeployment
            ? 'This cloud deployment requires an off-host copy of the backup bundle, but no off-host sync command is configured. The bundle and the data it protects share one failure domain.'
            : 'Off-host backup is required for this deployment, but no off-host sync command is configured.';
    } else {
        posture = 'not-required';
        reason  = 'Off-host backup is not required for this deployment profile.';
    }

    return {
        cloudDeployment,
        // The stable classification of a config defect, or null when the config is valid. This is the
        // ONLY failure detail that crosses into the remotely readable snapshot.
        configErrorCode       : validationOutcome?.errorCode ?? null,
        offHostBackupRequired : required,
        offHostSyncConfigured : configured,
        offHostSyncConfigValid: configValid,
        posture,
        reason                : boundReason(reason)
    };
}
