import {expect, test} from '@playwright/test';

import {establishFleetSessionCustody, resolveFleetUrl} from '../../../../../../apps/agentos/fleet/fleetSessionCustody.mjs';

/**
 * The deliberate-switch semantics of the custody establish — the unit half beside the
 * live-wire integration coverage (`fleetTransport.integration.spec.mjs`, which proves the
 * verify→retire transaction against a real server). Here the install is injected, so every case
 * pins the GUARD and PUBLISH logic without a wire.
 */
test.describe('fleetSessionCustody — the deliberate instance switch (#17328)', () => {
    const url = 'http://127.0.0.1:8083/fleet';

    const makeInstall = (verifyOutcome = Promise.resolve({})) => {
        const calls = [];

        return {
            calls,
            installImpl(opts) {
                calls.push(opts);

                const bridge = {
                    profileId            : opts.profileId,
                    resolveViewerIdentity: () => verifyOutcome
                };

                // mirror the real install's publish semantics: only a real target receives the slot
                if (opts.target?.AgentOS) {
                    opts.target.AgentOS.fleet                = opts.target.AgentOS.fleet || {};
                    opts.target.AgentOS.fleet.registryBridge = bridge
                }

                return bridge
            }
        }
    };

    test('bearer-less + existing bridge + NOT deliberate: the live bridge is preserved and nothing installs (the boot no-downgrade guard)', async () => {
        const existing             = {profileId: 'fleet-profile:v1:http://old/fleet'};
        const target               = {AgentOS: {fleet: {registryBridge: existing}}};
        const {calls, installImpl} = makeInstall();

        const outcome = establishFleetSessionCustody({fleetUrl: url, installImpl, target});

        expect(outcome.bridge).toBe(existing);
        expect(calls).toHaveLength(0);
        await expect(outcome.custodySettled).resolves.toBe(false);
        await expect(outcome.verified).resolves.toBe(false)
    });

    test('bearer-less + existing bridge + DELIBERATE: the chosen endpoint REPLACES the live bridge fail-closed — the honest switch, never the old instance impersonating the choice', async () => {
        const existing             = {profileId: 'fleet-profile:v1:http://old/fleet'};
        const target               = {AgentOS: {fleet: {registryBridge: existing}}};
        const {calls, installImpl} = makeInstall();

        const outcome = establishFleetSessionCustody({deliberate: true, fleetUrl: url, installImpl, target});

        // publishNow: the install received the REAL target, and the returned bridge is the new one
        expect(calls).toHaveLength(1);
        expect(calls[0].target).toBe(target);
        expect(calls[0].bearerToken).toBeNull();
        expect(outcome.bridge).not.toBe(existing);
        expect(outcome.bridge.profileId).toBe(`fleet-profile:v1:${url}`);
        expect(target.AgentOS.fleet.registryBridge).toBe(outcome.bridge);

        // bearer-less: nothing to verify, nothing to retire — fail-closed is the settled truth
        await expect(outcome.verified).resolves.toBe(false);
        await expect(outcome.custodySettled).resolves.toBe(false)
    });

    test('deliberate + caller-provided bearer: verified resolves on the whoami proof even though there is NO ingress slot to retire — the two verdicts are distinct by design', async () => {
        const existing             = {profileId: 'fleet-profile:v1:http://old/fleet'};
        const target               = {AgentOS: {fleet: {registryBridge: existing}}};
        const {calls, installImpl} = makeInstall();

        const outcome = establishFleetSessionCustody({
            deliberate: true,
            fleetUrl  : url,
            installImpl,
            redeemed  : {bearerToken: 'a'.repeat(43)},
            target
        });

        expect(calls).toHaveLength(1);

        // the switch owner's verdict: the server stamped the session
        await expect(outcome.verified).resolves.toBe(true);

        // the boot owner's verdict: no launcher slot held this bearer, so nothing verified-RETIRED
        await expect(outcome.custodySettled).resolves.toBe(false)
    });

    test('a refused bearer resolves verified=false and the launcher slot SURVIVES — rollback truth on the switch path too', async () => {
        const slotBearer    = 'b'.repeat(43);
        const target        = {AgentOS: {fleet: {bearerToken: slotBearer}}};
        const {installImpl} = makeInstall(Promise.reject(new Error('401')));

        const outcome = establishFleetSessionCustody({deliberate: true, fleetUrl: url, installImpl, target});

        await expect(outcome.verified).resolves.toBe(false);
        await expect(outcome.custodySettled).resolves.toBe(false);
        expect(target.AgentOS.fleet.bearerToken).toBe(slotBearer)
    });

    test('boot semantics are UNCHANGED by the verified addition: slot bearer + successful verify still verified-retires the ingress', async () => {
        const slotBearer    = 'c'.repeat(43);
        const target        = {AgentOS: {fleet: {bearerToken: slotBearer}}};
        const {installImpl} = makeInstall();

        const outcome = establishFleetSessionCustody({fleetUrl: url, installImpl, target});

        await expect(outcome.verified).resolves.toBe(true);
        await expect(outcome.custodySettled).resolves.toBe(true);
        expect('bearerToken' in target.AgentOS.fleet).toBe(false)
    });

    test('resolveFleetUrl: the ?fleetUrl override wins, the pinned default otherwise', () => {
        const neoConfig = globalThis.Neo?.config;
        const priorUrl  = neoConfig?.url;

        globalThis.Neo        = globalThis.Neo || {};
        globalThis.Neo.config = globalThis.Neo.config || {};

        globalThis.Neo.config.url = {search: '?fleetUrl=https%3A%2F%2Ffleet.example.io%2Ffleet'};
        expect(resolveFleetUrl()).toBe('https://fleet.example.io/fleet');

        globalThis.Neo.config.url = {search: ''};
        expect(resolveFleetUrl()).toBe('http://127.0.0.1:8083/fleet');

        globalThis.Neo.config.url = priorUrl
    })
});
