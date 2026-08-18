import {
    createFleetCockpitEvent,
    FLEET_COCKPIT_SOURCES
} from './fleetCockpitStatus.mjs'
import {collisionPreventionTag} from '../shared/a2aCollisionTags.mjs'
import {redactCredentials}      from './redactCredentials.mjs'

/**
 * @module ai/services/fleet/fleetA2AActivityAdapter
 * @summary Maps Memory Core A2A mailbox summaries into bounded Fleet cockpit activity DTO rows.
 *
 * The adapter consumes MailboxService-compatible `listMessages()` output instead of importing the
 * singleton directly, so callers keep ownership of identity binding and read permissions. It never
 * copies full message bodies or task inputs into the cockpit DTO; the operator surface gets sender,
 * recipient (id + class — the viewer's own mailbox read already returns both, so the DTO discloses
 * nothing the caller could not read; the earlier class-only bound was relaxed deliberately for the
 * sender→recipient row rendering), subject/status metadata, related ticket ids, timestamps, and a
 * source label.
 *
 * Lane-claim detection rides the shared structural reader (`a2aCollisionTags`) — the same definition
 * the wake guard uses, so the two surfaces can never drift again. The adapter's question stays NARROW:
 * only `lane-claim` sets the flag; the wider collision class (`review-claim`, `claim-corrected`,
 * `drive-claimed`) is the guard's business, not the activity projection's.
 */

export const DEFAULT_FLEET_A2A_ACTIVITY_EVENT_LIMIT = 50

/**
 * @summary Read recent A2A mailbox summaries through a Memory Core-owned read path and map them into
 * Fleet cockpit activity events.
 * @param {Object} options={}
 * @param {Object} [options.mailboxService] Service exposing `listMessages(args)`.
 * @param {Function} [options.listMessages] Direct `listMessages(args)` override for tests/callers.
 * @param {Object} [options.listArgs] Explicit MailboxService query bounds.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @param {Number} [options.limit] Maximum events to return and default mailbox read bound.
 * @param {Date|String|null} [options.since] Lower timestamp bound for mapped events.
 * @param {Date|String|null} [options.until] Upper timestamp bound for mapped events.
 * @returns {Promise<{capability: Object, events: Object[]}>}
 */
export async function readFleetA2AActivitySnapshot({
    mailboxService = null,
    listMessages = null,
    listArgs = {},
    capturedAt = new Date(),
    limit = DEFAULT_FLEET_A2A_ACTIVITY_EVENT_LIMIT,
    since = null,
    until = null
} = {}) {
    const readMessages = listMessages || mailboxService?.listMessages?.bind(mailboxService)

    if (!readMessages) {
        return createFleetA2AActivitySnapshot({
            capturedAt,
            error: 'Memory Core mailbox read path unavailable',
            limit
        })
    }

    try {
        const result = await readMessages({
            box   : 'all',
            status: 'all',
            limit : normalizeLimit(limit),
            ...listArgs
        })

        return createFleetA2AActivitySnapshot({
            capturedAt,
            limit,
            messages: result?.messages || [],
            since,
            until
        })
    } catch (error) {
        return createFleetA2AActivitySnapshot({
            capturedAt,
            error,
            limit
        })
    }
}

/**
 * @summary Build a cockpit activity snapshot from already-read Memory Core mailbox summaries.
 * @param {Object} options={}
 * @param {Object[]} options.messages Message summaries from `MailboxService.listMessages()`.
 * @param {Error|String|null} options.error Source-read failure; returns degraded capability.
 * @param {Date|String} options.capturedAt Capture timestamp.
 * @param {Number} options.limit Maximum events to return.
 * @param {Date|String|null} options.since Lower timestamp bound for mapped events.
 * @param {Date|String|null} options.until Upper timestamp bound for mapped events.
 * @returns {{capability: Object, events: Object[]}}
 */
export function createFleetA2AActivitySnapshot({
    messages = [],
    error = null,
    capturedAt = new Date(),
    limit = DEFAULT_FLEET_A2A_ACTIVITY_EVENT_LIMIT,
    since = null,
    until = null
} = {}) {
    const observedAt = toIsoString(capturedAt)

    if (error) {
        const reason = normalizeError(error)

        return {
            capability: createA2AActivityCapability({
                capturedAt: observedAt,
                confidence: 'none',
                reason,
                state     : 'degraded'
            }),
            events: [createFleetCockpitEvent({
                type      : 'source-degraded',
                source    : FLEET_COCKPIT_SOURCES.a2a,
                confidence: 'none',
                occurredAt: observedAt,
                payload   : {
                    adapter: 'a2a-mailbox',
                    kind   : 'source-degraded',
                    reason
                }
            })]
        }
    }

    const events = createA2AMessageActivityEvents(messages, {capturedAt, since, until})
        .sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0))
        .slice(0, normalizeLimit(limit))

    return {
        capability: createA2AActivityCapability({
            capturedAt: observedAt,
            confidence: 'observed',
            state     : 'wired'
        }),
        events
    }
}

