import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * @summary Every provider-readiness leaf reaches each service that reads it, in an overridable form.
 *
 * **Why this exists as a second family.** `OllamaProviderEnvCoordinates.spec.mjs` proved the
 * coordinate model on the `NEO_OLLAMA_*` family and could not see any other. A deadline leaf that
 * arms an abort shipped unreachable twice more after that guard landed: five inference deadlines
 * absent from an external plane's profile, and then five freshly-declared
 * `NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_*` leaves that reached no profile at all and were caught in
 * review rather than by a gate. A family-scoped guard cannot see the next family, and there is
 * always a next family.
 *
 * The asserted property is identical to the ollama guard's and is restated rather than referenced,
 * because a reader landing here from a red build should not have to open another file:
 *
 * 1. **Service scope** — each `(service, leaf)` pair the code actually consumes is present on that
 *    service, asserted independently rather than as a set union.
 * 2. **Operator-overridable shape** — the value is a `${NAME}` / `${NAME:-default}` interpolation of
 *    its own variable. A literal is a decision taken away from the operator.
 * 3. **No coordinate by symmetry** — an entry on a service with no consumer is a violation. Copying a
 *    block between services is how the shape of the contract stops matching its content.
 *
 * **The namespace is not the consumer, and this family is the sharpest case of that.** Every leaf
 * here lives under `orchestrator.providerReadiness`, yet two of them are read by
 * `TextEmbeddingService` and `InferenceLifecycleService`, which run inside **kb-server and
 * mc-server**. Deriving the matrix from the config namespace would ship all of them to the
 * orchestrator alone and leave the processes that actually wait on the provider unable to raise
 * their own deadline — which is the defect this guard closes.
 *
 * **The reserved leaves are the inverse trap.** The three `NEO_ORCHESTRATOR_STUCK_RUNNER_*` leaves
 * have ZERO consumers anywhere in `ai/` — deliberately, per their own declaration: *"No current
 * consumer may interpret `canaryTimeoutMs` as permission to dispatch or abort inference."* Requiring
 * them would advertise three knobs that read nothing, which is the same class of harm as an
 * unreachable knob and arguably worse: the operator sets it, believes a bound exists, and none does.
 * They are dispositioned absent below rather than omitted silently.
 */

const
    repoRoot    = path.resolve(process.cwd()),
    configText  = fs.readFileSync(path.join(repoRoot, 'ai/configBase.mjs'), 'utf8'),
    composePath = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    composeDoc  = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    SERVICES    = ['kb-server', 'mc-server', 'orchestrator'],
    TES         = 'ai/services/memory-core/TextEmbeddingService.mjs',
    ILS         = 'ai/services/memory-core/lifecycle/InferenceLifecycleService.mjs',
    CTDS        = 'ai/daemons/orchestrator/services/ConfiguredTaskDefinitionsService.mjs',
    RESERVED    = 'reserved policy coordinate: ZERO consumers anywhere in ai/. Its own declaration ' +
                  'states no consumer may interpret it as permission to dispatch or abort inference. ' +
                  'Shipping it would advertise a knob that reads nothing.';

/**
 * @summary Coordinates the deployment must ship, each with the consumer that makes it required.
 *
 * `consumer` is the module holding the read; `anchors` are literal source lines that perform it.
 * Both are checked against the tree, so an entry here is a falsifiable claim rather than a preference.
 */
