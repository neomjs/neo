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

test.describe('ai/knowledge-base — askSynthesis config contract (canonical template source)', () => {
    // Source-level assertions: read the canonical template TEXT, do NOT import/construct the proxy.
    // Importing it registers `Neo.ai.Config`, which collides with config.mjs-importing specs sharing a
    // unitTestMode worker. Source-reads verify the declared leaf contract directly, are env-independent
    // (hold regardless of any value in the test shell), and register zero classes — so they are collision-free.
    let src;

    test.beforeAll(async () => {
        src = await fs.readFile(
            path.join(repoRoot, 'ai/mcp/server/knowledge-base/config.template.mjs'), 'utf8'
        );
    });

    test('the dedicated askSynthesis block exists (ask no longer rides the global modelProvider)', () => {
        expect(src).toMatch(/askSynthesis\s*:\s*\{/);
    });

    test('defaults to the fast remote gemini provider + the cheaper 2.5-flash model', () => {
        expect(src).toMatch(/provider\s*:\s*leaf\('gemini',\s*'NEO_KB_ASK_PROVIDER'/);
        expect(src).toMatch(/model\s*:\s*leaf\('gemini-2\.5-flash',\s*'NEO_KB_ASK_MODEL'/);
    });

    test('apiKey is env-only — null default bound to NEO_KB_ASK_API_KEY, no inline literal (security)', () => {
        expect(src).toMatch(/apiKey\s*:\s*leaf\(null,\s*'NEO_KB_ASK_API_KEY'/);
    });

    test('baseUrl local-endpoint override defaults null', () => {
        expect(src).toMatch(/baseUrl\s*:\s*leaf\(null,\s*'NEO_KB_ASK_BASE_URL'/);
    });

    test('runaway breaker (20/min) + the per-provider-class timeout pair are declared with env bindings', () => {
        expect(src).toMatch(/maxCallsPerMinute\s*:\s*leaf\(20,\s*'NEO_KB_ASK_MAX_RPM'/);
        // LOCAL-class budget stays 300s — near-empirical: a 31B-class local model has been
        // benchmarked needing ~287s for one ask synthesis; lowering it breaks local deployments.
        expect(src).toMatch(/timeoutMs\s*:\s*leaf\(300000,\s*'NEO_KB_ASK_SYNTHESIS_TIMEOUT_MS'/);
        // REMOTE-class budget is 60s — a remote answering in ~5-10s that is still pending at 60s
        // is hung, not slow; degrade to references instead of pinning the interactive caller.
        expect(src).toMatch(/timeoutMsRemote\s*:\s*leaf\(60000,\s*'NEO_KB_ASK_SYNTHESIS_TIMEOUT_MS_REMOTE'/);
    });
});
