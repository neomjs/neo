/**
 * @module ai/scripts/maintenance/deploymentMigrationCore
 * @summary Pure core for the migration bootstrap's apply gate: validates a discover result produced by
 * the census-derived discover driver, joins it with the plane-side facts only this tool observes, and
 * decides whether one `apply` is authorized or refused with named reasons.
 *
 * ## The boundary, and why there is no fallback derivation
 *
 * The discover driver owns DISCOVERY — deriving missing-required / present-forbidden / missing-secret
 * keys from the classified config census and emitting them as JSON. This module owns CONSUMPTION and
 * the apply gate. It deliberately carries **no census derivation of its own**, not even as a fallback
 * for an absent discover result: two resolvers for one contract can disagree, and the disagreement
 * surfaces as a migration that was authorized against the wrong answer. A parallel resolution path
 * running beside the canonical one is the shape this repository has already had to retire once, so an
 * absent discover result refuses rather than falling back.
 *
 * ## What this module knows that the discover driver cannot
 *
 * Discovery reads a contract. Apply must also read the *plane*: which Compose project and file list
 * the running containers actually belong to, and whether the cohort agrees with itself about the
 * revision it is on. Neither is derivable from the census, and both can refuse an apply that a clean
 * discover result would otherwise authorize.
 *
 * ## Neo-free on purpose
 *
 * No Neo import, no Docker call, no filesystem read: every refusal branch is reachable from a plain
 * object, so the gate is unit-testable without a container or a plane.
 */

/**
 * The discover-result schema version this core consumes. A mismatch refuses rather than best-efforts:
 * a shape change in the producer must fail loudly here, because the failure mode of silent
 * mis-parsing is an apply authorized against fields that were never populated.
 * @type {Number}
 */
export const DISCOVER_SCHEMA_VERSION = 1;

/**
 * The finding lists a discover result must carry. Presence is required; emptiness is fine and is the
 * normal clean case. An ABSENT list is refused because absent and empty are the same shape once
 * parsed, and treating a missing list as empty reads "you are fine" from a producer that never ran
 * that check — the exact failure the discover contract forbids: never report an empty delta.
 * @type {String[]}
 */
const REQUIRED_FINDING_LISTS = ['missingRequired', 'presentForbidden', 'missingSecrets'];

/**
 * @summary Validates a parsed discover result against the consumed contract, returning named problems
 * rather than throwing.
 *
 * Every problem returned here becomes an apply blocker. Refusing on shape is deliberate: this tool
 * mutates a deployment, so it must not proceed on a payload it only partly understood.
 * @param {Object} discover The parsed JSON output of the discover driver.
 * @param {String} [expectedProfile] When given, the result's profile must match it exactly.
 * @returns {String[]} Problem descriptions; empty means the payload is consumable.
 */
export function validateDiscoverResult(discover, expectedProfile) {
    const problems = [];

    if (!discover || typeof discover !== 'object' || Array.isArray(discover)) {
        return ['discover result is not an object — nothing to validate']
    }

    if (discover.schemaVersion !== DISCOVER_SCHEMA_VERSION) {
        problems.push(
            `discover schemaVersion is ${JSON.stringify(discover.schemaVersion)}; this consumer implements ` +
            `${DISCOVER_SCHEMA_VERSION} — refusing to interpret an unknown shape`
        )
    }

    if (typeof discover.profile !== 'string' || !discover.profile) {
        problems.push('discover result carries no profile — the census is per-profile, so an unlabelled result cannot be trusted')
    } else if (expectedProfile && discover.profile !== expectedProfile) {
        problems.push(`discover result describes profile '${discover.profile}' but this run targets '${expectedProfile}'`)
    }

    REQUIRED_FINDING_LISTS.forEach(listName => {
        if (!Array.isArray(discover[listName])) {
            problems.push(`discover result is missing the '${listName}' list — absent and empty are indistinguishable once parsed, so absence is refused`)
        }
    });

    // A producer that reports its own findings but claims nothing about cleanliness leaves the gate
    // deciding a question the producer was meant to answer.
    if (typeof discover.clean !== 'boolean') {
        problems.push("discover result carries no boolean 'clean' verdict")
    }

    return problems
}

