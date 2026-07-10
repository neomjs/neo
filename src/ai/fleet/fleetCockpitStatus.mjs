const WIRE_SOURCES = Object.freeze({
        activity   : 'fleet:activity-adapters',
        a2a        : 'memory-core:mailbox',
        githubPr   : 'github-workflow:pull-requests',
        githubIssue: 'github-workflow:issues',
        commentLane: 'github-workflow:issue-comments',
        graphLane  : 'graph:lane-state',
        graphStall : 'graph:work-stall',
        repoStatus : 'fleet:fleetStatus',
        roster     : 'fleet:listAgents',
        runtime    : 'fleet:runtimeStatus',
        lifecycle  : 'fleet:lifecycle'
    })

export const FLEET_COCKPIT_EVENT_TYPES = Object.freeze([
    'lifecycle-request',
    'lifecycle-success',
    'lifecycle-failure',
    'bridge-unavailable',
    'bridge-gated',
    'a2a-activity',
    'pr-activity',
    'issue-activity',
    'lane-claim',
    'work-stall',
    'source-degraded'
])

/**
 * @summary Source labels for the Fleet Manager cockpit DTO. These labels are deliberately stable and
 * transport-agnostic: the Body-side cockpit can explain which live substrate produced each row or
 * event without importing the Node-only FleetControlBridge / registry / lifecycle service chain.
 * @type {Object}
 */
export const FLEET_COCKPIT_SOURCES = Object.freeze({...WIRE_SOURCES})

const GITHUB_AVATAR_SIZE = 80 // small cockpit-appropriate size (~2x the 40px card avatar); GitHub serves it via the `size` param

/**
 * @summary Derive an agent's profile-avatar URL from its GitHub account. The crafted per-agent avatars
 * live on the agents' GitHub accounts, so the sized avatar is fetchable directly from the username via
 * GitHub's `https://github.com/{username}.png?size=N` endpoint — no manual avatar write needed for the
 * common case. Returns null when there is no username to derive from.
 * @param {String|null} githubUsername
 * @returns {String|null}
 */
function githubAvatarUrl(githubUsername) {
    return githubUsername ? `https://github.com/${githubUsername}.png?size=${GITHUB_AVATAR_SIZE}` : null
}

/**
 * @summary Build the first Fleet Manager cockpit snapshot from the already-shipped bridge reads:
 * `listAgents()` for the redacted roster, `fleetStatus()` for repo-provisioning state, and
 * `fleetRuntimeStatus()` for live process truth when the assembler supplies it. A2A/PR/lane activity
 * stays an explicit capability slot, not guessed browser state; an unwired adapter is rendered as
 * `not-wired` so Lane 1 never mistakes placeholder data for fact.
 *
 * Identity display facts (`family` + `engineTag`) pass through from the supplied agents when the
 * Brain-side assembler enriched them (the `resolveIdentityDisplay` join at the assembler — this Body-side
 * map stays pure and never imports `ai/graph`); un-enriched agents yield `null`, which the cockpit
 * renders as unclassified / tagless, never guessed.
 *
 * @param {Object}   options={}
 * @param {Object[]} options.agents        Public agent definitions from `registryBridge.listAgents()`,
 *     optionally identity-enriched with `family` / `engineTag` by the assembler.
 * @param {Object[]} options.fleetStatus   Repo-status entries from `registryBridge.fleetStatus()`.
 * @param {Object[]} options.runtimeStatus Optional per-agent process entries from
 *     `registryBridge.fleetRuntimeStatus()` — rows carry an observed `lifecycle` when present.
 * @param {Object[]} options.events        Optional already-normalized cockpit events.
 * @param {Object}   options.capabilities  Optional source-capability overrides from wired adapters.
 * @returns {Object} serializable cockpit DTO `{sources, capabilities, rows, events}`.
 */
