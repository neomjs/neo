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
} from '../../../../../../src/ai/fleet/fleetCockpitStatus.mjs'

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
