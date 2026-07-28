import {normalizeAgentIdentityNodeId} from '../../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @module ai/services/memory-core/helpers/mailboxReadStateClassifier
 * @summary Shared mailbox identity comparison and pure carrier-aware read-state classification.
 *
 * Direct messages persist `readAt` on the `MESSAGE` node, while receipt-backed broadcasts
 * persist it on the recipient's `DELIVERED_TO` edge. This helper accepts already-read raw graph
 * rows and returns the stable observation envelope shared by the explicit-path CLI and the live
 * Memory Core diagnostic. It performs no I/O, repair, configuration lookup, or mutation.
 *
 * The exported identity normalizer also feeds `MailboxService`'s production authorization,
 * visibility, retraction, and Task-transition comparisons. It is therefore not a diagnostic-only
 * primitive: changing its equivalence rules changes both the observation path and mailbox authority.
 */

/**
 * @summary Creates a stable failed-execution result for invalid inputs or an unavailable adapter.
 * @param {'input-error'|'open-error'} state Failure class.
 * @param {String} error Operator-facing failure detail.
 * @param {Object} [context] Validated identifiers available at the failure boundary.
 * @returns {Object}
 */
export function createMailboxReadStateFailure(state, error, context={}) {
    return {
        ok: false,
        state,
        ...context,
        error
    }
}

/**
 * @summary Canonicalizes mailbox identities for diagnostic routing and production authorization.
 *
 * Direct `AGENT:<identity>` wrappers remain comparison-compatible, while persisted
 * `AGENT:<family>/<model>` aliases stay untouched because roster-based alias resolution belongs to
 * send-time validation. Direct values without an address-kind colon and legacy
 * `AGENT:<identity>` wrappers flow through `normalizeAgentIdentityNodeId`, which trims whitespace
 * and collapses any run of leading `@` characters.
 *
 * `MailboxService.sameMailboxIdentity()` normalizes both operands through this function before
 * send-policy, inbox-visibility, sender-retraction, and A2A Task authority decisions. Do not broaden
 * or narrow these rules for diagnostic convenience without preserving those production consumers.
 *
 * @param {*} identity Stored edge target or request-bound identity.
 * @returns {*} Canonical direct identity or unchanged non-direct mailbox address.
 */
export function normalizeMailboxIdentityForComparison(identity) {
    if (typeof identity !== 'string') return identity;
    if (identity.startsWith('AGENT:') && identity.includes('/')) return identity;
    if (identity === 'AGENT:*') return identity;
    if (identity.startsWith('AGENT:')) return normalizeAgentIdentityNodeId(identity.slice('AGENT:'.length));
    if (!identity.includes(':')) return normalizeAgentIdentityNodeId(identity);
    return identity
}

/**
 * @summary Validates and canonicalizes the message-scoped portion of a read-state request.
 * @param {Object} options
 * @param {String} options.messageId MESSAGE node id.
 * @param {String} options.recipient Direct recipient identity.
 * @returns {{messageId:String,recipient:String}}
 * @throws {Error} For invalid message or recipient identifiers.
 */
export function validateMailboxReadStateRequest({messageId, recipient}={}) {
    if (typeof messageId !== 'string' || !/^MESSAGE:[^\s]+$/.test(messageId)) {
        throw new Error('messageId must use the MESSAGE:<id> graph-node form.');
    }
    if (typeof recipient !== 'string' || !recipient.trim()) {
        throw new Error('recipient must be a non-empty direct agent identity.');
    }

    const canonicalRecipient = normalizeAgentIdentityNodeId(recipient);
    if (
        typeof canonicalRecipient !== 'string' ||
        !canonicalRecipient.startsWith('@') ||
        canonicalRecipient === '@' ||
        canonicalRecipient.includes(':')
    ) {
        throw new Error('recipient must be a direct agent identity, not a role, human, or broadcast address.');
    }

    return {messageId, recipient: canonicalRecipient}
}

/**
 * @summary Creates a stable completed-inspection result, including anomaly observations.
 * @param {Object} context Common inspection identifiers.
 * @param {String} state Observed storage state.
 * @param {Object} [details] Route, carrier, or anomaly detail.
 * @returns {Object}
 * @private
 */
