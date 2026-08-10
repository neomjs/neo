import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * @summary Every `NEO_OLLAMA_*` leaf reaches each service that reads it, in an overridable form.
 *
 * The deployment contract is a set of **coordinates**, not a set of names. `NEO_OLLAMA_HOST`
 * appearing somewhere in the profile does nothing for `kb-server` if `kb-server` is the process
 * that dials the provider and never receives it. A union of env names across services cannot see
 * that difference, and neither can it see a name bound to a hardcoded target that no operator can
 * change — both read as "the variable is configured".
 *
 * This guard therefore asserts three things per coordinate:
 *
 * 1. **Service scope** — each `(service, leaf)` pair the code actually consumes is present on that
 *    service, asserted independently rather than as a set union.
 * 2. **Operator-overridable shape** — the value must be a `${NAME}` / `${NAME:-default}`
 *    interpolation of its own variable. A literal is a decision taken away from the operator.
 * 3. **No coordinate by symmetry** — a `NEO_OLLAMA_*` entry on a service with no consumer is a
 *    violation, not a harmless extra. Copying the block between services is how the *shape* of the
 *    contract stops matching the *content* of it, and the next reader cannot tell which service
 *    owns which leaf.
 *
 * **Every REQUIRED entry carries a receipt**: the consuming module plus the literal source lines
 * that perform the read, matched against the tree with whitespace normalised. An excerpt rather
 * than a pattern, because the first version of this check used a pattern and could not see
 * `const config = aiConfig.ollama` followed by `config.host` — and the repair for a pattern that
 * misses a real read is to quote the read, not to widen the pattern until it matches anything.
 *
 * **Every absent coordinate carries a written disposition**, and the two tables must cover the full
 * (service x declared-leaf) product: a newly declared leaf fails this spec until someone decides,
 * per service, whether it ships.
 *
 * Scope: this is the ollama-family contract. The family-agnostic floor — *a loopback-default leaf
 * must be overridable somewhere in the profile* — lives in `LoopbackDefaultReachability.spec.mjs`
 * and is deliberately weaker; it cannot see service scope and does not claim to.
 */

const
    repoRoot    = path.resolve(process.cwd()),
    configText  = fs.readFileSync(path.join(repoRoot, 'ai/configBase.mjs'), 'utf8'),
    composePath = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    composeDoc  = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    // The Neo services built from the shared image. `local-model` is the ollama server itself and
    // is configured through `OLLAMA_*`, not through the client-side `NEO_OLLAMA_*` leaves.
    ENTRYPOINTS = {
        'kb-server'   : 'ai/mcp/server/knowledge-base/mcp-server.mjs',
        'mc-server'   : 'ai/mcp/server/memory-core/mcp-server.mjs',
        'orchestrator': 'ai/daemons/orchestrator/daemon.mjs'
    },
    TES        = 'ai/services/memory-core/TextEmbeddingService.mjs',
    DISPATCH   = 'ai/services/graph/providerDispatch.mjs',
    READINESS  = 'ai/services/graph/providerReadinessHelper.mjs';

/**
 * @summary Coordinates the deployment must ship, each with the consumer that makes it required.
 *
 * `consumer` is the module holding the read and `anchors` are the source lines that perform it.
 * Both are checked against the tree and against the service's import graph, so an entry here is a
 * falsifiable claim rather than a preference.
 */
