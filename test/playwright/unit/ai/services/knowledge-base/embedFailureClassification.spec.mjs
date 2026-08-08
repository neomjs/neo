import {test, expect} from '@playwright/test';

import {
    BOUNDED_KB_ERROR_CODE_PATTERN,
    KB_VECTOR_EMBED_UNCLASSIFIED,
    classifyEmbedFailureCode
} from '../../../../../../ai/services/knowledge-base/helpers/embedFailureClassification.mjs';

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

    test('an already-bounded code is passed through, not overwritten', () => {
        // Our own layers produce codes more specific than anything the map could add. Rewriting them
        // would be a regression disguised as classification.
        expect(classifyEmbedFailureCode('KB_SYNC_VOLUME_EXCEEDED')).toBe('KB_SYNC_VOLUME_EXCEEDED');
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
