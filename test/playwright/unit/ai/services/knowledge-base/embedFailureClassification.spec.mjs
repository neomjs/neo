import {test, expect} from '@playwright/test';

import fs   from 'fs-extra';
import os   from 'os';
import path from 'path';

import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/Base.mjs';

import {
    BOUNDED_KB_ERROR_CODE_PATTERN,
    EMBED_DISPOSITION,
    KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN,
    KB_VECTOR_EMBED_UNCLASSIFIED,
    classifyEmbedDisposition,
    classifyEmbedFailureCode,
    classifyEmbedFailureError,
    classifyEmbedResidencyDisposition,
    isEmbedFailureCode
} from '../../../../../../ai/services/knowledge-base/helpers/embedFailureClassification.mjs';
import {normalizeTenantRepoCheckpointState}
    from '../../../../../../ai/daemons/orchestrator/services/tenantRepoCheckpointValidity.mjs';

/**
 * @summary An embed failure must reach the deployment-state snapshot as a cause a remote reader can
 * tell apart from a different cause — with no shell access to the host.
 *
 * The defect these specs pin is an inversion. Durable tenant-repo state admits only codes matching
 * `BOUNDED_KB_ERROR_CODE_PATTERN`; provider errors arrive in the provider's vocabulary
 * (`EMBEDDING_PROBE_TIMEOUT`, `ABORT_ERR`), which is truthy — so the old
 * `error.code || 'KB_VECTOR_EMBED_FAILED'` fallback never fired for one, the provider code was
 * recorded, and the `^KB_` filter then dropped it, landing `lastSourceErrorCode` as **null**. A
 * well-classified provider failure therefore produced a receipt with *no* cause, while a bare
 * `Error` produced at least a stage name.
 *
 * **Why these assertions are red before the fix.** Every case below feeds a code in the provider's
 * vocabulary and asserts the result is BOTH bounded and distinct. Pre-fix, `EMBEDDING_PROBE_TIMEOUT`
 * came back verbatim: unbounded, so `expect(...).toMatch(BOUNDED...)` fails, and identical in kind
 * to every other unmapped provider code, so the distinctness assertion fails too. A spec asserting
 * merely that *a* code is present passes today and proves nothing — which is the shape the ticket
 * names as insufficient.
 *
 * The pattern is imported from the module the orchestrator's sync service imports, not re-declared
 * here. A local copy would keep passing after a drift that breaks production.
 */
