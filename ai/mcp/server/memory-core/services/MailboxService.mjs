import Base from '../../../../../src/core/Base.mjs';
import aiConfig from '../config.mjs';
import RequestContextService from '../../shared/services/RequestContextService.mjs';
import GraphService from './GraphService.mjs';
import PermissionService from './PermissionService.mjs';
import crypto from 'crypto';
import SemanticGraphExtractor from '../../../../daemons/services/SemanticGraphExtractor.mjs';

/**
 * Canonicalizes a mailbox `to` address to the form seeded in the AgentIdentity graph.
 *
 * Neo's mailbox tool-schema wording accepts the ambiguous `'AGENT:@login'` form in addition to the
 * canonical seeded `'@login'` form. Left unnormalized, {@link Neo.ai.mcp.server.memory-core.services.GraphService#linkNodes}
 * culls every `SENT_TO` edge whose prefixed-form target doesn't happen to match a seeded node —
 * the silent-drop root cause documented in #10174. Centralizing normalization here preserves
 * `linkNodes`'s defense-in-depth FK-style guard (hallucinated-path protection for every other
 * edge-creation path in the graph) while honoring the mailbox's documented addressing surface.
 *
 * Accepted shapes and their canonical outputs:
 * - `'@login'` → `'@login'` (already canonical)
 * - `'AGENT:@login'` → `'@login'` (strip the `AGENT:` prefix)
 * - `'AGENT:*'` → `'AGENT:*'` (broadcast sentinel — unchanged, seeded as a real `BroadcastSentinel`
 *   node by `ai/scripts/seedAgentIdentities.mjs` so the FK guard accepts it)
 * - `'role:<name>'` / `'human:<login>'` → unchanged (role + human addressing; the corresponding
 *   node must pre-exist in the graph or be created by a separate seed pass)
 * - Test-fixture convention `'AGENT:<bareName>'` without `@` → unchanged; MailboxService unit
 *   tests seed these directly and bypass the production `bindAgentIdentity` path entirely. The
 *   `.startsWith('AGENT:@')` guard intentionally does NOT strip for bare-name fixtures.
 *
 * @param {String} to The raw `to` address as supplied by the caller.
 * @returns {String} The canonical address ready for `linkNodes` and permission-check consumption.
 * @private
 */
