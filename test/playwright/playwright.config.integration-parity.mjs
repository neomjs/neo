/**
 * @summary Mandatory witness for the dev-profile topology + mock-embedding contract.
 *
 * `parity` here means DEV-PROFILE parity — does the profile CI runs match the shape we deploy.
 * That is ongoing. It is NOT the local-vs-dockerized comparison that ended with the dockerization
 * cut, which is how the name gets read by anyone who has not opened the suite; it was nearly
 * dropped as leftover debt on exactly that reading.
 *
 * One isolated plane is booted — its own Compose project, its own data root — and the eight test
 * cases split evenly. Four prove the profile stands up: the plane boots, Neural Link loggers
 * initialize without sink degradation, provider auth refuses missing and empty secret carriers
 * before listen, and the deterministic mock provider carries semantic recall end to end. Four
 * prove it stays contained: served identity never resolves the durable root, foreign-plane
 * expectations are rejected at the wire, an overlay resolving the canonical root is refused at
 * boot, and no egress leaves the network.
 *
 * Isolation is one dimension of the guarantee, not the whole of it.
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
