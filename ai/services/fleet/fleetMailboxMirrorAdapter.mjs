import {FLEET_COCKPIT_SOURCES} from '../../../src/ai/fleet/fleetCockpitStatus.mjs'

/**
 * @module ai/services/fleet/fleetMailboxMirrorAdapter
 * @summary Read-only, viewer-admitted per-agent A2A mailbox mirror for the Fleet cockpit — the S1
 * Brain half: `{viewerIdentity, subjectAgentId, limit, offset}` → immutable message rows
 * (timestamped facts) + thread metadata.
 *
 * **Admission is the primitive's, never re-implemented here.** The adapter consumes an injected
 * MailboxService-compatible `listMessages()` read path whose session binding IS the viewer — passing
 * `to: subjectAgentId` makes the service's own fail-closed `CAN_READ_INBOX_OF` gate decide the
 * cross-read. A missing grant surfaces as an explicit `admission.state: 'denied'` snapshot carrying
 * the service's honest error — never an empty-success. The `viewerIdentity` parameter is the
 * auditable mapping fact (who is looking, canonicalized), not an enforcement input: the wiring owns
 * the identity binding, exactly like the sibling activity adapter's DI contract. An agent reading
 * its OWN inbox stays on the existing `list_messages` path untouched — this mirror exists for the
 * operator/control-plane viewer ≠ subject case.
 *
 * **Structurally read-only.** The module exports read/projection functions only: no markRead, no
 * archive, no mutation verb exists on this surface — operator-side mark-read would mutate the
 * agent's own turn-start signal and silently swallow peer handoffs (the graduated record's
 * MUST-NOT). The active/non-archived inbox is likewise structural: the adapter never forwards an
 * `includeArchived` key, so the service default (exclude archived) always governs; archive browsing
 * is out of scope by design.
 *
 * Rows are frozen summary facts (subject, sender, recipient class, priority, read status,
 * timestamps, `partOfThread` thread metadata, related tickets) — never full message bodies.
 */

export const DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT = 50
export const MAX_FLEET_MAILBOX_MIRROR_LIMIT     = 200

const ADMISSION_DENIED_RE = /\bCAN_READ_INBOX_OF\b|\bUnauthorized\b/

/**
 * @summary Read one agent's active inbox through a viewer-bound Memory Core read path and map it
 * into an immutable, auditable cockpit mirror snapshot.
 * @param {Object} options={}
 * @param {Object} [options.mailboxService] Service exposing `listMessages(args)`.
 * @param {Function} [options.listMessages] Direct `listMessages(args)` override for tests/callers —
 *     MUST be bound to the VIEWER identity (the wiring owns identity binding + read permissions).
 * @param {String} options.viewerIdentity Canonical viewer identity (`@`-form accepted) — the
 *     auditable who-is-looking fact carried on the snapshot's admission block.
 * @param {String} options.subjectAgentId Canonical subject-agent identity whose inbox is mirrored.
 * @param {Number} [options.limit] Page size; clamped to `[1, MAX_FLEET_MAILBOX_MIRROR_LIMIT]`.
 * @param {Number} [options.offset] Pagination offset; clamped to `>= 0`.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @returns {Promise<{capability: Object, admission: Object, rows: Object[], page: Object}>}
 */
export async function readFleetMailboxMirror({
    mailboxService = null,
    listMessages = null,
    viewerIdentity = null,
    subjectAgentId = null,
    limit = DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT,
    offset = 0,
    capturedAt = new Date()
} = {}) {
    const
        readMessages = listMessages || mailboxService?.listMessages?.bind(mailboxService),
        viewer       = normalizeIdentity(viewerIdentity),
        subject      = normalizeIdentity(subjectAgentId),
        page         = {limit: normalizeLimit(limit), offset: normalizeOffset(offset)}

    if (!viewer || !subject) {
        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            error: 'mailbox mirror requires canonical viewerIdentity and subjectAgentId',
            page,
            subject,
            viewer
        })
    }

    if (!readMessages) {
        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            error: 'Memory Core mailbox read path unavailable',
            page,
            subject,
            viewer
        })
    }

    try {
        // Deliberately NO `includeArchived` key: the service default (active inbox) always governs.
        const result = await readMessages({
            box   : 'inbox',
            status: 'all',
            to    : subject,
            limit : page.limit,
            offset: page.offset
        })

        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            messages: result?.messages || [],
            page,
            subject,
            viewer
        })
    } catch (error) {
        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            error,
            page,
            subject,
            viewer
        })
    }
}

/**
 * @summary Build the immutable mirror snapshot from already-read mailbox summaries (pure half).
 * @param {Object} options={}
 * @param {Object[]} [options.messages] Message summaries from `MailboxService.listMessages()`.
 * @param {Error|String|null} [options.error] Read failure — an admission denial (the service's
 *     fail-closed `CAN_READ_INBOX_OF` throw) maps to `admission.state: 'denied'`; anything else
 *     degrades as a source error. Never an empty-success.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @param {{limit: Number, offset: Number}} [options.page] Echoed pagination bounds.
 * @param {String|null} [options.viewer] Canonical viewer identity.
 * @param {String|null} [options.subject] Canonical subject-agent identity.
 * @returns {{capability: Object, admission: Object, rows: Object[], page: Object}}
 */
