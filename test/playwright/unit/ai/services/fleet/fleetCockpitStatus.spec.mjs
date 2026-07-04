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
})
