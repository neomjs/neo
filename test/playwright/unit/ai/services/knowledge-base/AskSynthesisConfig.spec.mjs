import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'AskSynthesisConfigTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../src/core/_export.mjs';
import fs                  from 'fs-extra';
import path                from 'path';
import {fileURLToPath}     from 'url';
import {checkAskRateLimit} from '../../../../../../ai/services/knowledge-base/helpers/askRateLimit.mjs';
import aiKbConfigTemplate  from '../../../../../../ai/mcp/server/knowledge-base/config.template.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../');

/**
 * @summary Unit coverage for the dedicated ask-synthesis config block + the cost-safety runaway breaker.
 *
 * Two B4-safe surfaces (no shared-singleton mutation, no live-DB risk): the pure `checkAskRateLimit`
 * rolling-window helper, and the `askSynthesis` config contract read from the canonical
 * `config.template.mjs` (per the tests-import-the-canonical-template discipline). The env-only API-key
 * guarantee is verified at the source level so it holds regardless of the test environment.
 */
test.describe('ai/knowledge-base — ask-synthesis runaway breaker (checkAskRateLimit)', () => {
    const MINUTE = 60000;

    test('empty buffer is never limited', () => {
        const {limited, kept} = checkAskRateLimit([], 1_000_000, 20);
        expect(limited).toBe(false);
        expect(kept).toEqual([]);
    });

    test('below the cap is not limited and keeps the in-window timestamps', () => {
        const now             = 1_000_000,
              ts              = [now - 1000, now - 2000, now - 3000],
              {limited, kept} = checkAskRateLimit(ts, now, 20);

        expect(limited).toBe(false);
        expect(kept.length).toBe(3);
    });

    test('at the cap (in-window count >= max) is limited', () => {
        const now       = 1_000_000,
              ts        = Array.from({length: 20}, (_, i) => now - i * 100),
              {limited} = checkAskRateLimit(ts, now, 20);

        expect(limited).toBe(true);
    });

    test('prunes out-of-window timestamps before counting (stale calls do not trip the cap)', () => {
        const now             = 1_000_000,
              stale           = Array.from({length: 19}, (_, i) => now - MINUTE - 1 - i * 100),
              fresh           = Array.from({length: 5},  (_, i) => now - i * 100),
              {limited, kept} = checkAskRateLimit([...stale, ...fresh], now, 20);

        expect(limited).toBe(false);
        expect(kept.length).toBe(5);
    });

    test('a full window of fresh calls trips the cap even with stale entries present', () => {
        const now             = 1_000_000,
              stale           = [now - MINUTE - 5000],
              fresh           = Array.from({length: 20}, (_, i) => now - i * 100),
              {limited, kept} = checkAskRateLimit([...stale, ...fresh], now, 20);

        expect(limited).toBe(true);
        expect(kept.length).toBe(20);
    });

    test('boundary: a timestamp exactly windowMs old is pruned (strict <)', () => {
        const now      = 1_000_000,
              {kept}   = checkAskRateLimit([now - MINUTE, now - MINUTE + 1], now, 20);

        expect(kept).toEqual([now - MINUTE + 1]);
    });
});

test.describe('ai/knowledge-base — askSynthesis config contract (canonical template)', () => {
    test('defaults to the fast remote gemini provider + the cheaper 2.5-flash model', () => {
        expect(aiKbConfigTemplate.askSynthesis.provider).toBe('gemini');
        expect(aiKbConfigTemplate.askSynthesis.model).toBe('gemini-2.5-flash');
    });

    test('baseUrl defaults null (local-endpoint override is opt-in)', () => {
        expect(aiKbConfigTemplate.askSynthesis.baseUrl).toBeNull();
    });

    test('runaway breaker + timeout defaults are present and numeric', () => {
        expect(typeof aiKbConfigTemplate.askSynthesis.maxCallsPerMinute).toBe('number');
        expect(aiKbConfigTemplate.askSynthesis.maxCallsPerMinute).toBe(20);
        expect(typeof aiKbConfigTemplate.askSynthesis.timeoutMs).toBe('number');
    });

    test('apiKey is env-only — no inline literal in the git-tracked template (security)', async () => {
        // Source-level assertion so it holds regardless of any env value present in the test shell:
        // the leaf MUST be `leaf(null, 'NEO_KB_ASK_API_KEY', ...)` — a null default bound only to the env var.
        const src = await fs.readFile(
            path.join(repoRoot, 'ai/mcp/server/knowledge-base/config.template.mjs'), 'utf8'
        );
        expect(src).toMatch(/apiKey\s*:\s*leaf\(null,\s*'NEO_KB_ASK_API_KEY'/);
    });
});