function observation(context, state, details={}) {
    return {
        ok: true,
        state,
        ...context,
        ...details
    }
}

/**
 * @summary Parses one persisted graph JSON record and classifies malformed or column-conflicting data.
 * @param {Object} row Raw SQLite row.
 * @param {'node'|'edge'} kind Graph record kind.
 * @returns {Object} Parsed record or a classified storage error.
 * @private
 */
function parseGraphRecord(row, kind) {
    let record;

    try {
        record = JSON.parse(row.data);
    } catch (error) {
        return {
            errorState: 'malformed-storage',
            error     : `${kind} row ${row.id} contains malformed JSON: ${error.message}`
        }
    }

    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return {
            errorState: 'malformed-storage',
            error     : `${kind} row ${row.id} data must be a JSON object.`
        }
    }

    if (record.id !== row.id) {
        return {
            errorState: 'conflicting-storage',
            error     : `${kind} row ${row.id} disagrees with data.id ${String(record.id)}.`
        }
    }

    if (kind === 'edge') {
        for (const field of ['source', 'target', 'type']) {
            if (record[field] !== row[field]) {
                return {
                    errorState: 'conflicting-storage',
                    error     : `edge row ${row.id} column ${field}=${String(row[field])} disagrees with data.${field}=${String(record[field])}.`
                }
            }
        }
    }

    return {record}
}

/**
 * @summary Classifies a resolved carrier's `readAt` property without collapsing absence into null.
 * @param {Object} context Common inspection identifiers.
 * @param {'direct'|'broadcast'} route Resolved mailbox route.
 * @param {Object} carrier Machine-readable carrier identity.
 * @param {Object} properties Persisted carrier properties.
 * @returns {Object}
 * @private
 */
function classifyCarrierReadAt(context, route, carrier, properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
        return observation(context, 'malformed-storage', {
            route,
            carrier,
            error: `${carrier.kind} ${carrier.rowId} has no object-shaped properties payload.`
        })
    }

    if (!Object.hasOwn(properties, 'readAt')) {
        return observation(context, 'malformed-storage', {
            route,
            carrier,
            error: `${carrier.kind} ${carrier.rowId} is missing properties.readAt; absence is not an explicit unread receipt.`
        })
    }

    const {readAt} = properties;
    if (readAt === null) {
        return observation(context, 'unread', {
            route,
            carrier: {...carrier, readAt: null}
        })
    }

    if (typeof readAt !== 'string') {
        return observation(context, 'malformed-storage', {
            route,
            carrier: {...carrier, readAt},
            error  : `${carrier.kind} ${carrier.rowId} properties.readAt must be null or an ISO timestamp string.`
        })
    }

    let canonical;
    try {
        canonical = new Date(readAt).toISOString();
    } catch {
        canonical = null;
    }

    if (canonical !== readAt) {
        return observation(context, 'malformed-storage', {
            route,
            carrier: {...carrier, readAt},
            error  : `${carrier.kind} ${carrier.rowId} properties.readAt is not a canonical ISO timestamp.`
        })
    }

    return observation(context, 'read', {
        route,
        carrier: {...carrier, readAt}
    })
}

/**
 * @summary Classifies one recipient's read-state from already-read raw message and edge rows.
 *
 * The adapters own bounded reads and authorization; this function owns every carrier, identity,
 * malformed-record, and topology decision. `context` may add adapter provenance such as the CLI's
 * explicit `dbPath`, but cannot override the validated message or recipient identifiers.
 *
 * @param {Object} options
 * @param {String} options.messageId MESSAGE node id.
 * @param {String} options.recipient Affected direct recipient identity.
 * @param {Object[]} [options.messageRows=[]] Raw `Nodes` rows containing `id` and `data`.
 * @param {Object[]} [options.edgeRows=[]] Raw `Edges` rows containing canonical columns and `data`.
 * @param {Object} [options.context={}] Adapter-specific result context.
 * @returns {Object} Stable completed-inspection observation envelope.
 */
