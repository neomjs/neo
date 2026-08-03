/**
 * @module ai/scripts/maintenance/deploymentMigrationCore
 * @summary Pure core for the migration bootstrap: derives a deployment's config-contract delta from
 * the classified census, joins it with the plane-side facts only a plane-side reader can observe, and
 * decides whether one `apply` is authorized or refused with named reasons.
 *
 * ## One tool, one resolver — and why that is the cheap shape rather than the expedient one
 *
 * An earlier revision consumed this delta as JSON from a separate discovery driver and carried **no
 * derivation of its own**, deliberately, so that two resolvers for one contract could not disagree.
 * That reasoning was sound and its premise is gone: the separate driver was closed as not-planned,
 * priced at *"a new CLI contract, JSON schema, tests, documentation, and ongoing compatibility
 * surface"*. Every one of those costs is an artifact of the **split**, not of the capability — so
 * folding derivation into this single tool removes all of them and still leaves exactly one resolver.
 * There is no second path here to disagree with.
 *
 * ## Why the delta is a CONFIG delta and not a revision delta
 *
 * A rebuild at a newer revision does not repair a deployment whose config no longer satisfies the
 * contract; it produces a refused launch. The orchestrator's authority role is the worked case: its
 * leaf carries no default, so a deployment that never declares its role writes no state directory, no
 * PID file and no log. The config delta decides whether a migration can work at all; the revision
 * delta is secondary.
 *
 * ## Observed, never re-derived
 *
 * The env input must come from the target's own containers. Host-side re-derivation cannot populate an
 * observed column — it degrades the comparison to desired-versus-desired, which passes trivially and
 * detects nothing. A planner fed the canonical Compose file would report every deployment compliant.
 *
 * ## What the census cannot supply
 *
 * A contract says what a deployment must declare. Apply must also read the *plane*: which Compose
 * project and file list the running containers belong to, and whether the cohort agrees with itself
 * about its revision. Neither is derivable from the census, and both can refuse an apply that a clean
 * contract delta would otherwise authorize.
 *
 * ## Neo-free on purpose
 *
 * No Neo import, no Docker call, no filesystem read: every refusal branch is reachable from a plain
 * object, so the gate is unit-testable without a container or a plane.
 */

/**
 * The env namespace the deployment contract governs. The guarded Compose surface is counted in
 * `NEO_*`/`MCP_*` keys, so anything outside it (image `PATH`, `NODE_VERSION`, Docker injections) is not
 * ours to judge and is dropped rather than reported as unexpected.
 * @type {RegExp}
 */
const GUARDED_ENV_KEY = /^(?:NEO|MCP)_/;

/**
 * The census key whose absence stops a container from starting at all rather than degrading it. Its
 * leaf carries no default, so requiredness is armed by that emptiness and a launch declaring no role is
 * refused outright — a different triage priority from an ordinary missing input, and the one key an
 * operator reading a long list must see first.
 * @type {String}
 */
const BOOT_BLOCKING_KEY = 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE';

/**
 * @summary Parses a Docker `Config.Env` array (`['KEY=value', …]`) into a Map of the guarded keys only.
 *
 * Splits on the FIRST `=` because values legitimately contain `=` (base64, query strings, DSNs);
 * splitting on all of them would truncate a value and make a present key look malformed. A bare `KEY`
 * with no `=` is recorded with an empty-string value — Docker permits it, and treating it as absent
 * would hide a key that was set-but-empty, which is a different defect from unset.
 * @param {String[]} envArray Raw `Config.Env` entries; a non-array yields an empty Map.
 * @returns {Map<String,String>} Guarded key → value, insertion-ordered.
 */
export function parseObservedEnv(envArray) {
    const observed = new Map();

    if (!Array.isArray(envArray)) {
        return observed
    }

    for (const entry of envArray) {
        if (typeof entry !== 'string') {
            continue
        }

        const separatorIndex = entry.indexOf('='),
              key            = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex);

        if (GUARDED_ENV_KEY.test(key)) {
            observed.set(key, separatorIndex === -1 ? '' : entry.slice(separatorIndex + 1))
        }
    }

    return observed
}