const REQUIRED = [{
    service : 'kb-server',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS',
    consumer: TES,
    anchors : ['timeoutMs               = aiConfig.orchestrator.providerReadiness.timeoutMs,'],
    why     : 'TextEmbeddingService bounds provider model-discovery from inside kb-server; the ' +
              'ingest path waits on it, so a CPU-only plane must raise it from the process that waits'
}, {
    service : 'mc-server',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS',
    consumer: TES,
    anchors : ['timeoutMs               = aiConfig.orchestrator.providerReadiness.timeoutMs,'],
    why     : 'the same read runs in mc-server, where the WAL drain and the graph extractors wait on it'
}, {
    service : 'mc-server',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS',
    consumer: ILS,
    anchors : ['cacheTtlMs: aiConfig.orchestrator.providerReadiness.routineCacheTtlMs'],
    why     : 'InferenceLifecycleService is an mc-server STARTUP DEPENDENCY (confirmed at runtime in ' +
              'the healthcheck dependency map), and it caches model discovery on this TTL'
}, {
    service : 'orchestrator',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS',
    consumer: CTDS,
    anchors : ['attempts                : AiConfig.orchestrator.providerReadiness.attempts,'],
    why     : 'the configured readiness task and the recovery actuator both retry on this count'
}, {
    service : 'orchestrator',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS',
    consumer: CTDS,
    anchors : ['delayMs                 : AiConfig.orchestrator.providerReadiness.delayMs,'],
    why     : 'the inter-attempt delay for the same retry loop; attempts without delay is not a policy'
}, {
    service : 'orchestrator',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_TIMEOUT_MS',
    consumer: CTDS,
    anchors : ['timeoutMs : AiConfig.orchestrator.providerReadiness.timeoutMs,'],
    why     : 'the readiness probe deadline, also read by DeploymentStateBridgeService and DreamService'
}, {
    service : 'orchestrator',
    env     : 'NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS',
    consumer: CTDS,
    anchors : ['cacheTtlMs: AiConfig.orchestrator.providerReadiness.routineCacheTtlMs'],
    why     : 'model-discovery cache TTL for the routine readiness path'
}];

/**
 * @summary Coordinates the deployment deliberately does NOT ship, each with its reason.
 *
 * A leaf absent from a service is a decision. Written down it is reviewable; left implicit, the next
 * person restores symmetry and nobody can say whether that was a fix or a regression.
 */
const NOT_REQUIRED = [
    ...SERVICES.flatMap(service => [
        {service, env: 'NEO_ORCHESTRATOR_STUCK_RUNNER_ENABLED',             why: RESERVED},
        {service, env: 'NEO_ORCHESTRATOR_STUCK_RUNNER_CONSECUTIVE_FAILURES', why: RESERVED},
        {service, env: 'NEO_ORCHESTRATOR_STUCK_RUNNER_CANARY_TIMEOUT_MS',    why: RESERVED}
    ]),
    {
        service: 'kb-server',
        env    : 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS',
        why    : 'every read is orchestrator-side (ConfiguredTaskDefinitionsService, DreamService, ' +
                 'RecoveryActuatorService). kb-server consumes only the timeout, through ' +
                 'TextEmbeddingService — shipping the retry policy here would advertise an ' +
                 'orchestrator knob as a kb-server one'
    }, {
        service: 'kb-server',
        env    : 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS',
        why    : 'same as ATTEMPTS: the retry loop that consumes it does not run in this process'
    }, {
        service: 'kb-server',
        env    : 'NEO_ORCHESTRATOR_PROVIDER_READY_ROUTINE_CACHE_TTL_MS',
        why    : 'the discovery cache is read by InferenceLifecycleService (mc-server startup ' +
                 'dependency) and the orchestrator services; kb-server has no reader'
    }, {
        service: 'mc-server',
        env    : 'NEO_ORCHESTRATOR_PROVIDER_READY_ATTEMPTS',
        why    : 'orchestrator-side retry policy; mc-server reads the timeout and the cache TTL only'
    }, {
        service: 'mc-server',
        env    : 'NEO_ORCHESTRATOR_PROVIDER_READY_DELAY_MS',
        why    : 'same as ATTEMPTS'
    }
];

/**
 * @summary Collapses whitespace runs so an anchor survives alignment churn but not a real edit.
 * @param {String} text Source text.
 * @returns {String}
 */
function normalize(text) {
    return text.replace(/\s+/g, ' ')
}

