import Base from '../../../src/core/Base.mjs';
import aiConfig from '../../mcp/server/memory-core/config.mjs';
import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';
import GraphService from './GraphService.mjs';
import PermissionService from './PermissionService.mjs';
import WakeSubscriptionService from './WakeSubscriptionService.mjs';
import crypto from 'crypto';
import SemanticGraphExtractor from '../../daemons/services/SemanticGraphExtractor.mjs';

/**
 * Normalizes a raw addressing target into its canonical Graph Node ID format.
 * Enforces the unified identity substrate where `@<login>` is canonical for all identities.
 * The two recognized recipient-field aliases are `@me` (Future-Self Routing) and `AGENT:*` (system-wide broadcast).
 * Safely strips legacy `AGENT:` prefixes and redundant `@@` prefixes.
 *
 * @param {String} to The raw `to` address as supplied by the caller.
 * @param {String} [sentBy] The canonical sender identity (from `RequestContextService.getAgentIdentityNodeId()`).
 *                           Required only when resolving the `@me` alias; ignored for all other inputs.
 * @returns {String} The canonical address ready for `linkNodes` and permission-check consumption.
 * @private
 */
function normalizeMailboxTarget(to, sentBy) {
    if (!to) return to;
    if (to === '@me' && sentBy) return sentBy;
    if (to === 'AGENT:*') return to;                                    // sentinel preserved
    if (to.startsWith('AGENT:')) {
        to = to.slice('AGENT:'.length);
        if (!to.startsWith('@')) return '@' + to;
        return to;
    }
    if (to.startsWith('@@')) return to.slice(1);                        // strip accidental double-@
    if (!to.startsWith('@') && !to.includes(':')) return '@' + to;      // prepend missing @ on bare names
    return to;
}

function getRecordField(record, field) {
    return record?.isRecord ? record.get(field) : record?.[field];
}

function getRecordProperties(record) {
    return getRecordField(record, 'properties') || {};
}

function setRecordProperties(record, properties) {
    if (record?.isRecord) {
        record.set('properties', properties);
    } else if (record) {
        record.properties = properties;
    }
}

/**
 * @summary Returns the current broadcast delivery audience for a MESSAGE sent to `AGENT:*`.
 *
 * Per #11029, broadcasts remain one semantic MESSAGE + SENT_TO->AGENT:* edge, while unread
 * state moves to per-recipient DELIVERY edges. The audience is a send-time snapshot of
 * registered peer agents, excluding the sender and sentinel/human identities.
 *
 * @param {String} sentBy The canonical sender identity.
 * @returns {String[]} Sorted recipient identity node IDs.
 * @private
 */
function getBroadcastAudience(sentBy) {
    const nodes = GraphService.db?.nodes?.items || [];

    return nodes
        .map(node => {
            const id         = getRecordField(node, 'id'),
                label        = getRecordField(node, 'label'),
                properties   = getRecordProperties(node),
                accountType  = properties.accountType;

            if (!id || id === sentBy || id === 'AGENT:*' || !id.startsWith('@')) {
                return null;
            }

            if (accountType === 'human' || accountType === 'sentinel') {
                return null;
            }

            if (label === 'AgentIdentity') {
                return accountType === 'agent' ? id : null;
            }

            return label === 'AGENT' ? id : null;
        })
        .filter(Boolean)
        .sort();
}

function getBroadcastDeliveryEdges(messageId) {
    return (GraphService.db?.edges?.items || []).filter(edge =>
        getRecordField(edge, 'source') === messageId &&
        getRecordField(edge, 'type') === 'DELIVERED_TO'
    );
}

function getBroadcastDeliveryEdge(messageId, target) {
    return getBroadcastDeliveryEdges(messageId).find(edge => getRecordField(edge, 'target') === target) || null;
}

function hasBroadcastDeliveryEdges(messageId) {
    return getBroadcastDeliveryEdges(messageId).length > 0;
}

function getReadAtForMessage(messageNode, deliveryEdge=null) {
    if (deliveryEdge) {
        return getRecordProperties(deliveryEdge).readAt || null;
    }

    return messageNode?.properties?.readAt || null;
}

async function setDeliveryEdgeReadAt(edge, readAt) {
    setRecordProperties(edge, {
        ...getRecordProperties(edge),
        readAt
    });

    const db = GraphService.db;

    if (db?.autoSave && db.storage) {
        await db.storage.addEdges([edge]);
        db.acknowledgeLocalMutations?.();
    }
}

