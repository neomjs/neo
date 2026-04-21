import Base from '../../../../../src/core/Base.mjs';
import RequestContextService from '../../shared/services/RequestContextService.mjs';
import GraphService from './GraphService.mjs';
import PermissionService from './PermissionService.mjs';
import crypto from 'crypto';

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
     * @param {String} args.to
     * @param {String} args.subject
     * @param {String} args.body
     * @returns {Promise<Object>}
     */
    async addMessage({ to, subject, body }) {
        const sentBy = RequestContextService.getAgentIdentityNodeId();
        if (!sentBy) {
            throw new Error("Cannot send message: no agent identity context bound. Ensure StdioIdentityResolver or OIDC transport is active.");
        }

        const messageId = `MESSAGE:${crypto.randomUUID()}`;
        const timestamp = new Date().toISOString();

        // Check reply permission
        if (to !== 'AGENT:*' && to !== sentBy) {
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
                sentAt: timestamp,
                readAt: null
            }
        });

        // 2. Map the routing edges
        GraphService.linkNodes(messageId, sentBy, 'SENT_BY', 1.0, { timestamp });
        GraphService.linkNodes(messageId, to, 'SENT_TO', 1.0, { timestamp });

        return { messageId, sentAt: timestamp, status: 'sent' };
    }

    /**
     * Lists messages sent to the calling agent or broadcast.
     * @param {Object} args
     * @param {String} [args.status='all']
     * @returns {Promise<Object>}
     */
    async listMessages({ status = 'all', to } = {}) {
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
        const messages = [];

        // Simple iteration over edges for now; fine for A2A scale.
        for (const edge of db.edges.items) {
            if (edge.type === 'SENT_TO' && (edge.target === target || edge.target === 'AGENT:*')) {
                const messageNode = db.nodes.get(edge.source);
                if (messageNode && messageNode.label === 'MESSAGE') {
                    const isUnread = !messageNode.properties.readAt;
                    if (status === 'unread' && !isUnread) continue;

                    let sentByNodeId = null;
                    for (const sourceEdge of db.edges.items) {
                        if (sourceEdge.source === messageNode.id && sourceEdge.type === 'SENT_BY') {
                            sentByNodeId = sourceEdge.target;
                            break;
                        }
                    }

                    messages.push({
                        messageId: messageNode.id,
                        subject: messageNode.properties.subject,
                        sentAt: messageNode.properties.sentAt,
                        readAt: messageNode.properties.readAt,
                        from: sentByNodeId,
                        to: edge.target
                    });
                }
            }
        }

        messages.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        return { messages };
    }

    /**
     * Retrieves a single message.
     * @param {Object} args
     * @param {String} args.messageId
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
     * @param {String} args.messageId
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
