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
        lifecycle  : 'fleet:lifecycle',
        wake       : 'fleet:wakeState',
        throttle   : 'fleet:throttleState',
        presence   : 'fleet:presenceState'
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
 * @summary Source labels for the Fleet Manager cockpit DTO — the AUTHORITY. These labels are
 * deliberately stable and transport-agnostic: the Body-side cockpit explains which live substrate
 * produced each row or event via its operable-cold twin
 * (`apps/agentos/config/cockpitSources.mjs`, bound by the vocabulary-parity lint) — it
 * never imports this Node-side module chain.
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
export function createFleetCockpitStatus({agents = [], fleetStatus = [], runtimeStatus = [], wakeStatus = [], throttleStatus = [], presenceStatus = [], events = [], capabilities = {}} = {}) {
    const suppliedCapabilities = capabilities || {}

    const statusByAgentId = new Map(
        fleetStatus.map(status => [status.agentId || status.id, sanitizePayload(status)])
    )

    const runtimeByAgentId = new Map(
        runtimeStatus.map(entry => [entry.agentId || entry.id, sanitizePayload(entry)])
    )

    const wakeByAgentId = new Map(
        wakeStatus.map(entry => [entry.agentId || entry.id, sanitizePayload(entry)])
    )

    const throttleByAgentId = new Map(
        throttleStatus.map(entry => [entry.agentId || entry.id, sanitizePayload(entry)])
    )

    const presenceByAgentId = new Map(
        presenceStatus.map(entry => [entry.agentId || entry.id, sanitizePayload(entry)])
    )

    return {
        sources     : FLEET_COCKPIT_SOURCES,
        capabilities: {
            activity: suppliedCapabilities.activity || createNotWiredCapability(FLEET_COCKPIT_SOURCES.activity, 'A2A / PR / lane activity adapter not wired'),
            runtime : suppliedCapabilities.runtime || createNotWiredCapability(FLEET_COCKPIT_SOURCES.runtime, 'runtime process status is pending the Fleet runtime-status wire method'),
            // The wake telltale axis (S2): four-state observation (`on | off | suppressed |
            // unknown`) produced Brain-side; not-wired here is the honest default until the
            // assembler passes a snapshot — the pane renders "cannot see", never a guessed state.
            wake    : suppliedCapabilities.wake || createNotWiredCapability(FLEET_COCKPIT_SOURCES.wake, 'wake-state producer not wired'),
            // The throttle telltale axis (S2), same contract as wake: `none | overage |
            // rate-limited | unknown`. No trustworthy platform source exists yet, so this axis is
            // expected to sit degraded — which is the honest report, not a gap to paper over.
            throttle: suppliedCapabilities.throttle || createNotWiredCapability(FLEET_COCKPIT_SOURCES.throttle, 'throttle-state producer not wired'),
            // The presence axis: the plane's who_is_online band embryo (`online |
            // idle | dark | benched | neverConnected | unknown`), the third independent signal —
            // presence-fresh ≠ wake-route-healthy ≠ identity-bound. Not-wired is the honest
            // default until the assembler passes a snapshot; a band is never guessed.
            presence: suppliedCapabilities.presence || createNotWiredCapability(FLEET_COCKPIT_SOURCES.presence, 'presence producer not wired')
        },
        rows: agents.map(agent => {
            const publicAgent = sanitizePayload(agent),
                  agentId     = publicAgent.id,
                  repoStatus  = statusByAgentId.get(agentId) || null,
                  runtime     = runtimeByAgentId.get(agentId) || null,
                  // Runtime supervision is wired for this row only when the producer actually holds a
                  // process record — NOT merely because a row came back. `fleetRuntimeStatus` answers
                  // for every REGISTERED agent by design, so row-existence is a roster fact, and
                  // reading it as a supervision fact is what let a `benched / offline` verdict render
                  // over seats the fleet never launched. An `unmanaged` row is the producer
                  // stating it observes nothing here; the honest source state for that is `not-wired`,
                  // which the display contract already renders as the external-harness topology.
                  supervised  = runtime != null && runtime.state !== 'unmanaged',
                  wake        = wakeByAgentId.get(agentId) || null,
                  throttle    = throttleByAgentId.get(agentId) || null,
                  presence    = presenceByAgentId.get(agentId) || null

            return {
                id            : agentId,
                githubUsername: publicAgent.githubUsername ?? null,
                harnessType   : publicAgent.harnessType ?? null,
                // Launch-derived truth stamped by the Brain-side assembler (fleetRoster) — hoisted
                // like the identity facts below, tri-state honest: null = not stamped/unknown
                // ("not read back yet"), never a guessed boolean. This pure map derives nothing.
                launchable: publicAgent.launchable ?? null,
                authMode  : publicAgent.authMode ?? null,
                // Open assigned lanes for the resident, stamped by a Brain-side enricher when one
                // exists — the roster DTO OWNS this field end-to-end (assembler → cockpit record →
                // card badge). Same tri-state honesty as `launchable`: null = no enricher has
                // stamped a count, and the card renders NO badge then — never a fabricated zero.
                openLaneCount: publicAgent.openLaneCount ?? null,
                displayName  : publicAgent.displayName ?? publicAgent.name ?? publicAgent.githubUsername ?? agentId ?? null,
                avatarUrl    : publicAgent.metadata?.avatarUrl ?? githubAvatarUrl(publicAgent.githubUsername),
                family       : publicAgent.family ?? null,
                engineTag    : publicAgent.engineTag ?? null,
                // The AUTHORITATIVE swarm-participation fact, resolved Brain-side through the ONE
                // identity join seam — hoisted so fleet-level control eligibility can exclude an
                // operator-benched identity. Tri-state: null = no identity root / not stamped.
                participationStatus: publicAgent.participationStatus ?? null,
                agent              : publicAgent,
                repoStatus,
                lifecycle          : supervised
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
                // The S2 wake telltale axis: the four-state observation row produced Brain-side.
                // `state` is CLOSED over `on | off | suppressed | unknown` — absence of a producer
                // is `unknown`, never a fifth value: consumers switch on this enum, so leaking a
                // wiring fact into the observation field would force every one of them to re-derive
                // the taxonomy. The wiring axis is carried by `sources.wake` + the capability
                // envelope, and `confidence: 'none'` + `reason` keep the row itself honest.
                wake: wake
                    ? {
                        source    : FLEET_COCKPIT_SOURCES.wake,
                        state     : wake.wake ?? 'unknown',
                        confidence: wake.confidence ?? 'none',
                        ...(wake.reason != null && {reason: wake.reason})
                    }
                    : {
                        source    : FLEET_COCKPIT_SOURCES.wake,
                        state     : 'unknown',
                        confidence: 'none',
                        reason    : 'wake-state producer not wired'
                    },
                // The S2 throttle axis, held to the same closed-enum contract as `wake` above:
                // `state` never leaves `none | overage | rate-limited | unknown`, absence included.
                throttle: throttle
                    ? {
                        source    : FLEET_COCKPIT_SOURCES.throttle,
                        state     : throttle.throttle ?? 'unknown',
                        confidence: throttle.confidence ?? 'none',
                        ...(throttle.reason != null && {reason: throttle.reason})
                    }
                    : {
                        source    : FLEET_COCKPIT_SOURCES.throttle,
                        state     : 'unknown',
                        confidence: 'none',
                        reason    : 'throttle-state producer not wired'
                    },
                // The presence axis, same closed-enum discipline as its siblings:
                // `state` never leaves the plane's band embryo + `unknown`, absence of a producer
                // included. `lastSeenAt` carries the producer's per-seat recency verbatim — the
                // tier-degradation contract forbids deriving a finer band here than was emitted.
                presence: presence
                    ? {
                        source    : FLEET_COCKPIT_SOURCES.presence,
                        state     : presence.presence ?? 'unknown',
                        confidence: presence.confidence ?? 'none',
                        lastSeenAt: presence.lastSeenAt ?? null,
                        ...(presence.reason != null && {reason: presence.reason})
                    }
                    : {
                        source    : FLEET_COCKPIT_SOURCES.presence,
                        state     : 'unknown',
                        confidence: 'none',
                        lastSeenAt: null,
                        reason    : 'presence producer not wired'
                    },
                // Every fact owns its bounded `reason` at THIS producer boundary — the consumer
                // renders name+reason for answered-abnormal facts, and a reason invented anywhere
                // downstream would be a fixture-truth (the review-caught defect this closes).
                // Wired facts pass the underlying row's own cause through (null when it carries
                // none); an ABSENT per-agent row states which truth is missing; not-wired axes
                // carry the axis-level explanation. All bounded via `boundReason`.
                sources: {
                    roster: {
                        source    : FLEET_COCKPIT_SOURCES.roster,
                        state     : 'wired',
                        confidence: 'observed',
                        reason    : null
                    },
                    repoStatus: {
                        source    : FLEET_COCKPIT_SOURCES.repoStatus,
                        state     : repoStatus ? 'wired' : 'missing',
                        confidence: repoStatus ? 'observed' : 'none',
                        reason    : repoStatus ? boundReason(repoStatus.reason) : 'no repository status answered for this agent'
                    },
                    runtime: {
                        source    : FLEET_COCKPIT_SOURCES.runtime,
                        state     : supervised ? 'wired' : 'not-wired',
                        confidence: supervised ? (runtime.confidence ?? 'observed') : 'none',
                        // An unmanaged row carries its OWN cause ("no fleet process record …"), which is
                        // strictly more informative than the axis-level not-wired default and must not be
                        // overwritten by it — the default describes a missing WIRE, this describes a
                        // present producer observing nothing for this agent.
                        reason    : supervised
                            ? boundReason(runtime.reason)
                            : (runtime?.reason
                                ? boundReason(runtime.reason)
                                : 'runtime process status is pending the Fleet runtime-status wire method')
                    },
                    wake: {
                        source    : FLEET_COCKPIT_SOURCES.wake,
                        state     : wake ? 'wired' : 'not-wired',
                        confidence: wake ? (wake.confidence ?? 'none') : 'none',
                        reason    : wake ? boundReason(wake.reason) : 'wake-state producer not wired'
                    },
                    throttle: {
                        source    : FLEET_COCKPIT_SOURCES.throttle,
                        state     : throttle ? 'wired' : 'not-wired',
                        confidence: throttle ? (throttle.confidence ?? 'none') : 'none',
                        reason    : throttle ? boundReason(throttle.reason) : 'throttle-state producer not wired'
                    },
                    presence: {
                        source    : FLEET_COCKPIT_SOURCES.presence,
                        state     : presence ? 'wired' : 'not-wired',
                        confidence: presence ? (presence.confidence ?? 'none') : 'none',
                        reason    : presence ? boundReason(presence.reason) : 'presence producer not wired'
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

/**
 * @summary Bound a producer-supplied cause to a serializable trimmed string, or `null` — the DTO
 * owns every reason it emits, and an unbounded upstream string must not ride the wire unchecked.
 * @param {*} value
 * @returns {String|null}
 */
export function boundReason(value) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
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
