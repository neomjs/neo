import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../..');

const KB_INTERNAL_URL     = 'http://127.0.0.1:3000';
const MC_INTERNAL_URL     = 'http://127.0.0.1:3001';
const PLANE_ID            = process.env.NEO_PARITY_COMPOSE_PROJECT || 'neo-parity-ci';
const PLANE_DATA_ROOT     = '/app/.neo-ai-data-parity';
const CANONICAL_DATA_ROOT = '/app/.neo-ai-data';
const DEFAULT_READY_URL   = process.env.NEO_PARITY_READY_URL || 'http://127.0.0.1:13095/ready';

/**
 * @summary Runs a docker compose invocation against the same project + file set the
 * lane's fixture booted, returning the spawnSync result for assertion.
 * @param {String[]} args Compose arguments after the project/file flags.
 * @returns {Object} The spawnSync result ({status, stdout, stderr, error}).
 */
function compose(args) {
    return spawnSync('docker', [
        'compose', '-p', PLANE_ID,
        '-f', 'ai/deploy/docker-compose.dev.yml',
        '-f', 'ai/deploy/docker-compose.parity-ci.yml',
        ...args
    ], {cwd: repoRoot, encoding: 'utf8', env: process.env, timeout: 150000});
}

/**
 * @summary Runs a canonical-auth one-off without mutating the live parity project graph.
 *
 * This is the negative arm for the environment-backed provider secret. It deliberately retains
 * the fixture's exact two-file Compose graph: addressing the same project through the base file
 * alone makes Compose replace the live internal network with the base network, severing the MCP
 * server's existing Chroma connection and poisoning later assertions. The one-off command
 * restores the base profile's GitHub-PAT leaves with `run -e` instead.
 *
 * `os.devNull` prevents a developer `.env` file from silently supplying the credential after
 * the explicit process-env deletion.
 * @param {String[]} args Compose arguments after the project/file flags.
 * @param {Object} env Child-process environment.
 * @returns {Object} The spawnSync result.
 */
function composeCanonicalAuth(args, env) {
    return spawnSync('docker', [
        'compose',
        '--env-file', os.devNull,
        '-p', PLANE_ID,
        '-f', 'ai/deploy/docker-compose.dev.yml',
        '-f', 'ai/deploy/docker-compose.parity-ci.yml',
        ...args
    ], {cwd: repoRoot, encoding: 'utf8', env, timeout: 150000});
}

/**
 * @summary Executes a node probe inside a running service container. The CI overlay's
 * internal network publishes no host ports, so network-dependent assertions run where
 * the network is: inside it.
 * @param {String} service Compose service name.
 * @param {String[]} nodeArgs Arguments after `node`.
 * @returns {Object} The spawnSync result.
 */
function execProbe(service, nodeArgs) {
    return compose(['exec', '-T', service, 'node', ...nodeArgs]);
}

/**
 * @summary Reads the parity fixture readiness endpoint.
 * @returns {Promise<Object>} The readiness payload (topology snapshot + wall-clock receipt).
 */
async function getReadiness() {
    const response = await fetch(DEFAULT_READY_URL);

    return response.json();
}