/**
 * @summary Resolves one profile's classified census out of the config-leaf parity document, failing closed.
 *
 * Throws rather than defaulting on an unknown profile. A default would silently plan against the
 * canonical cloud contract for a deployment running a different one, and the resulting plan would read
 * as authoritative — the census is per-profile precisely because the contracts differ.
 * @param {Object} parity The parsed `ai/scripts/lint/config-leaf-parity.json`.
 * @param {String} profile Repo-relative Compose path, e.g. `ai/deploy/docker-compose.yml`.
 * @returns {Object} `{requiredDeploymentInputs, optionalOverrides, secrets, forbiddenEnv, profile}`
 * @throws {Error} When the parity document, its parity block, or the profile is absent or mismatched.
 */
export function resolveCensus(parity, profile) {
    const parityBlock = parity?.$composeDefaultParity;

    if (!parityBlock) {
        throw new Error('config-leaf-parity.json carries no $composeDefaultParity block — cannot plan against an unknown contract')
    }

    const profiles = parityBlock.profiles || {};

    if (!Object.prototype.hasOwnProperty.call(profiles, profile)) {
        throw new Error(
            `profile '${profile}' is not declared in $composeDefaultParity.profiles ` +
            `(declared: ${Object.keys(profiles).join(', ') || 'none'}) — refusing to plan against a defaulted contract`
        )
    }

    const census = parityBlock.census || {};

    // The census block names ONE profile. Planning another against it would compare a deployment to a
    // contract that is not its own, so say so instead of proceeding.
    if (census.profile && census.profile !== profile) {
        throw new Error(
            `the census describes profile '${census.profile}', not '${profile}' — ` +
            'the classified key lists are per-profile and cannot be reused across contracts'
        )
    }

    return {
        profile,
        requiredDeploymentInputs: Array.isArray(census.requiredDeploymentInputs) ? census.requiredDeploymentInputs : [],
        optionalOverrides       : Array.isArray(census.optionalOverrides)        ? census.optionalOverrides        : [],
        secrets                 : Array.isArray(census.secrets)                  ? census.secrets                  : [],
        forbiddenEnv            : parityBlock.forbiddenEnv || {}
    }
}

/**
 * @summary Derives the config-contract delta by comparing the observed env against the census.
 *
 * The single resolver. Reason text for a forbidden key is taken **verbatim from the census**, which
 * already declares each one's replacement guidance — re-authoring it here would create a second copy
 * free to drift from the authority it paraphrases.
 * @param {Map<String,String>} observedEnv Output of {@link parseObservedEnv}.
 * @param {Object}             census      Output of {@link resolveCensus}.
 * @returns {Object} `{missingRequired, presentForbidden, missingSecrets, optionalPresent}`
 */
export function deriveContractDelta(observedEnv, census) {
    return {
        missingRequired : census.requiredDeploymentInputs
            .filter(key => !observedEnv.has(key))
            .map(key => ({
                key,
                bootBlocking: key === BOOT_BLOCKING_KEY,
                reason      : key === BOOT_BLOCKING_KEY
                    ? 'declared required with no leaf default, so a launch that does not declare it is refused rather than degraded'
                    : 'declared in the census as a required deployment input and absent from the observed deployment'
            })),
        presentForbidden: Object.keys(census.forbiddenEnv)
            .filter(key => observedEnv.has(key))
            .map(key => ({key, reason: String(census.forbiddenEnv[key])})),
        missingSecrets  : census.secrets
            .filter(key => !observedEnv.has(key))
            .map(key => ({key, reason: 'declared as a required secret and absent from the observed deployment'})),
        optionalPresent : census.optionalOverrides.filter(key => observedEnv.has(key))
    }
}

/**
 * @summary Normalizes one finding entry to `{key, reason}`, tolerating a bare string key.
 * @param {Object|String} finding
 * @returns {Object} `{key, reason}`
 */
function normalizeFinding(finding) {
    if (typeof finding === 'string') {
        return {key: finding, reason: ''}
    }

    return {key: String(finding?.key ?? '<unnamed>'), reason: String(finding?.reason ?? '')}
}