export function createFleetCockpitStatus({agents = [], fleetStatus = [], runtimeStatus = [], events = [], capabilities = {}} = {}) {
    const suppliedCapabilities = capabilities || {}

    const statusByAgentId = new Map(
        fleetStatus.map(status => [status.agentId || status.id, sanitizePayload(status)])
    )

    const runtimeByAgentId = new Map(
        runtimeStatus.map(entry => [entry.agentId || entry.id, sanitizePayload(entry)])
    )

    return {
        sources     : FLEET_COCKPIT_SOURCES,
        capabilities: {
            activity: suppliedCapabilities.activity || createNotWiredCapability(FLEET_COCKPIT_SOURCES.activity, 'A2A / PR / lane activity adapter not wired'),
            runtime : suppliedCapabilities.runtime || createNotWiredCapability(FLEET_COCKPIT_SOURCES.runtime, 'runtime process status is pending the Fleet runtime-status wire method')
        },
        rows: agents.map(agent => {
            const publicAgent = sanitizePayload(agent),
                  agentId     = publicAgent.id,
                  repoStatus  = statusByAgentId.get(agentId) || null,
                  runtime     = runtimeByAgentId.get(agentId) || null

            return {
                id            : agentId,
                githubUsername: publicAgent.githubUsername ?? null,
                harnessType   : publicAgent.harnessType ?? null,
                displayName   : publicAgent.displayName ?? publicAgent.name ?? publicAgent.githubUsername ?? agentId ?? null,
                avatarUrl     : publicAgent.metadata?.avatarUrl ?? githubAvatarUrl(publicAgent.githubUsername),
                family        : publicAgent.family ?? null,
                engineTag     : publicAgent.engineTag ?? null,
                agent         : publicAgent,
                repoStatus,
                lifecycle     : runtime
                    ? {
                        source    : FLEET_COCKPIT_SOURCES.runtime,
                        state     : runtime.state ?? 'unknown',
                        confidence: runtime.confidence ?? 'observed'
                    }
                    : {
                        source    : FLEET_COCKPIT_SOURCES.runtime,
                        state     : 'not-wired',
                        confidence: 'none'
                    },
                sources: {
                    roster: {
                        source    : FLEET_COCKPIT_SOURCES.roster,
                        state     : 'wired',
                        confidence: 'observed'
                    },
                    repoStatus: {
                        source    : FLEET_COCKPIT_SOURCES.repoStatus,
                        state     : repoStatus ? 'wired' : 'missing',
                        confidence: repoStatus ? 'observed' : 'none'
                    },
                    runtime: {
                        source    : FLEET_COCKPIT_SOURCES.runtime,
                        state     : runtime ? 'wired' : 'not-wired',
                        confidence: runtime ? (runtime.confidence ?? 'observed') : 'none'
                    }
                }
            }
        }),
        events: events.map(event => createFleetCockpitEvent(event))
    }
}

/**
 * @summary Normalize a bounded fleet cockpit activity event. The type set is intentionally narrow so
 * UI and whitebox tests can prove lifecycle request/success/failure and bridge unavailable/gated
 * states without inventing opaque free-form activity.
 * @param {Object} event
 * @returns {Object}
 */
export function createFleetCockpitEvent({type, source, agentId = null, confidence = 'observed', payload = null, occurredAt = null} = {}) {
    if (!FLEET_COCKPIT_EVENT_TYPES.includes(type)) {
        throw new Error(`createFleetCockpitEvent: unsupported event type '${type}'`)
    }
    if (!source) {
        throw new Error('createFleetCockpitEvent: source is required')
    }

    return {
        type,
        source,
        agentId,
        confidence,
        occurredAt,
        payload: sanitizePayload(payload)
    }
}

/**
 * @summary Capability placeholder for adapters that are planned but not wired. A missing adapter is a
 * first-class fact, not sample data.
 * @param {String} source
 * @param {String} reason
 * @returns {Object}
 */
export function createNotWiredCapability(source, reason) {
    return {
        source,
        state     : 'not-wired',
        confidence: 'none',
        reason
    }
}

function sanitizePayload(value) {
    if (Array.isArray(value)) {
        return value.map(item => sanitizePayload(item))
    }

    if (!value || typeof value !== 'object') {
        return value
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !isSecretKey(key))
            .map(([key, item]) => [key, sanitizePayload(item)])
    )
}

function isSecretKey(key) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '')

    return normalized === 'credential' ||
        normalized.endsWith('credential') ||
        normalized === 'pat' ||
        normalized.endsWith('pat') ||
        normalized.includes('token') ||
        normalized.includes('secret') ||
        normalized.includes('password') ||
        normalized.includes('signingkey') ||
        normalized.includes('privatekey')
}
