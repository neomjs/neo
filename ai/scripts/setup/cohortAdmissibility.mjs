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
 * ## Why it lives here, and why it carries no shebang
 *
 * Settled rather than left implicit, because a consumed library and a one-shot script want different
 * homes and this directory holds both. It stays beside `migrateConfigOverlay.mjs`, which covers the
 * config-overlay half of the same problem while stating it never handles env-resolved values — this
 * module is the half that was left uncovered, so the pair belongs together. `initServerConfigs.mjs`
 * and `seedAgentIdentities.mjs` are the precedent that a library is at home in this directory; the
 * folder is not CLI-only.
 *
 * It carried `#!/usr/bin/env node` on the way in, and that was simply wrong: there is no argv
 * handling, no `import.meta.url` entry guard, and no `main()` — only exports. A shebang announces
 * "runnable as a program", so on a pure library it misdeclares the file to every reader and to any
 * census that sorts scripts from libraries. Removed rather than made true.
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
 *
 * That rule holds at TWO levels, and the second is easy to miss because the first one reads as though
 * it covered everything. Missing evidence about the TARGET is handled by the matcher above; missing
 * evidence about the COHORT ITSELF is handled by {@link assessCohortSource}, which runs BEFORE any
 * finding is drawn. Without it, an unreadable cohort produces an empty census, an empty census reads
 * as "nothing blocked", and the weakest possible evidence yields the strongest possible verdict.
 *
 * ## `providedEnv` MUST be the RENDERED environment, not the declared one
 *
 * This is a caller contract and getting it wrong produces the one failure direction this module
 * cannot tolerate: a FALSE INADMISSIBLE that refuses a migration which would have succeeded.
 *
 * The reference Compose profile does not template every required value. `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE`
 * is written as a literal — `ai/deploy/docker-compose.yml:270` and `docker-compose.dev.yml:318` both
 * pin `container-plane` directly rather than interpolating `${...}`. A caller that reads the
 * deployment's `.env` file and passes that as `providedEnv` therefore sees the key as absent, and this
 * predicate correctly reports the input it was given as missing — while the daemon it is asked about
 * would have booted fine.
 *
 * So resolve the target's environment the way the daemon will actually see it (`docker compose config`
 * against the target's own ordered profile set, or the container's inspected env), never the
 * hand-authored overlay alone.
 *
 * The same hardcoding defeats an env-based override in the other direction: exporting this key into a
 * parent process does not change the rendered service either. A `docker compose config` render shows
 * it staying `container-plane` while an interpolated control such as `NEO_DEPLOY_HOSTNAME` picks up
 * its override normally — so the render, not the export, is the boundary that settles both questions.
 * @plane in-plane
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
 * @summary Which keys the target sets that the parity census forbids — each with its recorded reason.
 *
 * `config-leaf-parity.json`'s `forbiddenEnv` is a key→reason map covering three distinct classes that
 * share one instruction, *stop setting this*: **retired** controls whose owner moved (`NEO_AUTO_DREAM`
 * — *"the orchestrator owns Dream"*), **derived** values the runtime computes for itself (the
 * `NEO_AUTH_*` family — *"derived from auth.mode"*), and **posture-fixed** keys a canonical deployment
 * does not get to choose (`NEO_AI_DEPLOYMENT_MODE`).
 *
 * This is the half {@link diffCohortLeafSets} structurally cannot supply. A diff derives THAT a key
 * stopped being declared; only this map records WHY, and the why is the entire actionable content —
 * "no longer declared" tells an operator nothing about what replaced it.
 *
 * ADVISORY, and that is an evidential claim rather than a cautious one: `lint-config-template-ssot.mjs`
 * enforces this map against OUR Compose profiles in OUR CI, and nothing measured shows a foreign plane
 * refusing to boot on one. Gating on it would assert a failure mode we have not observed.
 *
 * @param {Object} options
 * @param {Object} options.providedEnv The target's resolved environment.
 * @param {Object|null} options.forbiddenEnv `$composeDefaultParity.forbiddenEnv`, key → reason.
 * @returns {Object[]} Rows `{env, reason}`, only for keys the target actually supplies.
 */
export function collectForbiddenKeysInUse({providedEnv = {}, forbiddenEnv = null} = {}) {
    if (!forbiddenEnv) {
        return []
    }

    return Object.entries(forbiddenEnv)
        .filter(([env]) => providesValue(providedEnv, env))
        .map(([env, reason]) => ({env, reason: reason ?? null}))
}

