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
 * @plane in-plane
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
 * @summary Decides whether an observed value satisfies a required key, or is present-but-unusable.
 *
 * `parseObservedEnv` records a bare `KEY` and `KEY=` alike as an empty string, because Docker permits
 * both and treating either as absent would hide a key that was set-but-empty. That distinction is only
 * worth recording if something downstream acts on it: a required input whose value is empty or
 * whitespace satisfies a presence check and still cannot configure anything, which is a different
 * defect from unset and a different fix for the operator.
 * @param {String|undefined} value Observed value, or `undefined` when the key is absent.
 * @returns {Boolean} `true` when the key is present and carries a usable value.
 */
function isUsableValue(value) {
    return typeof value === 'string' && value.trim() !== ''
}

/**
 * @summary Derives one service's config-contract delta by comparing its observed env against the census.
 *
 * The single resolver, evaluated **per service**. Reason text for a forbidden key is taken **verbatim
 * from the census**, which already declares each one's replacement guidance — re-authoring it here
 * would create a second copy free to drift from the authority it paraphrases.
 *
 * `declaredScope` is the set of env keys that service's own config template declares. The census
 * classifies keys per *profile*, not per service, and the profile's required list is not uniform across
 * its services: four of the canonical profile's thirteen required inputs are declared by one service
 * only. Judging every key against every service therefore invents obligations — and unioning the
 * observations across services invents satisfactions. A key outside the scope is not this service's to
 * carry and is skipped; a key inside no service's scope is reported by {@link buildMigrationPlan} as
 * unattributable rather than assigned to a default.
 * @param {Map<String,String>} observedEnv     Output of {@link parseObservedEnv} for ONE service.
 * @param {Object}             census          Output of {@link resolveCensus}.
 * @param {Set<String>|null}   [declaredScope] Env keys the service declares; `null` evaluates the whole census.
 * @returns {Object} `{missingRequired, setButEmpty, presentForbidden, missingSecrets, optionalPresent}`
 */
