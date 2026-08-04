#!/usr/bin/env node
/**
 * @module ai/scripts/setup/cohortAdmissibility
 * @summary Answers "may target T take cohort C?" — and when the answer is no, names the leaves that
 * block it and why.
 *
 * ## The gap this closes
 *
 * Four daemons fail CLOSED when a required configuration input is absent — `embed/daemon.mjs`,
 * `message/daemon.mjs`, `wake/daemon.mjs` and `orchestrator/daemon.mjs` each name `--migrate-config`
 * and exit. So moving a lagging deployment onto a newer cohort can produce a plane whose daemons
 * refuse to boot, and nothing in the tree could say so BEFORE the move: `compatibilityContract`,
 * `supportMatrix`, `minimumSupportedRevision` and `externallyAdmissible` return zero hits across
 * `ai/`, `src/` and `buildScripts/`.
 *
 * The raw material already exists and is machine-readable — every leaf that can block a boot
 * declares `requiredFor` on its own descriptor. What was missing is a predicate over it. This module
 * is that predicate and nothing more: it reads, it never migrates, and it never relaxes a guard.
 *
 * ## Derived, never hand-listed
 *
 * The census is walked from the cohort's own `config.data` leaf descriptors. A hand-maintained list
 * of "inputs the new version needs" is exactly what staled in the written upgrade guide, and it
 * stales the same way here — one leaf added without a matching list edit and the predicate starts
 * certifying a plane into a fail-closed boot.
 *
 * ## Unknown is inadmissible, and that INVERTS the runtime matcher
 *
 * `ConfigProvider`'s `matchesContext(list, actual)` is `!list || list.includes(actual)`. With an
 * `actual` of `undefined` and a constraining list that yields FALSE — the requirement does not match,
 * so the runtime treats the leaf as not-required and boots. That is correct for a live process, which
 * knows its own entrypoint and mode by construction.
 *
 * It is exactly wrong here. A target whose mode we cannot state is a target whose requirements we
 * cannot evaluate, and answering "admissible" for it would certify precisely the case we know least
 * about. So this module does NOT reuse that matcher: an unspecified axis that some requirement
 * constrains is reported as INDETERMINATE and the verdict is not admissible. Absence of evidence is
 * never admissibility.
 */

/**
 * @summary Whether a value is a `leaf()` descriptor rather than a namespace node.
 *
 * Mirrors `migrateConfigOverlay.isLeafDescriptor` deliberately rather than importing it: that module
 * is a CLI with side effects at import time, and this one is consulted by selection. The shape it
 * tests is the `leaf()` contract itself, which changing would break both.
 *
 * @param {*} value
 * @returns {Boolean}
 */
export function isLeafDescriptor(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
        Object.hasOwn(value, 'default') && (Object.hasOwn(value, 'env') || Object.hasOwn(value, 'type'))
}

/**
 * @summary Walks a cohort's config data and returns every leaf that can block a boot.
 *
 * Only leaves carrying `requiredFor` are returned — a leaf with a usable default cannot fail a
 * readiness check, so including it would pad the verdict with rows no operator can act on.
 *
 * @param {Object} data A cohort's `config.data` tree (leaf descriptors at the leaves).
 * @param {String} [prefix=''] Internal recursion path.
 * @returns {Object[]} `[{leafPath, env, type, requirements}]`, requirements always an array.
 */
export function collectRequirednessCensus(data, prefix = '') {
    const census = [];

    if (!data || typeof data !== 'object') {
        return census
    }

    for (const [key, value] of Object.entries(data)) {
        const leafPath = prefix ? `${prefix}.${key}` : key;

        if (isLeafDescriptor(value)) {
            // `requiredFor` may sit on the descriptor or inside its metadata bag, depending on how
            // the leaf was declared. Reading only one of the two would silently under-report.
            const declared = value.requiredFor ?? value.metadata?.requiredFor;

            if (declared) {
                census.push({
                    leafPath,
                    env         : value.env ?? null,
                    type        : value.type ?? null,
                    requirements: Array.isArray(declared) ? declared : [declared]
                })
            }

            continue
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            census.push(...collectRequirednessCensus(value, leafPath))
        }
    }

    return census
}

/**
 * @summary Every leaf path a cohort declares, requirement-bearing or not.
 *
 * The requiredness census answers "what could block a boot". This answers "what exists", which is the
 * other half of a migration: a lagging deployment needs to know which of the inputs it currently sets
 * have stopped meaning anything.
 *
 * @param {Object} data A cohort's `config.data` tree.
 * @param {String} [prefix='']
 * @returns {Map<String,{env: String|null}>} Keyed by leaf path.
 */
