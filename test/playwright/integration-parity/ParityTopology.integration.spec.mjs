import {test, expect} from '@playwright/test';

import {runHealthcheck}                                      from '../../../ai/scripts/diagnostics/mcpHealthcheck.mjs';
import {callHealthcheck, callJsonTool, createIdentityClient} from '../integration/fixtures/mcpClient.mjs';

const KB_URL              = process.env.NEO_PARITY_KB_URL || 'http://127.0.0.1:3100';
const MC_URL              = process.env.NEO_PARITY_MC_URL || 'http://127.0.0.1:3101';
const PLANE_ID            = process.env.NEO_PARITY_COMPOSE_PROJECT || 'neo-parity-ci';
const PLANE_DATA_ROOT     = '/app/.neo-ai-data-parity';
const CANONICAL_DATA_ROOT = '/app/.neo-ai-data';
const DEFAULT_READY_URL   = process.env.NEO_PARITY_READY_URL || 'http://127.0.0.1:13095/ready';

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

    test('served identity: both servers prove the overlay plane, never the durable root', async () => {
        const [kb, mc] = await Promise.all([
            runHealthcheck({url: KB_URL, clientName: 'neo-parity-ci-spec-kb', expectedPlaneId: PLANE_ID, expectedPlaneDataRoot: PLANE_DATA_ROOT}),
            runHealthcheck({url: MC_URL, clientName: 'neo-parity-ci-spec-mc', expectedPlaneId: PLANE_ID, expectedPlaneDataRoot: PLANE_DATA_ROOT})
        ]);

        for (const served of [kb, mc]) {
            expect(served.plane.id).toBe(PLANE_ID);
            expect(served.plane.dataRoot).toBe(PLANE_DATA_ROOT);
            // The isolation arm, stated positively: whatever the overlay serves, it is
            // never the canonical durable root (the F-invariant's whole point — identity
            // without isolation is the failure class the parity epic kills).
            expect(served.plane.dataRoot).not.toBe(CANONICAL_DATA_ROOT);
        }
    });

    test('fail-closed: foreign plane expectations are rejected at the wire', async () => {
        // The durable-root fail-closed invariant, exercised at the served-identity boundary:
        // the booted process refuses to masquerade as a different plane — a responder that
        // cannot prove the expected identity is a failed check, never a pass.
        await expect(runHealthcheck({
            url            : MC_URL,
            clientName     : 'neo-parity-ci-spec-foreign-id',
            expectedPlaneId: 'neo-canonical-durable-plane'
        })).rejects.toThrow(/Served plane id/);

        await expect(runHealthcheck({
            url                  : MC_URL,
            clientName           : 'neo-parity-ci-spec-foreign-root',
            expectedPlaneId      : PLANE_ID,
            expectedPlaneDataRoot: CANONICAL_DATA_ROOT
        })).rejects.toThrow(/dataRoot/);
    });

    test('mock-embedding contract: deterministic provider, semantic recall end to end', async () => {
        const [kbHealth, mcHealth] = await Promise.all([
            callHealthcheck(KB_URL, {clientName: 'neo-parity-ci-spec-kb-health'}),
            callHealthcheck(MC_URL, {clientName: 'neo-parity-ci-spec-mc-health'})
        ]);

        // The mock wiring, asserted at the served config surface: the active embedding
        // provider is the OpenAI-compatible mock (compose-internal, no real model host,
        // no external network) — never a real-provider fallback.
        expect(mcHealth.providers.embedding.active).toBe('openAiCompatible');
        expect(mcHealth.providers.embedding.error).toBeUndefined();
        expect(kbHealth.features.embedding).toBe(true);

        // The end-to-end arm: a memory written through the MCP boundary is embedded by the
        // mock, drained by the in-process WAL loop, and retrievable by semantic recall —
        // the whole embedding path exercised, not just a config value.
        const token  = `parity-ci-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const client = await createIdentityClient({baseUrl: MC_URL, clientName: 'neo-parity-ci-spec-memory', identity: 'neo-parity-ci-spec'});

        try {
            await callJsonTool(client, 'add_memory', {
                prompt  : `Parity CI probe prompt ${token}`,
                thought : `Parity CI probe thought ${token}`,
                response: `Parity CI probe response ${token}`
            });

            let   found    = false;
            const deadline = Date.now() + 30000;

            while (!found && Date.now() < deadline) {
                const result = await callJsonTool(client, 'query_raw_memories', {query: token, nResults: 5});

                found = JSON.stringify(result).includes(token);

                if (!found) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            expect(found, `semantic recall never surfaced the probe memory (token=${token}) — the embedding path (mock provider, WAL drain, chroma write) is broken`).toBe(true);
        } finally {
            await client.close();
        }
    });
});
