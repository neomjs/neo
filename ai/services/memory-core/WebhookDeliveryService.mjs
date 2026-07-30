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
            // Updating the subscription's harnessTarget to 'degraded'
            const subscriptionNode = GraphService.getNode({id: subscriptionId});
            if (subscriptionNode) {
                const properties = {
                    ...(subscriptionNode.properties || {}),
                    harnessTarget: 'degraded'
                };

                GraphService.upsertNode({
                    ...subscriptionNode,
                    properties
                });
                logger.info(`WebhookDeliveryService: Subscription ${subscriptionId} marked as degraded.`);
            } else {
                logger.warn(`WebhookDeliveryService: Cannot degrade ${subscriptionId}, node not found in Graph.`);
            }
        } catch (error) {
            logger.error(`WebhookDeliveryService: Failed to mark subscription ${subscriptionId} degraded: ${error.message}`);
        }
    }
}

export default Neo.setupClass(WebhookDeliveryService);