export function collectLeafPaths(data, prefix = '') {
    const paths = new Map();

    if (!data || typeof data !== 'object') {
        return paths
    }

    for (const [key, value] of Object.entries(data)) {
        const leafPath = prefix ? `${prefix}.${key}` : key;

        if (isLeafDescriptor(value)) {
            paths.set(leafPath, {env: value.env ?? null});
            continue
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [nested, meta] of collectLeafPaths(value, leafPath)) {
                paths.set(nested, meta)
            }
        }
    }

    return paths
}

/**
 * @summary Which leaves a move INTRODUCES and which it RETIRES.
 *
 * Retired keys are not a cosmetic tidy-up. An operator carrying an env var the new cohort no longer
 * declares has a setting that silently does nothing — and the failure mode is worse than useless,
 * because the value LOOKS load-bearing in their compose file and will be preserved through future
 * migrations by anyone reading it as intentional.
 *
 * Direction is explicit rather than inferred from argument order alone: `from` is the cohort the
 * target is ON, `to` is the cohort it would move TO.
 *
 * @param {Object} options
 * @param {Object} options.fromData The cohort the target currently runs.
 * @param {Object} options.toData The cohort under consideration.
 * @returns {{introduced: Object[], retired: Object[]}} Each row `{leafPath, env}`.
 */
export function diffCohortLeafSets({fromData, toData} = {}) {
    const from = collectLeafPaths(fromData),
          to   = collectLeafPaths(toData);

    const introduced = [],
          retired    = [];

    for (const [leafPath, meta] of to) {
        if (!from.has(leafPath)) {
            introduced.push({leafPath, env: meta.env})
        }
    }

    for (const [leafPath, meta] of from) {
        if (!to.has(leafPath)) {
            retired.push({leafPath, env: meta.env})
        }
    }

    return {introduced, retired}
}

/**
 * @summary Classifies ONE requirement against a target context.
 *
 * Three outcomes rather than two, and the third is the point: a requirement that constrains an axis
 * the target has not stated is neither "applies" nor "does not apply" — it is unevaluable, and
 * collapsing it into either is how a predicate starts lying.
 *
 * @param {Object} requirement A `requiredFor` entry.
 * @param {Object} context `{entrypoint, mode, consumerClaims}` — any may be undefined.
 * @returns {{verdict: 'applies'|'excluded'|'indeterminate', unknownAxes: String[]}}
 */
export function classifyRequirement(requirement, context = {}) {
    const axes = [
        {name: 'entrypoints',    constraint: requirement.entrypoints,    actual: context.entrypoint},
        {name: 'modes',          constraint: requirement.modes,          actual: context.mode},
        {name: 'consumerClaims', constraint: requirement.consumerClaims, actual: context.consumerClaims}
    ];

    const unknownAxes = [];

    let excluded = false;

    for (const axis of axes) {
        // `'*'`, null and undefined are the wildcard, exactly as `ConfigProvider.normalizeList`
        // defines it — a wildcard axis constrains nothing, so an unstated actual is harmless there.
        const list = axis.constraint === undefined || axis.constraint === null || axis.constraint === '*'
            ? null
            : (Array.isArray(axis.constraint) ? axis.constraint : [axis.constraint]);

        if (!list) {
            continue
        }

        if (axis.actual === undefined || axis.actual === null) {
            unknownAxes.push(axis.name);
            continue
        }

        // `consumerClaims` is a SET on the target: a claim list matches when any claim the target
        // makes is named. Treating it as a scalar would silently exclude multi-claim targets.
        const actuals = Array.isArray(axis.actual) ? axis.actual : [axis.actual];

        if (!actuals.some(actual => list.includes(actual))) {
            excluded = true
        }
    }

    if (excluded) {
        return {verdict: 'excluded', unknownAxes: []}
    }

    return unknownAxes.length > 0
        ? {verdict: 'indeterminate', unknownAxes}
        : {verdict: 'applies', unknownAxes: []}
}

/**
 * @summary Whether a target supplies a usable value for a leaf's env var.
 *
 * Mirrors `ConfigProvider.isEmptyRequiredValue`: an empty string is ABSENT, not present. A deployment
 * that exports `NEO_AUTH_LOCAL_BEARER_TOKEN=` has not supplied a token, and reading it as supplied is
 * the exact shape that lets a plane certify itself into a fail-closed boot.
 *
 * @param {Object} providedEnv
 * @param {String|null} envVarName
 * @returns {Boolean}
 */