test.describe('embed failure classification (#16647)', () => {
    test('a bounded provider code survives an unclassified wrapper cause', () => {
        const provider = Object.assign(new Error('provider detail must not be projected'), {
                  code: 'EMBEDDING_MODEL_NOT_RESIDENT'
              }),
              wrapper  = new Error('Failed to process batch 1', {cause: provider});

        expect(classifyEmbedFailureError(wrapper)).toBe('KB_VECTOR_EMBED_MODEL_NOT_RESIDENT');
    });

    test('a cyclic codeless cause chain remains honestly unclassified', () => {
        const outer = new Error('outer'),
              inner = new Error('inner');

        outer.cause = inner;
        inner.cause = outer;

        expect(classifyEmbedFailureError(outer)).toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
    });

    test('only a declared residency disposition survives a bounded wrapper chain', () => {
        const provider = Object.assign(new Error('provider'), {
            residencyDisposition: 'evicted-mid-batch'
        });

        expect(classifyEmbedResidencyDisposition(new Error('wrapper', {cause: provider})))
            .toBe('evicted-mid-batch');

        provider.residencyDisposition = 'provider-authored-secret';
        expect(classifyEmbedResidencyDisposition(new Error('wrapper', {cause: provider})))
            .toBeUndefined();
    });

    test('two distinct provider faults surface as two distinct bounded codes', () => {
        const
            timeout = classifyEmbedFailureCode('EMBEDDING_PROBE_TIMEOUT'),
            aborted = classifyEmbedFailureCode('ABORT_ERR');

        // Bounded: the durable filter accepts it at all. Pre-fix both came back in the provider's
        // vocabulary and were discarded downstream to null.
        expect(timeout, 'consumer-deadline timeout is bounded').toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);
        expect(aborted, 'upstream abort is bounded').toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);

        // Distinct: the property the ticket actually asks for. Two deployments failing for different
        // reasons must not read identically from the snapshot alone.
        expect(timeout).not.toBe(aborted);

        // ...and neither collapses to the unclassified code, which would satisfy "distinct from each
        // other" only by accident if one of them silently fell through the map.
        expect(timeout).not.toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
        expect(aborted).not.toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
    });

    test('a consumer-owned deadline and the provider\'s own timeout stay separable', () => {
        // Different fixes: raise our deadline, versus the provider is wedged. Collapsing both into
        // one "timeout" code would rebuild the ambiguity this module exists to remove.
        expect(classifyEmbedFailureCode('EMBEDDING_PROBE_TIMEOUT'))
            .not.toBe(classifyEmbedFailureCode('OPENAI_COMPATIBLE_REQUEST_TIMEOUT'));

        // The two provider-side timeout spellings ARE the same fault and deliberately share a code.
        expect(classifyEmbedFailureCode('OPENAI_COMPATIBLE_REQUEST_TIMEOUT'))
            .toBe(classifyEmbedFailureCode('PROVIDER_TIMEOUT'));
    });

    test('a connection refusal and a known model-residency failure stay distinguishable', () => {
        const
            refused     = classifyEmbedFailureCode('ECONNREFUSED'),
            nonResident = classifyEmbedFailureCode('EMBEDDING_MODEL_NOT_RESIDENT');

        expect(refused).toBe('KB_VECTOR_EMBED_CONNECTION_REFUSED');
        expect(nonResident).toBe('KB_VECTOR_EMBED_MODEL_NOT_RESIDENT');
        expect(refused).not.toBe(nonResident);
    });

    test('a DECLARED internal code is passed through, not overwritten', () => {
        // Our own layers produce codes more specific than anything the map could add. Rewriting them
        // would be a regression disguised as classification. It passes because it is a declared
        // member, not because of how it is spelled — see the provenance test below.
        expect(classifyEmbedFailureCode('KB_SYNC_VOLUME_EXCEEDED')).toBe('KB_SYNC_VOLUME_EXCEEDED');
        expect(classifyEmbedFailureCode('KB_EMBEDDING_INPUT_SIZE_EXCEEDED')).toBe('KB_EMBEDDING_INPUT_SIZE_EXCEEDED');
        expect(classifyEmbedFailureCode(KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN))
            .toBe(KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN);
    });

    test('a provider-authored KB_-shaped code does NOT pass through — shape is not provenance', () => {
        // The hard specimen, and the one the first draft got wrong. `BOUNDED_KB_ERROR_CODE_PATTERN`
        // constrains the ALPHABET, not the AUTHOR: 120 characters of `[A-Z0-9_]` are the provider's
        // to choose. Gating on the pattern therefore admitted provider-controlled text verbatim into
        // durable state while looking like a safety check.
        //
        // This is the assertion that makes the leak test below non-vacuous. A hostile string carrying
        // lowercase or punctuation fails the pattern for INCIDENTAL reasons, so it would pass even
        // under the broken gate — it never exercised the hole.
        const providerAuthored = 'KB_SECRET_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

        expect(providerAuthored, 'the specimen really is pattern-admissible')
            .toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);
        expect(classifyEmbedFailureCode(providerAuthored)).toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
    });

    test('an unrecognised provider code is reported unclassified, never passed through', () => {
        // The control that proves the map is consulted rather than acting as a pass-through: a code
        // that is NOT a member must not survive. If this returned its input, the leak assertion
        // below would be the only thing standing between provider text and durable state.
        expect(classifyEmbedFailureCode('SOME_FUTURE_PROVIDER_CODE')).toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
    });

    test('a provider code echoing request content cannot leak through it', () => {
        // Provider errors quote the request. This is the property that makes the allow-list the
        // right shape and a sanitizer the wrong one: the output is a literal declared by the module,
        // so no amount of hostile input reaches durable state or the remotely-readable snapshot.
        const hostile  = 'ERR fetch https://oauth2:glpat-SECRETVALUE@git.example.com/acme/repo.git failed';
        const observed = classifyEmbedFailureCode(hostile);

        expect(observed).toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
        expect(observed).toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);
        expect(observed).not.toContain('glpat-');
        expect(observed).not.toContain('git.example.com');
    });

    test('absent, empty and non-string codes are unclassified rather than crashing', () => {
        // A codeless provider error is the case `KB_VECTOR_EMBED_FAILED` genuinely names, and this
        // path stays unchanged by the fix — stated here so the constant's meaning is pinned as
        // "unclassified", not "embedding is broken".
        for (const input of [undefined, null, '', 0, {}, ['ABORT_ERR']]) {
            expect(classifyEmbedFailureCode(input), `input ${JSON.stringify(input) ?? 'undefined'}`)
                .toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
        }
    });

    test('every declared mapping is bounded — the guarantee the callers rely on', () => {
        // Totality control. Each caller persists the result without re-checking, so a single
        // mistyped literal in the map would put an unbounded code into durable state and this is the
        // only place that would notice.
        const providerCodes = [
            'ABORT_ERR',
            'ECONNREFUSED',
            'EMBEDDING_MODEL_NOT_RESIDENT',
            'EMBEDDING_PROBE_TIMEOUT',
            'OPENAI_COMPATIBLE_REQUEST_TIMEOUT',
            'PROVIDER_TIMEOUT'
        ];

        for (const code of providerCodes) {
            expect(classifyEmbedFailureCode(code), `${code} maps to a bounded code`)
                .toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);
        }

        // Non-vacuity: if the list above were ever emptied, the loop would pass by iterating nothing.
        expect(providerCodes.length).toBeGreaterThan(0);
    });
});