function normalizeMailboxTarget(to) {
    if (to?.startsWith('AGENT:@')) {
        return to.slice('AGENT:'.length)
    }
    // Strip accidental leading `@@` prefix (#10259). Defense-in-depth for misformed
    // automation / ID copy-paste where the canonical `@login` form gets an extra `@`
    // prepended inadvertently. Without this, `linkNodes`' FK-style guard culls the
    // SENT_TO edge because `@@login` doesn't match any seeded AgentIdentity node.
    // Scope is intentionally minimal — only double-@ is stripped, not N-@ for N>2,
    // because N>2 is vanishingly rare and the single-prefix-strip handles the 99% case.
    if (to?.startsWith('@@')) {
        return to.slice(1)
    }
    return to
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
 * @class Neo.ai.mcp.server.memory-core.services.MailboxService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.memory-core.services.GraphService
 * @see Neo.ai.mcp.server.memory-core.services.PermissionService
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 */
class MailboxService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.MailboxService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.MailboxService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

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
     * @returns {Promise<Object>}
     */
    async addMessage({ to, subject, body, originSessionId, relatedSessions = [], relatedTickets = [], inReplyTo, priority = 'normal', partOfThread, taggedConcepts = [] }) {
        const sentBy = RequestContextService.getAgentIdentityNodeId();
        if (!sentBy) {
            throw new Error("Cannot send message: no agent identity context bound. Ensure StdioIdentityResolver or OIDC transport is active.");
        }

        // Canonicalize addressing to match the seeded AgentIdentity graph-node IDs. Upstream tool-
        // schema wording exposes the `'AGENT:@login'` prefixed form; the seed uses bare `@login`.
        // Without this normalization, `GraphService.linkNodes`'s FK guard silently culls the
        // `SENT_TO` edge — the root-cause bug closed by #10174. Permission checks and edge
        // creation below all consume the canonical form from this point on.
        to = normalizeMailboxTarget(to);

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
        GraphService.upsertNode({
            id: messageId,
            type: 'MESSAGE',
            name: subject,
            properties: {
                subject,
                bodyText: body,
                priority,
                sentAt: timestamp,
                readAt: null
            }
        });

        // 2. Map the routing edges
        GraphService.linkNodes(messageId, sentBy, 'SENT_BY', 1.0, { timestamp });
        GraphService.linkNodes(messageId, to, 'SENT_TO', 1.0, { timestamp });

        // 3. Map additional graph semantic edges
        if (originSessionId) GraphService.linkNodes(messageId, originSessionId, 'ORIGINATES_IN', 1.0, { timestamp });
        if (inReplyTo) GraphService.linkNodes(messageId, inReplyTo, 'IN_REPLY_TO', 1.0, { timestamp });
        if (partOfThread) GraphService.linkNodes(messageId, partOfThread, 'PART_OF_THREAD', 1.0, { timestamp });
        
        for (const s of relatedSessions) GraphService.linkNodes(messageId, s, 'RELATED_SESSION', 1.0, { timestamp });
        for (const t of relatedTickets) GraphService.linkNodes(messageId, t, 'REFERENCES_TICKET', 1.0, { timestamp });
        for (const c of taggedConcepts) GraphService.linkNodes(messageId, c, 'TAGGED_CONCEPT', 1.0, { timestamp });

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
                    GraphService.linkNodes(messageId, c, 'TAGGED_CONCEPT', 0.8, { timestamp });
                }
            }
        }).catch(() => { /* error logged internally */ });

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
     * @param {Number} [args.limit=50] Maximum number of messages to return
     * @param {Number} [args.offset=0] Pagination offset
     * @returns {Promise<Object>}
     */
    async listMessages({ box = 'inbox', status = 'all', to, threadId, fromIdentity, limit = 50, offset = 0 } = {}) {
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
            let isMatch = false;
            let targetNode = null;
            let senderNode = null;

            if (edge.type === 'SENT_TO') {
                targetNode = edge.target;
                if ((box === 'inbox' || box === 'all') && (targetNode === target || targetNode === 'AGENT:*')) {
                    isMatch = true;
                }
            } else if (edge.type === 'SENT_BY') {
                senderNode = edge.target;
                if ((box === 'outbox' || box === 'all') && senderNode === target) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                // Determine message node id depending on which edge we matched
                const messageNodeId = edge.source;
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
                    const isUnread = !messageNode.properties.readAt;
                    if (status === 'unread' && !isUnread) continue;
                    if (status === 'read' && isUnread) continue;

                    let sentByNodeId = senderNode;
                    let sentToNodeId = targetNode;
                    let foundThreadId = null;

                    for (const sourceEdge of db.edges.items) {
                        if (sourceEdge.source === messageNode.id) {
                            if (sourceEdge.type === 'SENT_BY') sentByNodeId = sourceEdge.target;
                            if (sourceEdge.type === 'SENT_TO') sentToNodeId = sourceEdge.target;
                            if (sourceEdge.type === 'PART_OF_THREAD') foundThreadId = sourceEdge.target;
                        }
                    }

                    if (fromIdentity && sentByNodeId !== fromIdentity) continue;
                    if (threadId && foundThreadId !== threadId) continue;

                    messages.push({
                        messageId: messageNode.id,
                        subject: messageNode.properties.subject,
                        priority: messageNode.properties.priority,
                        sentAt: messageNode.properties.sentAt,
                        readAt: messageNode.properties.readAt,
                        from: sentByNodeId,
                        to: sentToNodeId
                    });
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

        let isAuthorized = false;
        let sentBy = null;
        let sentTo = null;

        for (const edge of db.edges.items) {
            if (edge.source === messageId) {
                if (edge.type === 'SENT_TO') {
                    sentTo = edge.target;
                    if (edge.target === me || edge.target === 'AGENT:*') {
                        isAuthorized = true;
                    }
                }
                if (edge.type === 'SENT_BY') {
                    sentBy = edge.target;
                }
            }
        }

        // Sender can also read
        if (sentBy === me) {
            isAuthorized = true;
        } else if (!isAuthorized && sentTo && sentTo !== me && sentTo !== 'AGENT:*') {
            // Check if me has permission to read sentTo's inbox
            if (PermissionService.hasPermission(me, sentTo, 'CAN_READ_INBOX_OF')) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new Error(`Unauthorized: message ${messageId} was not sent to or from ${me}. (Read-path validation strictly enforced per Phase 3 rules)`);
        }

        return {
            messageId,
            subject: messageNode.properties.subject,
            body: messageNode.properties.bodyText,
            sentAt: messageNode.properties.sentAt,
            readAt: messageNode.properties.readAt,
            from: sentBy,
            to: sentTo
        };
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

        let isRecipient = false;
        for (const edge of db.edges.items) {
            if (edge.source === messageId && edge.type === 'SENT_TO' && (edge.target === me || edge.target === 'AGENT:*')) {
                isRecipient = true;
                break;
            }
        }

        if (!isRecipient) {
            throw new Error(`Unauthorized: you are not the recipient of message ${messageId}`);
        }

        // Trigger an upsert to save to file backing store and notify listeners
        messageNode.properties.readAt = new Date().toISOString();
        GraphService.upsertNode(messageNode);

        return { messageId, readAt: messageNode.properties.readAt, status: 'read' };
    }

    /**
     * Generates the mailbox preview for the healthcheck payload.
     * @returns {Promise<Object|null>}
     */
    async getHealthcheckPreview() {
        const me = RequestContextService.getAgentIdentityNodeId();
        if (!me) {
            return null; // No agent identity bound yet
        }

        const inboxResult = await this.listMessages({ box: 'inbox', limit: 100 }); // fetch enough to count unreads
        const outboxResult = await this.listMessages({ box: 'outbox', limit: 3 });

        let unreadCount = 0;
        let inboxPreview = [];

        for (const msg of inboxResult.messages) {
            if (!msg.readAt) {
                unreadCount++;
            }
            if (inboxPreview.length < 3) {
                inboxPreview.push({
                    id: msg.messageId,
                    // Legacy Data Remediation: Messages written during the #10184/#10181 incident
                    // window may lack a SENT_BY edge if the sender was identity-unbound.
                    // This fallback ensures schema compliance. New writes enforce bind-identity discipline.
                    from: msg.from || 'unknown',
                    subject: msg.subject ? msg.subject.substring(0, 60) + (msg.subject.length > 60 ? '...' : '') : '',
                    createdAt: msg.sentAt,
                    priority: msg.priority
                });
            }
        }

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
