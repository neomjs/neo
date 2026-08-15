import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'AgentOSShellRouteTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('AgentOS packaged Fleet window routing', () => {
    test('resolves from live membership on every call and uses the boot id only before registration', async () => {
        const {resolveFleetWindowId} = await import('../../../../../apps/agentos/app.mjs');
        const windows                = [
            {appName: 'AgentOS', id: 'popup'},
            {appName: 'AgentOS', id: 'primary'}
        ];

        expect(resolveFleetWindowId({apps: {popup: {}}, fallbackWindowId: 'popup', windows})).toBe('popup');

        windows.shift();
        expect(resolveFleetWindowId({apps: {popup: {}}, fallbackWindowId: 'popup', windows})).toBe('primary');

        windows.length = 0;
        expect(resolveFleetWindowId({apps: {popup: {}}, fallbackWindowId: 'popup', windows})).toBe('popup');
        expect(resolveFleetWindowId({apps: {}, fallbackWindowId: 'popup', windows})).toBeNull()
    })

    test('derives shell versus browser transport from the existing worker URL envelope', async () => {
        const {resolveFleetTransportMode} = await import('../../../../../apps/agentos/app.mjs');

        expect(resolveFleetTransportMode({href: 'app://neo-agentos/index.html', search: ''})).toBe('shell');
        expect(resolveFleetTransportMode({href: 'http://127.0.0.1:8080/apps/agentos/', search: '?fleetUrl=x'})).toBe('browser');
        expect(resolveFleetTransportMode({href: 'https://example.test/apps/agentos/', search: ''})).toBe('browser');
        expect(() => resolveFleetTransportMode({search: ''})).toThrow()
    })

    test.describe('session custody lifecycle — real bridge, stubbed wire; verification is the server answer, never the closure', () => {
        const
            bearer   = 'A'.repeat(43),
            rotated  = 'B'.repeat(43),
            fleetUrl = 'http://127.0.0.1:8083/fleet';

        let establishFleetSessionCustody, installFleetBridge, createFleetWireResponse, FLEET_WIRE_RESPONSE_STATES;

        const
            okViewerFetch = () => async () => ({
                json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {userId: 'operator'}})
            }),
            refusedFetch  = () => async () => ({
                json: async () => ({
                    ...createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.operationFailed),
                    error: 'fleet: unauthorized'
                })
            }),
            // The real installer with only the NETWORK stubbed — establish stays the true bridge
            // (proxy map, profileId stamping, closure custody), so these specs can falsify
            // authentication failure instead of certifying object construction.
            realInstall = fetchImpl => opts => installFleetBridge({...opts, fetchImpl});

        test.beforeAll(async () => {
            ({establishFleetSessionCustody} = await import('../../../../../apps/agentos/app.mjs'));
            ({installFleetBridge}           = await import('../../../../../apps/agentos/fleet/installFleetBridge.mjs'));
            ({createFleetWireResponse, FLEET_WIRE_RESPONSE_STATES} = await import('../../../../../apps/agentos/config/fleetWireMethods.mjs'))
        });

        test('verified retire: the authenticated whoami succeeds, then and only then the ingress clears', async () => {
            const target = {AgentOS: {fleet: {bearerToken: bearer}}};

            const {bridge, custodySettled} = establishFleetSessionCustody({
                bearerToken: bearer,
                fleetUrl,
                installImpl: realInstall(okViewerFetch()),
                target
            });

            expect(bridge.profileId).toBe(`fleet-profile:v1:${fleetUrl}`);
            expect(target.AgentOS.fleet.bearerToken, 'retire must NOT precede verification').toBe(bearer);

            await expect(custodySettled).resolves.toBe(true);
            expect('bearerToken' in target.AgentOS.fleet, 'verified custody means the slot is no longer residence').toBe(false);
            await expect(bridge.listAgents()).resolves.toEqual({userId: 'operator'})
        });

        test('a format-valid but REJECTED bearer preserves the ingress — rollback truth over optimism', async () => {
            const target = {AgentOS: {fleet: {bearerToken: bearer}}};

            const {custodySettled} = establishFleetSessionCustody({
                bearerToken: bearer,
                fleetUrl,
                installImpl: realInstall(refusedFetch()),
                target
            });

            await expect(custodySettled).resolves.toBe(false);
            expect(target.AgentOS.fleet.bearerToken).toBe(bearer)
        });

        test('an unreachable endpoint preserves the ingress', async () => {
            const target = {AgentOS: {fleet: {bearerToken: bearer}}};

            const {custodySettled} = establishFleetSessionCustody({
                bearerToken: bearer,
                fleetUrl,
                installImpl: realInstall(async () => { throw new Error('ECONNREFUSED') }),
                target
            });

            await expect(custodySettled).resolves.toBe(false);
            expect(target.AgentOS.fleet.bearerToken).toBe(bearer)
        });

        test('a value rotated in DURING verification survives the retire attempt — the CAS guard', async () => {
            let releaseVerify;

            const
                gate       = new Promise(resolve => { releaseVerify = resolve }),
                target     = {AgentOS: {fleet: {bearerToken: bearer}}},
                gatedFetch = async () => {
                    await gate;
                    return {json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {userId: 'operator'}})}
                };

            const {custodySettled} = establishFleetSessionCustody({
                bearerToken: bearer,
                fleetUrl,
                installImpl: realInstall(gatedFetch),
                target
            });

            target.AgentOS.fleet.bearerToken = rotated;
            releaseVerify();

            await expect(custodySettled).resolves.toBe(false);
            expect(target.AgentOS.fleet.bearerToken, 'the rotated credential never verified and must survive').toBe(rotated)
        });

        test('a redeemed bearer retires nothing when the slot holds a DIFFERENT value', async () => {
            const target = {AgentOS: {fleet: {bearerToken: rotated}}};

            const {custodySettled} = establishFleetSessionCustody({
                bearerToken: bearer, // established + verified, but never the slot's value
                fleetUrl,
                installImpl: realInstall(okViewerFetch()),
                target
            });

            await expect(custodySettled).resolves.toBe(false);
            expect(target.AgentOS.fleet.bearerToken).toBe(rotated)
        });

        test('second SharedWorker start never downgrades: the live bridge survives a bearer-less re-join', async () => {
            const target = {AgentOS: {fleet: {bearerToken: bearer}}};

            const first = establishFleetSessionCustody({
                bearerToken: bearer,
                fleetUrl,
                installImpl: realInstall(okViewerFetch()),
                target
            });

            await expect(first.custodySettled).resolves.toBe(true);

            // The slot is retired now; a second joining window arrives with nothing to offer.
            const second = establishFleetSessionCustody({
                bearerToken: null,
                fleetUrl,
                installImpl: realInstall(okViewerFetch()),
                target
            });

            expect(second.bridge, 'the established capability must be preserved, not overwritten').toBe(first.bridge);
            expect(target.AgentOS.fleet.registryBridge).toBe(first.bridge);
            await expect(second.custodySettled).resolves.toBe(false);
            await expect(second.bridge.listAgents(), 'the surviving bridge still answers authenticated calls').resolves.toEqual({userId: 'operator'})
        });

        test('the composed rotation→failed-retry sequence: the rejected candidate never displaces the verified bridge', async () => {
            let releaseVerify;

            const
                gate       = new Promise(resolve => { releaseVerify = resolve }),
                target     = {AgentOS: {fleet: {bearerToken: bearer}}},
                gatedFetch = async () => {
                    await gate;
                    return {json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {userId: 'operator'}})}
                };

            // Bearer A establishes (first custody — published) and verifies while B rotates in.
            const first = establishFleetSessionCustody({bearerToken: bearer, fleetUrl, installImpl: realInstall(gatedFetch), target});

            target.AgentOS.fleet.bearerToken = rotated;
            releaseVerify();

            await expect(first.custodySettled, 'CAS preserves the rotated value').resolves.toBe(false);
            expect(target.AgentOS.fleet.bearerToken).toBe(rotated);

            // The next SharedWorker pass retries with B; the server rejects it. The candidate is
            // built DETACHED, so the known-good A bridge must remain published throughout.
            const second = establishFleetSessionCustody({bearerToken: rotated, fleetUrl, installImpl: realInstall(refusedFetch()), target});

            expect(target.AgentOS.fleet.registryBridge, 'an unproven candidate must never be published').toBe(first.bridge);
            expect(second.bridge, 'the caller sees the bridge that is actually live').toBe(first.bridge);

            await expect(second.custodySettled).resolves.toBe(false);
            expect(target.AgentOS.fleet.registryBridge, 'the known-good bridge survives the failed retry').toBe(first.bridge);
            expect(target.AgentOS.fleet.bearerToken, 'the rotated ingress also survives — both rollback truths hold').toBe(rotated);
            await expect(target.AgentOS.fleet.registryBridge.listAgents(), 'the surviving bridge still answers').resolves.toEqual({userId: 'operator'})
        });

        test('a candidate that VERIFIES is promoted: the published bridge switches only after proof', async () => {
            const
                bearersSeen   = [],
                recordedFetch = async (url, init) => {
                    bearersSeen.push(init.headers.Authorization);
                    return {json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {userId: 'operator'}})}
                },
                target = {AgentOS: {fleet: {bearerToken: bearer}}};

            const first = establishFleetSessionCustody({bearerToken: bearer, fleetUrl, installImpl: realInstall(recordedFetch), target});

            await expect(first.custodySettled).resolves.toBe(true);

            // A rotated-in credential that the server ACCEPTS: detached until proven, then promoted.
            target.AgentOS.fleet.bearerToken = rotated;

            const second = establishFleetSessionCustody({bearerToken: rotated, fleetUrl, installImpl: realInstall(recordedFetch), target});

            expect(target.AgentOS.fleet.registryBridge, 'no displacement before proof').toBe(first.bridge);
            await expect(second.custodySettled).resolves.toBe(true);
            expect(target.AgentOS.fleet.registryBridge, 'proof promotes the candidate').not.toBe(first.bridge);
            expect('bearerToken' in target.AgentOS.fleet, 'the verified rotation retires its own ingress copy').toBe(false);

            await expect(target.AgentOS.fleet.registryBridge.listAgents()).resolves.toEqual({userId: 'operator'});
            expect(bearersSeen.at(-1), 'the promoted bridge dials with the NEW credential').toBe(`Bearer ${rotated}`)
        });

        test('handshake-unavailable twice: the first fail-closed bridge is retained, never re-created', async () => {
            const target = {};

            const first  = establishFleetSessionCustody({fleetUrl, installImpl: realInstall(okViewerFetch()), target});
            const second = establishFleetSessionCustody({fleetUrl, installImpl: realInstall(okViewerFetch()), target});

            expect(second.bridge).toBe(first.bridge);
            await expect(first.custodySettled).resolves.toBe(false);
            await expect(second.custodySettled).resolves.toBe(false);
            await expect(first.bridge.listAgents()).rejects.toThrow(/fleet bearer not injected/)
        });

        test('the class-3 MC mint rides establish into BOTH install sites — first custody and the promote', async () => {
            const
                mcMint = 'C'.repeat(43),
                seen   = [],
                target = {};

            // arg-plumbing pin: the mint reaches the installer alongside the bearer, never a slot
            const first = establishFleetSessionCustody({
                bearerToken    : bearer,
                fleetUrl,
                mcAuthorization: mcMint,
                installImpl    : opts => { seen.push(opts.mcAuthorization); return installFleetBridge({...opts, fetchImpl: okViewerFetch()}) },
                target
            });

            await expect(first.custodySettled).resolves.toBe(false); // no slot to retire
            expect(seen).toEqual([mcMint]);

            // the promote install carries it too
            const second = establishFleetSessionCustody({
                bearerToken    : rotated,
                fleetUrl,
                mcAuthorization: mcMint,
                installImpl    : opts => { seen.push(opts.mcAuthorization); return installFleetBridge({...opts, fetchImpl: okViewerFetch()}) },
                target
            });

            await expect(second.custodySettled).resolves.toBe(false); // slot empty — CAS retires nothing
            expect(seen).toEqual([mcMint, mcMint, mcMint]) // candidate + promote
        });

        test('a throwing install preserves the ingress — the rollback needs no special path', async () => {
            const target = {AgentOS: {fleet: {bearerToken: 'not-a-canonical-bearer'}}};

            expect(() => establishFleetSessionCustody({
                bearerToken: 'not-a-canonical-bearer',
                fleetUrl,
                installImpl: realInstall(okViewerFetch()),
                target
            })).toThrow(/canonical 32-byte/);
            expect(target.AgentOS.fleet.bearerToken).toBe('not-a-canonical-bearer')
        })
    })
});
