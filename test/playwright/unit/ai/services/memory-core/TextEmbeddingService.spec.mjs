import {setup} from '../../../../setup.mjs';

const appName = 'TextEmbeddingServiceProviderTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}      from '@playwright/test';
import {execFile}          from 'child_process';
import {getEventListeners} from 'node:events';
import {promisify}         from 'util';
import Neo                 from '../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../src/core/_export.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
}                     from '../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs';
import {PROVIDER_TIMEOUT_CODE} from '../../../../../../ai/provider/createTimeoutError.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Polls until `condition` holds, or throws naming what never happened.
 *
 * Admission is observed by what the provider was ALLOWED to start, which settles across
 * microtasks. A fixed sleep would either be flaky or slow; the timeout message carries the
 * unmet condition so a failure says which wait expired rather than only that one did.
 */
async function waitForCondition(condition, message, timeoutMs = 500) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    throw new Error(`Timed out waiting for ${message}`);
}

/**
 * @summary Runs a config-sensitive embedding probe in a fresh process before any AiConfig singleton exists.
 * @param {Function} probe Self-contained async child probe.
 * @param {Object} [env={}] Environment overrides materialized by the child config provider.
 * @returns {Promise<Object>} Last-line JSON evidence emitted by the child probe.
 */
async function runIsolatedEmbeddingProbe(probe, env = {}) {
    const source = `
        const {setup} = await import('./test/playwright/setup.mjs');
        await import('./src/Neo.mjs');
        await import('./src/core/_export.mjs');
        setup({
            neoConfig: {unitTestMode: true},
            appConfig: {name: 'TextEmbeddingIsolatedProbe', isMounted: () => true, vnodeInitialising: false}
        });
        await (${probe.toString()})();
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', source], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            NEO_UNIT_TEST_MODE: 'true',
            ...env
        },
        killSignal: 'SIGKILL',
        maxBuffer : 1024 * 1024,
        timeout   : 10_000
    });
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);

    return JSON.parse(lines.at(-1));
}

/**
 * @summary Coverage for the TextEmbeddingService Gemini-init gate.
 *
 * Implicit provider fallback is forbidden inside TextEmbeddingService. The initialization gate
 * keeps routing deterministic: the singleton only initializes a Gemini embedding client when the
 * single canonical `embeddingProvider` selector is `gemini`.
 *
 * @see Neo.ai.services.memory-core.TextEmbeddingService#shouldInitializeGeminiEmbeddingClient
 */
test.describe('TextEmbeddingService #10804 — shouldInitializeGeminiEmbeddingClient', () => {
    let shouldInitializeGeminiEmbeddingClient;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs');
        shouldInitializeGeminiEmbeddingClient = mod.shouldInitializeGeminiEmbeddingClient;
    });

    test('returns true only for the unified gemini embedding provider', () => {
        expect(shouldInitializeGeminiEmbeddingClient({embeddingProvider: 'gemini'})).toBe(true);
        expect(shouldInitializeGeminiEmbeddingClient({embeddingProvider: 'openAiCompatible'})).toBe(false);
        expect(shouldInitializeGeminiEmbeddingClient({embeddingProvider: 'ollama'})).toBe(false);
    });

    test('does not consult removed Chroma/SQLite provider selectors', () => {
        expect(shouldInitializeGeminiEmbeddingClient({
            embeddingProvider      : 'openAiCompatible',
            chromaEmbeddingProvider: 'gemini',
            neoEmbeddingProvider   : 'gemini'
        })).toBe(false);
    });
});

test.describe('TextEmbeddingService #11965 Sub-2 — native Ollama dispatch', () => {
    let TextEmbeddingService;
    let aiConfig;
    let originalEmbeddingTimeoutMs;
    let originalMaxInFlightEmbeddings;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs');
        TextEmbeddingService = mod.default;
        aiConfig             = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        originalEmbeddingTimeoutMs    = aiConfig.ollama.embeddingTimeoutMs;
        originalMaxInFlightEmbeddings = aiConfig.ollama.maxInFlightEmbeddings;
    });

    test.afterEach(() => {
        // Restore singleton ollamaProvider slot — fake injection across tests must not leak.
        TextEmbeddingService.ollamaProvider = null;
        aiConfig.ollama.embeddingTimeoutMs  = originalEmbeddingTimeoutMs;
        aiConfig.ollama.maxInFlightEmbeddings = originalMaxInFlightEmbeddings;
        clearAggregatedFrictions();
    });

    /**
     * @summary A provider whose embeds block until released, so concurrency is observable.
     *
     * Returns the peak simultaneous in-flight count. A test that only counted calls could not tell
     * a cap from a fast provider — peak overlap is the property under test.
     */
    function makeBlockingOllama() {
        const releases = [];

        let inFlight = 0,
            peak     = 0;

        return {
            get peak() { return peak },
            get started() { return releases.length },
            releaseAll() { releases.forEach(resolve => resolve()); releases.length = 0 },
            provider: {
                embed(input) {
                    inFlight++;
                    peak = Math.max(peak, inFlight);

                    return new Promise(resolve => {
                        releases.push(() => {
                            inFlight--;
                            resolve({embeddings: [[0.1]]})
                        })
                    })
                }
            }
        }
    }

    test('the env leaf admits only POSITIVE INTEGERS and falls back for invalid values (#16780 AC-5)', async () => {
        const probe = async () => {
            const config = (await import('./ai/mcp/server/memory-core/config.template.mjs')).default;

            console.log(JSON.stringify({cap: config.ollama.maxInFlightEmbeddings}))
        };
        const [zero, negative, fractional, notANumber, two] = await Promise.all([
            runIsolatedEmbeddingProbe(probe, {NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS: '0'}),
            runIsolatedEmbeddingProbe(probe, {NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS: '-1'}),
            runIsolatedEmbeddingProbe(probe, {NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS: '1.5'}),
            runIsolatedEmbeddingProbe(probe, {NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS: 'NaN'}),
            runIsolatedEmbeddingProbe(probe, {NEO_OLLAMA_MAX_INFLIGHT_EMBEDDINGS: '2'})
        ]);

        expect([zero.cap, negative.cap, fractional.cap, notANumber.cap]).toEqual([1, 1, 1, 1]);
        expect(two.cap).toBe(2);
    });

    test('the declared cap ADMITS at its number — the control that proves the cap is what binds (#16780 AC-5)', async () => {
        // Run FIRST and deliberately at 2. If only the cap-of-1 case existed, accidentally-serial
        // code would pass it and the suite would certify a cap that does nothing. Raising the number
        // must raise observed overlap, or the mechanism under test is not the mechanism at work.
        aiConfig.ollama.maxInFlightEmbeddings = 2;

        const harness = makeBlockingOllama();
        TextEmbeddingService.ollamaProvider = harness.provider;

        const calls = [
            TextEmbeddingService.embedTexts(['a'], 'ollama'),
            TextEmbeddingService.embedTexts(['b'], 'ollama'),
            TextEmbeddingService.embedTexts(['c'], 'ollama')
        ];

        await waitForCondition(() => harness.started === 2, 'two concurrent embeds admitted');

        expect(harness.peak, 'a cap of 2 must admit exactly 2 — not 1, not 3').toBe(2);

        harness.releaseAll();
        await waitForCondition(() => harness.started >= 1, 'the third embed is admitted after a slot frees');
        harness.releaseAll();
        await Promise.all(calls);
    });

    test('the default cap SERIALIZES native Ollama embedding (#16780 AC-5)', async () => {
        // The path had no admission control at all: it reached the provider through
        // `observeUnqueuedProviderActivity`, which observes and does not admit. Three callers meant
        // three simultaneous requests against one resident model.
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        const harness = makeBlockingOllama();
        TextEmbeddingService.ollamaProvider = harness.provider;

        const calls = [
            TextEmbeddingService.embedTexts(['a'], 'ollama'),
            TextEmbeddingService.embedTexts(['b'], 'ollama'),
            TextEmbeddingService.embedTexts(['c'], 'ollama')
        ];

        await waitForCondition(() => harness.started === 1, 'the first embed is admitted');

        // `harness.peak` IS the cap assertion: peak simultaneous dispatch, measured at the provider
        // seam. Two callers not dispatched is the observable consequence of two callers queued.
        expect(harness.peak, 'three callers, one slot — the other two must be waiting, not dispatched').toBe(1);

        harness.releaseAll();
        await waitForCondition(() => harness.started >= 1, 'the next embed is admitted after release');
        harness.releaseAll();
        await waitForCondition(() => harness.started >= 1, 'the last embed is admitted');
        harness.releaseAll();
        await Promise.all(calls);

        expect(harness.peak, 'peak overlap never rose across the whole sequence').toBe(1);
    });

    test('a RAISED cap applies to the next admission, not the next process start (#16780 AC-5)', async () => {
        // The AC says the cap is read at the use site "on every admission, so an operator override
        // applies to the next request rather than the next process start". The peak-overlap tests do
        // not prove that clause: they set the cap BEFORE any call, so a value captured once at
        // construction would satisfy every one of them. This is the mutation they cannot see.
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        const harness = makeBlockingOllama();
        TextEmbeddingService.ollamaProvider = harness.provider;

        const first = TextEmbeddingService.embedTexts(['a'], 'ollama');

        await waitForCondition(() => harness.started === 1, 'the first embed is admitted');

        // Raise the cap with one request in flight and NOTHING released. A value captured at
        // construction would still read 1 here, so the next caller would queue and peak would stay 1.
        aiConfig.ollama.maxInFlightEmbeddings = 2;

        const second = TextEmbeddingService.embedTexts(['b'], 'ollama');

        await waitForCondition(() => harness.started === 2, 'the raised cap admits the next caller');

        expect(harness.peak,
            'the override applies to the NEXT admission — a cap captured once would hold this at 1').toBe(2);

        harness.releaseAll();
        await Promise.all([first, second]);
    });

    test('a cap lowered below 1 while callers are QUEUED does not strand the queue (#16780 AC-5)', async () => {
        // @neo-opus-grace's pre-review finding. The waiter woken by a release has already been
        // shifted off the queue; if the re-check then throws on an invalid cap and propagates bare,
        // that wakeup is consumed — this caller holds no slot and is no longer waiting, so everyone
        // behind it stalls until some unrelated release happens.
        //
        // The throw must still reach its own caller loudly. It must not take the queue with it.
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        const harness = makeBlockingOllama();
        TextEmbeddingService.ollamaProvider = harness.provider;

        const first  = TextEmbeddingService.embedTexts(['a'], 'ollama'),
              second = TextEmbeddingService.embedTexts(['b'], 'ollama').then(() => 'ok', error => error),
              third  = TextEmbeddingService.embedTexts(['c'], 'ollama').then(() => 'ok', error => error);

        await waitForCondition(() => harness.started === 1, 'the first embed is admitted');
        expect(harness.peak, 'one dispatched, two queued behind the single slot').toBe(1);

        // Invalidate the cap, then release so a waiter wakes into the throwing re-check.
        aiConfig.ollama.maxInFlightEmbeddings = 0;
        harness.releaseAll();

        const secondResult = await second;

        expect(secondResult, 'the woken waiter learns loudly').toBeTruthy();
        expect(secondResult.message).toContain('must be a positive integer');

        // The load-bearing half: the caller BEHIND it must also settle rather than hang forever.
        const thirdResult = await Promise.race([
            third,
            new Promise(resolve => setTimeout(() => resolve('STRANDED'), 300))
        ]);

        expect(thirdResult, 'the wake was handed on, not consumed').not.toBe('STRANDED');

        aiConfig.ollama.maxInFlightEmbeddings = 1;
        harness.releaseAll();
        await first.catch(() => {});
    });

    test('a FAILING embed returns its slot — N failures must not stall the path (#16780 AC-5)', async () => {
        // The leak that would turn admission control into an outage: release only on success, and the
        // cap walks down to zero after `cap` failures while every surface reports a healthy service
        // with no requests in flight. Silent, permanent, and indistinguishable from an idle plane.
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        TextEmbeddingService.ollamaProvider = {
            embed() { return Promise.reject(new Error('provider refused')) }
        };

        for (let i = 0; i < 3; i++) {
            await TextEmbeddingService.embedTexts(['a'], 'ollama').then(() => null, error => error);
        }

        // The CONSEQUENCE of a drained path, not its counters: a leaked slot is only harmful because
        // it blocks the next caller, so admitting one proves the property that matters. Asserting the
        // internal tally would also pass on an implementation that leaked and then re-derived it.
        // This provider always rejects, so a fourth call REJECTS if the path is open and HANGS at
        // admission if a slot leaked. Racing it against a timeout makes the distinction the assertion.
        const reopened = await Promise.race([
            TextEmbeddingService.embedTexts(['reopen'], 'ollama').then(() => 'settled', () => 'settled'),
            new Promise(resolve => setTimeout(() => resolve('STALLED_AT_ADMISSION'), 300))
        ]);

        expect(reopened, 'three consecutive failures must leave the path exactly as open as it started')
            .toBe('settled');
    });

    test('a cap below 1 fails LOUD rather than admitting nothing forever (#16780 AC-5)', async () => {
        // A zero cap blocks every caller permanently. An indefinitely-held embedding request is the
        // exact state this admission control exists to prevent, so manufacturing one from a config typo would
        // be this ticket's own defect wearing the fix's clothes.
        aiConfig.ollama.maxInFlightEmbeddings = 0;

        TextEmbeddingService.ollamaProvider = {
            embed() { return Promise.resolve({embeddings: [[0.1]]}) }
        };

        const error = await TextEmbeddingService.embedTexts(['a'], 'ollama').then(() => null, observed => observed);

        expect(error, 'it must reject, not hang').toBeTruthy();
        expect(error.message).toContain('must be a positive integer');
    });

    test('a FRACTIONAL cap fails LOUD rather than reporting less concurrency than it admits (#16780 AC-5)', async () => {
        // With a bare numeric leaf, 1.5 admits two requests because the comparison is `inFlight < cap`.
        // The reporter would then claim cap=1.5 while showing inFlight=2. A cap is a count: reject a
        // fractional runtime mutation at the use-site even though ConfigProvider also warns on it.
        aiConfig.ollama.maxInFlightEmbeddings = 1.5;

        TextEmbeddingService.ollamaProvider = {
            embed() { return Promise.resolve({embeddings: [[0.1]]}) }
        };

        const error = await TextEmbeddingService.embedTexts(['a'], 'ollama').then(() => null, observed => observed);

        expect(error, 'it must reject, not round the declared cap up').toBeTruthy();
        expect(error.message).toContain('must be a positive integer');
    });

    /**
     * @summary A caller that WAITED behind the admission cap must publish the wait it incurred.
     *
     * The defect this closes is an observability inversion, not a control-flow bug: native admission
     * was enforced correctly and then described by `observeUnqueuedProviderActivity`, which stamps
     * `not-applicable` and `enqueuedAt === startedAt`. So the queue existed and the metrics said it
     * did not. An operator watching a saturated plane could not separate "the provider is slow" from
     * "Neo made it wait" — and those demand opposite responses: give the model more resources, or
     * raise the cap. Guessing wrong makes it worse.
     *
     * Driven through the real admission path with a genuinely blocked second caller, so it fails on
     * the PRODUCER rather than on a lifecycle stubbed to say what the test wants.
     */
    test('#16880: a caller BLOCKED behind the cap records neo-queued with a positive measured wait', async () => {
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        const
            activities = [],
            recorder   = {
                // A double must REFUSE what the real one refuses. A permissive fake accepted
                // `failureStage: 'admission'` — a value the shared ledger normalizes to `unknown`
                // (`providerActivityLedger.mjs`: `FAILURE_STAGES = provider | queue | unknown`) — so
                // the suite was green while the persisted stage was the least informative one
                // available. @neo-gpt found it by replaying the production contract instead of the
                // injected seam. Mirrored here so the double cannot bless an unsupported value again.
                assertSupportedStage(outcome) {
                    if (outcome?.failureStage !== undefined &&
                        !['provider', 'queue', 'unknown'].includes(outcome.failureStage)) {
                        throw new Error(`unsupported failureStage: ${outcome.failureStage}`)
                    }
                },
                // The id counter is its OWN sequence. Deriving it from `activities.length` numbers
                // `start` rows too, so the second BEGIN would be `activity-3` and every later lookup
                // by id would silently miss.
                nextId: 0,
                beginProviderActivity(entry) {
                    const id = `activity-${++this.nextId}`;

                    activities.push({type: 'begin', id, ...entry});
                    return id
                },
                startProviderActivity(id, startedAt) { activities.push({type: 'start', id, startedAt}) },
                completeProviderActivity(id, outcome) {
                    this.assertSupportedStage(outcome);
                    activities.push({type: 'complete', id, outcome})
                }
            },
            harness    = makeBlockingOllama();

        TextEmbeddingService.ollamaProvider = harness.provider;

        const first  = TextEmbeddingService.embedTexts(['a'], 'ollama', {providerActivityRecorder: recorder}),
              second = TextEmbeddingService.embedTexts(['b'], 'ollama', {providerActivityRecorder: recorder});

        // THE BOUNDARY OPENS HERE — immediately after the calls that create the contention, and
        // BEFORE the first `await` that can time out. Twice now I moved it and left something above
        // it: first three assertions, then the `waitForCondition` itself, which throws on timeout.
        // Anything above this line that can throw strands the held slot and the parked waiter, and
        // the failure then surfaces in an unrelated spec. A test may fail; it may not poison.
        try {
            await waitForCondition(
                // Queue depth read from the RECORDER, which is what an operator gets: a row is begun
                // at admission entry and started at admission grant, so begun-minus-started IS the
                // number parked at the cap. No accessor needed for a fact already published.
                () => activities.filter(item => item.type === 'begin').length
                    - activities.filter(item => item.type === 'start').length === 1,
                'the second caller to queue behind the cap'
            );

            // The row is OPEN while waiting — begun, not yet started. An instrument that only writes
            // on completion cannot show a caller currently stuck at admission, the live symptom.
            const begun = activities.filter(item => item.type === 'begin');

            expect(begun.length, 'both callers opened a row before admission').toBe(2);
            expect(begun.every(entry => entry.queueDisposition === 'neo-queued'),
                'admission is a real queue and must be recorded as one').toBe(true);
            expect(activities.filter(item => item.type === 'start').length,
                'the blocked caller must NOT be marked started while it waits').toBe(1);

            // `harness.started` is PENDING releases, and `releaseAll()` resets it to 0 — so the
            // queued caller dispatching takes it back to 1, never to 2. Read the getter.
            harness.releaseAll();
            await waitForCondition(() => harness.started === 1, 'the queued caller to dispatch');
            harness.releaseAll();
            await Promise.all([first, second]);

            const
                secondBegin = begun[1],
                secondStart = activities.find(item => item.type === 'start' && item.id === secondBegin.id);

            expect(secondStart, 'the queued caller eventually starts').toBeTruthy();

            // `>=`, NOT `>`. `Date.now()` has millisecond resolution and an admission wait can
            // complete inside one tick, so a strict `>` fails on speed rather than on correctness —
            // it flaked here on the very first run. This assertion is deliberately NOT the
            // discriminator: the teeth are the `start`-count check above, because an implementation
            // using `observeUnqueuedProviderActivity` marks BOTH callers started immediately, while
            // a truthful queue cannot start one that has not been admitted.
            expect(secondStart.startedAt,
                'start is stamped at admission, never before it'
            ).toBeGreaterThanOrEqual(secondBegin.enqueuedAt);

        // This arm creates REAL contention, so it must prove it drained. A test that leaves a slot
        // held or a waiter parked poisons every later spec in the worker with an admission stall,
        // and the symptom surfaces somewhere else entirely — which is the pollution class this
        // suite already suffers from. Asserting the drain keeps the cost inside this test.
            // Drain proved as a CONSEQUENCE: a stranded slot or parked waiter would block this
            // caller, which is the only way the leak ever hurts anything. Keeps the cost of any
            // failure inside this test instead of surfacing as a stall three files later.
            const drainProbe = TextEmbeddingService.embedTexts(['drain'], 'ollama').then(() => null, error => error);

            await waitForCondition(() => harness.started === 1, 'contention must fully drain before the next spec runs');

            harness.releaseAll();
            await drainProbe
        } finally {
            harness.releaseAll();
            await Promise.allSettled([first, second])
        }
    });

    /**
     * @summary A caller abandoned WHILE QUEUED must CLOSE its row, at a stage the ledger supports.
     *
     * The arm that was missing, and its absence is why an invented `failureStage: 'admission'`
     * shipped green: nothing drove the abort path, so nothing could observe the value. The shared
     * ledger admits only `provider | queue | unknown` and silently normalizes anything else to
     * `unknown` — a bespoke stage does not fail, it degrades to the least informative answer while
     * the producer's own comment claims precision it never achieved.
     *
     * Two properties, and the row-closing one matters more. An abandoned caller that leaves its row
     * OPEN makes in-flight a number that only grows, so the instrument built to show a stuck plane
     * would itself report a permanent phantom backlog.
     */
    test('#16880: a caller abandoned WHILE QUEUED closes its row at a ledger-supported stage', async () => {
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        const
            activities = [],
            recorder   = {
                assertSupportedStage(outcome) {
                    if (outcome?.failureStage !== undefined &&
                        !['provider', 'queue', 'unknown'].includes(outcome.failureStage)) {
                        throw new Error(`unsupported failureStage: ${outcome.failureStage}`)
                    }
                },
                nextId: 0,
                beginProviderActivity(entry) {
                    const id = `abort-${++this.nextId}`;

                    activities.push({type: 'begin', id, ...entry});
                    return id
                },
                startProviderActivity(id, startedAt) { activities.push({type: 'start', id, startedAt}) },
                completeProviderActivity(id, outcome) {
                    this.assertSupportedStage(outcome);
                    activities.push({type: 'complete', id, outcome})
                }
            },
            harness    = makeBlockingOllama(),
            controller = new AbortController();

        TextEmbeddingService.ollamaProvider = harness.provider;

        const first  = TextEmbeddingService.embedTexts(['a'], 'ollama', {providerActivityRecorder: recorder}),
              second = TextEmbeddingService.embedTexts(['b'], 'ollama', {
                  providerActivityRecorder: recorder,
                  signal                  : controller.signal
              }).then(() => 'fulfilled', error => error);

        try {
            await waitForCondition(
                () => activities.filter(item => item.type === 'begin').length
                    - activities.filter(item => item.type === 'start').length === 1,
                'the second caller to queue'
            );

            controller.abort(new Error('queued caller cancelled'));
            await second;

            const
                queuedRow = activities.filter(item => item.type === 'begin').at(-1),
                completed = activities.find(item => item.type === 'complete' && item.id === queuedRow.id);

            expect(completed, 'an abandoned queued caller must CLOSE its row, never leave it open')
                .toBeTruthy();
            expect(completed.outcome.success, 'and it did not succeed').toBe(false);
            expect(completed.outcome.failureStage,
                'the stage must be one the shared ledger actually persists — `queue`, matching the ' +
                'openAiCompatible queued-abort precedent in this same service'
            ).toBe('queue')
        } finally {
            harness.releaseAll();
            await Promise.allSettled([first, second]);

            // PROVE THE DRAIN. This arm aborts a caller mid-queue, which is precisely the shape that
            // can strand a waiter or a slot; asserting it here keeps the cost inside this test
            // instead of surfacing as a stall in an unrelated spec three files later.
            // Drain proved as a CONSEQUENCE: a stranded slot or parked waiter would block this
            // caller, which is the only way the leak ever hurts anything. Keeps the cost of any
            // failure inside this test instead of surfacing as a stall three files later.
            const drainProbe = TextEmbeddingService.embedTexts(['drain'], 'ollama').then(() => null, error => error);

            await waitForCondition(() => harness.started === 1, 'an aborted queued caller must leave no residue');

            harness.releaseAll();
            await drainProbe
        }
    });

    test('#16880 NON-VACUITY: an UNCONTENDED caller also records neo-queued, with a ~zero wait', async () => {
        // Without this, the arm above passes against an implementation that only opens a row under
        // contention — which would make the queue look like it materializes at load rather than
        // being a property of the path. An uncontended call has a MEASURED near-zero wait; that is a
        // fact, not an absence, and `not-applicable` would erase the distinction again.
        aiConfig.ollama.maxInFlightEmbeddings = 4;

        const
            activities = [],
            recorder   = {
                beginProviderActivity(entry) { activities.push({type: 'begin', ...entry}); return 'activity-solo' },
                startProviderActivity(id, startedAt) { activities.push({type: 'start', id, startedAt}) },
                completeProviderActivity(id, outcome) { activities.push({type: 'complete', id, outcome}) }
            };

        TextEmbeddingService.ollamaProvider = {
            async embed() { return {embeddings: [[0.1, 0.2]]} }
        };

        await TextEmbeddingService.embedTexts(['solo'], 'ollama', {providerActivityRecorder: recorder});

        const begun = activities.find(item => item.type === 'begin');

        expect(begun.queueDisposition, 'the disposition is a property of the path, not of load')
            .toBe('neo-queued');
        expect(activities.find(item => item.type === 'complete'),
            'and provider settlement still completes the row').toBeTruthy()
    });

    test('a caller aborted while QUEUED settles without waiting for the occupied slot (#16780 AC-5)', async () => {
        // The provider can remain alive after caller abort, but no provider work exists for a caller
        // still waiting at admission. It must therefore leave the queue immediately. Waiting for the
        // occupied request to settle would turn its timeout/cancellation into a second indefinite wait.
        aiConfig.ollama.maxInFlightEmbeddings = 1;

        const
            harness    = makeBlockingOllama(),
            controller = new AbortController(),
            reason     = new Error('queued caller cancelled');

        TextEmbeddingService.ollamaProvider = harness.provider;

        const first  = TextEmbeddingService.embedTexts(['a'], 'ollama'),
              second = TextEmbeddingService.embedTexts(['b'], 'ollama', {
                  signal: controller.signal
              }).then(() => 'fulfilled', error => error),
              third  = TextEmbeddingService.embedTexts(['c'], 'ollama');

        // No recorder in this arm, so queue arrival is proven by dispatch exclusion: the first caller
        // holds the only slot, and a microtask flush lets the other two reach admission and park.
        await waitForCondition(() => harness.started === 1, 'the first caller holds the only slot');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(harness.peak, 'the second and third callers are parked, not dispatched').toBe(1);

        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
        controller.abort(reason);

        const observed = await Promise.race([
            second,
            new Promise(resolve => setTimeout(() => resolve('HUNG_BEHIND_PROVIDER'), 300))
        ]);

        expect(observed, 'the exact caller-owned reason settles before provider release').toBe(reason);
        expect(getEventListeners(controller.signal, 'abort'), 'the cancelled waiter leaves no listener').toEqual([]);

        // One of two queued callers was aborted; the OTHER must still be parked and dispatchable, and
        // the wait below IS that proof — releasing the held slot admits exactly the survivor, while an
        // implementation that dropped both waiters admits nobody and this times out.
        harness.releaseAll();
        await waitForCondition(() => harness.started === 1, 'the surviving queued caller to dispatch');
        harness.releaseAll();
        await Promise.all([first, third]);
    });

    test('embedText dispatches to native Ollama provider when explicitProvider=ollama', async () => {
        const captured   = [];
        const fakeOllama = {
            async embed(input, options) {
                captured.push({input, options});
                return {embeddings: [[0.1, 0.2, 0.3]], raw: {model: 'fake-model'}};
            }
        };
        TextEmbeddingService.ollamaProvider = fakeOllama;

        const result = await TextEmbeddingService.embedText('hello world', 'ollama');

        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(captured).toEqual([{
            input  : 'hello world',
            options: {
                num_ctx       : aiConfig.localModels.embedding.contextLimitTokens,
                operationLabel: 'TextEmbeddingService.embedText native Ollama embedding',
                timeoutMs     : aiConfig.ollama.embeddingTimeoutMs,
                truncate      : false
            }
        }]);
    });

    test('embedTexts dispatches batch to native Ollama provider when explicitProvider=ollama', async () => {
        const captured   = [];
        const identities = [];
        const fakeOllama = {
            async embed(input, options) {
                captured.push({input, options});
                return {
                    embeddings: [
                        [0.1, 0.2],
                        [0.3, 0.4],
                        [0.5, 0.6]
                    ],
                    raw: {model: 'fake-model'}
                };
            }
        };
        TextEmbeddingService.ollamaProvider = fakeOllama;

        const result = await TextEmbeddingService.embedTexts(['a', 'b', 'c'], 'ollama', {
            providerActivityRecorder: {
                beginProviderActivity() { return 'batch-activity' },
                completeProviderActivity() {},
                recordEmbeddingSubmissions(entry) { identities.push(entry) },
                startProviderActivity() {}
            }
        });

        expect(result).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]);
        expect(captured).toEqual([{
            input  : ['a', 'b', 'c'],
            options: {
                num_ctx       : aiConfig.localModels.embedding.contextLimitTokens,
                operationLabel: 'TextEmbeddingService.embedTexts native Ollama embedding',
                timeoutMs     : aiConfig.ollama.embeddingTimeoutMs,
                truncate      : false
            }
        }]);
        expect(identities).toEqual([{
            submittedAt: expect.any(Number),
            texts      : ['a', 'b', 'c']
        }]);
    });

    test('embedTexts refuses a longer native Ollama response so !== cannot regress to <', async () => {
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                return {
                    embeddings: [
                        [0.1, 0.2],
                        [0.3, 0.4],
                        [0.5, 0.6]
                    ]
                };
            }
        };

        await expect(
            TextEmbeddingService.embedTexts(['a', 'b'], 'ollama')
        ).rejects.toThrow(
            'ollama embedding response returned 3 vector(s) for 2 input(s); refusing to bind vectors to inputs by position'
        );
    });

    /**
     * @summary Native Ollama admission is a REAL queue, so it must be recorded as one.
     *
     * This arm previously asserted `queueDisposition: 'not-applicable'` — and that was correct when
     * it was written, because nothing admitted on this path. Native admission then landed and the
     * observation did not follow it, so a caller that genuinely waited behind the cap published a
     * null wait. The spec was pinning the defect: an operator reading provider metrics could not
     * separate "the provider is slow" from "Neo made it wait", which demand opposite responses.
     *
     * Both calls below are UNCONTENDED, and both must still record `neo-queued`. A disposition that
     * appears only under contention would make the queue look like it materializes at load rather
     * than being a property of the path; an uncontended call has a measured ~zero wait, which is a
     * fact rather than an absence.
     */
    test('records native Ollama as neo-queued without leaking attribution controls to the provider', async () => {
        const captured   = [];
        const activities = [];
        const recorder   = {
            beginProviderActivity(entry) { activities.push({type: 'begin', entry}); return `activity-${activities.length}` },
            startProviderActivity(id, startedAt) { activities.push({type: 'start', id, startedAt}) },
            completeProviderActivity(id, outcome) { activities.push({type: 'complete', id, outcome}) }
        };

        TextEmbeddingService.ollamaProvider = {
            async embed(input, options) {
                captured.push({input, options});
                return {embeddings: [[0.1, 0.2]]};
            }
        };

        await TextEmbeddingService.embedText('hello', 'ollama', {
            operationLabel          : 'session/private-123',
            operationStage          : 'embedding-canary',
            providerActivityRecorder: recorder,
            service                 : 'memory-core'
        });
        await TextEmbeddingService.embedText('unknown-stage', 'ollama', {
            operationLabel          : 'asset/private-456',
            providerActivityRecorder: recorder,
            service                 : 'memory-core'
        });

        expect(captured[0].options).toEqual({
            num_ctx       : aiConfig.localModels.embedding.contextLimitTokens,
            operationLabel: 'session/private-123',
            timeoutMs     : aiConfig.ollama.embeddingTimeoutMs,
            truncate      : false
        });
        expect(activities.filter(item => item.type === 'begin').map(item => item.entry)).toEqual([
            expect.objectContaining({
                operationStage  : 'embedding-canary',
                priority        : 'interactive',
                provider        : 'ollama',
                queueDisposition: 'neo-queued',
                role            : 'embedding',
                service         : 'memory-core'
            }),
            expect.objectContaining({
                operationStage  : 'unknown',
                queueDisposition: 'neo-queued'
            })
        ]);
        expect(activities.filter(item => item.type === 'complete')).toHaveLength(2);
    });

    test('attributes native Ollama to the cached provider model without changing its request shape', async () => {
        const activities = [];
        const captured   = [];

        TextEmbeddingService.ollamaProvider = {
            embeddingModel: 'cached-ollama-model-a',
            async embed(input, options) {
                captured.push({input, options});
                return {embeddings: [[0.1, 0.2]]};
            }
        };

        await TextEmbeddingService.embedText('hello', 'ollama', {
            operationStage          : 'embedding-canary',
            providerActivityRecorder: {
                beginProviderActivity(entry) { activities.push(entry); return 'cached-ollama-activity' },
                startProviderActivity() {},
                completeProviderActivity() {}
            },
            service: 'memory-core'
        });

        expect(activities[0].model).toBe('cached-ollama-model-a');
        expect(captured[0].options).not.toHaveProperty('model');
    });

    test('native Ollama timeout errors emit provider-scoped ConsumerFriction (#14052)', async () => {
        aiConfig.ollama.embeddingTimeoutMs = 25;
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                const err = new Error('[Ollama] native embed timed out after 25ms');
                err.code = PROVIDER_TIMEOUT_CODE;
                err.provider = 'Ollama';
                throw err;
            }
        };

        for (let i = 0; i < 3; i++) {
            await expect(TextEmbeddingService.embedTexts([`stuck ${i}`], 'ollama'))
                .rejects.toThrow(/native embed timed out after 25ms/);
        }

        expect(getAggregatedFrictions()).toEqual([
            expect.objectContaining({
                assetRef      : `ollama:${aiConfig.ollama.embeddingModel || aiConfig.ollama.model}`,
                consumer      : 'TextEmbeddingService.ollama',
                model         : aiConfig.ollama.embeddingModel || aiConfig.ollama.model,
                symptom       : 'timeout',
                emissionPoint : 'post-invocation-failure',
                suggestionKind: 'unknown',
                serviceDomain : 'memory-core',
                count         : 3
            })
        ]);
    });

    test('native Ollama embedding timeout config fails loud when invalid (#14052)', async () => {
        aiConfig.ollama.embeddingTimeoutMs = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() { return {embeddings: [[0.1]], raw: {}}; }
        };

        await expect(TextEmbeddingService.embedText('hello', 'ollama'))
            .rejects.toThrow(/ollama\.embeddingTimeoutMs must be a positive number/);
    });

    test('invalid native Ollama batch configuration records no admitted identities', async () => {
        const identities = [];

        aiConfig.ollama.embeddingTimeoutMs = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() { return {embeddings: [[0.1]], raw: {}}; }
        };

        await expect(TextEmbeddingService.embedTexts(['never admitted'], 'ollama', {
            providerActivityRecorder: {
                recordEmbeddingSubmissions(entry) { identities.push(entry) }
            }
        })).rejects.toThrow(/ollama\.embeddingTimeoutMs must be a positive number/);

        expect(identities).toEqual([]);
    });

    test('embedText with explicitProvider=ollama returns empty when provider returns no embeddings', async () => {
        TextEmbeddingService.ollamaProvider = {
            async embed() { return {embeddings: [], raw: {}}; }
        };

        const result = await TextEmbeddingService.embedText('hello', 'ollama');
        expect(result).toBeUndefined(); // embeddings[0] of empty array
    });

    test('embedText with explicitProvider=openAiCompatible does NOT dispatch to Ollama', async () => {
        const ollamaCalls = [];
        TextEmbeddingService.ollamaProvider = {
            async embed(input) { ollamaCalls.push(input); return {embeddings: [[9, 9, 9]]}; }
        };

        // openAiCompatible path tries to hit /v1/embeddings — let it fail; we only assert
        // that the Ollama fake was NOT called.
        await TextEmbeddingService.embedText('hello', 'openAiCompatible').catch(() => {});
        expect(ollamaCalls).toEqual([]);
    });

    test('embedText with explicitProvider=gemini does NOT dispatch to Ollama', async () => {
        const ollamaCalls = [];
        TextEmbeddingService.ollamaProvider = {
            async embed(input) { ollamaCalls.push(input); return {embeddings: [[9, 9, 9]]}; }
        };

        // gemini path checks GEMINI_API_KEY + embeddingModel; without those it throws
        // — we only assert the Ollama fake wasn't called regardless of throw.
        await TextEmbeddingService.embedText('hello', 'gemini').catch(() => {});
        expect(ollamaCalls).toEqual([]);
    });

    test('embedText throws explicitly for unsupported provider (no silent Gemini fallthrough)', async () => {
        // Historically, any unknown explicitProvider value fell through to the Gemini branch.
        // That silent fallback
        // masked misconfiguration. Now an unsupported value throws with the expected set
        // named in the message.
        await expect(TextEmbeddingService.embedText('hello', 'bogus-provider')).rejects.toThrow(
            /unsupported embedding provider 'bogus-provider'.*Expected one of.*gemini.*openAiCompatible.*ollama/
        );
    });

    test('embedTexts rejects an unsupported provider without recording provider work', async () => {
        const identities = [];

        await expect(TextEmbeddingService.embedTexts(['a', 'b'], 'mystery-provider', {
            providerActivityRecorder: {
                recordEmbeddingSubmissions(entry) { identities.push(entry) }
            }
        })).rejects.toThrow(
            /unsupported embedding provider 'mystery-provider'.*Expected one of.*gemini.*openAiCompatible.*ollama/
        );
        expect(identities).toEqual([]);
    });

    test('a pre-aborted batch records no identities and makes no provider call', async () => {
        const
            controller = new AbortController(),
            identities = [],
            reason     = new Error('batch cancelled before admission');
        let providerCalls = 0;

        controller.abort(reason);
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                providerCalls++;
                return {embeddings: [[0.1, 0.2]]}
            }
        };

        await expect(TextEmbeddingService.embedTexts(['never submit'], 'ollama', {
            providerActivityRecorder: {
                recordEmbeddingSubmissions(entry) { identities.push(entry) }
            },
            signal: controller.signal
        })).rejects.toBe(reason);

        expect(providerCalls).toBe(0);
        expect(identities).toEqual([]);
    });
});

test.describe.serial('TextEmbeddingService #15694 — provider-neutral cancellation contract', () => {
    let TextEmbeddingService;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs');

        TextEmbeddingService = mod.default;
    });

    test.afterEach(() => {
        TextEmbeddingService.ollamaProvider = null;
        clearAggregatedFrictions();
    });

    test('Ollama caller abort settles promptly while provider activity remains open until settlement (#16853)', async () => {
        const
            controller = new AbortController(),
            reason     = Object.freeze(new Error('stop waiting for native Ollama')),
            activities = [];

        let capturedOptions, resolveProvider;
        TextEmbeddingService.ollamaProvider = {
            embed(input, options) {
                capturedOptions = options;
                return new Promise(resolve => resolveProvider = resolve);
            }
        };

        const embeddingPromise = TextEmbeddingService.embedText('hello', 'ollama', {
            signal                  : controller.signal,
            operationLabel          : 'Ollama caller settlement probe',
            operationStage          : 'embedding-canary',
            service                 : 'memory-core',
            providerActivityRecorder: {
                beginProviderActivity(entry) { activities.push({type: 'begin', entry}); return 'activity-1' },
                startProviderActivity(id) { activities.push({type: 'start', id}) },
                completeProviderActivity(id, outcome) { activities.push({type: 'complete', id, outcome}) }
            }
        });

        await expect.poll(() => Boolean(capturedOptions)).toBe(true);
        controller.abort(reason);
        await expect(embeddingPromise).rejects.toBe(reason);

        expect(capturedOptions).not.toHaveProperty('signal');
        expect(activities.map(item => item.type)).toEqual(['begin', 'start']);

        resolveProvider({embeddings: [[0.1, 0.2]]});
        await expect.poll(() => activities.filter(item => item.type === 'complete').length).toBe(1);
        expect(activities.at(-1).outcome).toMatchObject({success: true});
    });

    test('Ollama provider failure that settles before caller abort keeps provider identity (#16853)', async () => {
        const
            controller    = new AbortController(),
            providerError = Object.assign(new Error('native provider failed first'), {
                name: 'AbortError',
                code: 'ABORT_ERR'
            }),
            callerReason  = new Error('later caller abort');

        let rejectProvider;
        TextEmbeddingService.ollamaProvider = {
            embed() {
                return new Promise((resolve, reject) => rejectProvider = reject);
            }
        };

        const embeddingPromise = TextEmbeddingService.embedText('hello', 'ollama', {
            signal        : controller.signal,
            operationLabel: 'provider-first race probe'
        });

        rejectProvider(providerError);
        controller.abort(callerReason);

        await expect(embeddingPromise).rejects.toBe(providerError);
    });

    test('Ollama batch caller abort keeps provider work observed and never forwards the signal (#16853)', async () => {
        const
            controller = new AbortController(),
            reason     = Object.freeze(new Error('stop waiting for native Ollama batch')),
            activities = [];

        let capturedInput, capturedOptions, resolveProvider;
        TextEmbeddingService.ollamaProvider = {
            embed(input, options) {
                capturedInput   = input;
                capturedOptions = options;
                return new Promise(resolve => resolveProvider = resolve);
            }
        };

        const embeddingPromise = TextEmbeddingService.embedTexts(['one', 'two'], 'ollama', {
            signal                  : controller.signal,
            operationLabel          : 'Ollama batch caller settlement probe',
            operationStage          : 'mc-wal-drain-embedding',
            service                 : 'memory-core',
            providerActivityRecorder: {
                beginProviderActivity(entry) { activities.push({type: 'begin', entry}); return 'activity-batch' },
                startProviderActivity(id) { activities.push({type: 'start', id}) },
                completeProviderActivity(id, outcome) { activities.push({type: 'complete', id, outcome}) }
            }
        });

        await expect.poll(() => Boolean(capturedOptions)).toBe(true);
        controller.abort(reason);
        await expect(embeddingPromise).rejects.toBe(reason);

        expect(capturedInput).toEqual(['one', 'two']);
        expect(capturedOptions).not.toHaveProperty('signal');
        expect(activities.map(item => item.type)).toEqual(['begin', 'start']);

        resolveProvider({embeddings: [[0.1], [0.2]]});
        await expect.poll(() => activities.filter(item => item.type === 'complete').length).toBe(1);
        expect(activities.at(-1).outcome).toMatchObject({success: true});
    });

    test('late Ollama timeout after caller abort completes the provider record exactly once (#16853)', async () => {
        const
            controller = new AbortController(),
            reason     = new Error('caller left before provider timeout'),
            activities = [];

        let rejectProvider;
        TextEmbeddingService.ollamaProvider = {
            embed() {
                return new Promise((resolve, reject) => rejectProvider = reject);
            }
        };

        const embeddingPromise = TextEmbeddingService.embedText('hello', 'ollama', {
            signal                  : controller.signal,
            operationLabel          : 'late provider timeout probe',
            providerActivityRecorder: {
                beginProviderActivity() { return 'activity-late-timeout' },
                startProviderActivity() {},
                completeProviderActivity(id, outcome) { activities.push({id, outcome}) }
            }
        });

        controller.abort(reason);
        await expect(embeddingPromise).rejects.toBe(reason);

        const timeoutError = Object.assign(new Error('native provider timed out later'), {
            code    : PROVIDER_TIMEOUT_CODE,
            provider: 'Ollama'
        });

        rejectProvider(timeoutError);

        await expect.poll(() => activities.length).toBe(1);
        expect(activities[0]).toMatchObject({
            id     : 'activity-late-timeout',
            outcome: {success: false}
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(activities).toHaveLength(1);
    });

    test('non-Error abort reasons become a bounded structural AbortError before provider work', async () => {
        const
            controller     = new AbortController(),
            operationLabel = 'x'.repeat(160),
            activities     = [];

        let providerCalls = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                providerCalls++;
                return {embeddings: [[0.1]]};
            }
        };
        controller.abort('opaque-reason');

        let observed;
        try {
            await TextEmbeddingService.embedText('hello', 'ollama', {
                signal                  : controller.signal,
                operationLabel,
                providerActivityRecorder: {
                    beginProviderActivity(entry) { activities.push(entry); return 'must-not-start' }
                }
            });
        } catch (error) {
            observed = error;
        }

        expect(providerCalls).toBe(0);
        expect(activities).toEqual([]);
        expect(getEventListeners(controller.signal, 'abort')).toEqual([]);
        expect(observed).toMatchObject({
            name          : 'AbortError',
            code          : 'ABORT_ERR',
            operationLabel: 'x'.repeat(120)
        });
        expect(observed.message).toBe(`${'x'.repeat(120)} aborted`);
    });

    test('rejects unknown call options before provider dispatch', async () => {
        let providerCalls = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                providerCalls++;
                return {embeddings: [[0.1]]};
            }
        };

        await expect(TextEmbeddingService.embedText('hello', 'ollama', {timeoutMs: 5}))
            .rejects.toThrow(/unsupported embedding option\(s\): timeoutMs/);
        expect(providerCalls).toBe(0);
    });

    test('Gemini forwards signals and preserves the complete SDK abort taxonomy in an isolated config process', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const {GoogleGenerativeAIAbortError} = await import('@google/generative-ai');
            const {default: Service}             = await import('./ai/services/memory-core/TextEmbeddingService.mjs');

            const forwardController = new AbortController();
            const calls             = [];

            Service.embeddingModel = {
                async embedContent(request, requestOptions) {
                    calls.push({kind: 'single', requestOptions});
                    return {embedding: {values: [0.1, 0.2]}};
                },
                async batchEmbedContents(request, requestOptions) {
                    calls.push({kind: 'batch', requestOptions});
                    return {embeddings: [{values: [0.3]}, {values: [0.4]}]};
                }
            };

            const single = await Service.embedText('one', 'gemini', {signal: forwardController.signal});
            const batch  = await Service.embedTexts(['two', 'three'], 'gemini', {signal: forwardController.signal});

            const exactController = new AbortController();
            const exactReason     = new Error('cancel Gemini probe');
            Service.embeddingModel = {
                embedContent(input, requestOptions) {
                    return new Promise((resolve, reject) => {
                        requestOptions.signal.addEventListener('abort', () => {
                            reject(new GoogleGenerativeAIAbortError('SDK wrapped the caller abort'));
                        }, {once: true});
                    });
                }
            };
            const exactPromise = Service.embedText('exact', 'gemini', {signal: exactController.signal});
            exactController.abort(exactReason);
            let exactObserved;
            try {
                await exactPromise;
            } catch (error) {
                exactObserved = error;
            }

            const fallbackController = new AbortController();
            Service.embeddingModel = {
                embedContent(input, requestOptions) {
                    return new Promise((resolve, reject) => {
                        requestOptions.signal.addEventListener('abort', () => {
                            reject(new GoogleGenerativeAIAbortError('SDK dropped a non-Error reason'));
                        }, {once: true});
                    });
                }
            };
            const fallbackPromise = Service.embedText('fallback', 'gemini', {
                signal        : fallbackController.signal,
                operationLabel: 'g'.repeat(160)
            });
            fallbackController.abort('opaque-reason');
            let fallbackObserved;
            try {
                await fallbackPromise;
            } catch (error) {
                fallbackObserved = error;
            }

            const liveController = new AbortController();
            const liveWrapper    = new GoogleGenerativeAIAbortError('SDK aborted independently');
            Service.embeddingModel = {
                async embedContent() {
                    throw liveWrapper;
                }
            };
            let liveObserved;
            try {
                await Service.embedText('live', 'gemini', {signal: liveController.signal});
            } catch (error) {
                liveObserved = error;
            }

            console.log(JSON.stringify({
                single,
                batch,
                singleSignalForwarded: calls[0].requestOptions.signal === forwardController.signal,
                batchSignalForwarded : calls[1].requestOptions.signal === forwardController.signal,
                exactReasonRestored  : exactObserved === exactReason,
                fallback             : {
                    name          : fallbackObserved?.name,
                    code          : fallbackObserved?.code,
                    operationLabel: fallbackObserved?.operationLabel,
                    message       : fallbackObserved?.message
                },
                liveWrapperPreserved: liveObserved === liveWrapper,
                liveSignalAborted   : liveController.signal.aborted
            }));
        }, {GEMINI_API_KEY: 'unit-test-key'});

        expect(evidence).toEqual({
            single               : [0.1, 0.2],
            batch                : [[0.3], [0.4]],
            singleSignalForwarded: true,
            batchSignalForwarded : true,
            exactReasonRestored  : true,
            fallback             : {
                name          : 'AbortError',
                code          : 'ABORT_ERR',
                operationLabel: 'g'.repeat(120),
                message       : `${'g'.repeat(120)} aborted`
            },
            liveWrapperPreserved: true,
            liveSignalAborted   : false
        });
    });

    test('attributes Gemini embeddings to the cached SDK endpoint model under config drift', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const {default: Service}  = await import('./ai/services/memory-core/TextEmbeddingService.mjs');
            const {default: aiConfig} = await import('./ai/mcp/server/memory-core/config.template.mjs');
            const activities          = [];
            const requestModels       = [];
            const recorder            = {
                beginProviderActivity(entry) { activities.push(entry); return `activity-${activities.length}` },
                startProviderActivity() {},
                completeProviderActivity() {}
            };

            aiConfig.embeddingModel = 'live-config-model-b';
            Service.embeddingModel = {
                model: 'models/cached-sdk-model-a',
                async embedContent() {
                    return {embedding: {values: [0.1]}};
                },
                async batchEmbedContents({requests}) {
                    requestModels.push(...requests.map(request => request.model));
                    return {embeddings: requests.map(() => ({values: [0.2]}))};
                }
            };

            await Service.embedText('one', 'gemini', {
                operationStage          : 'kb-query-embedding',
                providerActivityRecorder: recorder,
                service                 : 'knowledge-base'
            });
            await Service.embedTexts(['two', 'three'], 'gemini', {
                operationStage          : 'kb-tenant-ingestion-embedding',
                providerActivityRecorder: recorder,
                service                 : 'knowledge-base'
            });

            console.log(JSON.stringify({
                models: activities.map(entry => entry.model),
                requestModels
            }));
        }, {GEMINI_API_KEY: 'unit-test-key'});

        expect(evidence).toEqual({
            models: [
                'models/cached-sdk-model-a',
                'models/cached-sdk-model-a'
            ],
            requestModels: [
                'live-config-model-b',
                'live-config-model-b'
            ]
        });
    });

    test('OpenAI-compatible retry and batch delays stop before later work in an isolated config process', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const http                = await import('node:http');
            const {getEventListeners} = await import('node:events');

            let behavior                           = 'success';
            let closedHungRequests                 = 0;
            let heldResponse                       = null;
            let nextRequestObservedAfterAbortClose = false;
            let requestCount                       = 0;
            let requestInputs                      = [];

            const server = http.createServer((request, response) => {
                requestCount++;
                response.on('close', () => {
                    if (!response.writableEnded) {
                        closedHungRequests++;
                    }
                });

                let body = '';
                request.on('data', chunk => body += chunk);
                request.on('end', () => {
                    const payload = JSON.parse(body);
                    requestInputs.push(payload.input);

                    if (behavior === 'model-load') {
                        response.writeHead(400, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({error: 'Model was unloaded while the request was still in queue.'}));
                    } else if (behavior === 'contention') {
                        response.writeHead(408, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({error: 'provider contention'}));
                    } else {
                        if (behavior === 'hold-first' && requestCount === 1) {
                            heldResponse = response;
                            return;
                        }
                        if (behavior === 'hold-first') {
                            nextRequestObservedAfterAbortClose = closedHungRequests > 0;
                        }

                        const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
                        response.writeHead(200, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({
                            data: inputs.map((input, index) => ({index, embedding: [index + 0.1]}))
                        }));
                    }
                });
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

            try {
                Object.assign(process.env, {
                NEO_OPENAI_COMPATIBLE_HOST                      : `http://127.0.0.1:${server.address().port}`,
                NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT        : '2',
                NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS     : '500',
                NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT    : '2',
                NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS : '500',
                NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS     : '5000',
                NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE: '1',
                NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_TIMEOUT_MS: '5000',
                NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS  : '500'
            });

            const {default: Service} = await import('./ai/services/memory-core/TextEmbeddingService.mjs');
            const waitFor            = async (condition, label) => {
                const startedAt = Date.now();

                while (Date.now() - startedAt < 1000) {
                    if (condition()) return;
                    await new Promise(resolve => setTimeout(resolve, 1));
                }

                throw new Error(`Timed out waiting for ${label}`);
            };
            const capture = async promise => {
                try {
                    await promise;
                } catch (error) {
                    return error;
                }

                throw new Error('Expected isolated embedding probe to reject');
            };
            const resetServerState = nextBehavior => {
                behavior                           = nextBehavior;
                closedHungRequests                 = 0;
                heldResponse                       = null;
                nextRequestObservedAfterAbortClose = false;
                requestCount                       = 0;
                requestInputs                      = [];
            };

            resetServerState('success');
            let preflightCalls = 0;
            Service.openAiCompatibleLoadedModelsProbe = async () => {
                preflightCalls++;
                return [];
            };
            const preAbortedController = new AbortController();
            const preAbortedReason     = new Error('cancel before embedding entry');
            preAbortedController.abort(preAbortedReason);
            const preAbortedObserved = await capture(Service.embedText('never-send', 'openAiCompatible', {
                signal        : preAbortedController.signal,
                operationLabel: 'pre-aborted probe'
            }));
            const preAborted = {
                exactReason: preAbortedObserved === preAbortedReason,
                listeners  : getEventListeners(preAbortedController.signal, 'abort').length,
                preflightCalls,
                requestCount
            };

            resetServerState('success');
            let readinessSignal;
            Service.openAiCompatibleLoadedModelsProbe = ({signal}) => new Promise((resolve, reject) => {
                readinessSignal = signal;
                signal.addEventListener('abort', () => reject(Object.assign(
                    new Error('preflight wrapper'),
                    {name: 'AbortError'}
                )), {once: true});
            });
            const readinessController = new AbortController();
            const readinessReason     = new Error('cancel LMS readiness child');
            const readinessPromise    = Service.embedText('never-send', 'openAiCompatible', {
                signal        : readinessController.signal,
                operationLabel: 'preflight cancellation probe'
            });
            await waitFor(() => readinessSignal === readinessController.signal, 'preflight signal hand-off');
            readinessController.abort(readinessReason);
            const readinessObserved = await capture(readinessPromise);
            const readiness         = {
                exactReason: readinessObserved === readinessReason,
                listeners  : getEventListeners(readinessController.signal, 'abort').length,
                requestCount
            };
            Service.openAiCompatibleLoadedModelsProbe = null;

            resetServerState('hold-first');
            const blockerPromise = Service.embedTexts(['blocker'], 'openAiCompatible');
            await waitFor(() => heldResponse !== null, 'first provider request gate');

            const queuedController = new AbortController();
            const queuedReason     = new Error('cancel queued batch');
            const queuedPromise    = Service.embedTexts(['do-not-send'], 'openAiCompatible', {
                signal        : queuedController.signal,
                operationLabel: 'queued cancellation probe'
            });
            await waitFor(
                () => getEventListeners(queuedController.signal, 'abort').length === 1,
                'queued abort listener'
            );
            queuedController.abort(queuedReason);
            const queuedObserved = await capture(queuedPromise);

            heldResponse.writeHead(200, {'Content-Type': 'application/json'});
            heldResponse.end(JSON.stringify({data: [{index: 0, embedding: [7.1, 7.2, 7.3]}]}));
            heldResponse = null;
            await blockerPromise;
            await Service.embedText('after-abort', 'openAiCompatible');
            const queued = {
                exactReason: queuedObserved === queuedReason,
                listeners  : getEventListeners(queuedController.signal, 'abort').length,
                requestInputs
            };

            resetServerState('hold-first');
            const inFlightController = new AbortController();
            const inFlightReason     = new Error('cancel active socket');
            const inFlightPromise    = Service.embedText('hung', 'openAiCompatible', {
                signal        : inFlightController.signal,
                operationLabel: 'in-flight cancellation probe'
            });
            await waitFor(() => requestCount === 1, 'hung provider request');
            const afterInFlightPromise = Service.embedText('after-socket-abort', 'openAiCompatible');
            inFlightController.abort(inFlightReason);
            const inFlightObserved = await capture(inFlightPromise);
            await afterInFlightPromise;
            await waitFor(() => closedHungRequests === 1, 'active socket close');
            const inFlight = {
                closedHungRequests,
                exactReason: inFlightObserved === inFlightReason,
                listeners  : getEventListeners(inFlightController.signal, 'abort').length,
                nextRequestObservedAfterAbortClose,
                requestCount
            };

            const runDelayedAbort = async (nextBehavior, input, batch = false) => {
                resetServerState(nextBehavior);

                const controller = new AbortController();
                const reason     = new Error(`cancel ${nextBehavior}`);
                const promise    = batch
                    ? Service.embedTexts(input, 'openAiCompatible', {signal: controller.signal, operationLabel: nextBehavior})
                    : Service.embedText(input, 'openAiCompatible', {signal: controller.signal, operationLabel: nextBehavior});

                await waitFor(
                    () => requestCount === 1 && getEventListeners(controller.signal, 'abort').length === 1,
                    `${nextBehavior} abortable delay`
                );
                controller.abort(reason);

                const observed = await capture(promise);
                await new Promise(resolve => setTimeout(resolve, 30));

                return {
                    exactReason: observed === reason,
                    requestCount,
                    listeners  : getEventListeners(controller.signal, 'abort').length
                };
            };

            const modelLoad  = await runDelayedAbort('model-load', 'retry-once');
            const contention = await runDelayedAbort('contention', 'retry-once');
            const batchYield = await runDelayedAbort('success', ['first', 'second'], true);

                console.log(JSON.stringify({
                    preAborted,
                    readiness,
                    queued,
                    inFlight,
                    modelLoad,
                    contention,
                    batchYield
                }));
            } finally {
                server.closeAllConnections?.();
                await new Promise(resolve => server.close(resolve));
            }
        });

        expect(evidence).toEqual({
            preAborted: {exactReason: true, listeners: 0, preflightCalls: 0, requestCount: 0},
            readiness : {exactReason: true, listeners: 0, requestCount: 0},
            queued    : {
                exactReason  : true,
                listeners    : 0,
                requestInputs: [['blocker'], 'after-abort']
            },
            inFlight: {
                closedHungRequests                : 1,
                exactReason                       : true,
                listeners                         : 0,
                nextRequestObservedAfterAbortClose: true,
                requestCount                      : 2
            },
            modelLoad : {exactReason: true, requestCount: 1, listeners: 0},
            contention: {exactReason: true, requestCount: 1, listeners: 0},
            batchYield: {exactReason: true, requestCount: 1, listeners: 0}
        });
    });

    test('OpenAI-compatible provider timeout wins a later caller abort in an isolated config process', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const http                = await import('node:http');
            const {getEventListeners} = await import('node:events');

            let   requestCount = 0;
            const server       = http.createServer(request => {
                requestCount++;
                request.resume();
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

            try {
                Object.assign(process.env, {
                    NEO_OPENAI_COMPATIBLE_HOST                  : `http://127.0.0.1:${server.address().port}`,
                    NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT: '0',
                    NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS : '10'
                });

                const {default: Service} = await import('./ai/services/memory-core/TextEmbeddingService.mjs');
                const controller         = new AbortController();

                let observed;
                try {
                    await Service.embedText('timeout', 'openAiCompatible', {
                        signal        : controller.signal,
                        operationLabel: 'provider timeout race probe'
                    });
                } catch (error) {
                    observed = error;
                }

                controller.abort(new Error('late caller abort'));
                await new Promise(resolve => setTimeout(resolve, 20));

                console.log(JSON.stringify({
                    code     : observed?.code,
                    listeners: getEventListeners(controller.signal, 'abort').length,
                    requestCount
                }));
            } finally {
                server.closeAllConnections?.();
                await new Promise(resolve => server.close(resolve));
            }
        });

        expect(evidence).toEqual({
            code        : 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT',
            listeners   : 0,
            requestCount: 1
        });
    });
});
