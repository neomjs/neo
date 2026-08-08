import {FLEET_COCKPIT_SOURCES}        from './fleetCockpitStatus.mjs'
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs'
import {redactCredentials}            from './redactCredentials.mjs'

/**
 * @module ai/services/fleet/fleetMailboxMirrorAdapter
 * @summary Read-only, viewer-admitted per-agent A2A mailbox mirror for the Fleet cockpit — the S1
 * Brain half: `{subjectAgentId, limit, offset}` read under a bound request identity → immutable
 * message rows (timestamped facts) + thread metadata.
 *
 * **Admission is the primitive's, never re-implemented here.** The adapter consumes an injected
 * MailboxService-compatible `listMessages()` read path whose request binding IS the viewer — passing
 * `to: subjectAgentId` makes the service's own fail-closed `CAN_READ_INBOX_OF` gate decide the
 * cross-read. A missing grant surfaces as an explicit `admission.state: 'denied'` snapshot carrying
 * the service's honest error — never an empty-success. An agent reading its OWN inbox stays on the
 * existing `list_messages` path untouched — this mirror exists for the operator/control-plane
 * viewer ≠ subject case.
 *
 * **The audit viewer is derived, never asserted.** `admission.viewerIdentity` is read from
 * `resolveBoundIdentity()` — the same trusted request binding the read executes under
 * (`RequestContextService.getAgentIdentityNodeId()` in production wiring). A caller-supplied label
 * beside a separately-bound permission check is provenance, not admission evidence: it lets the
 * snapshot claim "viewer A was granted" when viewer B's bound service actually performed the read.
 * An optional `viewerIdentity` is therefore an *assertion* that is verified against the binding and
 * refuses the read on mismatch; with no binding resolvable, no admission claim is made at all.
 *
 * **The subject is one direct agent.** `AGENT:*` and other namespace pseudo-targets are rejected
 * before any read: `MailboxService.listMessages` deliberately skips `CAN_READ_INBOX_OF` for the
 * broadcast sentinel, so forwarding one would let this surface report `granted` for a target that
 * was never admission-checked.
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

/**
 * The scope whose specific failure — for the specific subject — is the ONLY thing this surface
 * reports as `denied`. Matching bare `Unauthorized` would misclassify any unrelated authorization
 * failure as the named admission decision.
 * @type {String}
 */
const ADMISSION_SCOPE = 'CAN_READ_INBOX_OF'

/**
 * @summary Read one agent's active inbox through a viewer-bound Memory Core read path and map it
 * into an immutable, auditable cockpit mirror snapshot.
 * @param {Object} options={}
 * @param {Object} [options.mailboxService] Service exposing `listMessages(args)`.
 * @param {Function} [options.listMessages] Direct `listMessages(args)` override for tests/callers —
 *     MUST execute under the same request identity `resolveBoundIdentity` reports.
 * @param {Function} [options.resolveBoundIdentity] Returns the identity the read executes under —
 *     production wiring passes `() => RequestContextService.getAgentIdentityNodeId()`. Its result is
 *     the audit viewer. Without it no admission claim can be made and the snapshot degrades.
 * @param {String} [options.viewerIdentity] OPTIONAL viewer assertion, verified against the bound
 *     identity. A mismatch refuses the read; it never overrides the binding on the audit fact.
 * @param {String} options.subjectAgentId Direct subject-agent identity whose inbox is mirrored
 *     (`@`-form accepted). Namespace pseudo-targets such as `AGENT:*` are rejected.
 * @param {Number} [options.limit] Page size; clamped to `[1, MAX_FLEET_MAILBOX_MIRROR_LIMIT]`.
 * @param {Number} [options.offset] Pagination offset; clamped to `>= 0`.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @returns {Promise<{capability: Object, admission: Object, rows: Object[], page: Object}>}
 */