/**
 * @summary Builds the apply gate: blockers that refuse, unchecked items that must be reported rather
 * than passed over, and informational notes.
 *
 * Three buckets, and the middle one is the point. An input nothing could evaluate — an overlay the
 * operator did not supply, a stopped container whose revision is unreadable — is neither a pass nor a
 * failure, and collapsing it into either is how a partial plan reads as complete. `unchecked` never
 * blocks; it travels into the apply receipt so the operator sees exactly what was not proven.
 *
 * @param {Object}             config
 * @param {Map<String,String>} config.observedEnv        Guarded env observed on the target's containers.
 * @param {Object}             config.census             Output of {@link resolveCensus}.
 * @param {Object}             config.composeIdentity    `{project, configFiles}` read off the running plane; `null` when undiscoverable.
 * @param {Object}             config.deployedRevisions  Service name → revision string, or `null` for unreadable.
 * @param {String|null}        config.targetRevision     The resolved 40-hex target, or `null` when resolution failed.
 * @param {String[]}           [config.uncheckedNotes]   Entrypoint-supplied items it could not evaluate.
 * @returns {Object} `{clean, blockers, unchecked, notes, revisionDelta, contractDelta}`
 */
export function buildMigrationPlan({observedEnv, census, composeIdentity, deployedRevisions, targetRevision, uncheckedNotes = []}) {
    const blockers  = [],
          unchecked = [...uncheckedNotes],
          notes     = [];

    // 1. An unreadable target cannot be compared to any contract. Refused before deriving anything,
    // because an EMPTY observed set would otherwise derive "every required key is missing" — a
    // spectacular-looking delta whose real cause is that nothing was read.
    if (!(observedEnv instanceof Map) || observedEnv.size === 0) {
        blockers.push({
            kind  : 'no-observed-env',
            key   : 'Config.Env',
            reason: 'no guarded env was read from the target, so the contract delta would be derived from an empty ' +
                    'observation and every required key would appear missing for the wrong reason'
        })
    }

    const contractDelta   = deriveContractDelta(observedEnv instanceof Map ? observedEnv : new Map(), census),
          missingRequired = contractDelta.missingRequired.map(normalizeFinding),
          forbiddenSet    = contractDelta.presentForbidden.map(normalizeFinding),
          missingSecrets  = contractDelta.missingSecrets.map(normalizeFinding);

    // 2. The contract delta as blockers. Boot-blocking gets its own kind: a refused launch is a
    // different triage priority from a degraded one, and it is the one key an operator reading a long
    // list must see first.
    missingRequired.forEach(({key, reason}) => {
        const bootBlocking = contractDelta.missingRequired.some(entry => entry.key === key && entry.bootBlocking === true);

        blockers.push({
            kind  : bootBlocking ? 'missing-required-input-boot-blocking' : 'missing-required-input',
            key,
            reason
        })
    });

    forbiddenSet.forEach(({key, reason}) => blockers.push({
        kind  : 'forbidden-env-present',
        key,
        reason: reason || 'declared retired or derived by the census and still set on the target'
    }));

    missingSecrets.forEach(({key, reason}) => blockers.push({
        kind  : 'missing-secret',
        key,
        reason: reason || 'declared as a required secret and absent from the target'
    }));

    contractDelta.optionalPresent.forEach(key => notes.push(`optional override set: ${key}`));

    // Secrets are named in the census but their VALUES are not observable through container env in
    // every deployment shape, so a satisfied secret list is weaker evidence than a satisfied required
    // list. Say so rather than letting a clean secrets check read as a proof it is not.
    if (census.secrets.length && missingSecrets.length === 0) {
        unchecked.push(
            `secret presence was checked by env key only (${census.secrets.length} declared) — a key set to an ` +
            'empty or stale value reads as present'
        )
    }

    // 3. Compose identity — a plane-side fact the census cannot supply. Undiscoverable identity is a
    // blocker and never a default, because the shipped pipeline's own defaults (`neo-agent-os`, one
    // compose file) would address a DIFFERENT project with the overlay dropped.
    if (!composeIdentity?.project || !Array.isArray(composeIdentity.configFiles) || composeIdentity.configFiles.length === 0) {
        blockers.push({
            kind  : 'compose-identity-undiscoverable',
            key   : 'com.docker.compose.project.config_files',
            reason: "the target's Compose project and file list could not be read from its containers; " +
                    'applying would fall back to the pipeline default and address a different project'
        })
    } else {
        notes.push(`compose identity: project '${composeIdentity.project}', ${composeIdentity.configFiles.length} file(s)`)
    }

    if (!targetRevision) {
        blockers.push({
            kind  : 'target-revision-unresolved',
            key   : 'target',
            reason: 'the desired revision could not be resolved to a single commit; refusing to plan against an unpinned target'
        })
    }

    // 4. Cohort agreement — the other plane-side fact. A cohort that disagrees with itself is a
    // partially-applied prior run: the "before" half of the receipt would be a fiction, and the
    // services left behind are the ones a fresh apply is most likely to strand.
    const readableValues  = Object.values(deployedRevisions || {}).filter(Boolean),
          distinctRunning = new Set(readableValues);

    Object.entries(deployedRevisions || {}).forEach(([service, revision]) => {
        if (!revision) {
            unchecked.push(`service '${service}': /app/.neo-revision unreadable — its before-state is not established`)
        }
    });

    if (readableValues.length === 0) {
        blockers.push({
            kind  : 'no-readable-revision',
            key   : '/app/.neo-revision',
            reason: 'no service reported a revision, so neither the delta nor the post-apply assertion has a baseline'
        })
    } else if (distinctRunning.size > 1) {
        blockers.push({
            kind  : 'cohort-revision-split',
            key   : '/app/.neo-revision',
            reason: `services report ${distinctRunning.size} different revisions (${[...distinctRunning].join(', ')}) — ` +
                    'a partially-applied prior run must be reconciled before a new migration is planned'
        })
    }

    // 5. The revision delta — reported, never a blocker. Already-at-target is a legitimate outcome:
    // the CONFIG delta decides whether a deployment is healthy, and a plane can be current on
    // revision while still missing a required input.
    const singleRunning = distinctRunning.size === 1 ? [...distinctRunning][0] : null,
          alreadyTarget = Boolean(singleRunning && targetRevision && singleRunning === targetRevision);

    if (alreadyTarget) {
        notes.push(`already at target revision ${targetRevision} — apply would deliver no code change`)
    }

    return {
        clean        : blockers.length === 0,
        blockers,
        unchecked,
        notes,
        revisionDelta: {from: singleRunning, to: targetRevision, alreadyTarget},
        contractDelta: {
            profile         : census.profile,
            missingRequired : missingRequired.map(({key}) => key),
            presentForbidden: forbiddenSet.map(({key}) => key),
            missingSecrets  : missingSecrets.map(({key}) => key),
            optionalPresent : contractDelta.optionalPresent,
            observedKeyCount: observedEnv instanceof Map ? observedEnv.size : 0
        }
    }
}

