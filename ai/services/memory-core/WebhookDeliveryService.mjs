import Base         from '../../../src/core/Base.mjs';
import crypto       from 'crypto';
import GraphService from './GraphService.mjs';
import logger       from '../../mcp/server/memory-core/logger.mjs';

/**
 * @summary Service for delivering wake events via A2A Webhook Push Notifications (Shape B).
 *
 * Implements Shape-B webhook delivery. It is responsible for POSTing the
 * MCP-aligned wake payload to the target URL,
 * applying HMAC-SHA256 signing, and handling exponential backoff and connection degradation.
 *
 * @class Neo.ai.services.memory-core.WebhookDeliveryService
 * @extends Neo.core.Base
 * @singleton
 */
class WebhookDeliveryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.WebhookDeliveryService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.WebhookDeliveryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Track consecutive failures per subscription for degradation
     * @member {Map} consecutiveFailures
     * @protected
     */
    consecutiveFailures = new Map();

    /**
     * Subscription ids degraded during this process lifetime. This is what BOUNDS the attempt count: a
     * degraded route is never attempted again, so a permanently dead endpoint costs the threshold's attempts
     * once, not a full retry cycle on every message forever. The persisted
     * `properties.status` is the durable half and survives restarts; this covers the window before the
     * caller re-reads the node. {@link WebhookDeliveryService#clearDegraded} is the named resumption path.
     * @member {Set} degradedSubscriptions
     * @protected
     */
    degradedSubscriptions = new Set();

    /**
     * Per-request timeout injected by the Memory Core entrypoint from
     * `AiConfig.orchestrator.wakeDispatch.attemptTimeoutSeconds`.
     * @member {Number|null}
     * @protected
     */
    attemptTimeoutMs = null

    /**
     * @summary Injects the canonical webhook-attempt timeout at the Memory Core composition root.
     * @param {Object} options
     * @param {Number} options.attemptTimeoutSeconds
     */
    configure({attemptTimeoutSeconds} = {}) {
        if (!Number.isFinite(attemptTimeoutSeconds) || attemptTimeoutSeconds <= 0) {
            throw new Error("WebhookDeliveryService.configure requires positive finite 'attemptTimeoutSeconds'");
        }

        this.attemptTimeoutMs = attemptTimeoutSeconds * 1000;
    }

    /**
     * Delivers an event to a webhook with exponential backoff and HMAC-SHA256 signing.
     * @param {Object} subscription The WAKE_SUBSCRIPTION object
     * @param {Object} eventData The payload matching the MCP notification `data` field schema
     * @returns {Promise<'delivered'|'skipped'|'failed'>}
     */
    async deliver(subscription, eventData) {
        const properties = subscription.properties || {};
        const url        = properties.harnessTargetMetadata?.url;
        const signingKey = properties.harnessTargetMetadata?.signingKey;

        // A degraded route is dead until explicitly repaired, so it is not attempted at all. Without this the
        // failure threshold only decides when to START logging: `_recordConsecutiveFailure` kept counting past
        // it and re-fired the degrade on every subsequent message, each preceded by a full 4-attempt backoff
        // cycle. The persisted status is authoritative across restarts; the in-memory set covers
        // the window before the caller re-reads the node.
        if (properties.status === 'degraded' || this.degradedSubscriptions.has(subscription.id)) {
            logger.warn(`WebhookDeliveryService: Subscription ${subscription.id} is degraded; skipping delivery without an attempt.`);
            return 'skipped';
        }

        if (!url) {
            logger.error(`WebhookDeliveryService: Subscription ${subscription.id} is missing URL.`);
            return 'skipped';
        }
        if (!signingKey) {
            logger.error(`WebhookDeliveryService: Subscription ${subscription.id} is missing signing key; refusing unsigned Shape-B delivery.`);
            return 'skipped';
        }
        if (!Number.isFinite(this.attemptTimeoutMs)) {
            throw new Error('WebhookDeliveryService is not configured by the Memory Core entrypoint');
        }

        const bodyString = JSON.stringify(eventData);
        const headers    = {
            'Content-Type'              : 'application/json',
            'X-Neo-Wake-Event-Id'       : eventData.eventId,
            'X-Neo-Wake-Subscription-Id': subscription.id,
            'X-Neo-Wake-Schema-Version' : eventData.schemaVersion || '1.0'
        };

        headers['X-Neo-Wake-Signature'] = this._generateSignature(bodyString, signingKey);

        const maxRetries = 3;
        let   attempt    = 0;
        let   backoff    = 1000; // 1s -> 2s -> 4s

        while (attempt <= maxRetries) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body  : bodyString,
                    signal: AbortSignal.timeout(this.attemptTimeoutMs)
                });

                if (response.ok) { // 2xx
                    // Success, reset consecutive failures
                    this.consecutiveFailures.set(subscription.id, 0);
                    logger.info(`WebhookDeliveryService: Successfully delivered event ${eventData.eventId} to ${subscription.id}`);
                    return 'delivered';
                }

                if (response.status >= 400 && response.status < 500) {
                    // 4xx: client error, no retry, mark degraded immediately
                    logger.warn(`WebhookDeliveryService: Client error ${response.status} delivering to ${subscription.id}. Marking degraded.`);
                    await this._markDegraded(subscription.id);
                    return 'skipped';
                }

                // 5xx: network error / server error, retry
                logger.warn(`WebhookDeliveryService: Server error ${response.status} delivering to ${subscription.id}. Attempt ${attempt + 1}/${maxRetries + 1}`);
            } catch (error) {
                // Network error, retry
                logger.error(`WebhookDeliveryService: Network error delivering to ${subscription.id}: ${error.message}. Attempt ${attempt + 1}/${maxRetries + 1}`);
            }

            attempt++;
            if (attempt <= maxRetries) {
                await new Promise(resolve => setTimeout(resolve, backoff));
                backoff *= 2;
            }
        }

        // Exhausted retries
        await this._recordConsecutiveFailure(subscription.id);
        return 'failed';
    }

    _generateSignature(bodyString, signingKey) {
        return crypto
            .createHmac('sha256', signingKey)
            .update(bodyString)
            .digest('hex');
    }

    async _recordConsecutiveFailure(subscriptionId) {
        const failures = (this.consecutiveFailures.get(subscriptionId) || 0) + 1;
        this.consecutiveFailures.set(subscriptionId, failures);

        if (failures >= 3) {
            logger.warn(`WebhookDeliveryService: 3 consecutive failures for ${subscriptionId}. Marking degraded.`);
            await this._markDegraded(subscriptionId);
        }
    }

    async _markDegraded(subscriptionId) {
        try {
            // Context-free read. This runs from a background delivery flush with no bound request, where an
            // RLS-scoped read (`GraphService.getNode`) resolves a null requester, fails every visibility
            // branch, and returns null for a node that plainly exists — the degrade was then skipped and the
            // route stayed live forever.
            const record = GraphService.getUnscopedNodeRecord({
                id    : subscriptionId,
                writer: 'WebhookDeliveryService._markDegraded'
            });

            if (!record) {
                // ERROR, not WARN: a route that silently fails to change state is the condition that kept
                // this invisible. The only signal was a WARN in a file nobody tails.
                logger.error(`WebhookDeliveryService: Cannot degrade ${subscriptionId}, node not found in Graph.`);
                return;
            }

            // Degradation is a `status` value, never a `harnessTarget` value. `harnessTarget` is the ROUTING
            // field, and its documented value space (`mcp-notifications | a2a-webhook | bridge-daemon |
            // disabled | none`) has no `degraded` member. Both consumers of degradation read
            // `properties.status`: the sunset check (`ai/scripts/lifecycle/checkSunsetted.mjs`) and the
            // heartbeat push exclusion (`SwarmHeartbeatService`). Writing 'degraded' into `harnessTarget` left
            // BOTH blind — the sunset check still classified the dead route as active and heartbeats kept
            // being pushed at it — while corrupting routing into CoalescingEngineService's unknown-target
            // drop branch. `upsertNode` merges onto the stored properties, so this touches `status` only.
            GraphService.upsertNode({
                id        : subscriptionId,
                properties: {status: 'degraded'}
            });

            this.degradedSubscriptions.add(subscriptionId);
            logger.info(`WebhookDeliveryService: Subscription ${subscriptionId} marked as degraded.`);
        } catch (error) {
            logger.error(`WebhookDeliveryService: Failed to mark subscription ${subscriptionId} degraded: ${error.message}`);
        }
    }

    /**
     * @summary Clears the IN-MEMORY degraded markers only — the restorer must also move the node's
     * persisted `properties.status` off `'degraded'`, or the route stays skipped.
     *
     * This is half of a two-phase contract, not a self-sufficient resumption. The delivery skip reads
     * BOTH truths — the flush's fresh `properties.status` and this process-local set — so calling this
     * alone resumes nothing: the next flush re-reads a status that still says degraded.
     *
     * Degradation is terminal by design (a degraded route is never probed again, which is what bounds the
     * attempt count), so coming back is an explicit operator act rather than anything the delivery path
     * does on its own. `WakeSubscriptionService.resume` is the operator-reachable action that performs
     * both phases as one step; prefer it over calling this directly.
     * @param {String} subscriptionId
     */
    clearDegraded(subscriptionId) {
        this.degradedSubscriptions.delete(subscriptionId);
        this.consecutiveFailures.delete(subscriptionId);
    }
}

export default Neo.setupClass(WebhookDeliveryService);
