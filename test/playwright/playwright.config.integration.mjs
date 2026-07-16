import './configTemplateResolver.mjs';

import {defineConfig}        from '@playwright/test';
import {resolveFreePortSync} from './resolveFreePort.mjs';

// Per-process ready-port: a fixed default + reuseExistingServer:false wedges concurrent runs on
// the shared multi-agent machine (see resolveFreePort.mjs). The composeWebServer fixture reads
// the same env var, so the derived value is passed down via the webServer env — an explicit
// NEO_INTEGRATION_READY_PORT pin keeps winning end-to-end.
const readyPort = resolveFreePortSync(process.env.NEO_INTEGRATION_READY_PORT);

export default defineConfig({
    testDir      : './integration',
    outputDir    : './test-results/integration/artifacts',
    fullyParallel: false,
    workers      : 1,
    timeout      : 120000,

    reporter: [
        ['list'],
        ['json', {outputFile: 'test-results/integration/results.json'}]
    ],

    use: {
        trace: 'on-first-retry'
    },

    webServer: {
        command            : 'node ./integration/fixtures/composeWebServer.mjs',
        url                : `http://127.0.0.1:${readyPort}/ready`,
        timeout            : 240000,
        reuseExistingServer: false,
        stdout             : 'pipe',
        stderr             : 'pipe',
        env                : {
            ...process.env,
            NEO_INTEGRATION_READY_PORT: String(readyPort)
        },
        gracefulShutdown   : {
            signal : 'SIGTERM',
            timeout: 30000
        }
    }
});