/**
 * @summary Normalizes one finding entry to `{key, reason}`, tolerating a bare string key.
 *
 * The reason text is taken verbatim from the producer and never re-authored: the census already
 * declares each forbidden key's replacement guidance, and a second copy here would drift from it.
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
 * @param {Object}      config
 * @param {Object}      config.discover           Parsed discover result from the discover driver.
 * @param {Object}      config.composeIdentity    `{project, configFiles}` read off the running plane; `null` when undiscoverable.
 * @param {Object}      config.deployedRevisions  Service name → revision string, or `null` for unreadable.
 * @param {String|null} config.targetRevision     The resolved 40-hex target, or `null` when resolution failed.
 * @param {String}      [config.expectedProfile]  Profile the discover result must describe.
 * @param {String[]}    [config.uncheckedNotes]   Entrypoint-supplied items it could not evaluate.
 * @returns {Object} `{clean, blockers, unchecked, notes, revisionDelta, discoverFindings}`
 */
export function buildMigrationPlan({discover, composeIdentity, deployedRevisions, targetRevision, expectedProfile, uncheckedNotes = []}) {
    const blockers  = [],
          unchecked = [...uncheckedNotes],
          notes     = [];

    // 1. The consumed payload itself. A shape problem refuses before any finding is read, because a
    // payload this core only partly understood cannot authorize a mutation.
    const shapeProblems = validateDiscoverResult(discover, expectedProfile);

    shapeProblems.forEach(reason => blockers.push({kind: 'discover-result-invalid', key: 'discover', reason}));

    const usable          = shapeProblems.length === 0,
          missingRequired = usable ? discover.missingRequired.map(normalizeFinding)  : [],
          forbiddenSet    = usable ? discover.presentForbidden.map(normalizeFinding) : [],
          missingSecrets  = usable ? discover.missingSecrets.map(normalizeFinding)   : [];

    // 2. The contract delta, forwarded as blockers. `bootBlocking` is surfaced as a distinct kind
    // because the discover contract distinguishes it: a missing authority role is a refused launch, not a
    // degraded one, and an operator triaging a long list needs that ordering.
    missingRequired.forEach(({key, reason}) => {
        const bootBlocking = usable && discover.missingRequired.some(entry => entry?.key === key && entry?.bootBlocking === true);

        blockers.push({
            kind  : bootBlocking ? 'missing-required-input-boot-blocking' : 'missing-required-input',
            key,
            reason: reason || 'declared in the census as a required deployment input and absent from the target'
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

    // A producer that reports no findings but calls itself dirty knows something this gate does not;
    // trusting the findings over the verdict would silently discard it.
    if (usable && discover.clean === false && missingRequired.length + forbiddenSet.length + missingSecrets.length === 0) {
        blockers.push({
            kind  : 'discover-verdict-unexplained',
            key   : 'clean',
            reason: 'the discover result reports clean=false while listing no findings — refusing rather than resolving the contradiction'
        })
    }

    if (usable && Array.isArray(discover.unchecked)) {
        unchecked.push(...discover.unchecked.map(item => `discover: ${item}`))
    }

    // 3. Compose identity — a plane-side fact discovery cannot supply. Undiscoverable identity is a
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
        clean           : blockers.length === 0,
        blockers,
        unchecked,
        notes,
        revisionDelta   : {from: singleRunning, to: targetRevision, alreadyTarget},
        discoverFindings: {
            missingRequired : missingRequired.map(({key}) => key),
            presentForbidden: forbiddenSet.map(({key}) => key),
            missingSecrets  : missingSecrets.map(({key}) => key)
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
