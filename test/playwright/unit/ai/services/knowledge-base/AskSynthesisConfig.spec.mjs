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
 * `configBase.mjs` ledger. The env-only API-key
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

test.describe('ai/knowledge-base — askSynthesis config contract (canonical base source)', () => {
    // Source-level assertions: read the canonical config-base TEXT, do NOT import/construct the proxy.
    // Importing it registers `Neo.ai.Config`, which collides with config.mjs-importing specs sharing a
    // unitTestMode worker. Source-reads verify the declared leaf contract directly, are env-independent
    // (hold regardless of any value in the test shell), and register zero classes — so they are collision-free.
    let src;

    test.beforeAll(async () => {
        src = await fs.readFile(
            path.join(repoRoot, 'ai/mcp/server/knowledge-base/configBase.mjs'), 'utf8'
        );
    });

    test('the dedicated askSynthesis block exists (ask no longer rides the global modelProvider)', () => {
        expect(src).toMatch(/askSynthesis\s*:\s*\{/);
    });

    /**
     * @summary The ask default is LOCAL, and no remote model id may be the default.
     *
     * This arm previously asserted the opposite — a remote `gemini` provider on `gemini-2.5-flash`,
     * justified as the cheaper of two cloud models. Cheaper is not free: a cloud DEFAULT bills every
     * `ask` by nobody's decision, it ran ~EUR 70/month, and the dedicated key it required was
     * exposed by a peer. The block's own cost-safety machinery (runaway breaker, dedicated key,
     * budget cap) all bounds a metered call rather than removing the meter.
     *
     * The second assertion is the one that matters long-term. Pinning `'openAiCompatible'` alone
     * would still pass if someone left a remote model id in the `model` leaf, which is precisely how
     * this drifts back — a provider flip is visible in review, a model-id string is not.
     */
    test('defaults to the LOCAL provider on the deployment chat model — never a metered remote', () => {
        expect(src).toMatch(/provider\s*:\s*leaf\('openAiCompatible',\s*'NEO_KB_ASK_PROVIDER'/);
        expect(src).toMatch(/model\s*:\s*leaf\('google\/gemma-4-26b-a4b',\s*'NEO_KB_ASK_MODEL'/);

        // The ask model must be the SAME id the deployment already serves. A different one is not a
        // preference — LM Studio JIT-loads whatever it is handed, so it means a second resident
        // chat model (~20 GB) beside the one serving traffic.
        const tier1 = fs.readFileSync(path.join(repoRoot, 'ai/configBase.mjs'), 'utf8');

        expect(tier1, 'the Tier-1 chat leaf is the single source for this id')
            .toMatch(/model\s*:\s*leaf\('google\/gemma-4-26b-a4b',\s*'NEO_OPENAI_COMPATIBLE_MODEL'/);
    });

    test('NO remote model id may sit in a default anywhere in the askSynthesis block', () => {
        // The regression this blocks is a quiet edit of one string, not a redesign. Named remote
        // families rather than a generic pattern, so the failure says WHICH vendor crept back in.
        const askBlock = src.slice(src.indexOf('askSynthesis'), src.indexOf('askSynthesis') + 4000);

        for (const remote of ['gemini-', 'gpt-4', 'gpt-5', 'claude-3', 'claude-4', 'claude-5']) {
            expect(askBlock.includes(`leaf('${remote}`),
                `a metered ${remote}* id is the DEFAULT again — remote synthesis must stay opt-in via env`
            ).toBe(false)
        }
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