/**
 * @summary A2A (Agent-to-Agent) Messaging Service mapped to the Native Edge Graph.
 *
 * Implements the Mailbox primitives for direct or broadcast agent communications.
 * Messages are stored as graph nodes of `type: 'MESSAGE'`, with `SENT_BY` and `SENT_TO` edges.
 *
 * This class is a key example of the framework's **A2A messaging substrate** and demonstrates
 * concepts like **agent identity**, **broadcast fan-out**, **reachable-counterparty trust
 * inference**, and **server-stamped authorship** (the anti-spoof `SENT_BY` edge is derived from
 * `RequestContextService.getAgentIdentityNodeId()`, never from client input — per
 * `AuthMiddleware.IDENTITY_OVERRIDE_KEYS`).
 *
 * @class Neo.ai.services.memory-core.MailboxService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.memory-core.GraphService
 * @see Neo.ai.services.memory-core.PermissionService
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 */
class MailboxService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.MailboxService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.MailboxService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    static VALID_TASK_STATES = ['Submitted', 'Working', 'InputRequired', 'Completed', 'Canceled', 'Failed', 'Rejected', 'AuthRequired', 'Unknown', 'Expired', 'Blocked'];

    /**
     * Adds a new message to the mailbox system.
     * @param {Object} args
     * @param {String} args.to The agent identity, role, or broadcast to send to
     * @param {String} args.subject The subject of the message
     * @param {String} args.body The body content of the message
     * @param {String} [args.originSessionId] The session ID this message originates from
     * @param {String[]} [args.relatedSessions] Array of session IDs related to this message
     * @param {String[]} [args.relatedTickets] Array of ticket IDs referenced
     * @param {String} [args.inReplyTo] Message ID this replies to
     * @param {String} [args.priority='normal'] Message priority ('low', 'normal', or 'high')
     * @param {String} [args.partOfThread] Thread ID
     * @param {String[]} [args.taggedConcepts] Array of concept IDs tagged
     * @param {Boolean} [args.wakeSuppressed=false] Persist the message without emitting `SENT_TO_ME`
     *   wake events. Intended for mailbox-only handovers such as session-sunset self-DMs that must be
     *   consumed by the next boot, not injected back into the active sender harness.
     * @param {Object} [args.task] Optional A2A Task envelope payload (per #10334). When present,
     *   stored verbatim as a property on the MESSAGE node and surfaced by get_message + list_messages
     *   for programmatic agent coordination. Phase 1 (this primitive) treats `task` as opaque JSON;
     *   Phase 2 (Track 2B #10338) layers state-machine transitions, RBAC enforcement, and idempotency
     *   claim-and-lock on top. Schema follows Option C hybrid (A2A spec subset + Neo extensions like
     *   `expiresAt`, `Blocked`) per Discussion #10313 graduation. See
     *   {@link https://a2a-protocol.org/latest/specification/} for the canonical Task envelope.
     * @returns {Promise<Object>}
     */
    async addMessage({ to, subject, body, originSessionId, relatedSessions = [], relatedTickets = [], inReplyTo, priority = 'normal', partOfThread, taggedConcepts = [], wakeSuppressed = false, task }) {
        const preNormalizeTo = to; // Phase 1 #10347 observability
        const sentBy = RequestContextService.getAgentIdentityNodeId();
        if (!sentBy) {
            throw new Error("Cannot send message: no agent identity context bound. Ensure StdioIdentityResolver or OIDC transport is active.");
        }

        // Canonicalize addressing to match the seeded AgentIdentity graph-node IDs. Upstream tool-
        // schema wording exposes the `'AGENT:@login'` prefixed form; the seed uses bare `@login`.
        // Without this normalization, `GraphService.linkNodes`'s FK guard silently culls the
        // `SENT_TO` edge — the root-cause bug closed by #10174. Permission checks and edge
        // creation below all consume the canonical form from this point on.
        to = normalizeMailboxTarget(to, sentBy);
        const postNormalizeTo = to; // Phase 1 #10347 observability

        const messageId = `MESSAGE:${crypto.randomUUID()}`;
        const timestamp = new Date().toISOString();

        const isRoleOrHuman = to.startsWith('role:') || to.startsWith('human:');

        // Reply permission gate (#10252): strict-isolation mode only.
        //
        // In `'blocked'` mode (multi-user / multi-tenant deployment default per #10146),
        // non-broadcast DMs to a specific AgentIdentity require either a prior
        // `CAN_REPLY_TO` grant or the reachable-counterparty trust-lift (#10179).
        //
        // In `'open'` mode (homogeneous trusted-frontier swarm default), the check is
        // skipped — all authenticated peers can DM each other. The PermissionService
        // primitives remain live and callable; `CAN_REPLY_TO` edges are still created
        // by `grantPermission` and still queryable by `listPermissions`. Only the
        // enforcement path on `addMessage` consults the config selector.
        //
        // Read-path scoping (`CAN_READ_INBOX_OF`, `CAN_READ_MEMORIES_OF`,
        // `CAN_READ_SESSIONS_OF`) is NOT affected by this setting — reading someone's
        // inbox is categorically different from sending them a message; asymmetric
        // treatment is intentional per #10252's Out of Scope.
        const strictReplyPolicy = aiConfig.mailbox?.defaultReplyPolicy === 'blocked';

        // @summary Defensive guard enforcing the "Block Wins" negative-intent primitive (#10255).
        // Fires in BOTH reply-policy modes ('open' and 'blocked').
        // Explicit blocks override both the 'open' default-allow AND the 'blocked'-mode
        // reachable-counterparty trust-lift. Re-granting CAN_REPLY_TO does not silently
        // re-enable reach. To restore reach, the recipient must revoke the BLOCKED_BY edge.
        if (!isRoleOrHuman && to !== 'AGENT:*' && to !== sentBy) {
            if (PermissionService.hasPermission(sentBy, to, 'BLOCKED_BY')) {
                throw new Error(`Unauthorized: ${to} has blocked messages from ${sentBy}.`);
            }
        }

        if (strictReplyPolicy && !isRoleOrHuman && to !== 'AGENT:*' && to !== sentBy) {
            let canReply = PermissionService.hasPermission(sentBy, to, 'CAN_REPLY_TO');

            // Reachable Counterparty trust lift: if `to` ever sent a message that reached the
            // caller — either directly (SENT_TO → sentBy) or via broadcast (SENT_TO → AGENT:*) —
            // an implicit trust chain permits DM without an explicit CAN_REPLY_TO grant.
            // Broadcast inclusion closes #10179: pre-fix the iteration only matched direct
            // SENT_TO targets, breaking the first-message bootstrap pattern where Agent A
            // broadcasts and Agent B wants to DM-reply. Trade-off: any broadcaster becomes
            // DM-reachable by every authenticated recipient; rate-limit mitigation is deferred
            // until the spam surface materializes empirically at swarm scale.
            if (!canReply) {
                // Trigger syncCache + lazy-reload vicinity (#10257). The trust-lift
                // iteration needs to see peer-process broadcasts / DMs that just landed —
                // SENT_TO edges targeting sentBy or AGENT:*. Without the re-load, those
                // edges from peer harnesses remain invisible to this process, blocking
                // first-message bootstrap even when SQLite has them. Bare `syncCache()`
                // alone would invalidate without re-hydrating; `getAdjacentNodes` handles
                // both steps. See listMessages for the full rationale.
                GraphService.db.getAdjacentNodes(sentBy, 'inbound');
                GraphService.db.getAdjacentNodes('AGENT:*', 'inbound');

                for (const edge of GraphService.db.edges.items) {
                    if (edge.type === 'SENT_TO' && (edge.target === sentBy || edge.target === 'AGENT:*')) {
                        // Per-message outbound vicinity lazy-load (#10257 follow-up per Gemini's
                        // cross-family review on PR #10258). Symmetric with listMessages' inner
                        // loop fix. Without this, the SENT_BY edge scan below comes up empty
                        // for peer-process messages (the SENT_BY edge targets the author node,
                        // not sentBy or AGENT:*, so the entry-level inbound lookups don't load
                        // it). That would cause priorSender to stay null and the trust-lift to
                        // falsely fail — breaking first-message bootstrap under cross-process
                        // writes, exactly the scenario this PR's core fix is meant to close.
                        GraphService.db.getAdjacentNodes(edge.source, 'outbound');

                        let priorSender = null;
                        for (const srcEdge of GraphService.db.edges.items) {
                            if (srcEdge.source === edge.source && srcEdge.type === 'SENT_BY') {
                                priorSender = srcEdge.target;
                                break;
                            }
                        }
                        if (priorSender === to) {
                            canReply = true;
                            break;
                        }
                    }
                }
            }

            if (!canReply) {
                throw new Error(`Unauthorized: Cannot send to ${to}. Requires CAN_REPLY_TO permission or prior message history.`);
            }
        }

        // 1. Create the Message Node
        // The optional `task` property carries an A2A-Task-object-shaped JSON payload per #10334
        // (Track 2 envelope primitive). When present, downstream consumers (listMessages,
        // getMessage) surface it for programmatic agent coordination. Schema sketch + Option C
        // hybrid (A2A spec subset + Neo extensions like `expiresAt`/`Blocked`) per Discussion
        // #10313 graduation. Phase 1 stores arbitrary opaque object; Phase 2 (Track 2B #10338)
        // layers state-machine transition logic + RBAC matrix on top. See
        // https://a2a-protocol.org/latest/specification/ for the canonical envelope shape.
        const messageProperties = {
            subject,
            bodyText: body,
            priority,
            sentAt: timestamp,
            readAt: null,
            from: sentBy,
            to,
            inReplyTo: inReplyTo || null,
            partOfThread: partOfThread || null,
            taggedConcepts,
            wakeSuppressed: Boolean(wakeSuppressed),
            userId: sentBy,
            sharedEntity: true
        };
        
        if (task !== undefined) {
            if (task.state && !MailboxService.VALID_TASK_STATES.includes(task.state)) {
                throw new Error(`Invalid task state: ${task.state}. Must be one of: ${MailboxService.VALID_TASK_STATES.join(', ')}`);
            }
            messageProperties.task = task;
        }

        GraphService.upsertNode({
            id: messageId,
            type: 'MESSAGE',
            name: subject,
            properties: messageProperties
        });

        // 2. Map the routing edges
        GraphService.linkNodes(messageId, sentBy, 'SENT_BY', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        GraphService.linkNodes(messageId, to, 'SENT_TO', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        if (to === 'AGENT:*') {
            for (const recipient of getBroadcastAudience(sentBy)) {
                GraphService.linkNodes(messageId, recipient, 'DELIVERED_TO', 1.0, {
                    deliveredAt: timestamp,
                    readAt: null,
                    deliveryKind: 'broadcast',
                    userId: sentBy,
                    sharedEntity: true
                });
            }
        }

        // Phase 1 #10347 Observability: Make SENT_TO failure loud and cross-process readable
        try {
            const edgeCount = GraphService.db.storage.db.prepare('SELECT count(*) as count FROM Edges WHERE source = ? AND target = ? AND type = ?').get(messageId, to, 'SENT_TO').count;
            if (edgeCount === 0) {
                const fkVerifyCount = GraphService.db.storage.db.prepare('SELECT count(*) as count FROM Nodes WHERE id IN (?, ?)').get(messageId, to).count;
                
                const logEntry = {
                    msg: "[#10347 Phase 1] Intermittent SENT_TO edge cull detected",
                    timestamp,
                    caller_passed_to: preNormalizeTo,
                    pre_normalize_to: preNormalizeTo,
                    post_normalize_to: postNormalizeTo,
                    fk_verify_count: fkVerifyCount,
                    identity_binding_me: sentBy,
                    edge_type: 'SENT_TO',
                    message_id: messageId
                };

                Promise.all([import('fs'), import('path'), import('../../mcp/server/memory-core/logger.mjs')]).then(([{ default: fs }, { default: path }, { default: logger }]) => {
                    logger.warn(JSON.stringify(logEntry));
                    const logPath = path.join(path.dirname(aiConfig.storagePaths.graph), 'sent-to-cull.jsonl');
                    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
                });
            }
        } catch (e) {
            // fail silently on observability errors to not break the message send
        }

        // 3. Map additional graph semantic edges
        if (originSessionId) GraphService.linkNodes(messageId, originSessionId, 'ORIGINATES_IN', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        if (inReplyTo) GraphService.linkNodes(messageId, inReplyTo, 'IN_REPLY_TO', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        if (partOfThread) GraphService.linkNodes(messageId, partOfThread, 'PART_OF_THREAD', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        
        for (const s of relatedSessions) GraphService.linkNodes(messageId, s, 'RELATED_SESSION', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        for (const t of relatedTickets) GraphService.linkNodes(messageId, t, 'REFERENCES_TICKET', 1.0, { timestamp, userId: sentBy, sharedEntity: true });
        for (const c of taggedConcepts) GraphService.linkNodes(messageId, c, 'TAGGED_CONCEPT', 1.0, { timestamp, userId: sentBy, sharedEntity: true });

        // 4. Auto-emit TAGGED_CONCEPT edges asynchronously without blocking delivery
        SemanticGraphExtractor.extractMessageConcepts(body).then(concepts => {
            if (concepts && concepts.length > 0) {
                for (const c of concepts) {
                    // Ensure the concept node exists before linking
                    if (!GraphService.db.nodes.has(c)) {
                        let type = c.split(':')[0];
                        let name = c.split(':').slice(1).join(':');
                        GraphService.upsertNode({
                            id: c,
                            type: type,
                            name: name || c,
                            properties: { auto_extracted: true }
                        });
                    }
                    // Use slightly lower weight for auto-extracted concepts
                    GraphService.linkNodes(messageId, c, 'TAGGED_CONCEPT', 0.8, { timestamp, userId: sentBy, sharedEntity: true });
                }
            }
        }).catch(() => { /* error logged internally */ });

        WakeSubscriptionService.pump().catch(e => logger.error('[wake-pump]', e));

        return { messageId, sentAt: timestamp, priority, status: 'sent' };
    }

    /**
     * Lists messages in the mailbox.
     * @param {Object} args
     * @param {String} [args.box='inbox'] Which box to list ('inbox', 'outbox', 'all')
     * @param {String} [args.status='all'] Read status ('all', 'read', 'unread')
     * @param {String} [args.to] Target identity to list messages for (defaults to caller)
     * @param {String} [args.threadId] Filter by specific thread
     * @param {String} [args.fromIdentity] Filter by specific sender. Named `fromIdentity` rather
     *   than `from` to avoid the anti-spoof reserved-key collision in
     *   {@link Neo.ai.mcp.server.shared.services.AuthMiddleware} — `from` is a claim-of-authorship
     *   key blocked at the callTool choke-point, whereas this parameter is a read-path filter
     *   with no authorship semantics. Renamed per #10174.
     * @param {String[]} [args.taggedConcepts] Filter by specific tagged concepts (requires all)
     * @param {Number} [args.limit=50] Maximum number of messages to return
     * @param {Number} [args.offset=0] Pagination offset
     * @returns {Promise<Object>}
     */
    async listMessages({ box = 'inbox', status = 'all', to, threadId, fromIdentity, taggedConcepts, limit = 50, offset = 0 } = {}) {
        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            throw new Error("Cannot list messages: no agent identity context bound.");
        }

        const target = to || me;

        if (target !== me && target !== 'AGENT:*') {
            if (!PermissionService.hasPermission(me, target, 'CAN_READ_INBOX_OF')) {
                throw new Error(`Unauthorized: no CAN_READ_INBOX_OF permission for ${target}`);
            }
        }

        const db = GraphService.db;

        // Consume WAL delta AND re-populate vicinity from SQLite before iterating
        // in-memory edges (#10257). A bare `syncCache()` call invalidates cached
        // entries but edge-type scans don't have a lazy-reload fallback, so locally-
        // written messages get wiped without re-hydration. `getAdjacentNodes` is the
        // correct primitive: it triggers `syncCache` (see Database.mjs:~267) AND then
        // re-loads the node vicinity from SQLite, re-populating the cache with peer
        // writes. Mailbox inbox query maps onto "inbound edges targeting me or the
        // broadcast sentinel" — vicinity of those two nodes.
        if (box === 'inbox' || box === 'all') {
            db.getAdjacentNodes(target, 'inbound');
            db.getAdjacentNodes('AGENT:*', 'inbound');
        }
        if (box === 'outbox' || box === 'all') {
            db.getAdjacentNodes(target, 'inbound');
        }

        let messages = [];

        for (const edge of db.edges.items) {
            const edgeType = getRecordField(edge, 'type'),
                edgeSource = getRecordField(edge, 'source'),
                edgeTarget = getRecordField(edge, 'target');

            let isMatch = false,
                targetNode = null,
                senderNode = null,
                deliveryEdge = null;

            if (edgeType === 'DELIVERED_TO') {
                targetNode = edgeTarget;
                if ((box === 'inbox' || box === 'all') && targetNode === target) {
                    isMatch = true;
                    deliveryEdge = edge;
                }
            } else if (edgeType === 'SENT_TO') {
                targetNode = edgeTarget;
                if (box === 'inbox' || box === 'all') {
                    if (targetNode === target) {
                        isMatch = true;
                    } else if (targetNode === 'AGENT:*') {
                        // Load the full message vicinity before deciding whether this is a
                        // #11029 per-recipient broadcast or a legacy shared-read broadcast.
                        db.getAdjacentNodes(edgeSource, 'outbound');
                        deliveryEdge = getBroadcastDeliveryEdge(edgeSource, target);
                        if (deliveryEdge || !hasBroadcastDeliveryEdges(edgeSource)) {
                            isMatch = true;
                        }
                    }
                }
            } else if (edgeType === 'SENT_BY') {
                senderNode = edgeTarget;
                if ((box === 'outbox' || box === 'all') && senderNode === target) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                // Determine message node id depending on which edge we matched
                const messageNodeId = edgeSource;
                // Avoid duplicates if 'all' is chosen
                if (messages.find(m => m.messageId === messageNodeId)) continue;

                // Lazy-reload this message's outbound vicinity — loads SENT_BY,
                // PART_OF_THREAD, TAGGED_CONCEPT, etc. edges authored by the message.
                // Without this, the inner `sourceEdge` iteration (below) sees only
                // edges present in the process's cache at query entry, which for
                // peer-process writes is empty. #10257.
                db.getAdjacentNodes(messageNodeId, 'outbound');

                const messageNode = db.nodes.get(messageNodeId);
                if (messageNode && messageNode.label === 'MESSAGE') {
                    deliveryEdge = deliveryEdge || getBroadcastDeliveryEdge(messageNodeId, target);

                    const readAt = getReadAtForMessage(messageNode, deliveryEdge);
                    const isUnread = !readAt;
                    if (status === 'unread' && !isUnread) continue;
                    if (status === 'read' && isUnread) continue;

                    let sentByNodeId = senderNode;
                    let sentToNodeId = targetNode;
                    let foundThreadId = null;
                    let messageTaggedConcepts = [];

                    for (const sourceEdge of db.edges.items) {
                        if (getRecordField(sourceEdge, 'source') === messageNode.id) {
                            const sourceEdgeType = getRecordField(sourceEdge, 'type');

                            if (sourceEdgeType === 'SENT_BY') sentByNodeId = getRecordField(sourceEdge, 'target');
                            if (sourceEdgeType === 'SENT_TO') sentToNodeId = getRecordField(sourceEdge, 'target');
                            if (sourceEdgeType === 'PART_OF_THREAD') foundThreadId = getRecordField(sourceEdge, 'target');
                            if (sourceEdgeType === 'TAGGED_CONCEPT') messageTaggedConcepts.push(getRecordField(sourceEdge, 'target'));
                        }
                    }

                    if (fromIdentity && sentByNodeId !== fromIdentity) continue;
                    if (threadId && foundThreadId !== threadId) continue;

                    if (taggedConcepts && taggedConcepts.length > 0) {
                        let hasAllConcepts = true;
                        for (const concept of taggedConcepts) {
                            if (!messageTaggedConcepts.includes(concept)) {
                                hasAllConcepts = false;
                                break;
                            }
                        }
                        if (!hasAllConcepts) continue;
                    }

                    const summary = {
                        messageId: messageNode.id,
                        subject: messageNode.properties.subject,
                        priority: messageNode.properties.priority,
                        sentAt: messageNode.properties.sentAt,
                        readAt,
                        from: sentByNodeId,
                        to: sentToNodeId
                    };
                    if (messageNode.properties.task !== undefined) summary.task = messageNode.properties.task;
                    if (messageNode.properties.wakeSuppressed) summary.wakeSuppressed = true;
                    messages.push(summary);
                }
            }
        }

        messages.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        
        // Pagination
        messages = messages.slice(offset, offset + limit);
        
        return { messages };
    }

    /**
     * Retrieves a single message.
     * @param {Object} args
     * @param {String} args.messageId The ID of the message to retrieve
     * @returns {Promise<Object>}
     */
    async getMessage({ messageId }) {
        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            throw new Error("Cannot get message: no agent identity context bound.");
        }

        const db = GraphService.db;

        // Trigger syncCache + lazy-reload vicinity for this message node (#10257).
        // Ensures peer-process writes to this message's edges (e.g. late PART_OF_THREAD
        // additions, read-receipt annotations) are visible. See listMessages for the
        // full rationale on why bare `syncCache()` is insufficient for edge-type scans.
        db.getAdjacentNodes(messageId, 'both');

        const messageNode = db.nodes.get(messageId);
        if (!messageNode || messageNode.label !== 'MESSAGE') {
            throw new Error(`Message not found: ${messageId}`);
        }

        let sentBy = null,
            sentTo = null,
            isDirectRecipient = false;

        for (const edge of db.edges.items) {
            if (getRecordField(edge, 'source') === messageId) {
                const edgeType = getRecordField(edge, 'type'),
                    edgeTarget = getRecordField(edge, 'target');

                if (edgeType === 'SENT_TO') {
                    sentTo = edgeTarget;
                    if (edgeTarget === me) {
                        isDirectRecipient = true;
                    }
                }
                if (edgeType === 'SENT_BY') {
                    sentBy = edgeTarget;
                }
            }
        }

        const deliveryEdge = getBroadcastDeliveryEdge(messageId, me);
        let isAuthorized = sentBy === me || isDirectRecipient;

        if (!isAuthorized && sentTo === 'AGENT:*') {
            // Legacy broadcasts without per-recipient receipts retain their historical
            // read-path semantics. #11029 broadcasts authorize only snapshotted recipients.
            isAuthorized = deliveryEdge || !hasBroadcastDeliveryEdges(messageId);
        } else if (!isAuthorized && sentTo && sentTo !== me && sentTo !== 'AGENT:*') {
            // Check if me has permission to read sentTo's inbox
            if (PermissionService.hasPermission(me, sentTo, 'CAN_READ_INBOX_OF')) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new Error(`Unauthorized: message ${messageId} was not sent to or from ${me}. (Read-path validation strictly enforced per Phase 3 rules)`);
        }

        const result = {
            messageId,
            subject: messageNode.properties.subject,
            body: messageNode.properties.bodyText,
            sentAt: messageNode.properties.sentAt,
            readAt: getReadAtForMessage(messageNode, deliveryEdge),
            from: sentBy,
            to: sentTo
        };
        if (messageNode.properties.task !== undefined) result.task = messageNode.properties.task;
        if (messageNode.properties.wakeSuppressed) result.wakeSuppressed = true;
        return result;
    }

    /**
     * Marks a message as read.
     * @param {Object} args
     * @param {String} args.messageId The ID of the message to mark read
     * @returns {Promise<Object>}
     */
    async markRead({ messageId }) {
        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            throw new Error("Cannot mark message read: no agent identity context bound.");
        }

        const db = GraphService.db;

        // Trigger syncCache + lazy-reload vicinity (#10257). Ensures the SENT_TO edge
        // iteration sees peer-process writes. See listMessages for the full rationale.
        db.getAdjacentNodes(messageId, 'both');

        const messageNode = db.nodes.get(messageId);
        if (!messageNode || messageNode.label !== 'MESSAGE') {
            throw new Error(`Message not found: ${messageId}`);
        }

        let isDirectRecipient = false,
            isBroadcastRecipient = false;

        for (const edge of db.edges.items) {
            if (getRecordField(edge, 'source') === messageId && getRecordField(edge, 'type') === 'SENT_TO') {
                const edgeTarget = getRecordField(edge, 'target');

                if (edgeTarget === me) {
                    isDirectRecipient = true;
                    break;
                }
                if (edgeTarget === 'AGENT:*') {
                    isBroadcastRecipient = true;
                }
            }
        }

        const deliveryEdge = getBroadcastDeliveryEdge(messageId, me);

        if (deliveryEdge) {
            const readAt = new Date().toISOString();

            await setDeliveryEdgeReadAt(deliveryEdge, readAt);

            return { messageId, readAt, status: 'read' };
        }

        if (isBroadcastRecipient && hasBroadcastDeliveryEdges(messageId)) {
            throw new Error(`Unauthorized: you are not the recipient of message ${messageId}`);
        }

        if (!isDirectRecipient && !isBroadcastRecipient) {
            throw new Error(`Unauthorized: you are not the recipient of message ${messageId}`);
        }

        // Trigger an upsert to save to file backing store and notify listeners
        messageNode.properties.readAt = new Date().toISOString();
        GraphService.upsertNode(messageNode);

        return { messageId, readAt: messageNode.properties.readAt, status: 'read' };
    }

    /**
     * Transitions an A2A task to a new state.
     * Enforces the Track 2B (#10338) state-machine, RBAC transition authority, and
     * optimistic-concurrency idempotency (claim-and-lock).
     *
     * Note on Error Semantics:
     * - Throws an Error for unauthorized access or invalid input parameters.
     * - Returns { success: false, reason: ... } for expected state-race failures (e.g., expectedCurrentState mismatch, or optimistic-concurrency race lost).
     * Note on Broadcast Assignees:
     * - Tasks sent to `AGENT:*` are broadcast and can be claimed by ANY authenticated agent. The UPDATE-WHERE-state optimistic concurrency guard serializes the race to claim it.
     *
     * @param {Object} args
     * @param {String} args.taskId The ID of the MESSAGE node containing the task
     * @param {String} args.newState The new state to transition to
     * @param {String} [args.expectedCurrentState] Optional guard: if provided, the transition fails if current state differs
     * @returns {Promise<Object>} Object containing success boolean, rowsAffected, and updated task object
     */
    async transitionTask({ taskId, newState, expectedCurrentState }) {
        if (!MailboxService.VALID_TASK_STATES.includes(newState)) {
            throw new Error(`Invalid new task state: ${newState}. Must be one of: ${MailboxService.VALID_TASK_STATES.join(', ')}`);
        }

        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            throw new Error("Cannot transition task: no agent identity context bound.");
        }

        const db = GraphService.db;

        // Trigger syncCache to ensure we have latest vicinity
        db.getAdjacentNodes(taskId, 'both');

        const messageNode = db.nodes.get(taskId);
        if (!messageNode || messageNode.label !== 'MESSAGE') {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (!messageNode.properties.task || !messageNode.properties.task.state) {
            throw new Error(`Message ${taskId} is not an A2A Task (missing task.state)`);
        }

        const currentState = messageNode.properties.task.state;

        if (expectedCurrentState && currentState !== expectedCurrentState) {
            return { success: false, rowsAffected: 0, reason: `State mismatch: expected ${expectedCurrentState}, got ${currentState}` };
        }

        let isOriginator = false;
        let isAssignee = false;

        for (const edge of db.edges.items) {
            if (edge.source === taskId) {
                if (edge.type === 'SENT_BY' && edge.target === me) isOriginator = true;
                if (edge.type === 'SENT_TO' && (edge.target === me || edge.target === 'AGENT:*')) isAssignee = true;
            }
        }

        if (!isOriginator && !isAssignee) {
            throw new Error(`Unauthorized: ${me} is neither originator nor assignee for task ${taskId}`);
        }

        let authorized = false;

        if (isOriginator) {
            if (currentState === 'Submitted' && newState === 'Canceled') authorized = true;
            if (currentState === 'InputRequired' && newState === 'Working') authorized = true;
        }

        if (isAssignee) {
            if (currentState === 'Submitted' && newState === 'Working') authorized = true;
            if (currentState === 'Working' && ['InputRequired', 'Completed', 'Failed'].includes(newState)) authorized = true;
        }

        if (!authorized) {
            const role = isOriginator ? 'originator' : 'assignee';
            throw new Error(`Unauthorized: ${me} as ${role} cannot transition \`${currentState} → ${newState}\``);
        }

        const timestamp = new Date().toISOString();

        // Optimistic concurrency claim-and-lock: Update SQLite with WHERE-state guard
        const stmt = db.storage.db.prepare(`
            UPDATE Nodes
            SET data = json_set(data, '$.properties.task.state', ?, '$.properties.lastModifiedAt', ?)
            WHERE id = ? AND json_extract(data, '$.properties.task.state') = ?
        `);
        const info = stmt.run(newState, timestamp, taskId, currentState);

        if (info.changes === 0) {
            // Lost the race or state changed asynchronously. Fetch fresh state directly from DB.
            const row = db.storage.db.prepare(`SELECT json_extract(data, '$.properties.task.state') as state FROM Nodes WHERE id = ?`).get(taskId);
            const freshState = row && row.state ? row.state : currentState;
            // Sync memory node to reality and trigger cache events
            if (messageNode && messageNode.properties && messageNode.properties.task) {
                messageNode.properties.task.state = freshState;
                GraphService.upsertNode(messageNode);
            }
            return { success: false, rowsAffected: 0, reason: `Race lost: state changed to ${freshState}` };
        }

        messageNode.properties.task.state = newState;
        messageNode.properties.lastModifiedAt = timestamp;

        // Push the merged object back to GraphService cache to trigger events
        GraphService.upsertNode(messageNode);

        WakeSubscriptionService.pump().catch(e => logger.error('[wake-pump]', e));

        return {
            success: true,
            rowsAffected: info.changes,
            task: messageNode.properties.task
        };
    }

    /**
     * @summary Sweeps expired A2A Tasks past their `task.expiresAt` to the `Expired` state.
     *
     * Maintenance operation invoked by the swarm-heartbeat cron cycle (Track 2C, #10339).
     * Bulk-transitions all MESSAGE nodes carrying an A2A Task envelope whose `task.expiresAt`
     * ISO timestamp has passed AND whose `task.state` is non-terminal
     * (`Submitted` / `Working` / `InputRequired`) to `Expired` via a single atomic
     * `UPDATE-WHERE` statement — mirroring the optimistic-concurrency pattern used by
     * `transitionTask`. Cached MESSAGE nodes are then synced to reflect the SQLite write,
     * triggering observable cache events.
     *
     * Distinguished from `transitionTask` in three ways:
     * 1. **No identity context required.** Sweeper runs as a maintenance role; not bound
     *    to an agent identity. Bypasses the originator/assignee RBAC matrix because TTL
     *    expiry is a substrate-level concern, not a state-machine action.
     * 2. **No state-machine validation.** Direct SQL `UPDATE`; the `WHERE` clause itself
     *    constrains source states (`Submitted` / `Working` / `InputRequired`) and target
     *    state (`Expired` is fixed).
     * 3. **Bulk operation.** A single `UPDATE` may transition many tasks; returns
     *    `sweptCount` for observability rather than per-task results.
     *
     * Idempotent: rerunning when no tasks are expired is a no-op (zero `sweptCount`).
     * Tasks without an `expiresAt` field are unaffected (TTL is opt-in). Tasks already
     * in terminal states (`Completed` / `Canceled` / `Failed` / `Rejected` / `Expired`)
     * are untouched.
     *
     * NOT exposed via MCP tool surface — internal cron primitive only. See
     * `ai/scripts/sweepExpiredTasks.mjs` for the CLI invoker consumed by the heartbeat.
     *
     * @returns {Promise<{success: Boolean, sweptCount: Number}>}
     */
    async sweepExpiredTasks() {
        const
            db        = GraphService.db,
            timestamp = new Date().toISOString();

        const stmt = db.storage.db.prepare(`
            UPDATE Nodes
            SET data = json_set(data,
                '$.properties.task.state', 'Expired',
                '$.properties.lastModifiedAt', ?
            )
            WHERE
                json_extract(data, '$.label') = 'MESSAGE'
                AND json_extract(data, '$.properties.task.state') IN ('Submitted', 'Working', 'InputRequired')
                AND json_extract(data, '$.properties.task.expiresAt') IS NOT NULL
                AND datetime(json_extract(data, '$.properties.task.expiresAt')) < datetime(?)
        `);
        const info = stmt.run(timestamp, timestamp);

        if (info.changes > 0) {
            // Fast-forward `lastSyncId` so subsequent `syncCache()` calls won't treat our
            // own UPDATE-triggered GraphLog entries as external invalidation events. SQLite
            // `node_update` triggers append to GraphLog automatically (see SQLite.mjs); without
            // this fast-forward, the next `getAdjacentNodes` (e.g. via downstream
            // `transitionTask` or `upsertNode`) would invalidate the just-written cache entries
            // and break consumers that read via `db.nodes.get(id)`. Mirrors the discipline used
            // by `GraphService.upsertNode` after `storage.addNodes`.
            db.acknowledgeLocalMutations?.();

            // Sync cached MESSAGE nodes that the sweep touched. The unique sweep timestamp
            // discriminates this cycle's writes from any concurrent `transitionTask` writes,
            // since ISO millisecond precision plus single-process JS ordering guarantee
            // distinct values across calls. Direct in-memory mutation (no `upsertNode` round
            // trip) is sufficient because SQLite already holds the canonical truth.
            const sweptRows = db.storage.db.prepare(`
                SELECT id FROM Nodes
                WHERE json_extract(data, '$.label') = 'MESSAGE'
                    AND json_extract(data, '$.properties.task.state') = 'Expired'
                    AND json_extract(data, '$.properties.lastModifiedAt') = ?
            `).all(timestamp);

            for (const row of sweptRows) {
                const cached = db.nodes.get(row.id);
                if (cached?.properties?.task) {
                    cached.properties.task.state    = 'Expired';
                    cached.properties.lastModifiedAt = timestamp
                }
            }

            WakeSubscriptionService.pump().catch(e => logger.error('[wake-pump]', e));
        }

        return { success: true, sweptCount: info.changes }
    }

    /**
     * Returns a scalar count of messages matching the given filter, without
     * fetching message bodies. Patterned after `MemoryService.buildMailboxDelta`
     * (#10178) — uses direct `prepare` + `get` against `Edges` joined with
     * `Nodes`, returning `{count}` in O(indexed) time regardless of mailbox
     * depth. Retires the `listMessages({limit: N}).messages.length` proxy
     * pattern previously used by `getHealthcheckPreview` (#10180).
     *
     * **Inbox path (3-way UNION):** captures direct DMs (`SENT_TO` me with
     * `readAt` on the MESSAGE node), per-recipient broadcasts (`DELIVERED_TO`
     * me with `readAt` on the DELIVERY edge per #11029), and legacy broadcasts
     * (`SENT_TO AGENT:*` with the shared-read fallback when no `DELIVERED_TO`
     * edges exist). Mirrors `buildMailboxDelta`'s unread-count taxonomy exactly.
     *
     * **Outbox path:** count of `SENT_BY` edges from the caller's identity.
     * `status` filter is a no-op for outbox — outbox messages have per-recipient
     * `readAt`, not a unified message-level state; "outbox unread" is semantically
     * undefined and returns the full outbox count.
     *
     * **Cache coherence note:** direct-SQL bypasses the in-memory cache hydration
     * that `listMessages` performs via `getAdjacentNodes`. Acceptable for caller
     * use cases that tolerate a single-write staleness window (healthcheck preview,
     * dashboards). For strict per-write-visibility, use `listMessages` instead.
     *
     * @param {Object} [args]
     * @param {String} [args.box='inbox'] Which box to count (`'inbox'` or `'outbox'`).
     * @param {String} [args.status='all'] Read-state filter for inbox path
     *   (`'all'`, `'read'`, `'unread'`). Ignored for outbox.
     * @param {String} [args.to] Target identity (defaults to caller). Cross-identity
     *   reads require `CAN_READ_INBOX_OF` permission, mirroring `listMessages`.
     * @param {String} [args.fromIdentity] Filter inbox messages by sender identity.
     *   Ignored for outbox (no inverse-of-sender semantic).
     * @returns {Promise<{count: Number}>}
     */
    async countMessages({ box = 'inbox', status = 'all', to, fromIdentity } = {}) {
        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            throw new Error("Cannot count messages: no agent identity context bound.");
        }

        const target = to || me;

        if (target !== me && target !== 'AGENT:*') {
            if (!PermissionService.hasPermission(me, target, 'CAN_READ_INBOX_OF')) {
                throw new Error(`Unauthorized: no CAN_READ_INBOX_OF permission for ${target}`);
            }
        }

        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return { count: 0 };

        // readAt filter clauses keyed by the storage location of the read-state.
        // SENT_TO direct + AGENT:* legacy: readAt lives on the MESSAGE node payload.
        // DELIVERED_TO per-recipient: readAt lives on the DELIVERY edge payload.
        const messageReadAtClause = status === 'unread'
            ? `AND json_extract(n.data, '$.properties.readAt') IS NULL`
            : status === 'read'
                ? `AND json_extract(n.data, '$.properties.readAt') IS NOT NULL`
                : '';

        const edgeReadAtClause = status === 'unread'
            ? `AND json_extract(e.data, '$.properties.readAt') IS NULL`
            : status === 'read'
                ? `AND json_extract(e.data, '$.properties.readAt') IS NOT NULL`
                : '';

        // Optional sender filter — applies to inbox only.
        const senderFilterSql = fromIdentity
            ? `AND EXISTS (SELECT 1 FROM Edges sb WHERE sb.source = n.id AND sb.type = 'SENT_BY' AND sb.target = ?)`
            : '';

        try {
            if (box === 'outbox') {
                const row = sqlite.prepare(`
                    SELECT COUNT(DISTINCT n.id) AS count
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_BY'
                      AND e.target = ?
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                `).get(target);
                return { count: row?.count ?? 0 };
            }

            // Inbox: 3-way UNION mirroring buildMailboxDelta's unread-message taxonomy.
            const params = [];
            const inboxSql = `
                WITH inbox_messages AS (
                    SELECT n.id AS messageId
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_TO'
                      AND e.target = ?
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      ${messageReadAtClause}
                      ${senderFilterSql}

                    UNION

                    SELECT n.id AS messageId
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'DELIVERED_TO'
                      AND e.target = ?
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      ${edgeReadAtClause}
                      ${senderFilterSql}

                    UNION

                    SELECT n.id AS messageId
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_TO'
                      AND e.target = 'AGENT:*'
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      ${messageReadAtClause}
                      ${senderFilterSql}
                      AND NOT EXISTS (
                          SELECT 1 FROM Edges de
                          WHERE de.source = n.id AND de.type = 'DELIVERED_TO'
                      )
                )
                SELECT COUNT(DISTINCT messageId) AS count
                FROM inbox_messages
            `;

            params.push(target);
            if (fromIdentity) params.push(fromIdentity);
            params.push(target);
            if (fromIdentity) params.push(fromIdentity);
            if (fromIdentity) params.push(fromIdentity);

            const row = sqlite.prepare(inboxSql).get(...params);
            return { count: row?.count ?? 0 };
        } catch (error) {
            // Pattern from buildMailboxDelta: non-fatal degradation. Returning 0
            // for healthcheck-class callers is safer than throwing during boot/poll.
            return { count: 0 };
        }
    }

    /**
     * Generates the mailbox preview for the healthcheck payload.
     *
     * Uses `countMessages` (#10180) for the `unreadCount` field — direct-SQL path
     * with no upper-bound cap. Inbox + outbox previews retain `listMessages` with
     * `limit: 3` matching the preview surface size; the previously-implicit cap
     * of 100 on `unreadCount` is retired.
     *
     * @returns {Promise<Object|null>}
     */
    async getHealthcheckPreview() {
        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            return null; // No agent identity bound yet
        }

        const { count: unreadCount } = await this.countMessages({ box: 'inbox', status: 'unread' });
        const inboxResult            = await this.listMessages({ box: 'inbox',  limit: 3 });
        const outboxResult           = await this.listMessages({ box: 'outbox', limit: 3 });

        const inboxPreview = inboxResult.messages.map(msg => ({
            id: msg.messageId,
            // Legacy Data Remediation: Messages written during the #10184/#10181 incident
            // window may lack a SENT_BY edge if the sender was identity-unbound.
            // This fallback ensures schema compliance. New writes enforce bind-identity discipline.
            from: msg.from || 'unknown',
            subject: msg.subject ? msg.subject.substring(0, 60) + (msg.subject.length > 60 ? '...' : '') : '',
            createdAt: msg.sentAt,
            priority: msg.priority
        }));

        const outboxPreview = outboxResult.messages.map(msg => ({
            id: msg.messageId,
            // Legacy Data Remediation: See inboxPreview rationale.
            from: msg.from || 'unknown', // outbox 'from' is me
            subject: msg.subject ? msg.subject.substring(0, 60) + (msg.subject.length > 60 ? '...' : '') : '',
            createdAt: msg.sentAt,
            priority: msg.priority
        }));

        return {
            unreadCount,
            inbox: inboxPreview,
            outboxRecent: outboxPreview
        };
    }
}

export default Neo.setupClass(MailboxService);