test.describe('Parity topology lane (#15807) — the phase-3 stack with a CI witness', () => {
    test('the complete plane boots: chroma + both MCP servers healthy, the orchestrator running', async () => {
        const readiness = await getReadiness();

        // Fail-closed by construction: a docker-less runner never reaches this spec (the
        // webServer stays 503 until the job times out RED). This assertion is the belt to
        // that suspenders — it guards a locally-pointed NEO_PARITY_READY_URL.
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const byName = Object.fromEntries((readiness.services || []).map(s => [s.Service, s]));

        expect(byName['chroma']?.Health).toBe('healthy');
        expect(byName['kb-server']?.Health).toBe('healthy');
        expect(byName['mc-server']?.Health).toBe('healthy');
        // The plane's writer has no healthcheck of its own — a failed F-invariant boot walk
        // surfaces as an exited container, never as a green check.
        expect(byName['orchestrator']?.State, 'orchestrator is not running — a failed plane boot walk exits the container').toBe('running');

        // AC4 wall-clock receipt: the readiness payload carries the measured boot time.
        expect(readiness.bootMs, 'readiness payload must carry the boot wall-clock receipt').toBeGreaterThan(0);
        test.info().annotations.push({type: 'parity-boot-ms', description: `${readiness.bootMs}ms (project=${readiness.project})`});
    });

    test('both imported Neural Link loggers initialize without sink degradation', () => {
        // RecorderService imports the Neural Link logger into both processes even though the
        // Neural Link server remains seat-local. A missing NEO_NL_LOG_PATH therefore escaped the
        // booting servers' own config walks and degraded at runtime. A positive RecorderService
        // marker prevents an empty log stream from satisfying the two negative assertions.
        for (const service of ['mc-server', 'orchestrator']) {
            const logs   = compose(['logs', '--no-color', service]),
                  output = `${logs.stdout}\n${logs.stderr}`;

            expect(logs.status, `could not read ${service} parity boot logs:\n${output.slice(-2000)}`).toBe(0);
            // Either arm is a valid positive marker, and one of them ALWAYS appears: the enabled
            // line when action logging is on, the disabled line when it is not (the default). Neither
            // reports a connection any more: the recorder opens nothing at boot.
            // The alternation keeps the guard intact across that config without pinning parity to a
            // non-default setting — the point is that RecorderService reported through the Neural
            // Link logger at all, which is what proves the sink is live.
            expect(output).toMatch(
                /\[RecorderService\] (Action logging enabled; telemetry admits to Memory Core, write-only\.|Action logging disabled; transaction archive available on demand\.)/
            );
            expect(output).not.toContain('file sink unavailable');
            expect(output).not.toContain("mkdir '/app/.neo-ai-data/logs'");
        }
    });

    test('served identity: both servers prove the overlay plane, never the durable root', async () => {
        for (const {service, url} of [
            {service: 'kb-server', url: KB_INTERNAL_URL},
            {service: 'mc-server', url: MC_INTERNAL_URL}
        ]) {
            const probe = execProbe(service, [
                'ai/scripts/diagnostics/mcpHealthcheck.mjs',
                '--url', url,
                '--client-name', `neo-parity-ci-spec-${service}`,
                '--expected-status', 'healthy,degraded',
                '--expected-plane-id', PLANE_ID,
                '--expected-plane-data-root', PLANE_DATA_ROOT
            ]);

            expect(probe.status, `served-identity probe failed for ${service}: ${(probe.stderr || '').slice(-400)}`).toBe(0);

            const served = JSON.parse(probe.stdout.trim().split('\n').pop());

            expect(served.plane.id).toBe(PLANE_ID);
            expect(served.plane.dataRoot).toBe(PLANE_DATA_ROOT);
            // The isolation arm, stated positively: whatever the overlay serves, it is
            // never the canonical durable root (the F-invariant's whole point — identity
            // without isolation is the failure class the parity epic kills).
            expect(served.plane.dataRoot).not.toBe(CANONICAL_DATA_ROOT);
        }
    });

    test('served-identity probe: foreign plane expectations are rejected at the wire', async () => {
        // The CLIENT-side contract: the probe refuses a responder that cannot prove the
        // expected identity — the wrong-process arm (the profile's 8100 ssh-collision
        // lesson). This complements, and does not replace, the server-side boot refusal
        // asserted two tests below: a probe that never rejects would rubber-stamp a
        // foreign process even when the boot walk did its job.
        const foreignId = execProbe('mc-server', [
            'ai/scripts/diagnostics/mcpHealthcheck.mjs',
            '--url', MC_INTERNAL_URL,
            '--client-name', 'neo-parity-ci-spec-foreign-id',
            '--expected-status', 'healthy,degraded',
            '--expected-plane-id', 'neo-canonical-durable-plane'
        ]);

        expect(foreignId.status).not.toBe(0);
        expect(`${foreignId.stdout}\n${foreignId.stderr}`).toMatch(/Served plane id/);

        const foreignRoot = execProbe('mc-server', [
            'ai/scripts/diagnostics/mcpHealthcheck.mjs',
            '--url', MC_INTERNAL_URL,
            '--client-name', 'neo-parity-ci-spec-foreign-root',
            '--expected-status', 'healthy,degraded',
            '--expected-plane-id', PLANE_ID,
            '--expected-plane-data-root', CANONICAL_DATA_ROOT
        ]);

        expect(foreignRoot.status).not.toBe(0);
        expect(`${foreignRoot.stdout}\n${foreignRoot.stderr}`).toMatch(/dataRoot/);
    });

    test('canonical provider auth refuses missing and empty secret carriers before listen', () => {
        const missingEnv = {...process.env};
        delete missingEnv.NEO_MCP_HEALTHCHECK_TOKEN;

        // Entry point `true` makes this a pure Compose materialization probe. The command can only
        // fail because the required credential carrier cannot be projected into the profile.
        const missing = composeCanonicalAuth([
            'run', '--rm', '--no-deps', '--entrypoint', 'true', 'kb-server'
        ], missingEnv);
        const missingOutput = `${missing.stdout}\n${missing.stderr}`;

        expect(missing.status).not.toBe(0);
        expect(missing.error?.code).not.toBe('ETIMEDOUT');
        expect(missingOutput).toMatch(/required variable NEO_MCP_HEALTHCHECK_TOKEN is missing a value|environment variable .* required by secret .* is not set/i);

        // The required-variable expression correctly rejects an empty environment value before
        // container creation, so use the container's readable-but-empty null device for the
        // boot arm. Restore the base profile's canonical GitHub-PAT leaves only for that process;
        // AuthService must reject the empty carrier before Transport opens a listener.
        const empty = composeCanonicalAuth([
            'run', '--rm', '--no-deps',
            '-e', 'NEO_AUTH_MODE=github-pat',
            '-e', 'NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT=true',
            '-e', 'NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES=github-pat',
            '-e', `NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE=${os.devNull}`,
            '-e', 'NEO_AUTH_LOCAL_BEARER_TOKEN=',
            'kb-server'
        ], process.env);
        const emptyOutput = `${empty.stdout}\n${empty.stderr}`;

        expect(empty.status).not.toBe(0);
        expect(empty.error?.code).not.toBe('ETIMEDOUT');
        expect(emptyOutput).toMatch(/AuthService: (?:cannot read auth\.providerBootstrapPatFile|auth\.providerBootstrapPatFile contains no credential)/);
        expect(emptyOutput).not.toMatch(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/)
    });

    test('the durable-root invariant: an overlay that resolves the canonical root is REFUSED at boot', async () => {
        // The SERVER-side arm (the F-invariant itself): force a non-canonical plane id
        // (the project-derived NEO_PLANE_ID still holds) onto the canonical data root
        // and prove the process refuses to serve — `assertPlaneCoherence` fires at the
        // boot walk, the container exits, and the failure names the collision. A fast
        // exit is the witness; a hanging server would mean the invariant did not fire.
        const bad = compose(['run', '--rm', '--no-deps',
            '-e', `NEO_PLANE_DATA_ROOT=${CANONICAL_DATA_ROOT}`,
            'kb-server'
        ]);

        const output = `${bad.stdout}\n${bad.stderr}`;

        expect(bad.error?.code, `boot refusal must be fast — a timeout means the server kept running:\n${output.slice(-2000)}`).not.toBe('ETIMEDOUT');
        expect(output).toMatch(/resolves the durable root/);
    });

    test('no egress: external destinations are unreachable from inside the parity network', async () => {
        // The no-external-network contract, falsified at the network layer: the CI
        // overlay marks the parity network internal, so an outbound fetch from inside
        // a running service container cannot resolve/route anywhere. EGRESS-OPEN in
        // the output would mean the isolation mechanism failed — the mock contract
        // would no longer be the only model path.
        const probe = compose(['exec', '-T', 'kb-server', 'node', '-e',
            `fetch('https://api.github.com', {signal: AbortSignal.timeout(8000)})` +
            `.then(r => console.log('EGRESS-OPEN', r.status))` +
            `.catch(() => console.log('EGRESS-BLOCKED'))`
        ]);

        const output = `${probe.stdout}\n${probe.stderr}`;

        expect(output).toContain('EGRESS-BLOCKED');
        expect(output).not.toContain('EGRESS-OPEN');
    });

    test('mock-embedding contract: deterministic provider, semantic recall end to end', async () => {
        // The mock wiring, asserted at the served config surface: the active embedding
        // provider is the OpenAI-compatible mock (compose-internal, no real model host,
        // no external network) — never a real-provider fallback.
        const mcProviders = execProbe('mc-server', [
            'test/playwright/integration-parity/fixtures/parityProbe.mjs', 'providers', MC_INTERNAL_URL
        ]);

        expect(mcProviders.status, (mcProviders.stderr || '').slice(-400)).toBe(0);

        const mcHealth = JSON.parse(mcProviders.stdout.trim().split('\n').pop());

        expect(mcHealth.embedding.active).toBe('openAiCompatible');
        expect(mcHealth.embedding.error).toBeUndefined();

        const kbProviders = execProbe('kb-server', [
            'test/playwright/integration-parity/fixtures/parityProbe.mjs', 'providers', KB_INTERNAL_URL
        ]);

        expect(kbProviders.status, (kbProviders.stderr || '').slice(-400)).toBe(0);

        const kbHealth = JSON.parse(kbProviders.stdout.trim().split('\n').pop());

        expect(kbHealth.features.embedding).toBe(true);

        // The end-to-end arm: a memory written through the MCP boundary is embedded by the
        // mock, drained by the in-process WAL loop, and retrievable by semantic recall —
        // the whole embedding path exercised, not just a config value.
        const recall = execProbe('mc-server', [
            'test/playwright/integration-parity/fixtures/parityProbe.mjs', 'recall', MC_INTERNAL_URL
        ]);

        expect(recall.status, (recall.stderr || '').slice(-600)).toBe(0);
        expect(recall.stdout).toContain('RECALL-OK');
    });
});
