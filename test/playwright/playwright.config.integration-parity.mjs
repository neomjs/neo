import './configTemplateResolver.mjs';

import {defineConfig}        from '@playwright/test';
import {resolveFreePortSync} from './resolveFreePort.mjs';

// Per-process ready-port, same idiom as the integration-unified config: a fixed default +
// reuseExistingServer:false wedges concurrent runs on the shared multi-agent machine
// (see resolveFreePort.mjs). The parityComposeWebServer fixture reads the same env var,
// so the derived value is passed down via the webServer env.
const readyPort = resolveFreePortSync(process.env.NEO_PARITY_READY_PORT);

// Write the derived values back into the runner env (the unit config's writeback idiom):
// test WORKERS inherit this process's env, and the parity specs resolve their readiness
// endpoint from it.
process.env.NEO_PARITY_READY_PORT = String(readyPort);
process.env.NEO_PARITY_READY_URL  = process.env.NEO_PARITY_READY_URL || `http://127.0.0.1:${readyPort}/ready`;

export default defineConfig({
    testDir      : './integration-parity',
    outputDir    : './test-results/integration-parity/artifacts',
    fullyParallel: false,
    workers      : 1,
    timeout      : 120000,

    reporter: [
        ['list'],
        ['json', {outputFile: 'test-results/integration-parity/results.json'}]
    ],

    use: {
        trace: 'on-first-retry'
    },

    webServer: {
        command: 'node ./integration-parity/fixtures/parityComposeWebServer.mjs',
        url    : `http://127.0.0.1:${readyPort}/ready`,
        // Cold budget: the first run builds the parity images (in-container npm ci +
        // better-sqlite3 native rebuild) and then waits out the 90s healthcheck
        // start_periods. The timeout is an upper bound, not a target — the wall-clock
        // receipt lives in the readiness payload (bootMs).
        timeout            : 600000,
        reuseExistingServer: false,
        stdout             : 'pipe',
        stderr             : 'pipe',
        env                : {
            ...process.env,
            NEO_PARITY_READY_PORT: String(readyPort)
        },
        gracefulShutdown   : {
            signal : 'SIGTERM',
            timeout: 30000
        }
    }
});
