import {
    createFleetCockpitEvent,
    FLEET_COCKPIT_SOURCES
} from '../../../src/ai/fleet/fleetCockpitStatus.mjs'
import {
    extractIssueCommentBlocks,
    getPrDeferDisposition,
    getPrHumanGateState
} from '../graph/issueFocusSections.mjs'
import {redactCredentials} from './redactCredentials.mjs'

/**
 * @module ai/services/fleet/fleetPrLaneActivityAdapter
 * @summary Maps GitHub Workflow / work-graph facts into the bounded Fleet cockpit activity DTO.
 *
 * This adapter is deliberately source-specific: GitHub PR/issue/lane-state and graph stall facts
 * become small, source-labeled cockpit events. Comment-derived lane claims are heuristic issue
 * comment matches, not authoritative graph lane-state facts. It does not add a FleetControlBridge
 * wire method and does not stream full comment bodies into the Body-side DTO; bodies are only
 * pattern input for deriving ids, timestamps, and event class.
 */

export const DEFAULT_FLEET_ACTIVITY_EVENT_LIMIT = 50

const LANE_CLAIM_PATTERN = /\[(?:lane-claim|claiming)\]|\blane-state:\s*next-lane\b|\b(?:taking|claiming)\s+#\d+\b/i

/**
 * @summary Build one cockpit activity snapshot from already-read GitHub / graph facts.
 *
 * @param {Object} options={}
 * @param {Object[]} options.prs Open or recent PR payloads from GitHub Workflow.
 * @param {Object[]} options.issues Open or recent issue payloads from GitHub Workflow / local sync.
 * @param {Object[]} options.stallFindings Work-graph stall findings from `issueFocusSections`.
 * @param {Error|String|null} options.error Source-read failure; returns degraded capability.
 * @param {Date|String} options.capturedAt Capture timestamp.
 * @param {Number} options.limit Maximum events to return.
 * @returns {{capability: Object, events: Object[]}}
 */
export function createFleetPrLaneActivitySnapshot({
    prs = [],
    issues = [],
    stallFindings = [],
    error = null,
    capturedAt = new Date(),
    limit = DEFAULT_FLEET_ACTIVITY_EVENT_LIMIT
} = {}) {
    const observedAt = toIsoString(capturedAt)

    if (error) {
        return {
            capability: createActivityCapability({
                capturedAt: observedAt,
                confidence: 'none',
                reason    : normalizeError(error),
                state     : 'degraded'
            }),
            events: [createFleetCockpitEvent({
                type      : 'source-degraded',
                source    : FLEET_COCKPIT_SOURCES.activity,
                confidence: 'none',
                occurredAt: observedAt,
                payload   : {
                    kind  : 'source-degraded',
                    reason: normalizeError(error)
                }
            })]
        }
    }

    const events = [
        ...createPrActivityEvents(prs, {capturedAt: observedAt}),
        ...createIssueActivityEvents(issues, {capturedAt: observedAt}),
        ...createStallActivityEvents(stallFindings, {capturedAt: observedAt})
    ]
        .sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0))
        .slice(0, Math.max(0, limit))

    return {
        capability: createActivityCapability({
            capturedAt: observedAt,
            confidence: 'observed',
            state     : 'wired'
        }),
        events
    }
}

/**
 * @summary Convert PR payloads into bounded Fleet cockpit activity events.
 * @param {Object[]} prs GitHub PR payloads.
 * @param {Object} options
 * @param {Date|String} options.capturedAt Fallback timestamp.
 * @returns {Object[]}
 */
export function createPrActivityEvents(prs = [], {capturedAt = new Date()} = {}) {
    return asArray(prs)
        .filter(Boolean)
        .map(pr => {
            const number         = getNumber(pr.number),
                  author         = getLogin(pr.author),
                  relatedTickets = extractRefs(`${pr.title || ''} ${pr.body || ''}`)

            const humanGateState = getPrHumanGateState(pr)

            return createFleetCockpitEvent({
                type      : 'pr-activity',
                source    : FLEET_COCKPIT_SOURCES.githubPr,
                agentId   : author,
                confidence: 'observed',
                occurredAt: toIsoString(pr.updatedAt || pr.mergedAt || pr.closedAt || pr.createdAt, capturedAt),
                payload   : {
                    kind            : 'pull-request',
                    number,
                    title           : pr.title || null,
                    url             : pr.url || null,
                    state           : pr.state || null,
                    author,
                    reviewDecision  : pr.reviewDecision || null,
                    isDraft         : Boolean(pr.isDraft),
                    relatedPrs      : number ? [number] : [],
                    relatedTickets,
                    deferDisposition: normalizeDeferDisposition(getPrDeferDisposition(pr, new Date(capturedAt))),
                    humanGateState  : {
                        ...humanGateState,
                        changedRequested: Boolean(humanGateState.changedRequested)
                    }
                }
            })
        })
}

/**
 * @summary Convert issue and lane-claim facts into bounded Fleet cockpit events.
 * @param {Object[]} issues GitHub issue or local-sync issue payloads.
 * @param {Object} options
 * @param {Date|String} options.capturedAt Fallback timestamp.
 * @returns {Object[]}
 */
