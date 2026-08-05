import {setup} from '../../../../setup.mjs';

const appName = 'KBRetrievalProvenanceTest';

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

import {test, expect}                from '@playwright/test';
import Neo                           from '../../../../../../src/Neo.mjs';
import * as core                     from '../../../../../../src/core/_export.mjs';
import {describeRetrievalProvenance} from '../../../../../../ai/services/knowledge-base/retrievalProvenance.mjs';

/**
 * The aggregate retrieval-provenance block, witnessed.
 *
 * A query over an empty collection still returned results, scores and a topResult from the lexical
 * rescue path alone, in a response shape identical to a grounded answer. Per-row rescue metadata was
 * already present and already correct; nothing read it, because a caller with a topResult and a score
 * has no reason to inspect every row.
 *
 * The POSITIVE case is the control: without asserting that a grounded answer carries NO warning, an
 * always-warn implementation would satisfy every other assertion here.
 */
test.describe('describeRetrievalProvenance — grounded vs rescue-only answers', () => {
    test('a grounded answer reports its source count and carries NO warning — the CONTROL', async () => {
        const retrieval = describeRetrievalProvenance(7);

        expect(retrieval.vectorSources).toBe(7);
        expect(retrieval.rescueOnly).toBeUndefined();
        expect(retrieval.warning).toBeUndefined();
    });

    test('zero vector sources marks the answer rescue-only and says why', async () => {
        const retrieval = describeRetrievalProvenance(0);

        expect(retrieval.vectorSources).toBe(0);
        expect(retrieval.rescueOnly).toBe(true);
        expect(typeof retrieval.warning).toBe('string');

        // The warning must name the CAUSE, not merely the state. "0 sources" alone reads as "no match
        // found", which is the wrong conclusion: an empty or unreachable collection presents this way.
        expect(retrieval.warning).toContain('empty or unreachable');
        expect(retrieval.warning).toContain('healthcheck');
    });

    test('the warning does not claim an error or empty results — the rescue is a designed capability', async () => {
        const {warning} = describeRetrievalProvenance(0);

        // Calling this an error would be wrong and would train callers to ignore it: the rescue hits may
        // be exactly what was wanted. The claim is about PROVENANCE, never about failure.
        expect(warning.toLowerCase()).not.toContain('error');
        expect(warning.toLowerCase()).not.toContain('failed');
        expect(warning).toContain('unsourced');
    });

    test('vectorSources is always present, so a caller never reads absence as a grounded answer', async () => {
        for (const count of [0, 1, 42]) {
            const retrieval = describeRetrievalProvenance(count);

            expect(Object.hasOwn(retrieval, 'vectorSources'), `count ${count} must report its source count`).toBe(true);
            expect(retrieval.vectorSources).toBe(count);
        }
    });

    test('a single vector source is NOT rescue-only — the boundary sits at zero, not at "few"', async () => {
        // Guards against a future "too few sources" threshold being folded into this predicate. Scarcity
        // and absence are different claims; only absence means the corpus contributed nothing.
        const retrieval = describeRetrievalProvenance(1);

        expect(retrieval.rescueOnly).toBeUndefined();
        expect(retrieval.warning).toBeUndefined();
    });
});