const REQUIRED = [{
    service : 'kb-server',
    env     : 'NEO_OLLAMA_HOST',
    consumer: TES,
    anchors : ['const config = aiConfig.ollama;', 'host : config.host,'],
    why     : 'VectorService, QueryService and HealthService all embed through TextEmbeddingService, ' +
              'whose #getOllamaProvider dials ollama.host from inside the kb-server process'
}, {
    service : 'kb-server',
    env     : 'NEO_OLLAMA_MODEL',
    consumer: DISPATCH,
    anchors : ['modelName : ollamaConfig?.model,'],
    why     : 'the ask path builds a chat model from ollamaConfig.model; TextEmbeddingService also ' +
              'falls back to it when embeddingModel is unset'
}, {
    service : 'kb-server',
    env     : 'NEO_OLLAMA_EMBEDDING_MODEL',
    consumer: 'ai/services/knowledge-base/VectorService.mjs',
    anchors : ['? aiConfig.ollama.embeddingModel'],
    why     : 'the ingest path names the embedding model when the provider is ollama, and the model ' +
              'decides the vector dimension the corpus is written with'
}, {
    service : 'kb-server',
    env     : 'NEO_OLLAMA_KEEP_ALIVE',
    consumer: DISPATCH,
    anchors : ['ollamaProviderConfig.keepAlive = ollamaConfig.keep_alive;'],
    why     : 'keep_alive rides on every dispatched ollama request; a cold reload per call is the ' +
              'difference between a usable ask tool and a timeout'
}, {
    service : 'kb-server',
    env     : 'NEO_OLLAMA_EMBEDDING_TIMEOUT_MS',
    consumer: TES,
    anchors : ['const timeoutMs = aiConfig.ollama.embeddingTimeoutMs;'],
    why     : 'the sole reader bounds one native embed request, and kb-server is where ingestion ' +
              'issues them — a CPU-only provider needs this raised from the process that waits'
}, {
    service : 'mc-server',
    env     : 'NEO_OLLAMA_HOST',
    consumer: TES,
    anchors : ['const config = aiConfig.ollama;', 'host : config.host,'],
    why     : 'memory embedding and the graph extractors dial ollama.host from inside mc-server'
}, {
    service : 'mc-server',
    env     : 'NEO_OLLAMA_MODEL',
    consumer: 'ai/services/graph/SemanticGraphExtractor.mjs',
    anchors : ['model : AiConfig.ollama.model,'],
    why     : 'graph extraction and topology inference run the chat model in this process'
}, {
    service : 'mc-server',
    env     : 'NEO_OLLAMA_EMBEDDING_MODEL',
    consumer: TES,
    anchors : ["return aiConfig.ollama.embeddingModel || aiConfig.ollama.model;"],
    why     : 'memory embeddings are written here; the model decides their dimension'
}, {
    service : 'mc-server',
    env     : 'NEO_OLLAMA_KEEP_ALIVE',
    consumer: DISPATCH,
    anchors : ['ollamaProviderConfig.keepAlive = ollamaConfig.keep_alive;'],
    why     : 'the same dispatch seam carries keep_alive for the Dream pipeline calls made here'
}, {
    service : 'mc-server',
    env     : 'NEO_OLLAMA_EMBEDDING_TIMEOUT_MS',
    consumer: TES,
    anchors : ['const timeoutMs = aiConfig.ollama.embeddingTimeoutMs;'],
    why     : 'the WAL drain embeds in this process and stalls behind an unbounded request'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_HOST',
    consumer: READINESS,
    anchors : ['host : ollamaConfig.host,'],
    why     : 'readiness probes, the ollama serve task and the recovery actuator all address the ' +
              'provider by host from the orchestrator'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_MODEL',
    consumer: READINESS,
    anchors : ['chatModel = ollamaConfig.model,'],
    why     : 'the chat role in the readiness role-set is this model; residency repair reloads it'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_EMBEDDING_MODEL',
    consumer: READINESS,
    anchors : ['embeddingModel = ollamaConfig.embeddingModel,'],
    why     : 'the embedding role in the readiness role-set, and what Dream re-embeds with'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_KEEP_ALIVE',
    consumer: READINESS,
    anchors : ['keepAlive : ollamaConfig.keep_alive,'],
    why     : 'buildOllamaServeEnv renders the resolved keep-alive into OLLAMA_KEEP_ALIVE for the ' +
              'supervised server process'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_EMBEDDING_TIMEOUT_MS',
    consumer: TES,
    anchors : ['const timeoutMs = aiConfig.ollama.embeddingTimeoutMs;'],
    why     : 'Orchestrator, DreamService and TenantRepoSyncService embed through the same service'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS',
    consumer: READINESS,
    anchors : ['requireParallelModels: ollamaConfig.requireParallelModels,'],
    why     : 'buildOllamaReadinessConfig reads it and every caller is orchestrator-side: the ' +
              'configured serve task, DreamService, and the residency repair'
},
// NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS is required on ALL THREE services, which is the widest
// disposition in this table. The reason is the failure mode rather than the reach: an admission cap
// that does not ship reads as enforced from every surface while admitting without limit, so an
// operator who set it believes a bound exists that does not. That is strictly worse than shipping no
// cap at all, and it is the same class of silent inertness found across this whole leaf group.
{
    service : 'kb-server',
    env     : 'NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS',
    consumer: TES,
    anchors : ['const cap = aiConfig.ollama.maxInFlightEmbeddings;', 'if (this.#ollamaInFlightEmbeddings < cap) {'],
    why     : 'ingest embeds through TextEmbeddingService in this process, and the KB sweep is the ' +
              'heaviest embedding producer we run — an unshipped cap here admits a whole corpus ' +
              'without limit against one resident model'
}, {
    service : 'mc-server',
    env     : 'NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS',
    consumer: TES,
    anchors : ['const cap = aiConfig.ollama.maxInFlightEmbeddings;', 'if (this.#ollamaInFlightEmbeddings < cap) {'],
    why     : 'memory embeddings are written from this process through the same admission gate, and ' +
              'the WAL drain issues them continuously rather than in one sweep, so the cap is what ' +
              'keeps drain work from competing with interactive embedding'
}, {
    service : 'orchestrator',
    env     : 'NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS',
    consumer: TES,
    anchors : ['const cap = aiConfig.ollama.maxInFlightEmbeddings;', 'if (this.#ollamaInFlightEmbeddings < cap) {'],
    why     : 'Orchestrator.mjs calls TextEmbeddingService.embedTexts directly for Dream and ' +
              'TenantRepoSyncService calls embedText, so the re-embed sweeps that hold the ' +
              'heavy-maintenance lease run through this gate — the worst place for it to be absent'
}];

