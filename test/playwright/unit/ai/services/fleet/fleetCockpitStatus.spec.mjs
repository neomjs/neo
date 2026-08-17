import {setup} from '../../../../setup.mjs'

const appName = 'FleetCockpitStatusTest'

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
})

import {test, expect} from '@playwright/test'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'

import {
    createFleetCockpitEvent,
    createFleetCockpitStatus,
    FLEET_COCKPIT_EVENT_TYPES,
    FLEET_COCKPIT_SOURCES
} from '../../../../../../ai/services/fleet/fleetCockpitStatus.mjs'

// Brain-side producer constants, imported HERE only: the module under test is a pure Body map that
// must never import `ai/`. The spec is the one place both sides may meet — which is what lets it
// pin the duplicated source labels against drift.
import {THROTTLE_SOURCE_LABEL} from '../../../../../../ai/services/fleet/fleetThrottleStateAdapter.mjs'
import {WAKE_SOURCE_LABEL}     from '../../../../../../ai/services/fleet/fleetWakeStateAdapter.mjs'

// Same both-sides-meet licence as the labels above, for the one assertion that has to span the whole
// chain. The never-launched-reads-benched defect was invisible to every single-layer test because each
// layer was correct on its own terms — the producer reported what it was asked, the assembler wired
// what it was handed, the display rendered its input faithfully. Only the composition was a lie.
import {mapFleetSessionHealth, resolveFleetDisplayState} from '../../../../../../apps/agentos/view/fleet/sourceHealth.mjs'