export function createIssueActivityEvents(issues = [], {capturedAt = new Date()} = {}) {
    const events = []

    for (const issue of asArray(issues).filter(Boolean)) {
        const normalized = normalizeIssue(issue, capturedAt)

        events.push(createFleetCockpitEvent({
            type      : 'issue-activity',
            source    : FLEET_COCKPIT_SOURCES.githubIssue,
            agentId   : normalized.assignees[0] || null,
            confidence: 'observed',
            occurredAt: normalized.updatedAt || normalized.createdAt,
            payload   : {
                kind          : 'issue',
                number        : normalized.number,
                title         : normalized.title,
                url           : normalized.url,
                state         : normalized.state,
                assignees     : normalized.assignees,
                labels        : normalized.labels,
                relatedTickets: normalized.relatedTickets
            }
        }))

        for (const comment of normalized.comments) {
            if (!LANE_CLAIM_PATTERN.test(comment.body || '')) continue;

            events.push(createFleetCockpitEvent({
                type      : 'lane-claim',
                source    : FLEET_COCKPIT_SOURCES.commentLane,
                agentId   : comment.author || null,
                confidence: 'observed',
                occurredAt: toIsoString(comment.createdAt, normalized.updatedAt || capturedAt),
                payload   : {
                    kind          : 'lane-claim',
                    issueNumber   : normalized.number,
                    issueTitle    : normalized.title,
                    issueUrl      : normalized.url,
                    commentId     : comment.id || null,
                    author        : comment.author || null,
                    relatedTickets: [...new Set([
                        ...normalized.relatedTickets,
                        ...extractRefs(comment.body || '')
                    ])]
                }
            }))
        }
    }

    return events
}

/**
 * @summary Convert work-graph stall findings into cockpit activity events.
 * @param {Object[]} stallFindings Findings from `buildWorkGraphStallFindings`.
 * @param {Object} options
 * @param {Date|String} options.capturedAt Fallback timestamp.
 * @returns {Object[]}
 */
export function createStallActivityEvents(stallFindings = [], {capturedAt = new Date()} = {}) {
    return asArray(stallFindings)
        .filter(Boolean)
        .map(finding => createFleetCockpitEvent({
            type      : 'work-stall',
            source    : FLEET_COCKPIT_SOURCES.graphStall,
            agentId   : finding.subject?.owner || null,
            confidence: finding.sourceFidelity === 'candidate' || finding.grade === 'candidate-stall' ? 'inferred' : 'observed',
            occurredAt: toIsoString(finding.observedAt || finding.lastVerifiedAt || finding.waitingSince, capturedAt),
            payload   : {
                kind              : 'work-stall',
                findingClass      : finding.findingClass || null,
                grade             : finding.grade || null,
                motionPredicate   : finding.motionPredicate || null,
                evidenceRefs      : asArray(finding.evidenceRefs),
                verificationSource: finding.verificationSource || null,
                waitingSince      : finding.waitingSince || null,
                subject           : normalizeSubject(finding.subject)
            }
        }))
}

function createActivityCapability({capturedAt, confidence, reason = null, state}) {
    return {
        source: FLEET_COCKPIT_SOURCES.activity,
        state,
        confidence,
        capturedAt,
        reason
    }
}

function normalizeIssue(issue, capturedAt) {
    const meta     = issue.meta || issue,
          number   = getNumber(issue.number || meta.number || meta.id),
          title    = issue.title || meta.title || null,
          content  = issue.content || issue.body || '',
          comments = normalizeComments(issue, content)

    return {
        number,
        title,
        url           : issue.url || meta.githubUrl || meta.url || null,
        state         : issue.state || meta.state || null,
        createdAt     : toIsoString(issue.createdAt || meta.createdAt, capturedAt),
        updatedAt     : toIsoString(issue.updatedAt || meta.updatedAt || issue.createdAt || meta.createdAt, capturedAt),
        assignees     : normalizeLogins(issue.assignees || meta.assignees),
        labels        : normalizeLabels(issue.labels || meta.labels),
        relatedTickets: extractRefs(`${title || ''} ${content}`),
        comments
    }
}

function normalizeComments(issue, content = '') {
    const commentNodes = issue.comments?.nodes || issue.comments || []

    if (Array.isArray(commentNodes) && commentNodes.length > 0) {
        return commentNodes.map(comment => ({
            id       : comment.id || comment.node_id || null,
            author   : getLogin(comment.author || comment.user),
            body     : comment.body || '',
            createdAt: comment.createdAt || comment.created_at || comment.submittedAt || null
        }))
    }

    return extractIssueCommentBlocks(content)
}

function normalizeSubject(subject = {}) {
    if (!subject || typeof subject !== 'object') return null

    return {
        id    : subject.id || null,
        number: getNumber(subject.number),
        owner : subject.owner || null,
        title : subject.title || null,
        type  : subject.type || null,
        url   : subject.url || null
    }
}

function normalizeDeferDisposition(disposition = {}) {
    return {
        anchorArtifact: disposition.anchorArtifact || null,
        authority     : disposition.authority || null,
        deferredAt    : disposition.deferredAt || null,
        evidenceRefs  : asArray(disposition.evidenceRefs),
        state         : disposition.state || 'none'
    }
}

function normalizeLabels(labels = []) {
    return asArray(labels)
        .map(label => typeof label === 'string' ? label : label?.name)
        .filter(Boolean)
}

function normalizeLogins(values = []) {
    return asArray(values)
        .map(getLogin)
        .filter(Boolean)
}

function getLogin(value) {
    if (!value) return null
    if (typeof value === 'string') return value.replace(/^@/, '')

    return value.login || value.name || null
}

function getNumber(value) {
    const number = Number(value)

    return Number.isFinite(number) ? number : null
}

function extractRefs(text = '') {
    const refs = new Set()

    for (const match of String(text).matchAll(/#(\d+)/g)) {
        refs.add(Number(match[1]))
    }

    return [...refs].sort((a, b) => a - b)
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

function asArray(value) {
    return Array.isArray(value) ? value : []
}