/**
 * @summary Convert Memory Core mailbox summaries into bounded Fleet cockpit activity events.
 * @param {Object[]} messages Message summaries from `MailboxService.listMessages()`.
 * @param {Object} options
 * @param {Date|String} options.capturedAt Fallback timestamp.
 * @param {Date|String|null} options.since Lower timestamp bound.
 * @param {Date|String|null} options.until Upper timestamp bound.
 * @returns {Object[]}
 */
export function createA2AMessageActivityEvents(messages = [], {capturedAt = new Date(), since = null, until = null} = {}) {
    const
        sinceTime = toTime(since),
        untilTime = toTime(until)

    return asArray(messages)
        .filter(Boolean)
        .map(message => normalizeA2AMessage(message, capturedAt))
        .filter(message => isWithinBounds(message.occurredAt, sinceTime, untilTime))
        .map(message => createFleetCockpitEvent({
            type      : message.isLaneClaim ? 'lane-claim' : 'a2a-activity',
            source    : FLEET_COCKPIT_SOURCES.a2a,
            agentId   : message.from,
            confidence: 'observed',
            occurredAt: message.occurredAt,
            payload   : {
                kind               : message.isLaneClaim ? 'a2a-lane-claim' : 'a2a-message',
                messageId          : message.messageId,
                subject            : message.subject,
                from               : message.from,
                to                 : message.to,
                priority           : message.priority,
                recipientClass     : message.recipientClass,
                relatedTickets     : message.relatedTickets,
                relatedPullRequests: message.relatedPullRequests,
                status             : message.status,
                taskState          : message.taskState,
                wakeSuppressed     : message.wakeSuppressed
            }
        }))
}

function normalizeA2AMessage(message, capturedAt) {
    const subject = normalizeSubject(message.subject)

    return {
        messageId: typeof message.messageId === 'string' ? message.messageId : null,
        subject,
        from     : normalizeAgentId(message.from),
        // the raw recipient rides beside its class: the class answers "what kind of send", the
        // identity answers "to whom" — the operator surface renders sender→recipient from it
        to                 : typeof message.to === 'string' && message.to !== '' ? message.to : null,
        priority           : message.priority || null,
        recipientClass     : getRecipientClass(message.to),
        relatedTickets     : normalizeRelatedTickets(message.relatedTickets),
        relatedPullRequests: normalizeRelatedPullRequests(message.relatedPullRequests),
        status             : getMessageStatus(message),
        taskState          : message.task?.state || null,
        wakeSuppressed     : Boolean(message.wakeSuppressed),
        occurredAt         : toIsoString(message.sentAt || message.createdAt, capturedAt),
        // Classify the RAW subject: the display form above is whitespace-collapsed and truncated,
        // and the reader's grammar is segments and length — normalizing the evidence first can
        // erase a claim that opens a later line or lands past the display boundary.
        isLaneClaim        : collisionPreventionTag({subject: message.subject, taggedConcepts: message.taggedConcepts}) === 'lane-claim'
    }
}

function createA2AActivityCapability({capturedAt, confidence, reason = null, state}) {
    return {
        source: FLEET_COCKPIT_SOURCES.activity,
        state,
        confidence,
        capturedAt,
        reason
    }
}

function getMessageStatus(message) {
    if (message.retracted) return 'retracted'
    if (message.archivedAt) return 'archived'
    if (message.readAt) return 'read'

    return 'unread'
}

function getRecipientClass(to) {
    if (!to) return 'unknown'
    if (to === 'AGENT:*') return 'broadcast'
    if (String(to).startsWith('@')) return 'agent'
    if (String(to).startsWith('role:')) return 'role'
    if (String(to).startsWith('human:')) return 'human'

    return 'other'
}

function normalizeAgentId(value) {
    if (!value) return null
    if (typeof value === 'string') return value.replace(/^@/, '')

    return value.login || value.name || null
}

function normalizeSubject(subject) {
    if (!subject) return null

    return redactSecretText(String(subject).replace(/\s+/g, ' ').trim()).slice(0, 180)
}

function normalizeRelatedTickets(values = []) {
    return asArray(values)
        .map(value => Number(String(value).replace(/^#/, '')))
        .filter(value => Number.isSafeInteger(value) && value > 0)
        .sort((a, b) => a - b)
}

function normalizeRelatedPullRequests(values = []) {
    return asArray(values)
        .map(value => typeof value === 'number' ? value : Number(value?.number || value?.ticket?.replace?.(/^#/, '')))
        .filter(value => Number.isSafeInteger(value) && value > 0)
        .sort((a, b) => a - b)
}

function isWithinBounds(value, sinceTime, untilTime) {
    const time = toTime(value)

    if (sinceTime !== null && time < sinceTime) return false
    if (untilTime !== null && time > untilTime) return false

    return true
}

function normalizeLimit(value) {
    const limit = Number(value)

    return Number.isFinite(limit) ? Math.max(0, limit) : DEFAULT_FLEET_A2A_ACTIVITY_EVENT_LIMIT
}

function normalizeError(error) {
    return redactSecretText(String(error?.message || error || 'source unavailable')).replace(/\s+/g, ' ').slice(0, 240)
}

function redactSecretText(text) {
    return redactCredentials(text)
}

function toIsoString(value, fallback = new Date()) {
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()

    const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback)
    return fallbackDate.toISOString()
}

function toTime(value) {
    if (!value) return null

    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}