/**
 * @summary The production-path witness: the same two faults, observed as the codes that actually
 * reach the receipt, through the real `embedChunkGroups` catch block rather than the helper.
 *
 * The specs above pin the classifier in isolation. That is necessary and not sufficient — a correct
 * helper wired to nothing would satisfy every one of them. This block drives the method the
 * orchestrator's sync lane actually calls, and asserts on `summary.errors[].code` plus the bounded
 * `summary.errors[].details.residencyDisposition` discriminator: the exact receipt fields a remote
 * operator uses to distinguish a configuration fault from an eviction.
 *
 * The bounded-pattern assertion is the load-bearing half. Pre-fix these arrived as
 * `EMBEDDING_PROBE_TIMEOUT` and `ABORT_ERR`, which are rejected by that filter — so the receipt lost
 * them and reported null. Asserting only that the two codes DIFFER would have passed before the fix
 * too, since the provider's own strings also differ. Distinct AND admissible is the property.
 *
 * `.call()` on a stub rather than configuring the singleton: the service is a Neo singleton, and
 * mutating shared instance state inside a unit run leaks across specs in the same worker.
 */
test.describe('embed failure classification — production path', () => {
    /**
     * @param {Function} embed Stubbed `vectorService.embed`.
     * @returns {Promise<Object>} The populated ingestion summary.
     */
    async function runEmbedWithFailure(embed) {
        const {default: IngestionService} = await import(
            '../../../../../../ai/services/knowledge-base/IngestionService.mjs'
        );
        const
            summary = {errors: [], embeddingsGenerated: 0},
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-embed-witness-')),
            harness = {
                createError            : IngestionService.createError.bind(IngestionService),
                updateIngestionProgress: () => {},
                vectorService          : {embed},
                writeTempJsonl         : async () => path.join(tempDir, 'chunks.jsonl')
            };

        try {
            await IngestionService.embedChunkGroups.call(harness, {
                chunks       : [{repoSlug: 'org/witness', text: 'x'}],
                summary,
                tenantContext: {tenantId: 't1', repoSlug: 'org/witness'},
                viaMcp       : false
            });

            return summary
        } finally {
            await fs.remove(tempDir)
        }
    }

    test('a thrown provider timeout and a thrown abort reach the receipt as distinct admissible codes', async () => {
        const
            timeoutError = Object.assign(new Error('probe timed out'), {code: 'EMBEDDING_PROBE_TIMEOUT'}),
            abortError   = Object.assign(new Error('aborted'),         {code: 'ABORT_ERR'}),
            timeoutRun   = await runEmbedWithFailure(async () => { throw timeoutError }),
            abortRun     = await runEmbedWithFailure(async () => { throw abortError });

        // Non-vacuity: an empty errors array would satisfy every assertion below by iterating nothing.
        expect(timeoutRun.errors, 'the timeout run recorded an error').toHaveLength(1);
        expect(abortRun.errors,   'the abort run recorded an error').toHaveLength(1);

        const timeoutCode = timeoutRun.errors[0].code,
              abortCode   = abortRun.errors[0].code;

        // Admissible: survives the `^KB_` filter on the way to `lastSourceErrorCode`. This is the
        // half that was red before the fix — both arrived in the provider's vocabulary.
        expect(timeoutCode).toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);
        expect(abortCode).toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);

        // Distinct: two causes remain two causes at the surface a remote reader sees.
        expect(timeoutCode).not.toBe(abortCode);
    });

    test('a result-shaped provider failure is classified on the same path', async () => {
        // The sibling branch — `embed` RESOLVES with an error payload instead of throwing. Both sites
        // defaulted identically before, so covering only the throw path would leave half the defect.
        const run = await runEmbedWithFailure(async () => ({
            error: 'provider refused', code: 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT'
        }));

        expect(run.errors).toHaveLength(1);
        expect(run.errors[0].code).toMatch(BOUNDED_KB_ERROR_CODE_PATTERN);
        expect(run.errors[0].code).not.toBe(KB_VECTOR_EMBED_UNCLASSIFIED);
    });

    test('an observed mid-batch eviction reaches the final ingestion receipt (#16859)', async () => {
        const error = Object.assign(new Error('embedding model was evicted'), {
                  code                : 'EMBEDDING_MODEL_NOT_RESIDENT',
                  residencyDisposition: 'evicted-mid-batch'
              }),
              run   = await runEmbedWithFailure(async () => { throw error });

        expect(run.errors, 'the classified failure produced an operator-visible receipt').toHaveLength(1);
        expect(run.errors[0].code).toBe('KB_VECTOR_EMBED_MODEL_NOT_RESIDENT');
        expect(run.errors[0].details).toEqual({
            repoSlug            : 'org/witness',
            residencyDisposition: 'evicted-mid-batch'
        });
    });

    test('#17017 a wrapper preserves both the bounded cause code and declared disposition', async () => {
        const provider = Object.assign(new Error('provider detail'), {
                  code                : 'EMBEDDING_MODEL_NOT_RESIDENT',
                  residencyDisposition: 'evicted-mid-batch'
              }),
              wrapper  = new Error('outer batch abort', {cause: provider}),
              run      = await runEmbedWithFailure(async () => { throw wrapper });

        expect(run.errors).toEqual([{
            code   : 'KB_VECTOR_EMBED_MODEL_NOT_RESIDENT',
            message: 'outer batch abort',
            details: {
                repoSlug            : 'org/witness',
                residencyDisposition: 'evicted-mid-batch'
            }
        }]);
    });

    test('an unobserved residency state stays absent from the final ingestion receipt (#16859)', async () => {
        const error = Object.assign(new Error('embedding model was not resident'), {
                  code: 'EMBEDDING_MODEL_NOT_RESIDENT'
              }),
              run   = await runEmbedWithFailure(async () => { throw error });

        expect(run.errors, 'the unobserved-residency failure still produced an operator-visible receipt')
            .toHaveLength(1);
        expect(run.errors[0].details).toEqual({repoSlug: 'org/witness'});
        expect(Object.hasOwn(run.errors[0].details, 'residencyDisposition'),
            'absence means unobserved; a null-valued field would imply a measurement').toBe(false);
    });
});