export function classifyMailboxReadState({
    messageId,
    recipient,
    messageRows=[],
    edgeRows=[],
    context={}
}={}) {
    const validated        = validateMailboxReadStateRequest({messageId, recipient}),
        observationContext = {...context, ...validated};

    if (messageRows.length === 0) {
        return observation(observationContext, 'message-missing', {
            route  : null,
            carrier: null
        })
    }
    if (messageRows.length !== 1) {
        return observation(observationContext, 'conflicting-storage', {
            route  : null,
            carrier: null,
            error  : `Expected one MESSAGE row for ${validated.messageId}; found ${messageRows.length}.`
        })
    }

    const messageParsed = parseGraphRecord(messageRows[0], 'node');
    if (messageParsed.errorState) {
        return observation(observationContext, messageParsed.errorState, {
            route  : null,
            carrier: null,
            error  : messageParsed.error
        })
    }

    const message = messageParsed.record;
    if (message.label !== 'MESSAGE') {
        return observation(observationContext, 'conflicting-storage', {
            route  : null,
            carrier: null,
            error  : `Node ${validated.messageId} is stored with label ${String(message.label)}, not MESSAGE.`
        })
    }

    const edges = [];
    for (const row of edgeRows) {
        const parsed = parseGraphRecord(row, 'edge');
        if (parsed.errorState) {
            return observation(observationContext, parsed.errorState, {
                route  : null,
                carrier: null,
                error  : parsed.error
            })
        }

        edges.push(parsed.record);
    }

    const
        sentTo       = edges.filter(edge => edge.type === 'SENT_TO'),
        deliveries   = edges.filter(edge => edge.type === 'DELIVERED_TO'),
        directRoutes = sentTo.filter(edge =>
            normalizeMailboxIdentityForComparison(edge.target) === validated.recipient),
        broadcastRoutes     = sentTo.filter(edge => edge.target === 'AGENT:*'),
        recipientDeliveries = deliveries.filter(edge =>
            normalizeMailboxIdentityForComparison(edge.target) === validated.recipient);

    if (
        directRoutes.length > 1 ||
        broadcastRoutes.length > 1 ||
        (directRoutes.length > 0 && broadcastRoutes.length > 0) ||
        sentTo.length > 1
    ) {
        return observation(observationContext, 'conflicting-storage', {
            route  : null,
            carrier: null,
            error  : `Message ${validated.messageId} has an ambiguous SENT_TO topology: ${sentTo.map(edge => edge.target).join(', ')}.`
        })
    }

    if (directRoutes.length === 1) {
        if (deliveries.length > 0) {
            return observation(observationContext, 'conflicting-storage', {
                route  : 'direct',
                carrier: null,
                error  : `Direct message ${validated.messageId} also has ${deliveries.length} DELIVERED_TO carrier(s).`
            })
        }

        return classifyCarrierReadAt(
            observationContext,
            'direct',
            {kind: 'MESSAGE', rowId: validated.messageId},
            message.properties
        )
    }

    if (broadcastRoutes.length === 1) {
        if (recipientDeliveries.length === 0) {
            return observation(observationContext, 'recipient-carrier-missing', {
                route  : 'broadcast',
                carrier: {
                    kind     : 'DELIVERED_TO',
                    rowId    : null,
                    recipient: validated.recipient
                }
            })
        }
        if (recipientDeliveries.length > 1) {
            return observation(observationContext, 'conflicting-storage', {
                route  : 'broadcast',
                carrier: null,
                error  : `Broadcast ${validated.messageId} has ${recipientDeliveries.length} DELIVERED_TO carriers for ${validated.recipient}.`
            })
        }

        const delivery = recipientDeliveries[0];
        return classifyCarrierReadAt(
            observationContext,
            'broadcast',
            {
                kind     : 'DELIVERED_TO',
                rowId    : delivery.id,
                recipient: validated.recipient
            },
            delivery.properties
        )
    }

    if (deliveries.length > 0) {
        return observation(observationContext, 'conflicting-storage', {
            route  : null,
            carrier: null,
            error  : `Message ${validated.messageId} has DELIVERED_TO carrier(s) but no SENT_TO broadcast route.`
        })
    }

    return observation(observationContext, 'recipient-carrier-missing', {
        route  : null,
        carrier: null
    })
}
