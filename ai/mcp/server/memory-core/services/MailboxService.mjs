import Base from '../../../../../src/core/Base.mjs';
import RequestContextService from '../../shared/services/RequestContextService.mjs';
import GraphService from './GraphService.mjs';
import PermissionService from './PermissionService.mjs';
import crypto from 'crypto';
import SemanticGraphExtractor from '../../../../daemons/services/SemanticGraphExtractor.mjs';

/**
 * @summary A2A (Agent-to-Agent) Messaging Service mapped to the Native Edge Graph.
 *
 * Implements the Mailbox primitives for direct or broadcast agent communications.
 * Messages are stored as graph nodes of `type: 'MESSAGE'`, with `SENT_BY` and `SENT_TO` edges.
 *
 * @class Neo.ai.mcp.server.memory-core.services.MailboxService
 * @extends Neo.core.Base
 * @singleton
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

        const messageId = `MESSAGE:${crypto.randomUUID()}`;
        const timestamp = new Date().toISOString();

        const isRoleOrHuman = to.startsWith('role:') || to.startsWith('human:');

        // Check reply permission
        if (!isRoleOrHuman && to !== 'AGENT:*' && to !== sentBy) {
            let canReply = PermissionService.hasPermission(sentBy, to, 'CAN_REPLY_TO');

            // Reachable counterparty logic: if they ever sent us a message, we can reply
            if (!canReply) {
                for (const edge of GraphService.db.edges.items) {
                    if (edge.type === 'SENT_TO' && edge.target === sentBy) {
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
     * @param {String} [args.from] Filter by specific sender
     * @param {Number} [args.limit=50] Maximum number of messages to return
     * @param {Number} [args.offset=0] Pagination offset
     * @returns {Promise<Object>}
     */
    async listMessages({ box = 'inbox', status = 'all', to, threadId, from, limit = 50, offset = 0 } = {}) {
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

                    if (from && sentByNodeId !== from) continue;
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
}

export default Neo.setupClass(MailboxService);
