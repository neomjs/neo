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

const
    SIGNING_KEY = crypto.randomBytes(32).toString('hex'),
    ROUTE       = {signingKey: SIGNING_KEY, agentIdentity: '@viewer'};

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

/** A fully route-bound envelope; overrides produce the mismatch negatives. */
function envelope(overrides = {}) {
    return {
        eventId       : 'EVT:1',
        subscriptionId: 'WAKE_SUB:known',
        agentIdentity : '@viewer',
        eventType     : 'wake/digest',
        schemaVersion : '1.0',
        payload       : {digest: 'wake up'},
        ...overrides
    }
}

/** Headers agreeing with {@link envelope}; overrides produce header-disagreement negatives. */
function boundHeaders(bodyString, overrides = {}) {
    return {
        'x-neo-wake-subscription-id': 'WAKE_SUB:known',
        'x-neo-wake-event-id'       : 'EVT:1',
        'x-neo-wake-schema-version' : '1.0',
        'x-neo-wake-signature'      : sign(bodyString),
        ...overrides
    }
}

function createHandler({onDigest = () => {}, route = ROUTE} = {}) {
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

        const body = JSON.stringify(envelope());

        const res = await invoke(createHandler({onDigest: () => digests++}), {
            headers   : boundHeaders(body, {'x-neo-wake-signature': sign('{"other":"bytes"}')}),
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({error: 'invalid-signature'});
        expect(digests).toBe(0)
    });

    test('a fully route-bound signed envelope is admitted and handed over verbatim', async () => {
        const
            received = [],
            body     = JSON.stringify(envelope());

        const res = await invoke(createHandler({onDigest: digest => received.push(digest)}), {
            headers   : boundHeaders(body),
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ok: true, state: 'accepted'});
        expect(received).toEqual([{
            subscriptionId: 'WAKE_SUB:known',
            agentIdentity : '@viewer',
            envelope      : envelope()
        }])
    });

    test('the signature must cover the exact raw bytes — a chunk-identical rewrite fails', async () => {
        const body = JSON.stringify(envelope());

        const res = await invoke(createHandler(), {
            headers   : boundHeaders(body),
            bodyChunks: [` ${body}`]
        });

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({error: 'invalid-signature'})
    });

    test('an authentically signed but unparsable body is invalid-json, never accepted', async () => {
        const body = 'not json at all';

        const res = await invoke(createHandler(), {
            headers   : boundHeaders(body),
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({error: 'invalid-json'})
    });

    for (const [label, mutate] of [
        ['a foreign owner identity',     {agentIdentity: '@someone-else'}],
        ['a relabeled subscription id',  {subscriptionId: 'WAKE_SUB:other'}],
        ['an unknown event type',        {eventType: 'wake/other'}],
        ['an unknown schema version',    {schemaVersion: '2.0'}]
    ]) {
        test(`signed-route-mismatch: an authentic signature over ${label} delivers nothing`, async () => {
            let digests = 0;

            const body = JSON.stringify(envelope(mutate));

            const res = await invoke(createHandler({onDigest: () => digests++}), {
                headers   : boundHeaders(body),
                bodyChunks: [body]
            });

            expect(res.statusCode).toBe(409);
            expect(res.body).toEqual({error: 'signed-route-mismatch'});
            expect(digests).toBe(0)
        })
    }

    test('signed-route-mismatch: header/envelope disagreement on the event id delivers nothing', async () => {
        let digests = 0;

        const body = JSON.stringify(envelope());

        const res = await invoke(createHandler({onDigest: () => digests++}), {
            headers   : boundHeaders(body, {'x-neo-wake-event-id': 'EVT:2'}),
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({error: 'signed-route-mismatch'});
        expect(digests).toBe(0)
    });

    test('a delivery-side fault is absorbed: the dispatcher must never be told to retry it', async () => {
        const body = JSON.stringify(envelope());

        const res = await invoke(createHandler({onDigest: () => {
            throw new Error('downstream fan-out fault')
        }}), {
            headers   : boundHeaders(body),
            bodyChunks: [body]
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ok: true, state: 'accepted'})
    })
});