/**
 * @summary Whether the cohort evidence was actually OBSERVED, before any finding is drawn from it.
 *
 * **"No blockers found" and "no cohort was observed" are different states, and only the first is a
 * permission.** Folding them together is the failure this guard exists to prevent: an empty finding
 * set read as a clean bill, so a loader that returned nothing, an import that failed, or a path that
 * pointed at the wrong tree all render as ADMISSIBLE — the strongest possible verdict produced by the
 * weakest possible evidence.
 *
 * That inversion is worse here than anywhere else in this module. Every other branch refuses when it
 * cannot decide; this one would grant permission precisely when it knows least, on a predicate whose
 * whole purpose is to keep a plane out of a fail-closed boot.
 *
 * ## The discriminator is leaf descriptors, NOT requirements
 *
 * A cohort that carries descriptors but none with `requiredFor` is a legitimate, fully-observed cohort
 * with nothing that can block a boot — it must stay admissible. A cohort with no descriptors at all is
 * not a permissive cohort, it is a failed reading. Counting requirements conflates the two; counting
 * descriptors separates them, because a real `config.data` tree carries hundreds of leaves whether or
 * not any of them constrain anything.
 *
 * @param {*} cohortData The value handed in as the cohort's `config.data` tree.
 * @returns {{observed: Boolean, leafCount: Number, reason: String|null}}
 */
export function assessCohortSource(cohortData) {
    if (cohortData === undefined || cohortData === null) {
        return {
            observed : false,
            leafCount: 0,
            reason   : 'No cohort data was supplied. This is a failed observation, not an empty ' +
                'cohort — resolve the candidate\'s config tree and re-run rather than reading this as a pass.'
        }
    }

    if (typeof cohortData !== 'object' || Array.isArray(cohortData)) {
        return {
            observed : false,
            leafCount: 0,
            reason   : `Cohort data is ${Array.isArray(cohortData) ? 'an array' : `a ${typeof cohortData}`}, ` +
                'not a config tree. Something upstream returned the wrong shape; a verdict drawn from it would be meaningless.'
        }
    }

    const leafCount = collectLeafPaths(cohortData).size;

    if (leafCount === 0) {
        return {
            observed : false,
            leafCount: 0,
            reason   : 'The cohort tree carries no leaf descriptors at all. A real config tree carries ' +
                'hundreds regardless of what they require, so zero means the tree was not read — not that it demands nothing.'
        }
    }

    return {observed: true, leafCount, reason: null}
}

/**
 * @summary Answers "may target T take cohort C?".
 *
 * @param {Object} options
 * @param {*} options.cohortData The cohort's `config.data` tree — typed `{*}` deliberately, NOT
 *   `{Object}`. This function is specified to accept `undefined`, `null`, a scalar, an array and a
 *   descriptor-free tree, and to refuse each of them through `sourceError`. Annotating it `{Object}`
 *   would tell a caller to pre-validate, and the two ways they would do that are both wrong: a
 *   duplicate upstream guard reimplements this one less carefully, and throwing on a non-object lets
 *   a single unreadable candidate abort a whole selection pass instead of being skipped and recorded.
 * @param {Object} [options.currentCohortData=null] The cohort the target is ON, for retirement diffing.
 *   Omitted means retirement is not guessed — absence of a comparison point is not evidence.
 * @param {Object} [options.forbiddenEnv=null] `$composeDefaultParity.forbiddenEnv`, key → reason.
 * @param {Object} options.target `{entrypoint, mode, consumerClaims, providedEnv}`.
 * @returns {{admissible: Boolean, sourceError: Object|null, blocking: Object[], indeterminate: Object[], retired: Object[], forbidden: Object[], evaluated: Number}}
 *   `blocking` names each leaf whose requirement applies and whose input the target does not supply,
 *   with the requirement's own `reason`. `indeterminate` names each leaf whose applicability could
 *   not be decided, with the axes that were unstated. Admissible only when BOTH are empty.
 *
 *   `sourceError` is the discriminator between the two ways a verdict can be inadmissible, and a
 *   consumer that ignores it collapses them back together. It is `{observed, leafCount, reason}` when
 *   the cohort could not be READ — a failed load, a wrong shape, a tree with no leaf descriptors — and
 *   **`null` on every successfully-observed evaluation**, including inadmissible ones. So
 *   `admissible: false` with `sourceError: null` means *this cohort does not fit this target*, while a
 *   non-null `sourceError` means *we never saw a cohort at all*; the first is a fact about the target,
 *   the second is a fault upstream of it, and an operator acts on them differently.
 *
 *   `retired` and `forbidden` are ADVISORY and never affect `admissible` — neither can fail a
 *   readiness check, so gating on them would refuse a migration for an input that is merely inert.
 */
