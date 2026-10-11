import {defineConfig}        from '@playwright/test';
import {resolveFreePortSync} from './resolveFreePort.mjs';

/**
 * The Epic's goal bar, as an executable scenario.
 *
 * ## Why this is its OWN project rather than a spec inside `integration-parity`
 *
 * `integration-parity` already provisions a disposable Compose plane and is already in the default CI gate.
 * Reusing it would have been the cheaper edit and it is the wrong one: this scenario lands **red** while the
 * implementation leaves of its Epic are open, so adding it to a gated project turns the shared gate red on
 * day one. A permanently-red check in the default gate gets routed around within a week and stops meaning
 * anything — which the source ticket names as a trap against itself.
 *
 * So: a separate project, **absent from `.github/workflows/`** until it goes green. Moving it into the gate
 * is the ticket's completion condition, not a follow-up.
 *
 * ## Why it is opt-in rather than skipped
 *
 * A `test.skip` inside a gated project reads as green and proves nothing. An unreferenced config cannot read
 * as anything — it either was not run, or it ran and reported. Absence of a workflow entry is the honest
 * form of "not yet gated".
 *
 * Run it deliberately:
 *
 * ```
 * npx playwright test -c test/playwright/playwright.config.update-chain.mjs
 * ```
 */
// Sync and env-overridable, matching the sibling parity config: a pinned positive integer is honoured
// unchanged so CI can fix the port, and only an unset value gets probed.
const readyPort = resolveFreePortSync(process.env.NEO_UPDATE_CHAIN_READY_PORT);

process.env.NEO_UPDATE_CHAIN_READY_PORT = String(readyPort);

export default defineConfig({
    testDir      : './update-chain',
    outputDir    : './test-results/update-chain/artifacts',
    fullyParallel: false,
    workers      : 1,
    // A provisioning-plus-migration round is minutes, not seconds: an image build, two health windows and a
    // recreate. The budget is an upper bound rather than a target — the wall-clock receipt belongs in the
    // scenario's own output, so a slow pass is distinguishable from a hang.
    timeout      : 900000,

    // No retries. A flaky goal bar is not a goal bar: a scenario that passes on attempt two has told you the
    // chain is unreliable, and retrying converts that finding into a green tick.
    retries      : 0,

    reporter: [
        ['list'],
        ['json', {outputFile: 'test-results/update-chain/results.json'}]
    ],

    use: {
        trace: 'on-first-retry'
    }
});