/**
 * @summary The readiness env names declared as leaves, read from the config source.
 *
 * Derived rather than listed: adding an eighth leaf fails the coverage test below until its
 * disposition is decided per service, instead of shipping unwired. This is the property that makes
 * the guard survive the next family member — the failure mode it exists to prevent.
 * @returns {String[]}
 */
function declaredReadinessEnvNames() {
    return [...new Set(
        [...configText.matchAll(/'(NEO_ORCHESTRATOR_(?:PROVIDER_READY|STUCK_RUNNER)_[A-Z0-9_]*)'/g)]
            .map(match => match[1])
    )].sort()
}

/**
 * @summary The environment entries a compose service declares, as a name -> raw-value map.
 * @param {String} service Compose service key.
 * @returns {Object}
 */
function serviceEnv(service) {
    const raw = composeDoc.services?.[service]?.environment || [];

    if (Array.isArray(raw)) {
        return Object.fromEntries(raw
            .filter(entry => typeof entry === 'string' && entry.includes('='))
            .map(entry => {
                const index = entry.indexOf('=');
                return [entry.slice(0, index).trim(), entry.slice(index + 1)]
            }))
    }

    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value ?? '')]))
}

test.describe('provider-readiness env coordinates', () => {
    for (const {service, env, consumer, anchors, why} of REQUIRED) {
        test(`${service} receives ${env} — ${why.slice(0, 60)}`, () => {
            const value = serviceEnv(service)[env];

            expect(value, `${service} must declare ${env}`).toBeDefined();

            // Overridable shape: the value interpolates ITS OWN variable. A literal, or an
            // interpolation of a different name, both read as "configured" and are neither.
            expect(value, `${env} on ${service} must be operator-overridable`)
                .toMatch(new RegExp(`^\\$\\{${env}(:-[^}]*)?\\}$`));

            // The receipt. An entry in REQUIRED is a claim about a read that exists; if the read
            // moves or is deleted, this table is stale and must fail rather than pass by inertia.
            const source = normalize(fs.readFileSync(path.join(repoRoot, consumer), 'utf8'));

            for (const anchor of anchors) {
                expect(source, `${consumer} must still contain the read backing ${env}`)
                    .toContain(normalize(anchor))
            }
        })
    }

    test('no coordinate ships by symmetry — every declared entry is a consumed one', () => {
        const required = new Set(REQUIRED.map(entry => `${entry.service}|${entry.env}`));

        for (const service of SERVICES) {
            for (const env of Object.keys(serviceEnv(service))) {
                if (!/^NEO_ORCHESTRATOR_(PROVIDER_READY|STUCK_RUNNER)_/.test(env)) continue;

                expect(required.has(`${service}|${env}`),
                    `${service} declares ${env} but nothing in this process reads it — a copied ` +
                    'block, not a coordinate').toBe(true)
            }
        }
    });

    test('the (service x declared-leaf) product is fully dispositioned', () => {
        // THE arm that makes this guard outlive its author. A newly declared readiness leaf lands in
        // neither table and fails here, so it cannot ship unreachable and cannot ship unconsidered.
        const
            declared    = declaredReadinessEnvNames(),
            required    = new Set(REQUIRED.map(entry => `${entry.service}|${entry.env}`)),
            notRequired = new Set(NOT_REQUIRED.map(entry => `${entry.service}|${entry.env}`)),
            undecided   = [];

        for (const service of SERVICES) {
            for (const env of declared) {
                const key = `${service}|${env}`;

                if (!required.has(key) && !notRequired.has(key)) undecided.push(key)
            }
        }

        expect(undecided,
            'every (service, leaf) coordinate needs a disposition — ship it with a consumer receipt, ' +
            'or record why it is absent').toEqual([]);

        expect(declared.length, 'the declared readiness leaf set changed; re-check both tables')
            .toBe(7)
    })
});
