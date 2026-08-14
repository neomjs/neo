import {setup} from '../../../../setup.mjs';

const appName = 'FleetWakeReceiverTest';

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

import {test, expect} from '@playwright/test';
import crypto         from 'node:crypto';
import {EventEmitter} from 'node:events';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {createFleetWakeReceiver} from '../../../../../../ai/services/fleet/fleetWakeReceiver.mjs';

const SIGNING_KEY = crypto.randomBytes(32).toString('hex');

/**
 * Drives the handler exactly like Express does: headers on the request object, the raw body
 * arriving as stream events after the handler attached its listeners.
 */
function invoke(handler, {headers = {}, bodyChunks = []} = {}) {
    const req = new EventEmitter();

    req.headers = headers;
    req.destroy = () => {};

    const res = {
        statusCode: null,
        body      : null,
        status(code) {
            this.statusCode = code;
            return this
        },
        json(payload) {
            this.body = payload;
            this._resolve?.()
        }
    };

    const done = new Promise(resolve => {
        res._resolve = resolve
    });

    const invocation = handler(req, res);

    queueMicrotask(() => {
        for (const chunk of bodyChunks) {
            req.emit('data', Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }

        req.emit('end')
    });

    return Promise.all([invocation, done]).then(() => res)
}

function sign(bodyString, key = SIGNING_KEY) {
    return crypto.createHmac('sha256', key).update(Buffer.from(bodyString)).digest('hex')
}

function createHandler({onDigest = () => {}, route = {signingKey: SIGNING_KEY, agentIdentity: '@viewer'}} = {}) {
    return createFleetWakeReceiver({
        resolveRoute: id => (id === 'WAKE_SUB:known' ? route : null),
        onDigest,
        logger      : {error: () => {}}
    })
}

test.describe('fleetWakeReceiver - signed wake admission for the composed fleet server', () => {
    test('an unknown subscription answers the exact vocabulary the dispatcher tolerance keys on', async () => {
        const res = await invoke(createHandler(), {
            headers   : {'x-neo-wake-subscription-id': 'WAKE_SUB:stranger'},
            bodyChunks: ['{}']
        });

        expect(res.statusCode).toBe(404);
        // The literal string is load-bearing: WebhookDeliveryService#_isUnknownSubscriptionResponse
        // grants its manifest-lag tolerance ONLY on this exact error value.
        expect(res.body).toEqual({error: 'unknown-subscription'})
    });

    test('a missing subscription header is indistinguishable from an unknown route', async () => {
        const res = await invoke(createHandler(), {headers: {}, bodyChunks: ['{}']});

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({error: 'unknown-subscription'})
    });

    test('a wrong signature is refused before the body is ever parsed', async () => {
        let digests = 0;

        const res = await invoke(createHandler({onDigest: () => digests++}), {
            headers: {
                'x-neo-wake-subscription-id': 'WAKE_SUB:known',
                'x-neo-wake-signature'      : sign('{"other":"bytes"}')
            },
            bodyChunks: ['{"digest":"hello"}']
        });

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({error: 'invalid-signature'});
        expect(digests).toBe(0)
    });

    test('a valid signature over the exact bytes admits the digest and hands it over verbatim', async () => {
        const
            received = [],
            body     = JSON.stringify({subscriptionId: 'WAKE_SUB:known', digest: 'wake up'});

        const res = await invoke(createHandler({onDigest: digest => received.push(digest)}), {
            headers: {
                'x-neo-wake-subscription-id': 'WAKE_SUB:known',
                'x-neo-wake-signature'      : sign(body)
            },
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ok: true, state: 'accepted'});
        expect(received).toEqual([{
            subscriptionId: 'WAKE_SUB:known',
            agentIdentity : '@viewer',
            envelope      : {subscriptionId: 'WAKE_SUB:known', digest: 'wake up'}
        }])
    });

    test('the signature must cover the exact raw bytes — a chunk-identical rewrite fails', async () => {
        // Same JSON semantics, different bytes (whitespace) — the HMAC is over bytes, not meaning.
        const res = await invoke(createHandler(), {
            headers: {
                'x-neo-wake-subscription-id': 'WAKE_SUB:known',
                'x-neo-wake-signature'      : sign('{"digest":"x"}')
            },
            bodyChunks: ['{ "digest": "x" }']
        });

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({error: 'invalid-signature'})
    });

    test('an authentically signed but unparsable body is invalid-json, never accepted', async () => {
        const body = 'not json at all';

        const res = await invoke(createHandler(), {
            headers: {
                'x-neo-wake-subscription-id': 'WAKE_SUB:known',
                'x-neo-wake-signature'      : sign(body)
            },
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({error: 'invalid-json'})
    });

    test('a delivery-side fault is absorbed: the dispatcher must never be told to retry it', async () => {
        const body = JSON.stringify({digest: 'boom'});

        const res = await invoke(createHandler({onDigest: () => {
            throw new Error('downstream fan-out fault')
        }}), {
            headers: {
                'x-neo-wake-subscription-id': 'WAKE_SUB:known',
                'x-neo-wake-signature'      : sign(body)
            },
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ok: true, state: 'accepted'})
    })
});