/**
 * @summary The READ boundary in isolation — not the consumer witness, and it must not be read as one.
 *
 * This block proves one link: a code the producer mints is admitted by the durable reader, and the raw
 * provider code is refused by it. It does NOT span `assertErrorFreeIngestionSummary` /
 * `getSourceErrorCode`, the filter that sits between them and that actually decided the null — so it
 * stays green if that middle drops the code. Raised by @neo-gpt against an earlier draft of this
 * docblock, which claimed the whole chain.
 *
 * The end-to-end witness lives with the harness that can drive it: see
 * `TenantRepoSyncService.spec.mjs` — "two real embed failures reach details.repos[] as distinct
 * source codes", which runs the real `embedChunkGroups` summaries through `runTask` and reddens when
 * either the producer or that middle filter is mutated.
 *
 * The producer test above stops at `summary.errors[].code` and checks it against a pattern. That is
 * one step short of the claim, and re-asserting the same regex I wrote proves only that I applied it
 * twice. Whether the code SURVIVES is decided by a different function in a different module —
 * `normalizeTenantRepoCheckpointState`, which independently re-validates persisted state it did not
 * write and nulls anything it does not admit.
 *
 * So the two halves are chained by a real value: whatever `embedChunkGroups` actually produced is fed
 * to the read boundary, with no literal code named in between. If the producer's namespace and the
 * reader's admission rule ever drift apart, that is precisely the pair this catches — and it is the
 * drift the durable receipt reported as `null`.
 */