/**
 * @summary Renders a plan as operator-readable text. Blockers first, because the plan's job is to say
 * why `apply` is refused before it says anything reassuring.
 * @param {Object} plan Output of {@link buildMigrationPlan}.
 * @returns {String} Multi-line report, no trailing newline.
 */
export function formatPlan(plan) {
    const lines = ['[migrate] === MIGRATION PLAN ==='];

    lines.push(`[migrate] revision: ${plan.revisionDelta.from || '<unreadable>'} -> ${plan.revisionDelta.to || '<unresolved>'}`);

    if (plan.blockers.length) {
        lines.push('', `[migrate] BLOCKERS (${plan.blockers.length}) — apply is refused:`);

        // Boot-blocking first: a refused launch is a different triage priority from a degraded one.
        const ordered = [
            ...plan.blockers.filter(blocker => blocker.kind === 'missing-required-input-boot-blocking'),
            ...plan.blockers.filter(blocker => blocker.kind !== 'missing-required-input-boot-blocking')
        ];

        ordered.forEach(({kind, key, reason}) => lines.push(`[migrate]   ✖ ${kind}: ${key}`, `[migrate]       ${reason}`))
    } else {
        lines.push('', '[migrate] no blockers — apply is authorized')
    }

    if (plan.unchecked.length) {
        lines.push('', `[migrate] NOT VERIFIED (${plan.unchecked.length}) — neither passed nor failed:`);
        plan.unchecked.forEach(item => lines.push(`[migrate]   ? ${item}`))
    }

    if (plan.notes.length) {
        lines.push('', '[migrate] notes:');
        plan.notes.forEach(note => lines.push(`[migrate]   · ${note}`))
    }

    lines.push('', `[migrate] verdict: ${plan.clean ? 'CLEAN' : 'REFUSED'}`);

    return lines.join('\n')
}