/**
 * @summary Coordinates the deployment deliberately does NOT ship, each with its reason.
 *
 * A leaf absent from a service is a decision. Written down, it is reviewable; left implicit, the
 * next person restores symmetry and nobody can say whether that was a fix or a regression.
 */
const NOT_REQUIRED = [{
    service: 'kb-server',
    env    : 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS',
    why    : 'the only read is buildOllamaReadinessConfig (providerReadinessHelper.mjs) and all ' +
             'three of its callers live under ai/daemons/orchestrator/. The module IS in this ' +
             "service's import graph, but only because TextEmbeddingService dynamic-imports " +
             'fetchLmsLoadedModels from it — a different function that never reads this leaf. ' +
             'Module reachability is not consumption, and shipping it here would advertise an ' +
             'orchestrator knob as a kb-server one.'
}, {
    service: 'mc-server',
    env    : 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS',
    why    : 'same as kb-server: the reader is orchestrator-called only, and the module is present ' +
             'in this graph through an unrelated named import'
}];

/**
 * @summary Collapses whitespace runs so an anchor survives alignment churn but not a real edit.
 * @param {String} text Source text.
 * @returns {String}
 */
function normalize(text) {
    return text.replace(/\s+/g, ' ')
}

/**
 * @summary The `NEO_OLLAMA_*` env names declared as leaves, read from the config source.
 *
 * Derived rather than listed so that adding a seventh leaf fails the coverage test below until its
 * disposition is decided per service, instead of shipping unwired.
 * @returns {String[]}
 */