test.describe('fleetCockpitStatus - Body-side cockpit DTO contract', () => {
    test('passes identity display facts through from assembler-enriched agents — nulls when un-enriched (never guessed)', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [
                {id: 'neo-gpt', githubUsername: 'neo-gpt', family: 'gpt', engineTag: 'GPT-5.6 Sol'},
                {id: 'guest', githubUsername: 'guest-gh'}
            ]
        })

        expect(snapshot.rows[0]).toMatchObject({id: 'neo-gpt', family: 'gpt', engineTag: 'GPT-5.6 Sol'})
        // un-enriched -> explicit nulls: the cockpit renders unclassified / tagless, never a guess
        expect(snapshot.rows[1]).toMatchObject({id: 'guest', family: null, engineTag: null})
    })

    test('folds the display-name chain in the CARD-CONTRACT order: displayName -> name -> githubUsername -> id', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [
                {id: 'full',  githubUsername: 'full-gh',  name: 'Full Name',  displayName: 'Chosen'},
                {id: 'named', githubUsername: 'named-gh', name: 'Named'},
                {id: 'login', githubUsername: 'login-gh'},
                {id: 'bare'}
            ]
        })

        // one folded field, resolved Brain-side ONCE — the Body name slot consumes it and never
        // re-implements the chain (a view-side copy would be a second truth that drifts)
        expect(snapshot.rows.map(row => row.displayName)).toEqual(['Chosen', 'Named', 'login-gh', 'bare'])
    })

    test('hoists assembler-stamped launch truth — tri-state null when un-stamped, never derived in this pure map', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [
                {id: 'desk', launchable: true, authMode: 'in-app'},
                {id: 'bare'}
            ]
        })

        // the Brain-side assembler (fleetRoster) is the ONLY deriver; this Body-pure map hoists
        // the stamped facts like the identity facts above — absent stays an honest null
        // ("not read back yet"), never a guessed boolean
        expect(snapshot.rows[0]).toMatchObject({id: 'desk', launchable: true, authMode: 'in-app'})
        expect(snapshot.rows[1]).toMatchObject({id: 'bare', launchable: null, authMode: null})
    })

    test('hoists the assembler-stamped open-lane count — the roster DTO owns the field; un-stamped stays an honest null, never a fabricated zero', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [
                {id: 'busy'},
                {id: 'counted', openLaneCount: 23}
            ]
        })

        // same tri-state contract as `launchable`: a Brain-side enricher stamps the count; this
        // pure map only hoists it, and a missing stamp reaches the cockpit as null (no badge)
        expect(snapshot.rows[0]).toMatchObject({id: 'busy', openLaneCount: null})
        expect(snapshot.rows[1]).toMatchObject({id: 'counted', openLaneCount: 23})
    })

    test('composes runtimeStatus onto row lifecycle — observed process truth when present, honest not-wired when absent', () => {
        const snapshot = createFleetCockpitStatus({
            agents       : [{id: 'alice'}, {id: 'bob'}],
            runtimeStatus: [{agentId: 'alice', state: 'running', running: true, confidence: 'observed'}]
        })

        expect(snapshot.rows[0].lifecycle).toMatchObject({source: FLEET_COCKPIT_SOURCES.runtime, state: 'running', confidence: 'observed'})
        expect(snapshot.rows[0].sources.runtime).toMatchObject({state: 'wired', confidence: 'observed'})

        // no runtime entry -> the DTO's own placeholder-never-renders-as-fact discipline
        expect(snapshot.rows[1].lifecycle).toMatchObject({state: 'not-wired', confidence: 'none'})
        expect(snapshot.rows[1].sources.runtime).toMatchObject({state: 'not-wired', confidence: 'none'})
    })

    test('an unmanaged runtime row is NOT wired — row-existence is a roster fact, not a supervision fact (#17305)', () => {
        const snapshot = createFleetCockpitStatus({
            agents       : [{id: 'grace'}],
            runtimeStatus: [{
                agentId   : 'grace',
                state     : 'unmanaged',
                running   : false,
                confidence: 'none',
                reason    : 'no fleet process record: this agent runs outside fleet supervision'
            }]
        })

        // A row came back, so the pre-fix mapping called this `wired` and published the row's state
        // as session truth — which is how a `benched / offline` verdict rendered over seats the fleet
        // never launched. Supervision is keyed on holding a process record, not on answering.
        expect(snapshot.rows[0].sources.runtime).toMatchObject({state: 'not-wired', confidence: 'none'})
        expect(snapshot.rows[0].sources.runtime.state).not.toBe('wired')

        // The producer's own cause survives instead of being overwritten by the axis-level
        // "pending the wire method" default — that default describes a missing WIRE, this describes a
        // present producer that observes nothing for this agent.
        expect(snapshot.rows[0].sources.runtime.reason).toBe('no fleet process record: this agent runs outside fleet supervision')

        expect(snapshot.rows[0].lifecycle).toMatchObject({state: 'not-wired', confidence: 'none'})
    })

    test('END TO END: an unmanaged row renders `external`, never `benched / offline` (#17305)', () => {
        const snapshot = createFleetCockpitStatus({
            agents       : [{id: 'grace'}],
            runtimeStatus: [{
                agentId   : 'grace',
                state     : 'unmanaged',
                running   : false,
                confidence: 'none',
                reason    : 'no fleet process record: this agent runs outside fleet supervision'
            }]
        })

        const row     = snapshot.rows[0],
              session = mapFleetSessionHealth(row.lifecycle, row.sources),
              display = resolveFleetDisplayState({state: session.state, sources: session.sources})

        // The operator's witnessed defect, as one assertion: `off` is the state that renders the
        // "benched / offline" card text, and it is a participation verdict the fleet has no standing
        // to make about a seat it never launched.
        expect(display).toBe('external')
        expect(display).not.toBe('off')

        // And it must arrive there HONESTLY. Routing an unrecognized state through the mapper's
        // downgrade path also yields `external`, but only by rewriting the runtime source to
        // `invalid` / "lifecycle and runtime facts contradict" — a fabricated conflict, made
        // operator-visible by design. A right answer via an invented reason is the same defect class
        // this ticket closes, relocated to a field nobody checks.
        expect(session.sources.runtime.state).toBe('not-wired')
        expect(session.sources.runtime.state).not.toBe('invalid')
        expect(session.sources.runtime.reason).toBe('no fleet process record: this agent runs outside fleet supervision')
    })

    test('END TO END control: a real stopped record still renders `off` — the benched verdict Fleet IS entitled to (#17305)', () => {
        const snapshot = createFleetCockpitStatus({
            agents       : [{id: 'alice'}],
            runtimeStatus: [{agentId: 'alice', state: 'stopped', running: false, confidence: 'observed'}]
        })

        const row     = snapshot.rows[0],
              session = mapFleetSessionHealth(row.lifecycle, row.sources),
              display = resolveFleetDisplayState({state: session.state, sources: session.sources})

        // Without this control the fix could pass by making EVERY row external — which would delete
        // the one honest benched/offline signal instead of correcting its scope.
        expect(display).toBe('off')
        expect(session.sources.runtime.state).toBe('wired')
    })

    test('a REAL stopped record stays wired and keeps stopped — the operator-benched fact remains observable (#17305)', () => {
        const snapshot = createFleetCockpitStatus({
            agents       : [{id: 'alice'}],
            runtimeStatus: [{agentId: 'alice', state: 'stopped', running: false, confidence: 'observed'}]
        })

        // The negative control for the fix: without it, a genuine fleet-managed stop would be
        // laundered into the same not-wired bucket and the one verdict Fleet IS entitled to make
        // would disappear.
        expect(snapshot.rows[0].sources.runtime).toMatchObject({state: 'wired', confidence: 'observed'})
        expect(snapshot.rows[0].lifecycle).toMatchObject({state: 'stopped', confidence: 'observed'})
    })

    test('composes roster and repo status with explicit source labels', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [{
                id            : 'alice',
                githubUsername: 'alice-gh',
                harnessType   : 'codex',
                metadata      : {
                    repo: {repoSlug: 'neomjs/neo'}
                }
            }],
            fleetStatus: [{
                agentId           : 'alice',
                configured        : true,
                repoSlug          : 'neomjs/neo',
                state             : 'checkout',
                provisioningAction: 'reuse'
            }]
        })

        expect(snapshot.sources).toEqual(FLEET_COCKPIT_SOURCES)
        expect(snapshot.rows).toHaveLength(1)
        expect(snapshot.rows[0]).toMatchObject({
            id            : 'alice',
            githubUsername: 'alice-gh',
            harnessType   : 'codex',
            repoStatus    : {
                agentId : 'alice',
                repoSlug: 'neomjs/neo',
                state   : 'checkout'
            },
            sources: {
                roster: {
                    source: FLEET_COCKPIT_SOURCES.roster,
                    state : 'wired'
                },
                repoStatus: {
                    source: FLEET_COCKPIT_SOURCES.repoStatus,
                    state : 'wired'
                }
            }
        })
    })

    test('derives avatarUrl from the GitHub account (setAvatar override wins; null only without a username)', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [{
                id            : 'vega',
                githubUsername: 'neo-opus-vega',
                metadata      : {avatarUrl: 'https://cdn.neomjs.com/avatars/vega.png'}
            }, {
                id            : 'grace',
                githubUsername: 'neo-opus-grace'
            }, {
                id: 'ghost'
            }],
            fleetStatus: []
        })

        // an explicit metadata.avatarUrl (FleetManager.setAvatar) is the override — it wins
        expect(snapshot.rows[0].avatarUrl).toBe('https://cdn.neomjs.com/avatars/vega.png')
        // no explicit avatar → derived from the agent's GitHub account, a small sized fetch (not the full-res avatar)
        expect(snapshot.rows[1].avatarUrl).toBe('https://github.com/neo-opus-grace.png?size=80')
        // no username to derive from → null (never undefined, never a malformed URL — a clean bindable contract)
        expect(snapshot.rows[2].avatarUrl).toBeNull()
    })

    test('marks runtime and activity adapters as not wired instead of inventing state', () => {
        const snapshot = createFleetCockpitStatus({
            agents     : [{id: 'alice', githubUsername: 'alice-gh'}],
            fleetStatus: []
        })

        expect(snapshot.capabilities.activity).toMatchObject({
            source: FLEET_COCKPIT_SOURCES.activity,
            state : 'not-wired'
        })
        expect(snapshot.capabilities.runtime).toMatchObject({
            source: FLEET_COCKPIT_SOURCES.runtime,
            state : 'not-wired'
        })
        expect(snapshot.rows[0].repoStatus).toBeNull()
        expect(snapshot.rows[0].sources.repoStatus).toMatchObject({
            source: FLEET_COCKPIT_SOURCES.repoStatus,
            state : 'missing'
        })
        expect(snapshot.rows[0].lifecycle).toMatchObject({
            source: FLEET_COCKPIT_SOURCES.runtime,
            state : 'not-wired'
        })
    })

    test('strips secret-shaped fields from rows and events recursively', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [{
                id             : 'alice',
                credential     : 'ghp_secret',
                credentialState: 'stored',
                metadata       : {
                    repo        : {repoSlug: 'neomjs/neo'},
                    privateToken: 'secret'
                }
            }],
            fleetStatus: [{
                agentId   : 'alice',
                repoPath  : '/tmp/fleet/alice',
                state     : 'checkout',
                signingKey: 'secret'
            }],
            events: [{
                type   : 'lifecycle-request',
                source : FLEET_COCKPIT_SOURCES.lifecycle,
                agentId: 'alice',
                payload: {
                    id       : 'alice',
                    bridgePAT: 'ghp_secret',
                    nested   : {
                        password: 'secret'
                    }
                }
            }]
        })

        const serialized = JSON.stringify(snapshot)

        expect(serialized).toContain('alice')
        expect(serialized).toContain('credentialState')
        expect(serialized).toContain('repoPath')
        expect(serialized).not.toContain('ghp_secret')
        expect(serialized).not.toContain('signingKey')
        expect(serialized).not.toContain('privateToken')
        expect(serialized).not.toContain('bridgePAT')
        expect(serialized).not.toContain('password')
    })

    test('normalizes only the bounded lifecycle and bridge event classes', () => {
        const events = FLEET_COCKPIT_EVENT_TYPES.map(type => createFleetCockpitEvent({
            type,
            source : type.startsWith('bridge') ? FLEET_COCKPIT_SOURCES.roster : FLEET_COCKPIT_SOURCES.lifecycle,
            agentId: 'alice'
        }))

        expect(events.map(event => event.type)).toEqual([...FLEET_COCKPIT_EVENT_TYPES])
    })

    test('rejects source-less or unsupported events', () => {
        expect(() => createFleetCockpitEvent({type: 'lifecycle-request'})).toThrow('source is required')
        expect(() => createFleetCockpitEvent({type: 'free-form', source: FLEET_COCKPIT_SOURCES.lifecycle})).toThrow('unsupported event type')
    })

    // The wake row's `state` is CLOSED over the S2 four-state taxonomy. The wiring fact belongs to
    // the capability + `sources.wake`; leaking it into the observation field would hand every
    // consumer a fifth value it never agreed to switch on.
    test('an unwired wake producer reads unknown/none in the ROW, and not-wired only in the wiring axes', () => {
        const snapshot = createFleetCockpitStatus({agents: [{id: 'grace', githubUsername: 'neo-opus-grace'}]}),
              row      = snapshot.rows[0]

        expect(row.wake).toEqual({
            source    : FLEET_COCKPIT_SOURCES.wake,
            state     : 'unknown',
            confidence: 'none',
            reason    : 'wake-state producer not wired'
        })
        expect(row.sources.wake).toMatchObject({state: 'not-wired', confidence: 'none'})
        expect(snapshot.capabilities.wake).toMatchObject({state: 'not-wired'})
    })

    // The presence row holds the identical closed-enum discipline: absence of a producer is
    // `unknown` in the observation field; the wiring fact lives only in capability + sources.
    test('an unwired presence producer reads unknown/none in the ROW, and not-wired only in the wiring axes', () => {
        const snapshot = createFleetCockpitStatus({agents: [{id: 'clio', githubUsername: 'neo-fable-clio'}]}),
              row      = snapshot.rows[0]

        expect(row.presence).toEqual({
            source    : FLEET_COCKPIT_SOURCES.presence,
            state     : 'unknown',
            confidence: 'none',
            lastSeenAt: null,
            reason    : 'presence producer not wired'
        })
        expect(row.sources.presence).toMatchObject({state: 'not-wired', confidence: 'none'})
        expect(snapshot.capabilities.presence).toMatchObject({state: 'not-wired'})
    })

    test('a wired presence row travels WHOLE — band, recency, confidence, never re-derived', () => {
        const snapshot = createFleetCockpitStatus({
            agents        : [{id: 'clio', githubUsername: 'neo-fable-clio'}],
            presenceStatus: [{
                agentId   : 'clio',
                presence  : 'online',
                lastSeenAt: '2026-08-09T11:00:00.000Z',
                confidence: 'observed',
                source    : FLEET_COCKPIT_SOURCES.presence
            }],
            capabilities: {presence: {source: FLEET_COCKPIT_SOURCES.presence, state: 'wired', confidence: 'observed'}}
        })

        expect(snapshot.rows[0].presence).toEqual({
            source    : FLEET_COCKPIT_SOURCES.presence,
            state     : 'online',
            confidence: 'observed',
            lastSeenAt: '2026-08-09T11:00:00.000Z'
        })
        expect(snapshot.rows[0].sources.presence).toMatchObject({state: 'wired', confidence: 'observed'})
        expect(snapshot.capabilities.presence).toMatchObject({state: 'wired'})
    })

    test('a degraded presence capability carries its typed reasonCode to the DTO intact — supplied object wins whole', () => {
        const snapshot = createFleetCockpitStatus({
            agents      : [{id: 'clio', githubUsername: 'neo-fable-clio'}],
            capabilities: {presence: {
                source    : FLEET_COCKPIT_SOURCES.presence,
                state     : 'degraded',
                confidence: 'none',
                reason    : 'plane who_is_online failed: session lost and plane identity mismatch',
                reasonCode: 'viewer-binding-unavailable'
            }}
        })

        // the binding-signal chain's last hop: the adapter's typed code reaches the cockpit DTO
        // unchanged — C3 renders "binding unavailable" from THIS field, never from prose-matching
        expect(snapshot.capabilities.presence).toMatchObject({
            state     : 'degraded',
            reasonCode: 'viewer-binding-unavailable'
        })
    })

    test('an unwired throttle producer reads unknown/none in the ROW, not-wired only in the wiring axes', () => {
        const snapshot = createFleetCockpitStatus({agents: [{id: 'grace'}]}),
              row      = snapshot.rows[0]

        expect(row.throttle).toEqual({
            source    : FLEET_COCKPIT_SOURCES.throttle,
            state     : 'unknown',
            confidence: 'none',
            reason    : 'throttle-state producer not wired'
        })
        expect(row.sources.throttle).toMatchObject({state: 'not-wired', confidence: 'none'})
        expect(snapshot.capabilities.throttle).toMatchObject({state: 'not-wired'})
    })

    test('throttle row state stays inside its closed taxonomy — absence included', () => {
        const snapshot = createFleetCockpitStatus({
            agents        : [{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}],
            throttleStatus: [
                {agentId: 'a', throttle: 'none',         confidence: 'observed'},
                {agentId: 'b', throttle: 'overage',      confidence: 'observed'},
                {agentId: 'c', throttle: 'rate-limited', confidence: 'observed'}
                // 'd' has no producer row — absence must read unknown, never a fifth value.
            ]
        })

        expect(snapshot.rows.map(row => row.throttle.state)).toEqual(['none', 'overage', 'rate-limited', 'unknown'])

        for (const row of snapshot.rows) {
            expect(['none', 'overage', 'rate-limited', 'unknown']).toContain(row.throttle.state)
        }
    })

    test('the Body-side source labels MATCH the Brain-side producer constants — a split would silently orphan every row', () => {
        // These are duplicated by design (this pure Body map never imports `ai/`), so matching
        // today is not the same as pinned: the join keys rows by this exact string.
        expect(FLEET_COCKPIT_SOURCES.wake).toBe(WAKE_SOURCE_LABEL)
        expect(FLEET_COCKPIT_SOURCES.throttle).toBe(THROTTLE_SOURCE_LABEL)
    })

    test('wake row state stays inside the four-state taxonomy for every producer answer, wired or not', () => {
        const agents   = [{id: 'grace'}, {id: 'vega'}, {id: 'euclid'}, {id: 'ada'}],
              snapshot = createFleetCockpitStatus({
                  agents,
                  wakeStatus: [
                      {agentId: 'grace',  wake: 'on',        confidence: 'observed'},
                      {agentId: 'vega',   wake: 'suppressed', confidence: 'observed'},
                      {agentId: 'euclid', wake: 'unknown',    confidence: 'none', reason: 'graph offline'}
                      // 'ada' has no producer row at all — absence must read unknown.
                  ]
              })

        expect(snapshot.rows.map(row => row.wake.state)).toEqual(['on', 'suppressed', 'unknown', 'unknown'])

        for (const row of snapshot.rows) {
            expect(['on', 'off', 'suppressed', 'unknown']).toContain(row.wake.state)
        }
    })
})