test.describe('embed failure classification — read boundary only', () => {
    /**
     * @param {String} providerCode A code in the provider's vocabulary.
     * @returns {String|null} The value a remote client would read as `lastSourceErrorCode`.
     */
    function projectThroughDurableRead(providerCode) {
        // No literal is named here — this is the producer's real answer, whatever it is.
        const producedCode = classifyEmbedFailureCode(providerCode);

        return normalizeTenantRepoCheckpointState({
            consecutiveFailures: 1,
            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            lastRunAttemptAt   : 1,
            lastSourceErrorCode: producedCode
        }).lastSourceErrorCode
    }

    test('a minted code is admitted by the durable reader', () => {
        const timeout = projectThroughDurableRead('EMBEDDING_PROBE_TIMEOUT'),
              aborted = projectThroughDurableRead('ABORT_ERR');

        // Survival is the whole point: the reader nulls anything it will not admit, and null is
        // exactly what the receipt reported before this fix.
        expect(timeout, 'a timeout reaches the client as a cause').not.toBeNull();
        expect(aborted, 'an abort reaches the client as a cause').not.toBeNull();

        // Two causes remain two causes at the surface a remote diagnostician actually reads.
        expect(timeout).not.toBe(aborted);
    });

    test('the reader is genuinely capable of nulling — the control that makes the above mean something', () => {
        // Without this, "not null" could hold because the reader admits everything, and the test
        // would pass against a boundary that validates nothing at all.
        const rejected = normalizeTenantRepoCheckpointState({
            consecutiveFailures: 1,
            lastRunAttemptAt   : 1,
            lastSourceErrorCode: 'EMBEDDING_PROBE_TIMEOUT'
        }).lastSourceErrorCode;

        // The raw provider code — what the pre-fix producer handed over — is refused by the reader.
        // That is the exact mechanism by which the cause was lost.
        expect(rejected).toBeNull();
    });
});

/**
 * @summary A failed embed decides the fate of a whole ingest run, so the disposition must be right
 * for the failure we actually observed — not for the failure that is easiest to recognise.
 *
 * The specimen these specs are built around is `KB_VECTOR_EMBED_FAILED`: the code an external
 * deployment reported on all four of its tenant repos while its collection stayed empty. It is the
 * UNCLASSIFIED sentinel — the provider's own code matched no entry in either vocabulary. Any design
 * that defers only recognised-transient faults rejects that specimen, which is why the first test
 * below is the load-bearing one rather than the boring one.
 */
