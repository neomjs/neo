import {setup} from '../../../../setup.mjs';

const appName = 'FleetBridgeServerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import {startFleetBridgeServer} from '../../../../../../ai/services/fleet/fleetBridgeServer.mjs';

// fleetBridgeServer is the Node HTTP end of the dev-server app<->fleet transport. Each test starts it
// on an ephemeral port (0) with a recording stub dispatch, so the assertions are on the HTTP glue —
// routing, body parsing, CORS, the fail-closed error paths — not on dispatchFleetRequest (unit-tested
// separately). No real registry / process is ever touched.

test.describe('fleetBridgeServer — the Node HTTP end of the dev-server app<->fleet transport', () => {
    let server, url, seen;

    test.beforeEach(async () => {
        seen   = [];
        server = await startFleetBridgeServer({port: 0, dispatch: async req => { seen.push(req); return {ok: true, result: {echoed: req}}; }});
        url    = `http://127.0.0.1:${server.address().port}`
    });

    test.afterEach(async () => {
        await new Promise(resolve => server.close(resolve))
    });

    test('POST /fleet routes the body through dispatch + returns its envelope', async () => {
        const res = await fetch(`${url}/fleet`, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify({method: 'listAgents'})
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ok: true, result: {echoed: {method: 'listAgents'}}});
        expect(seen).toEqual([{method: 'listAgents'}])
    });

    test('a non-/fleet path 404s with a fail-closed envelope, never reaching dispatch', async () => {
        const res = await fetch(`${url}/nope`, {method: 'GET'});

        expect(res.status).toBe(404);
        expect((await res.json()).ok).toBe(false);
        expect(seen).toEqual([])
    });

    test('a sibling path (POST /fleetx) fails closed — exact /fleet match only, never reaching dispatch', async () => {
        const res = await fetch(`${url}/fleetx`, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify({method: 'listAgents'})
        });

        expect(res.status).toBe(404);
        expect((await res.json()).ok).toBe(false);
        expect(seen).toEqual([])
    });

    test('an invalid JSON body 400s without touching dispatch', async () => {
        const res = await fetch(`${url}/fleet`, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : 'not json{'
        });

        expect(res.status).toBe(400);
        expect((await res.json()).ok).toBe(false);
        expect(seen).toEqual([])
    });

    test('OPTIONS preflight returns 204 with an open CORS origin', async () => {
        const res = await fetch(`${url}/fleet`, {method: 'OPTIONS'});

        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
    });
});
