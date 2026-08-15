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

        test('handshake-unavailable twice: the first fail-closed bridge is retained, never re-created', async () => {
            const target = {};

            const first  = establishFleetSessionCustody({fleetUrl, installImpl: realInstall(okViewerFetch()), target});
            const second = establishFleetSessionCustody({fleetUrl, installImpl: realInstall(okViewerFetch()), target});

            expect(second.bridge).toBe(first.bridge);
            await expect(first.custodySettled).resolves.toBe(false);
            await expect(second.custodySettled).resolves.toBe(false);
            await expect(first.bridge.listAgents()).rejects.toThrow(/fleet bearer not injected/)
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
