import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'CanonicalModelIdTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                    from '@playwright/test';
import Neo                               from '../../../../../../src/Neo.mjs';
import * as core                         from '../../../../../../src/core/_export.mjs';
import {canonicalModelId, isSameModelId} from '../../../../../../ai/services/graph/providerReadinessHelper.mjs';

/**
 * @summary An untagged model id and its `:latest` form name the same model — and nothing else does.
 *
 * **The defect, measured on a live external plane.** Ollama canonicalises stored models to
 * `name:tag` and reports an untagged pull as `name:latest`. Config carries the untagged name, so an
 * exact string comparison reported a RESIDENT embedding model as missing:
 *
 * ```
 * availableModels: ["qwen3-embedding:latest", "gemma4:26b"]
 * missingModels:   ["qwen3-embedding"]      <- resident, and embeds were working
 * extraModels:     ["qwen3-embedding:latest"]  <- the same model, in both lists, one payload
 * ```
 *
 * It could never clear: warming the "missing" model produces the same `:latest` id that already
 * failed to match. And it was not cosmetic — `missingModels` becomes `missing-required-model`, which
 * the health diagnosis classes as recoverable and answers with `warmProvider`. A warm loop with no
 * exit, on a plane whose Knowledge Base was idle and whose ingestion had never once attempted.
 */
test.describe('canonicalModelId / isSameModelId', () => {
    test('an untagged id matches its :latest form — the defect', () => {
        expect(isSameModelId('qwen3-embedding', 'qwen3-embedding:latest')).toBe(true);
        expect(isSameModelId('qwen3-embedding:latest', 'qwen3-embedding')).toBe(true)
    });

    /**
     * The trap this fix must not become. Collapsing ALL tags would make the matcher pass more often,
     * which looks like a better fix and is a far worse bug: `:8b` and `:4b` are different models with
     * different vector dimensions, so a plane could silently embed against the wrong one and corrupt
     * a corpus. A wrong warm loop costs CPU; a wrong embedder costs the data.
     */
    test('an EXPLICIT tag is never folded — :8b must not match :latest or the untagged name', () => {
        expect(isSameModelId('qwen3-embedding:8b', 'qwen3-embedding:latest')).toBe(false);
        expect(isSameModelId('qwen3-embedding:8b', 'qwen3-embedding')).toBe(false);
        expect(isSameModelId('qwen3-embedding:8b', 'qwen3-embedding:4b')).toBe(false)
    });

    test('NON-VACUITY — genuinely different models still differ', () => {
        // Without this the matcher could return true for everything and both arms above would pass
        // on the untagged case alone.
        expect(isSameModelId('gemma4:26b', 'qwen3-embedding')).toBe(false);
        expect(isSameModelId('gemma4:26b', 'gemma4:31b')).toBe(false)
    });

    test('only a TRAILING :latest is stripped, and non-strings are never equal', () => {
        expect(canonicalModelId('registry/latest-model')).toBe('registry/latest-model');
        expect(canonicalModelId('x:latest')).toBe('x');
        expect(canonicalModelId('x')).toBe('x');
        // Two absent ids must not compare equal — that would make every empty slot "match".
        expect(isSameModelId(null, undefined)).toBe(false);
        expect(isSameModelId('', '')).toBe(false)
    })
});