export function deriveContractDelta(observedEnv, census, declaredScope = null) {
    const inScope = key => !(declaredScope instanceof Set) || declaredScope.has(key),
          scoped  = census.requiredDeploymentInputs.filter(inScope);

    return {
        missingRequired : scoped
            .filter(key => !observedEnv.has(key))
            .map(key => ({
                key,
                bootBlocking: key === BOOT_BLOCKING_KEY,
                reason      : key === BOOT_BLOCKING_KEY
                    ? 'declared required with no leaf default, so a launch that does not declare it is refused rather than degraded'
                    : 'declared in the census as a required deployment input and absent from the observed deployment'
            })),
        setButEmpty     : scoped
            .filter(key => observedEnv.has(key) && !isUsableValue(observedEnv.get(key)))
            .map(key => ({
                key,
                bootBlocking: key === BOOT_BLOCKING_KEY,
                reason      : 'declared required and present but carrying an empty value, which satisfies a presence ' +
                              'check and still configures nothing — a different repair from an absent key'
            })),
        presentForbidden: Object.keys(census.forbiddenEnv)
            .filter(key => observedEnv.has(key))
            .map(key => ({key, reason: String(census.forbiddenEnv[key])})),
        missingSecrets  : census.secrets
            .filter(inScope)
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
 * A fourth property matters more than the buckets: the plan must carry the **repair**, not merely
 * describe the damage. A deployment missing a required input is refused from its own observation, so if
 * nothing can supply the corrected value the operator has to fix the plane by another path — which is
 * the manual intervention this tool exists to remove. `desiredEnv` is that carrier: a supplied value
 * turns a missing input from a terminal blocker into a declared transition the apply step performs.
 *
 * @param {Object}   config
 * @param {Object}   config.observedEnvByService Service name → Map from {@link parseObservedEnv}. Observations
 *                                              stay **per service**; a union credits one service with another's
 *                                              configuration and blames it for keys it never declares.
 * @param {Object}   config.serviceScopes        Service name → Set of env keys that service's config template declares.
 * @param {Object}   [config.observationByService] Service name → `{inspected, configRead}` provenance. An empty
 *                                              guarded set is ambiguous on its own: a container that could not be
 *                                              read and one that legitimately carries no Neo config both yield an
 *                                              empty Map. Provenance is the discriminator, and its ABSENCE is
 *                                              treated as unmeasured so a caller cannot authorize by omission.
 * @param {Object}   config.census               Output of {@link resolveCensus}.
 * @param {Object}   [config.desiredEnv]         Service name → `{KEY: value}` the operator declares for the transition.
 * @param {Object}   config.composeIdentity      `{project, configFiles}` read off the running plane; `null` when undiscoverable.
 * @param {Object}   config.deployedRevisions    Service name → revision string, or `null` for unreadable.
 * @param {String|null} config.targetRevision    The resolved 40-hex target, or `null` when resolution failed.
 * @param {String[]} [config.uncheckedNotes]     Entrypoint-supplied items it could not evaluate.
 * @returns {Object} `{clean, blockers, unchecked, notes, revisionDelta, contractDelta, configTransition}`
 */
export function buildMigrationPlan({
    observedEnvByService, serviceScopes, census, desiredEnv = {}, composeIdentity, deployedRevisions,
    targetRevision, uncheckedNotes = [], observationByService = null
}) {
    const blockers         = [],
          unchecked        = [...uncheckedNotes],
          notes            = [],
          configTransition = {},
          services         = Object.keys(observedEnvByService || {}).sort(),
          optionalPresent  = new Set(),
          attributed       = new Set();

    // 1. Nothing observed at all. Refused before deriving anything, because an EMPTY observation would
    // otherwise derive "every required key is missing" — a spectacular-looking delta whose real cause is
    // that nothing was read.
    if (services.length === 0) {
        blockers.push({
            kind  : 'no-observed-service',
            key   : 'Config.Env',
            reason: 'no service was observed on the target, so any contract delta would be derived from an empty ' +
                    'observation and every required key would appear missing for the wrong reason'
        })
    }

    const aggregate = {missingRequired: [], setButEmpty: [], presentForbidden: [], missingSecrets: []};

    services.forEach(service => {
        const observed = observedEnvByService[service],
              scope    = serviceScopes?.[service];

        // A service whose declared surface could not be resolved cannot be judged. Evaluating the whole
        // census against it would invent obligations; skipping it would silently drop a service from the
        // gate. Neither is admissible, so it blocks.
        if (!(scope instanceof Set)) {
            blockers.push({
                kind  : 'service-scope-unresolved',
                key   : service,
                reason: `no declared env surface could be resolved for service '${service}', so its observed config ` +
                        'can be neither satisfied nor faulted against the census'
            });

            return
        }

        scope.forEach(key => attributed.add(key));

        // An empty guarded set is TWO different observations wearing one value, and the discriminator is
        // provenance rather than the value itself:
        //
        //   the container was never read      -> not measured; blocks, and this is the case the refusal
        //                                        exists for (a stopped container emits nothing, and silence
        //                                        is not evidence that config is absent)
        //   the container was read, set empty -> the service carries no Neo config; owes nothing
        //
        // Chroma is the live instance of the second: `docker inspect` succeeds and its guarded set is empty,
        // because it is a third-party image with no Neo configuration surface. Conflating the two refused
        // every real plane for a service behaving correctly.
        //
        // Provenance ABSENT is treated as not-measured, never as empty-by-design — a caller that omits the
        // discriminator must not be able to authorize by omission.
        const provenance = observationByService?.[service],
              wasRead    = provenance?.configRead === true;

        if (!wasRead) {
            blockers.push({
                kind  : 'service-unmeasured',
                key   : service,
                reason: provenance
                    ? `service '${service}' was not read (container found: ${provenance.inspected === true}), so its ` +
                      'config is unestablished — silence from an unreachable service is not evidence of absence'
                    : `no observation provenance was supplied for service '${service}', so whether its config was ` +
                      'read cannot be established; treated as unmeasured rather than assumed empty'
            });

            return
        }

        if (!(observed instanceof Map) || observed.size === 0) {
            // Read and legitimately empty. Reported so an operator sees the service was inspected and found
            // irrelevant, rather than it silently vanishing from the plan.
            notes.push(`service '${service}': read, carries no guarded NEO_/MCP_ config — nothing owed`);

            return
        }

        const delta = deriveContractDelta(observed, census, scope);

        delta.optionalPresent.forEach(key => optionalPresent.add(key));

        // 2. The contract delta as blockers, keyed per service. A supplied desired value converts a
        // missing or empty input into a recorded transition instead: that is the repair this tool owes.
        [...delta.missingRequired, ...delta.setButEmpty].forEach(entry => {
            const {key, reason, bootBlocking} = entry,
                  supplied                    = desiredEnv?.[service]?.[key],
                  wasEmpty                    = delta.setButEmpty.some(item => item.key === key);

            if (isUsableValue(supplied)) {
                configTransition[service] ||= [];
                configTransition[service].push({key, from: wasEmpty ? '<empty>' : '<unset>', declared: true});

                return
            }

            if (supplied !== undefined) {
                blockers.push({
                    kind  : 'desired-value-unusable',
                    key   : `${service}.${key}`,
                    reason: 'a desired value was supplied for this key but is empty or not a string, so the transition ' +
                            'would replace an unusable value with another one'
                });

                return
            }

            blockers.push({
                kind  : bootBlocking
                    ? 'missing-required-input-boot-blocking'
                    : wasEmpty ? 'required-input-set-but-empty' : 'missing-required-input',
                key   : `${service}.${key}`,
                reason: `${reason} — and no desired value was supplied, so apply cannot repair it`
            })
        });

        aggregate.missingRequired.push(...delta.missingRequired.map(entry => `${service}.${entry.key}`));
        aggregate.setButEmpty.push(...delta.setButEmpty.map(entry => `${service}.${entry.key}`));

        delta.presentForbidden.map(normalizeFinding).forEach(({key, reason}) => {
            aggregate.presentForbidden.push(`${service}.${key}`);

            blockers.push({
                kind  : 'forbidden-env-present',
                key   : `${service}.${key}`,
                reason: reason || 'declared retired or derived by the census and still set on the target'
            })
        });

        delta.missingSecrets.map(normalizeFinding).forEach(({key, reason}) => {
            aggregate.missingSecrets.push(`${service}.${key}`);

            blockers.push({
                kind  : 'missing-secret',
                key   : `${service}.${key}`,
                reason: reason || 'declared as a required secret and absent from the target'
            })
        })
    });

    // 2b. A required key no observed service declares cannot be attributed by this instrument. It is
    // neither satisfied nor faulted, and picking a service for it would be a guess that reads as a
    // verdict — so it blocks rather than resolving to a default owner.
    if (services.length) {
        census.requiredDeploymentInputs.filter(key => !attributed.has(key)).forEach(key => blockers.push({
            kind  : 'required-input-unattributable',
            key,
            reason: 'declared required by the profile census and declared by none of the observed services, so no ' +
                    'service can be held to it and no service can satisfy it'
        }))
    }

    // 2c. There is deliberately NO cross-service value-conflict refusal. An earlier revision blocked when
    // two services declared different values for one key, on the premise that the repair travelled as
    // parent environment and Compose interpolation is global. That premise was false — the profile
    // declares these leaves as literals, so parent env never reached the consumer at all. The repair now
    // travels as a Compose fragment nested under each service, which makes differing per-service values
    // expressible, so a refusal here would reject a transition the transaction can perform.
    const contractDelta = {optionalPresent: [...optionalPresent]};

    contractDelta.optionalPresent.forEach(key => notes.push(`optional override set: ${key}`));

    // Secrets are named in the census but their VALUES are not observable through container env in
    // every deployment shape, so a satisfied secret list is weaker evidence than a satisfied required
    // list. Say so rather than letting a clean secrets check read as a proof it is not.
    if (census.secrets.length && aggregate.missingSecrets.length === 0) {
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

    // An unreadable revision was previously reported and passed over. It cannot be: the post-apply
    // assertion for that service has no baseline to move from, so a successful-looking apply could not be
    // distinguished from one that stranded it. An unestablished safety fact blocks rather than annotating
    // a CLEAN verdict.
    Object.entries(deployedRevisions || {}).forEach(([service, revision]) => {
        if (!revision) {
            blockers.push({
                kind  : 'revision-unreadable',
                key   : `${service}:/app/.neo-revision`,
                reason: `service '${service}' reported no revision, so its before-state is not established and no ` +
                        'post-apply assertion could prove it moved rather than being stranded'
            })
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

    Object.entries(configTransition).forEach(([service, entries]) => notes.push(
        `declared config transition on '${service}': ${entries.map(({key, from}) => `${key} (${from} -> declared)`).join(', ')}`
    ));

    return {
        clean        : blockers.length === 0,
        blockers,
        unchecked,
        notes,
        revisionDelta: {from: singleRunning, to: targetRevision, alreadyTarget},
        configTransition,
        contractDelta: {
            profile          : census.profile,
            services,
            missingRequired  : aggregate.missingRequired,
            setButEmpty      : aggregate.setButEmpty,
            presentForbidden : aggregate.presentForbidden,
            missingSecrets   : aggregate.missingSecrets,
            optionalPresent  : contractDelta.optionalPresent,
            observedKeyCounts: Object.fromEntries(
                services.map(service => [
                    service,
                    observedEnvByService[service] instanceof Map ? observedEnvByService[service].size : 0
                ])
            )
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