export function providesValue(providedEnv, envVarName) {
    if (!envVarName) {
        return false
    }

    const value = providedEnv?.[envVarName];

    return !(value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
}

/**
 * @summary Answers "may target T take cohort C?".
 *
 * @param {Object} options
 * @param {Object} options.cohortData The cohort's `config.data` tree.
 * @param {Object} options.target `{entrypoint, mode, consumerClaims, providedEnv}`.
 * @returns {{admissible: Boolean, blocking: Object[], indeterminate: Object[], evaluated: Number}}
 *   `blocking` names each leaf whose requirement applies and whose input the target does not supply,
 *   with the requirement's own `reason`. `indeterminate` names each leaf whose applicability could
 *   not be decided, with the axes that were unstated. Admissible only when BOTH are empty.
 */
export function evaluateCohortAdmissibility({cohortData, currentCohortData = null, target = {}} = {}) {
    const census        = collectRequirednessCensus(cohortData),
          providedEnv   = target.providedEnv ?? {},
          blocking      = [],
          indeterminate = [];

    // Retired keys are ADVISORY and deliberately do not affect the verdict: an input the new cohort
    // no longer declares cannot fail a readiness check, so refusing the move over one would block a
    // migration for a setting that is merely inert. Reported, never gating.
    const retired = currentCohortData
        ? diffCohortLeafSets({fromData: currentCohortData, toData: cohortData}).retired
            .filter(row => row.env && providesValue(providedEnv, row.env))
        : [];

    for (const entry of census) {
        for (const requirement of entry.requirements) {
            const {verdict, unknownAxes} = classifyRequirement(requirement, target);

            if (verdict === 'excluded') {
                continue
            }

            if (verdict === 'indeterminate') {
                indeterminate.push({
                    leafPath: entry.leafPath,
                    env     : entry.env,
                    unknownAxes,
                    reason  : requirement.reason ?? null
                });
                continue
            }

            if (!providesValue(providedEnv, entry.env)) {
                blocking.push({
                    leafPath: entry.leafPath,
                    env     : entry.env,
                    reason  : requirement.reason ?? null,
                    requirement
                })
            }
        }
    }

    return {
        admissible: blocking.length === 0 && indeterminate.length === 0,
        blocking,
        indeterminate,
        retired,
        evaluated : census.length
    }
}

/**
 * @summary Renders a verdict as operator-readable lines.
 *
 * A bare boolean is unactionable — an operator told "inadmissible" with no leaf named cannot move
 * their deployment, and the written guide this replaces failed exactly by not being specific.
 *
 * @param {Object} verdict Output of {@link evaluateCohortAdmissibility}.
 * @returns {String[]}
 */
export function formatAdmissibilityVerdict(verdict) {
    // Retired keys are reported on BOTH verdicts. An admissible move still leaves the operator holding
    // inputs that no longer mean anything, and a verdict that says only "ADMISSIBLE" sends them into
    // the migration still carrying them.
    const retiredLines = (verdict.retired ?? []).flatMap(row => [
        `  RETIRED   ${row.leafPath}${row.env ? ` (${row.env})` : ''}`,
        '            You set this and the target cohort no longer declares it — inert, not blocking. Remove it, or a future reader preserves it as intentional.'
    ]);

    if (verdict.admissible) {
        return [
            `ADMISSIBLE — ${verdict.evaluated} requirement-bearing leaf/leaves evaluated, none blocking.`,
            ...retiredLines
        ]
    }

    const lines = [`NOT ADMISSIBLE — ${verdict.blocking.length} blocking, ${verdict.indeterminate.length} indeterminate.`];

    for (const row of verdict.blocking) {
        lines.push(`  BLOCKING  ${row.leafPath}${row.env ? ` (${row.env})` : ''}`);
        if (row.reason) {
            lines.push(`            ${row.reason}`)
        }
    }

    for (const row of verdict.indeterminate) {
        lines.push(`  UNKNOWN   ${row.leafPath}${row.env ? ` (${row.env})` : ''} — target did not state: ${row.unknownAxes.join(', ')}`);
        lines.push('            Unknown is not admissible: the requirement may or may not apply, and guessing favours the case we know least about.')
    }

    lines.push(...retiredLines);

    return lines
}
