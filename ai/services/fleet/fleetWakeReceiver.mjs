import {verifyWakeSignature} from '../../daemons/wake/receiver.mjs';

/**
 * @module ai/services/fleet/fleetWakeReceiver
 * @summary The composed fleet-server's signed wake receiver — the Shape-B listener a
 * no-checkout client cannot host, moved onto the plane.
 *
 * The producer is the Memory Core's `WebhookDeliveryService` (the signed Shape-B dispatcher):
 * it POSTs the digest body with the four `X-Neo-Wake-*` headers and an HMAC-SHA256 signature
 * over the EXACT body bytes, keyed by the per-subscription server-issued signing key. This
 * receiver mirrors the host receiver's admission contract (`ai/daemons/wake/receiver.mjs`) —
 * same headers, same shared {@link verifyWakeSignature}, and the same error vocabulary, which
 * is load-bearing: the dispatcher's manifest-lag tolerance keys on the literal
 * `unknown-subscription` error string (`WebhookDeliveryService#_isUnknownSubscriptionResponse`).
 *
 * **Admission is the signature, deliberately and exclusively.** The route mounts BEFORE the
 * fleet app's client-auth chain (AuthService admission, identity projection, JSON parser):
 * the wake dispatcher authenticates with the per-subscription signed-wake HMAC (its own
 * credential class in the fleet ledger), never a
 * provider bearer, and the signature over exact body bytes is a stronger statement than any
 * ambient property of the request. Reachability is never authentication, so the route stays
 * compose-internal AND signed: `/wake` is deliberately absent from
 * the ingress route table (`ai/deploy/Caddyfile*`).
 *
 * The raw body is read manually — a JSON body parser upstream would re-serialize and destroy
 * the exact bytes the HMAC covers.
 */

/**
 * @summary Reads the request body as a raw Buffer with a hard byte cap.
 * @param {Object} req Node `IncomingMessage`-shaped readable (headers + data/end events).
 * @param {Number} maxBodyBytes
 * @returns {Promise<Buffer>} Rejects with `{code: 'body-too-large'}` past the cap.
 * @private
 */
function readRawBody(req, maxBodyBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let   total  = 0;

        req.on('data', chunk => {
            total += chunk.length;

            if (total > maxBodyBytes) {
                reject(Object.assign(new Error('body too large'), {code: 'body-too-large'}));
                req.destroy();
                return
            }

            chunks.push(chunk)
        });

        req.on('end',   () => resolve(Buffer.concat(chunks)));
        req.on('error', reject)
    })
}

/**
 * @summary Creates the exact-route `POST /wake` handler for the composed fleet server.
 *
 * Admission ladder, in order and fail-closed: route known (`unknown-subscription`, 404 — the
 * exact string the dispatcher's manifest-lag tolerance recognises) → signature valid over the
 * exact raw bytes (`invalid-signature`, 401) → body parses (`invalid-json`, 400) → the digest
 * is handed to `onDigest` and acknowledged. The handler never throws into Express: every
 * outcome is a terminal JSON response.
 *
 * @param {Object} options
 * @param {Function} options.resolveRoute `(subscriptionId) => {signingKey, agentIdentity}|null` —
 *     the fan-out registry's in-memory route table (self-armed at boot; keys never persisted).
 * @param {Function} options.onDigest `({subscriptionId, agentIdentity, envelope}) => void` —
 *     receives one verified digest; delivery to streams is the fan-out's concern.
 * @param {Object} [options.logger=console]
 * @param {Number} [options.maxBodyBytes=262144] Digests are small; the cap bounds a hostile peer.
 * @returns {Function} Express-compatible `(req, res)` handler for the exact `POST /wake` route.
 */
export function createFleetWakeReceiver({resolveRoute, onDigest, logger = console, maxBodyBytes = 256 * 1024}) {
    if (typeof resolveRoute !== 'function' || typeof onDigest !== 'function') {
        throw new Error('createFleetWakeReceiver requires resolveRoute and onDigest functions')
    }

    return async function fleetWakeReceiver(req, res) {
        const
            subscriptionId = req.headers['x-neo-wake-subscription-id'],
            signature      = req.headers['x-neo-wake-signature'],
            route          = subscriptionId ? resolveRoute(subscriptionId) : null;

        if (!route) {
            res.status(404).json({error: 'unknown-subscription'});
            return
        }

        let rawBody;

        try {
            rawBody = await readRawBody(req, maxBodyBytes)
        } catch (error) {
            res.status(error?.code === 'body-too-large' ? 413 : 400).json({error: 'invalid-body'});
            return
        }

        if (!verifyWakeSignature(rawBody, route.signingKey, signature)) {
            res.status(401).json({error: 'invalid-signature'});
            return
        }

        let envelope;

        try {
            envelope = JSON.parse(rawBody.toString('utf8'))
        } catch {
            res.status(400).json({error: 'invalid-json'});
            return
        }

        try {
            onDigest({subscriptionId, agentIdentity: route.agentIdentity, envelope})
        } catch (error) {
            // Delivery-side faults are the receiver's to absorb, never the dispatcher's to
            // retry: the digest was authentically received, and derive-at-read (poll-digest)
            // makes any downstream loss recoverable on the next catch-up.
            logger.error?.(`[FleetWakeReceiver] onDigest failed for ${subscriptionId}`)
        }

        res.status(200).json({ok: true, state: 'accepted'})
    }
}