export function createFleetMailboxMirrorSnapshot({
    messages = [],
    error = null,
    capturedAt = new Date(),
    page = {limit: DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT, offset: 0},
    viewer = null,
    subject = null
} = {}) {
    const observedAt = toIsoString(capturedAt)

    if (error) {
        const
            reason = normalizeError(error),
            denied = ADMISSION_DENIED_RE.test(reason)

        return Object.freeze({
            capability: createMirrorCapability({
                capturedAt: observedAt,
                confidence: 'none',
                reason,
                state     : 'degraded'
            }),
            admission: createAdmissionFact({
                checkedAt: observedAt,
                reason,
                state    : denied ? 'denied' : 'unavailable',
                subject,
                viewer
            }),
            rows: Object.freeze([]),
            page: Object.freeze({...page, count: 0})
        })
    }

    const rows = Object.freeze(asArray(messages).filter(Boolean).map(message => createMirrorRow(message, observedAt)))

    return Object.freeze({
        capability: createMirrorCapability({
            capturedAt: observedAt,
            confidence: 'observed',
            state     : 'wired'
        }),
        admission: createAdmissionFact({
            checkedAt: observedAt,
            state    : 'granted',
            subject,
            viewer
        }),
        rows,
        page: Object.freeze({...page, count: rows.length})
    })
}

/**
 * @summary Project one mailbox summary into a frozen, body-free mirror row (timestamped fact).
 * @param {Object} message Mailbox summary from `MailboxService.listMessages()`.
 * @param {String} observedAt Fallback ISO timestamp.
 * @returns {Object}
 */
function createMirrorRow(message, observedAt) {
    return Object.freeze({
        messageId     : typeof message.messageId === 'string' ? message.messageId : null,
        subject       : normalizeSubject(message.subject),
        from          : normalizeIdentity(message.from),
        recipientClass: getRecipientClass(message.to),
        priority      : message.priority || null,
        status        : getMessageStatus(message),
        taskState     : message.task?.state || null,
        partOfThread  : typeof message.partOfThread === 'string' ? message.partOfThread : null,
        relatedTickets: normalizeRelatedTickets(message.relatedTickets),
        wakeSuppressed: Boolean(message.wakeSuppressed),
        sentAt        : toIsoString(message.sentAt || message.createdAt, observedAt),
        readAt        : message.readAt ? toIsoString(message.readAt, observedAt) : null
    })
}

function createMirrorCapability({capturedAt, confidence, reason = null, state}) {
    return Object.freeze({
        source: FLEET_COCKPIT_SOURCES.a2a,
        state,
        confidence,
        capturedAt,
        reason
    })
}

function createAdmissionFact({checkedAt, reason = null, state, subject, viewer}) {
    return Object.freeze({
        state,
        viewerIdentity: viewer,
        subjectAgentId: subject,
        checkedAt,
        reason
    })
}

function getMessageStatus(message) {
    if (message.retracted) return 'retracted'
    if (message.readAt) return 'read'

    return 'unread'
}

function getRecipientClass(to) {
    if (!to) return 'unknown'
    if (to === 'AGENT:*') return 'broadcast'
    if (String(to).startsWith('@')) return 'agent'

    return 'other'
}

/**
 * @summary Canonicalize an identity to the graph's `@`-prefixed node-id form.
 * @param {String|null} value Raw identity (`neo-x` and `@neo-x` both accepted).
 * @returns {String|null}
 */
function normalizeIdentity(value) {
    if (typeof value !== 'string') return null

    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed === 'AGENT:*') return trimmed

    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function normalizeSubject(subject) {
    if (!subject) return null

    return redactSecretText(String(subject).replace(/\s+/g, ' ').trim()).slice(0, 180)
}

function normalizeRelatedTickets(values = []) {
    return Object.freeze(asArray(values)
        .map(value => Number(String(value).replace(/^#/, '')))
        .filter(value => Number.isSafeInteger(value) && value > 0)
        .sort((a, b) => a - b))
}

function normalizeLimit(value) {
    const limit = Number(value)

    if (!Number.isFinite(limit)) return DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT

    return Math.min(MAX_FLEET_MAILBOX_MIRROR_LIMIT, Math.max(1, Math.trunc(limit)))
}

function normalizeOffset(value) {
    const offset = Number(value)

    return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0
}

function normalizeError(error) {
    return redactSecretText(String(error?.message || error || 'source unavailable')).replace(/\s+/g, ' ').slice(0, 240)
}

function redactSecretText(text) {
    return text
        .replace(/\b(token|secret|password|pat|credential|privateKey|signingKey)\s*[:=]\s*[^\s,;)]+/gi, '$1=[redacted]')
        .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, '[redacted-token]')
}

function toIsoString(value, fallback = new Date()) {
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()

    const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback)
    return fallbackDate.toISOString()
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}
