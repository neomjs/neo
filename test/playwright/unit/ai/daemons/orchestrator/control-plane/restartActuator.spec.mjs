import {test, expect}                        from '@playwright/test';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath}                       from 'node:url';

import {restartRuntimeTarget} from '../../../../../../../ai/daemons/orchestrator/control-plane/restartActuator.mjs';

/** Recursively collect `.mjs` files under a dir (absolute), excluding specs. */
function collectMjs(absDir) {
    const out = [];
    let entries;
    try { entries = readdirSync(absDir); } catch (error) { return out; }
    for (const entry of entries) {
        const abs = `${absDir}/${entry}`;
        if (statSync(abs).isDirectory()) out.push(...collectMjs(abs));
        else if (entry.endsWith('.mjs') && !entry.endsWith('.spec.mjs')) out.push(abs);
    }
    return out;
}

test.describe('control-plane/restartActuator — the R3 lifecycle-write restart endpoint', () => {
    test('delegates the restart through the lifecycle-write envelope (applyLifecycle), never a direct restart', async () => {
        const calls         = [],
              runtimeAccess = {applyLifecycle: async args => { calls.push(args); return {serviceKey: args.serviceKey, state: 'restarting'}; }},
              outcome       = await restartRuntimeTarget({runtimeAccess, serviceKey: 'memory-core', reason: 'stale-source'});

        expect(calls).toEqual([{serviceKey: 'memory-core', operation: 'restart', reason: 'stale-source'}]);
        expect(outcome).toEqual({ok: true, result: {serviceKey: 'memory-core', state: 'restarting'}});
    });

    test('propagates a lifecycle-envelope refusal (a throw) as {ok:false} — never a false success', async () => {
        // The envelope signals a refusal (disabled / disallowed op / non-allowlisted key / anti-thrash)
        // by throwing; the endpoint must return a clean {ok:false}, not leak the throw or claim success.
        const runtimeAccess = {applyLifecycle: async () => { throw new Error('runtime-access-disabled'); }},
              outcome       = await restartRuntimeTarget({runtimeAccess, serviceKey: 'memory-core'});

        expect(outcome.ok).toBe(false);
        expect(outcome.error).toEqual(expect.stringContaining('envelope refused'));
        expect(outcome.error).toEqual(expect.stringContaining('runtime-access-disabled'));
    });

    test('normalizes an explicit {ok:false} envelope result as a refusal — never wrapped as {ok:true}', async () => {
        const runtimeAccess = {applyLifecycle: async () => ({ok: false, error: 'anti-thrash: too soon since last restart'})},
              outcome       = await restartRuntimeTarget({runtimeAccess, serviceKey: 'memory-core'});

        expect(outcome.ok).toBe(false);
        expect(outcome.error).toEqual(expect.stringContaining('anti-thrash'));
    });

    test('REFUSES when no lifecycle-write runtime access is wired — never a fabricated success', async () => {
        expect(await restartRuntimeTarget({serviceKey: 'memory-core'})).toEqual({ok: false, error: expect.stringContaining('no lifecycle-write runtime access')});
        expect(await restartRuntimeTarget({runtimeAccess: {}, serviceKey: 'memory-core'})).toEqual({ok: false, error: expect.stringContaining('no lifecycle-write runtime access')});
    });

    test('REFUSES a missing service key — never a direct or unbounded restart', async () => {
        const runtimeAccess = {applyLifecycle: async () => { throw new Error('should not be reached'); }};
        expect(await restartRuntimeTarget({runtimeAccess})).toEqual({ok: false, error: expect.stringContaining('known service key')});
        expect(await restartRuntimeTarget({runtimeAccess, serviceKey: ''})).toEqual({ok: false, error: expect.stringContaining('known service key')});
    });

    test('R3 FIREWALL: no client Bridge / readiness surface imports the restart actuator (physically off-client)', () => {
        const root = fileURLToPath(new URL('../../../../../../../', import.meta.url)),
              // The client-reachable surfaces: the app↔fleet wire (the app's bridge glue + the
              // Node-side client factory), the AgentOS pane, and the container healthcheck.
              client = [
                  ...collectMjs(`${root}apps/agentos/fleet`),
                  ...collectMjs(`${root}apps/agentos/view/fleet`),
                  `${root}ai/services/fleet/createFleetRegistryBridge.mjs`,
                  `${root}ai/scripts/diagnostics/mcpHealthcheck.mjs`
              ];

        const importers = client.filter(file => {
            let src;
            try { src = readFileSync(file, 'utf8'); } catch (error) { return false; }
            return /restartActuator/.test(src);
        });

        // The lifecycle-write restart endpoint must be reachable only from an orchestrator-internal control-plane
        // caller — never a client RPC / readiness surface (the R3 seam). If this fails, a restart leaked onto
        // the client boundary.
        expect(importers, `client surfaces importing the restart actuator: ${importers.join(', ')}`).toEqual([]);
    });
});