function declaredOllamaEnvNames() {
    return [...new Set([...configText.matchAll(/'(NEO_OLLAMA_[A-Z0-9_]*)'/g)].map(match => match[1]))].sort()
}

/**
 * @summary Reads one service's `environment:` block as a name -> value map.
 * @param {Object} doc Parsed compose document.
 * @param {String} service Service key.
 * @returns {Map<String, String>}
 */
function serviceEnv(doc, service) {
    const
        entries = doc.services?.[service]?.environment || [],
        map     = new Map();

    if (Array.isArray(entries)) {
        for (const entry of entries) {
            const
                text  = String(entry),
                index = text.indexOf('=');

            index === -1 ? map.set(text, null) : map.set(text.slice(0, index), text.slice(index + 1))
        }
    } else {
        for (const [name, value] of Object.entries(entries)) {
            map.set(name, value === null ? null : String(value))
        }
    }

    return map
}

/**
 * @summary True when a compose value hands the decision to the operator via its own variable.
 * @param {String} env Env name the entry binds.
 * @param {String|null} value The compose-side value.
 * @returns {Boolean}
 */
function isOperatorOverridable(env, value) {
    // `${NAME}`, `${NAME:-fallback}` and `${NAME-fallback}` all resolve from the operator's
    // environment. Anything else — a literal, or an interpolation of a DIFFERENT variable — pins
    // the target inside the artifact.
    return typeof value === 'string' && new RegExp(`^\\$\\{${env}(?:[:-][^}]*)?\\}$`).test(value.trim())
}

/**
 * @summary The whole contract as a pure function of a compose document.
 *
 * Pure so the mutation controls below can run it against deliberately broken documents — a guard
 * whose failure mode is never exercised is a guard nobody has tested.
 *
 * @param {Object} doc Parsed compose document.
 * @returns {Object[]} Violations, each `{service, env, kind, detail}`.
 */
function coordinateViolations(doc) {
    const
        violations = [],
        required   = new Set(REQUIRED.map(entry => `${entry.service}::${entry.env}`));

    for (const entry of REQUIRED) {
        const env = serviceEnv(doc, entry.service);

        if (!env.has(entry.env)) {
            violations.push({
                service: entry.service,
                env    : entry.env,
                kind   : 'missing',
                detail : `${entry.service} consumes ${entry.env} via ${entry.consumer} but never receives it`
            });
            continue
        }

        const value = env.get(entry.env);

        if (!isOperatorOverridable(entry.env, value)) {
            violations.push({
                service: entry.service,
                env    : entry.env,
                kind   : 'not-overridable',
                detail : `${entry.service} pins ${entry.env} to ${JSON.stringify(value)}; the operator cannot change it`
            })
        }
    }

    for (const service of Object.keys(ENTRYPOINTS)) {
        for (const name of serviceEnv(doc, service).keys()) {
            if (name.startsWith('NEO_OLLAMA_') && !required.has(`${service}::${name}`)) {
                violations.push({
                    service,
                    env   : name,
                    kind  : 'undeclared',
                    detail: `${service} ships ${name} with no consumer behind it — added by symmetry, not by need`
                })
            }
        }
    }

    return violations
}

/**
 * @summary Every repo-relative module reachable from a service entrypoint, static or dynamic.
 * @param {String} entryRelPath Repo-relative entrypoint.
 * @returns {Set<String>} Absolute file paths.
 */
function importGraph(entryRelPath) {
    const
        // Static `from '...'` and dynamic `import('...')`. Bare specifiers are dependencies and are
        // not traversed; only first-party relative paths can hold a config read.
        SPECIFIER = /(?:\bfrom\s*|(?:^|[^.\w])import\s*\(\s*)['"]([^'"]+)['"]/g,
        seen      = new Set(),
        stack     = [path.join(repoRoot, entryRelPath)];

    while (stack.length > 0) {
        const file = stack.pop();

        if (seen.has(file)) continue;

        seen.add(file);

        let text;

        try {
            text = fs.readFileSync(file, 'utf8')
        } catch {
            continue
        }

        for (const match of text.matchAll(SPECIFIER)) {
            const specifier = match[1];

            if (!specifier.startsWith('.')) continue;

            const base = path.resolve(path.dirname(file), specifier);

            for (const candidate of [base, `${base}.mjs`, `${base}.js`, path.join(base, 'index.mjs')]) {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    if (!seen.has(candidate)) stack.push(candidate);
                    break
                }
            }
        }
    }

    return seen
}