export function evaluateCohortAdmissibility({cohortData, currentCohortData = null, forbiddenEnv = null, target = {}} = {}) {
    // FIRST, and before any finding is drawn: was the cohort observed at all? An unreadable source
    // must never reach the census loop, because an empty census is indistinguishable from a clean one
    // once it gets there — and "nothing blocked" would then be reported as permission.
    const source = assessCohortSource(cohortData);

    if (!source.observed) {
        return {
            admissible   : false,
            sourceError  : source,
            blocking     : [],
            indeterminate: [],
            retired      : [],
            forbidden    : [],
            evaluated    : 0
        }
    }

    const census        = collectRequirednessCensus(cohortData),
          providedEnv   = target.providedEnv ?? {},
          blocking      = [],
          indeterminate = [];

    // Retired keys are ADVISORY and deliberately do not affect the verdict: an input the new cohort
    // no longer declares cannot fail a readiness check, so refusing the move over one would block a
    // migration for a setting that is merely inert. Reported, never gating.
    //
    // The parity map is consulted for a reason when it has one. A derived retirement can only say "no
    // longer declared", which names the symptom; `forbiddenEnv` names what took the key's place.
    const retired = currentCohortData
        ? diffCohortLeafSets({fromData: currentCohortData, toData: cohortData}).retired
            .filter(row => row.env && providesValue(providedEnv, row.env))
            .map(row => ({...row, reason: forbiddenEnv?.[row.env] ?? null}))
        : [];

    // Independent of any diff, and deliberately so: this needs no `currentCohortData`, so a target
    // that cannot say which cohort it is on still gets an actionable list. That is the common case
    // for a plane far enough behind that nobody recorded what it was built from.
    const forbidden = collectForbiddenKeysInUse({providedEnv, forbiddenEnv});

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

    const retiredEnvNames = new Set(retired.map(row => row.env));

    return {
        admissible : blocking.length === 0 && indeterminate.length === 0,
        // Explicitly null rather than absent: a consumer checking `verdict.sourceError` must be able to
        // distinguish "observed, no source problem" from a verdict shape that predates this guard.
        sourceError: null,
        blocking,
        indeterminate,
        retired,
        // A key can be both diff-retired and parity-forbidden. Reporting it twice would read as two
        // separate problems and cost the operator a reconciliation they gain nothing from.
        forbidden: forbidden.filter(row => !retiredEnvNames.has(row.env)),
        evaluated: census.length
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
    // Rendered as its own verdict, never as "0 blocking". An operator shown "NOT ADMISSIBLE — 0
    // blocking, 0 indeterminate" would reasonably read it as a bug in the tool and re-run; the
    // actionable fact is that the cohort was never read, and the fix is upstream of this predicate.
    if (verdict.sourceError) {
        return [
            'NOT ADMISSIBLE — the cohort could not be observed.',
            `  UNREADABLE  ${verdict.sourceError.reason}`,
            '              No requirement was evaluated, so this is not a finding about the target. ' +
                '"Nothing blocked" and "nothing was read" are different states and only the first is a pass.'
        ]
    }

    // Retired keys are reported on BOTH verdicts. An admissible move still leaves the operator holding
    // inputs that no longer mean anything, and a verdict that says only "ADMISSIBLE" sends them into
    // the migration still carrying them.
    const retiredLines = (verdict.retired ?? []).flatMap(row => [
        `  RETIRED   ${row.leafPath}${row.env ? ` (${row.env})` : ''}`,
        row.reason
            ? `            ${row.reason}`
            : '            You set this and the target cohort no longer declares it — inert, not blocking. Remove it, or a future reader preserves it as intentional.'
    ]);

    const forbiddenLines = (verdict.forbidden ?? []).flatMap(row => [
        `  FORBIDDEN ${row.env}`,
        `            ${row.reason ?? 'The parity census forbids this key; it is retired, derived, or fixed by posture.'}`
    ]);

    if (verdict.admissible) {
        return [
            `ADMISSIBLE — ${verdict.evaluated} requirement-bearing leaf/leaves evaluated, none blocking.`,
            ...retiredLines,
            ...forbiddenLines
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

    lines.push(...retiredLines, ...forbiddenLines);

    return lines
}