export async function readFleetMailboxMirror({
    mailboxService = null,
    listMessages = null,
    resolveBoundIdentity = null,
    viewerIdentity = null,
    subjectAgentId = null,
    limit = DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT,
    offset = 0,
    capturedAt = new Date()
} = {}) {
    const
        readMessages = listMessages || mailboxService?.listMessages?.bind(mailboxService),
        viewer       = normalizeDirectAgentIdentity(resolveBoundIdentity?.()),
        asserted     = normalizeDirectAgentIdentity(viewerIdentity),
        subject      = normalizeDirectAgentIdentity(subjectAgentId),
        page         = {limit: normalizeLimit(limit), offset: normalizeOffset(offset)}

    if (!subject) {
        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            error: 'mailbox mirror requires one direct subjectAgentId — namespace targets are not admissible',
            page,
            subject,
            viewer
        })
    }

    // No binding → the snapshot cannot say who was admitted, so it does not claim admission at all.
    if (!viewer) {
        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            error: 'mailbox mirror requires a bound request identity to attribute admission',
            page,
            subject,
            viewer
        })
    }

    // A caller claiming an identity other than the one the read runs under is refused BEFORE the
    // read: the returned rows would be the bound viewer's, attributed to someone else.
    if (asserted && asserted !== viewer) {
        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            error: 'asserted viewerIdentity does not match the bound request identity',
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
        //
        // The read probes ONE row past the page. The producer returns a slice with no total, so
        // `count === limit` is ambiguous — it means "a full page" and cannot distinguish "more
        // follows" from "that was exactly the last one". A consumer forced to guess enables Next on
        // every full page and strands the operator on an empty window at a positive offset. One
        // extra row answers it honestly without a count query; the snapshot still returns at most
        // `limit`.
        const result = await readMessages({
            box   : 'inbox',
            status: 'all',
            to    : subject,
            limit : page.limit + 1,
            offset: page.offset
        })

        const probed = asArray(result?.messages)

        return createFleetMailboxMirrorSnapshot({
            capturedAt,
            hasMore : probed.length > page.limit,
            messages: probed.slice(0, page.limit),
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
 * @param {Error|String|null} [options.error] Read failure — the service's fail-closed
 *     `CAN_READ_INBOX_OF` throw FOR THIS SUBJECT maps to `admission.state: 'denied'`; every other
 *     failure degrades as `'unavailable'`. Never an empty-success.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @param {{limit: Number, offset: Number}} [options.page] Echoed pagination bounds.
 * @param {String|null} [options.viewer] Canonical viewer identity — the identity the read was bound
 *     to, never a caller-supplied label.
 * @param {String|null} [options.subject] Canonical direct subject-agent identity.
 * @returns {{capability: Object, admission: Object, rows: Object[], page: Object}}
 */
export function createFleetMailboxMirrorSnapshot({
    messages = [],
    error = null,
    capturedAt = new Date(),
    hasMore = false,
    page = {limit: DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT, offset: 0},
    viewer = null,
    subject = null
} = {}) {
    const observedAt = toIsoString(capturedAt)

    if (error) {
        const
            reason = normalizeError(error),
            denied = isSubjectAdmissionDenial(reason, subject)

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
            page: Object.freeze({...page, count: 0, hasMore: false})
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
        page: Object.freeze({...page, count: rows.length, hasMore: Boolean(hasMore)})
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
 * @summary Classify a read failure as THIS subject's admission denial.
 *
 * `MailboxService.listMessages` throws `Unauthorized: no CAN_READ_INBOX_OF permission for <target>`.
 * Matching the scope AND the subject keeps an unrelated authorization failure (an expired token, a
 * different scope, another target) from being reported as this subject's admission decision.
 * @param {String} reason Normalized failure reason.
 * @param {String|null} subject Canonical direct subject identity.
 * @returns {Boolean}
 * @private
 */
function isSubjectAdmissionDenial(reason, subject) {
    if (!subject) return false

    return reason.includes(`no ${ADMISSION_SCOPE} permission for ${subject}`)
}

/**
 * @summary Canonicalize a DIRECT AgentIdentity, rejecting namespace pseudo-targets.
 *
 * Delegates the `@`-form canonicalization to the graph primitive, then enforces what this surface
 * additionally requires: exactly one direct agent. The primitive deliberately returns namespace
 * forms (`AGENT:*`, `role:*`, `human:*`) unchanged — those are addressing schemes, and for this
 * adapter they are inadmissible rather than merely unnormalized.
 * @param {*} value Raw identity (`neo-x` and `@neo-x` both accepted).
 * @returns {String|null} Canonical `@<identity>`, or null when not a direct agent identity.
 * @private
 */
function normalizeDirectAgentIdentity(value) {
    const normalized = normalizeAgentIdentityNodeId(value)

    if (typeof normalized !== 'string') return null
    if (!normalized.startsWith('@'))    return null  // AGENT:*, role:*, and other schemes
    if (normalized.includes(':'))       return null  // '@ns:x' — scheme smuggled behind an @
    if (normalized === '@')             return null  // '@' / '@@' collapse to a nameless identity

    return normalized
}

/**
 * @summary Canonicalize an identity for row DISPLAY (sender), where any addressing form is honest.
 * @param {*} value Raw identity.
 * @returns {String|null}
 * @private
 */
function normalizeIdentity(value) {
    if (typeof value !== 'string' || !value.trim()) return null

    return normalizeAgentIdentityNodeId(value)
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

/**
 * @summary Strip credentials from text that crosses into the Body-facing snapshot.
 *
 * Subjects and failure reasons are peer/service-authored strings this surface republishes to the
 * cockpit, so redaction is the last boundary before a secret becomes operator-visible UI.
 *
 * Rule order is load-bearing: the scheme rule must run BEFORE the `key: value` rule, or
 * `Authorization: Bearer hunter2` matches `authorization` first, stops at the space after `Bearer`,
 * and republishes `hunter2` intact. Prefix rules cover the credential families this repository
 * actually handles — GitHub (`GH_TOKEN`) and GitLab (`GITLAB_PAT`) — plus the `Bearer` header form.
 * @param {String} text Untrusted text.
 * @returns {String}
 * @private
 */
function redactSecretText(text) {
    return redactCredentials(text)
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