test.describe('NEO_OLLAMA_* coordinates reach every consuming service', () => {
    test('the canonical profile satisfies every required coordinate', () => {
        const violations = coordinateViolations(composeDoc);

        expect(violations.map(violation => violation.detail)).toEqual([])
    });

    test('MUTATION — dropping a required leaf from one service is caught', () => {
        // The predecessor guard's first falsifier: removing NEO_OLLAMA_HOST from kb-server and
        // mc-server left it on orchestrator, and a union-of-names check stayed green.
        const mutant = structuredClone(composeDoc);

        for (const service of ['kb-server', 'mc-server']) {
            mutant.services[service].environment = mutant.services[service].environment
                .filter(entry => !String(entry).startsWith('NEO_OLLAMA_HOST='))
        }

        const violations = coordinateViolations(mutant);

        expect(violations.filter(violation => violation.kind === 'missing').map(violation => violation.service).sort())
            .toEqual(['kb-server', 'mc-server']);
        expect(coordinateViolations(composeDoc)).toEqual([])
    });

    test('MUTATION — pinning a value to a hardcoded target is caught', () => {
        // The second falsifier: every value replaced with a literal wrong host still passed, because
        // the name was still there. Reachability is a property of the VALUE, not of the key.
        const mutant = structuredClone(composeDoc);

        for (const service of Object.keys(ENTRYPOINTS)) {
            mutant.services[service].environment = mutant.services[service].environment.map(entry =>
                String(entry).startsWith('NEO_OLLAMA_HOST=')
                    ? 'NEO_OLLAMA_HOST=http://wrong-process.invalid:11434'
                    : entry)
        }

        const violations = coordinateViolations(mutant).filter(violation => violation.kind === 'not-overridable');

        expect(violations.map(violation => violation.service).sort()).toEqual(['kb-server', 'mc-server', 'orchestrator'])
    });

    test('MUTATION — interpolating a DIFFERENT variable is caught', () => {
        // The subtler half of the same defect: `${SOMETHING_ELSE:-}` is interpolation-shaped, so a
        // "does it contain ${" check would pass while the documented variable does nothing.
        const mutant = structuredClone(composeDoc);

        mutant.services['kb-server'].environment = mutant.services['kb-server'].environment.map(entry =>
            String(entry).startsWith('NEO_OLLAMA_HOST=') ? 'NEO_OLLAMA_HOST=${NEO_CHROMA_HOST:-}' : entry);

        expect(coordinateViolations(mutant).some(violation =>
            violation.kind === 'not-overridable' && violation.service === 'kb-server')).toBe(true)
    });

    test('MUTATION — a coordinate copied by symmetry is caught', () => {
        // The regression this repair exists to prevent: the block was pasted onto all three
        // services, so an orchestrator-only knob advertised itself as a kb-server one.
        const mutant = structuredClone(composeDoc);

        mutant.services['kb-server'].environment.push(
            'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS=${NEO_OLLAMA_REQUIRE_PARALLEL_MODELS:-}');

        expect(coordinateViolations(mutant).some(violation =>
            violation.kind === 'undeclared' && violation.env === 'NEO_OLLAMA_REQUIRE_PARALLEL_MODELS')).toBe(true)
    });

    test('RECEIPTS — every required coordinate quotes a real read in a reachable module', () => {
        // Without this, the REQUIRED table is a list of opinions. With it, an entry can only be
        // added when the quoted source is present in a module that service actually loads.
        const graphs = Object.fromEntries(
            Object.entries(ENTRYPOINTS).map(([service, entry]) => [service, importGraph(entry)]));

        for (const entry of REQUIRED) {
            const consumerPath = path.join(repoRoot, entry.consumer);

            expect(fs.existsSync(consumerPath), `${entry.consumer} does not exist`).toBe(true);

            const source = normalize(fs.readFileSync(consumerPath, 'utf8'));

            for (const anchor of entry.anchors) {
                expect(
                    source.includes(normalize(anchor)),
                    `${entry.consumer} no longer contains the quoted read for ${entry.env}: ${anchor}`
                ).toBe(true)
            }

            expect(
                graphs[entry.service].has(consumerPath),
                `${entry.consumer} is not reachable from the ${entry.service} entrypoint`
            ).toBe(true);

            expect(entry.why.length, `${entry.service}/${entry.env} needs a reviewable reason`).toBeGreaterThan(40)
        }
    });

    test('COVERAGE — every declared leaf has a disposition on every service', () => {
        // The "next added leaf cannot silently fail to ship" gate. A new NEO_OLLAMA_* leaf lands in
        // declaredOllamaEnvNames() immediately and has no row in either table, so this reddens until
        // someone decides, per service, whether it ships.
        const
            declared  = declaredOllamaEnvNames(),
            decided   = new Set([...REQUIRED, ...NOT_REQUIRED].map(entry => `${entry.service}::${entry.env}`)),
            undecided = [];

        for (const service of Object.keys(ENTRYPOINTS)) {
            for (const env of declared) {
                if (!decided.has(`${service}::${env}`)) undecided.push(`${service}::${env}`)
            }
        }

        expect(declared.length, 'the leaf scan found nothing — the config regex has drifted').toBeGreaterThanOrEqual(6);
        expect(declared, 'the leaf scan misses a known member').toContain('NEO_OLLAMA_HOST');
        expect(undecided, `coordinates with no disposition: ${undecided.join(', ')}`).toEqual([])
    });

    test('every deliberate absence names a reason', () => {
        for (const entry of NOT_REQUIRED) {
            expect(entry.why.length, `${entry.service}/${entry.env} absence is too thin to review`).toBeGreaterThan(60)
        }
    });

    test('NON-VACUITY — the import graph, the compose reader and the value check all discriminate', () => {
        // Each of the three fails silent rather than loud: an import graph that resolved nothing, an
        // env reader returning an empty map, or a value predicate that never says no would each make
        // some assertion above vacuous while leaving the suite green.
        const kbGraph = importGraph(ENTRYPOINTS['kb-server']);

        expect(kbGraph.size).toBeGreaterThan(50);
        expect(kbGraph.has(path.join(repoRoot, 'ai/services/knowledge-base/VectorService.mjs'))).toBe(true);
        // ...and it must NOT reach an entrypoint no kb-server code imports, or membership is free.
        expect(kbGraph.has(path.join(repoRoot, 'ai/daemons/orchestrator/daemon.mjs'))).toBe(false);

        const orchestratorEnv = serviceEnv(composeDoc, 'orchestrator');

        expect(orchestratorEnv.size).toBeGreaterThan(10);
        expect(orchestratorEnv.get('NEO_OLLAMA_HOST')).toBe('${NEO_OLLAMA_HOST:-}');

        expect(isOperatorOverridable('NEO_OLLAMA_HOST', '${NEO_OLLAMA_HOST:-}')).toBe(true);
        expect(isOperatorOverridable('NEO_OLLAMA_HOST', 'http://local-model:11434')).toBe(false);

        // The anchor matcher must also be able to say no, or every receipt passes.
        expect(normalize('  a   b ').includes(normalize('a b'))).toBe(true);
        expect(normalize('a b').includes(normalize('a c'))).toBe(false)
    })
});