test.describe('classifyEmbedDisposition (retry-or-discard)', () => {
    test('the UNCLASSIFIED code defers — the specimen the broken deployment actually produced', () => {
        // If this ever reads `rejected`, the fix does not fire on the failure it was written for.
        // Asserting through the exported constant rather than the literal keeps the two bound: a
        // rename of the sentinel cannot quietly leave this test pointing at a dead string.
        expect(classifyEmbedDisposition(KB_VECTOR_EMBED_UNCLASSIFIED)).toBe(EMBED_DISPOSITION.deferrable);
    });

    test('an unmapped provider code defers through the real translate-then-dispose composition', () => {
        // Drives the actual call path a caller uses, not the predicate in isolation. `ETIMEDOUT` is
        // deliberately a code the map does NOT carry: it stands for the open set of provider
        // vocabularies we will never finish enumerating, which is the whole reason deferral is the
        // default. A transient-allow-list implementation passes the isolated predicate test above
        // and fails HERE, so this is the mutation that separates the two designs.
        expect(classifyEmbedDisposition(classifyEmbedFailureCode('ETIMEDOUT')))
            .toBe(EMBED_DISPOSITION.deferrable);
    });

    for (const code of ['KB_EMBEDDING_INPUT_SIZE_EXCEEDED', 'KB_SYNC_VOLUME_EXCEEDED', 'KB_TENANT_SPOOF_REJECTED']) {
        test(`${code} rejects — retrying is futile or launders a deliberate refusal`, () => {
            expect(classifyEmbedDisposition(code)).toBe(EMBED_DISPOSITION.rejected);
        });
    }

    for (const code of [
        'KB_VECTOR_EMBED_ABORTED',
        'KB_VECTOR_EMBED_CONNECTION_REFUSED',
        'KB_VECTOR_EMBED_MODEL_NOT_RESIDENT',
        KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN,
        'KB_VECTOR_EMBED_TIMEOUT',
        'KB_VECTOR_EMBED_PROVIDER_TIMEOUT'
    ]) {
        test(`${code} defers — a slow or absent provider is not a reason to discard parsed work`, () => {
            expect(classifyEmbedDisposition(code)).toBe(EMBED_DISPOSITION.deferrable);
        });
    }

    test('the rejected set is genuinely capable of rejecting — the non-vacuity control', () => {
        // Without this, every `deferrable` assertion above would also hold against an implementation
        // that returns `deferrable` unconditionally. This is the one input that must come back
        // different, and it exercises the hard shape (a real member of the closed set) rather than a
        // stub that could not carry the signal either way.
        const dispositions = new Set([
            classifyEmbedDisposition('KB_TENANT_SPOOF_REJECTED'),
            classifyEmbedDisposition(KB_VECTOR_EMBED_UNCLASSIFIED)
        ]);

        expect(dispositions.size).toBe(2);
    });

    test('the embed DOMAIN is what makes deferral safe on a mixed error stream', () => {
        // An ingestion summary carries parse failures and tenant-guard rejections alongside embed
        // failures — 14 distinct push sites, only two of them the embed path. Routed through the
        // disposition alone, a permanently-malformed file would defer forever: never failing, never
        // advancing, never surfacing a cause. This is the guard that keeps deferral opt-in by domain.
        expect(isEmbedFailureCode(KB_VECTOR_EMBED_UNCLASSIFIED)).toBe(true);
        expect(isEmbedFailureCode('KB_VECTOR_EMBED_TIMEOUT')).toBe(true);
        expect(isEmbedFailureCode(KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN)).toBe(true);
        expect(isEmbedFailureCode('KB_TENANT_SPOOF_REJECTED')).toBe(true);

        // A real non-embed code from a sibling stage. It is bounded and legitimate, and it must NOT
        // be admitted to the domain — otherwise the disposition's deferrable default swallows it.
        expect(isEmbedFailureCode('KB_TENANT_REPO_SYNC_SYNC_FAILED')).toBe(false);
        expect(isEmbedFailureCode('KB_SOMETHING_ELSE_ENTIRELY')).toBe(false);
        expect(isEmbedFailureCode(undefined)).toBe(false);
        expect(isEmbedFailureCode('constructor')).toBe(false);
    });

    test('the domain is DERIVED from the classifier, not restated beside it', () => {
        // The drift falsifier. Every code classifyEmbedFailureCode can actually emit must be in the
        // domain — if someone adds a provider mapping and the domain were a hand-maintained literal,
        // that new code would classify fine and then be silently refused deferral. Driving the real
        // function over its real inputs is what makes this a check rather than a restatement.
        const emitted = [
            classifyEmbedFailureCode('EMBEDDING_PROBE_TIMEOUT'),
            classifyEmbedFailureCode('OPENAI_COMPATIBLE_REQUEST_TIMEOUT'),
            classifyEmbedFailureCode('ECONNREFUSED'),
            classifyEmbedFailureCode('EMBEDDING_MODEL_NOT_RESIDENT'),
            classifyEmbedFailureCode('ABORT_ERR'),
            classifyEmbedFailureCode('KB_EMBEDDING_INPUT_SIZE_EXCEEDED'),
            classifyEmbedFailureCode(KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN),
            classifyEmbedFailureCode('an unmapped provider code')
        ];

        for (const code of emitted) {
            expect(isEmbedFailureCode(code)).toBe(true);
        }
    });

    test('total over hostile and absent input', () => {
        // A codeless failure is the case the sentinel exists for, so it must not throw its way out of
        // a disposition. `constructor` is the prototype-pollution probe: a bare object index would
        // resolve it against Object.prototype, and the answer must still be a disposition string.
        expect(classifyEmbedDisposition(undefined)).toBe(EMBED_DISPOSITION.deferrable);
        expect(classifyEmbedDisposition(null)).toBe(EMBED_DISPOSITION.deferrable);
        expect(classifyEmbedDisposition('')).toBe(EMBED_DISPOSITION.deferrable);
        expect(classifyEmbedDisposition('constructor')).toBe(EMBED_DISPOSITION.deferrable);
        expect(classifyEmbedDisposition({code: 'KB_TENANT_SPOOF_REJECTED'})).toBe(EMBED_DISPOSITION.deferrable);
    });
});
