/**
 * @summary Multi-plane ISOLATION suite. The `parity` in its name is historical and misleading.
 *
 * It does NOT compare a local plane against a dockerized one — that transition is over. It boots
 * a SECOND, fully separate dockerized plane (its own Compose project, its own data root) and
 * proves the two coexist without contaminating each other.
 *
 * None of its assertions compare two planes for parity. Four assert the overlay plane must never
 * resolve or serve the durable root; one refuses boot outright when a plane resolves the canonical
 * root; one proves no egress. A second deployment is by definition a second plane, so what this
 * guards grows in relevance rather than shrinking.
 *
 * Stated here because the name alone reads as retirable, and the suite was nearly dropped as
 * leftover debt by a reader who had not opened it. A rename is ordering-sensitive and tracked
 * separately: this config's sibling job name IS the required check context.
 */
import './configTemplateResolver.mjs';

import {defineConfig}        from '@playwright/test';
import {resolveFreePortSync} from './resolveFreePort.mjs';

// Per-process ready-port, same idiom as the integration-unified config: a fixed default +
// reuseExistingServer:false wedges concurrent runs on the shared multi-agent machine
// (see resolveFreePort.mjs). The parityComposeWebServer fixture reads the same env var,
// so the derived value is passed down via the webServer env.
const
    readyPort       = resolveFreePortSync(process.env.NEO_PARITY_READY_PORT),
    parityAuthToken = 'bmVvLXBhcml0eS1jaS1sb2NhbC1hdXRoLWZpeHR1cmU';

// Write the derived values back into the runner env (the unit config's writeback idiom):
// test WORKERS inherit this process's env, and the parity specs resolve their readiness
// endpoint from it. The auth value is a deterministic, nonsecret 32-byte base64url fixture:
// the webServer and test workers pass it to every Compose child, and Compose materializes
// the base profile's file-backed secret from the same value.
process.env.NEO_MCP_HEALTHCHECK_TOKEN = parityAuthToken;
process.env.NEO_PARITY_READY_PORT     = String(readyPort);
process.env.NEO_PARITY_READY_URL      = process.env.NEO_PARITY_READY_URL || `http://127.0.0.1:${readyPort}/ready`;

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
            NEO_MCP_HEALTHCHECK_TOKEN: parityAuthToken,
            NEO_PARITY_READY_PORT    : String(readyPort)
        },
        gracefulShutdown   : {
            signal : 'SIGTERM',
            timeout: 30000
        }
    }
});
