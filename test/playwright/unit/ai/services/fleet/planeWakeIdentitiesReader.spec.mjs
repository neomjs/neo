import {setup} from '../../../../setup.mjs'

const appName = 'PlaneWakeIdentitiesReaderTest'

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

import {createPlaneWakeIdentitiesReader} from '../../../../../../ai/services/fleet/planeWakeIdentitiesReader.mjs'
import {readFleetWakeStateSnapshot}      from '../../../../../../ai/services/fleet/fleetWakeStateAdapter.mjs'

/**
 * The client→reader→adapter composition witnesses. The proven plane client returns PARSED tool
 * payloads (its own spec proves a structured tool result resolves to the plain payload), so these
 * fixtures speak exactly that contract — and pin the double-parse class in both directions: the
 * reader must accept the parsed shape and must NOT quietly unwrap a wire envelope.
 */
test.describe('planeWakeIdentitiesReader — the plane-mode client→adapter composition', () => {
    const wired = {
        resolveDeliveryLiveness        : () => ({alive: true, reason: null}),
        resolveTerminalDeliveryFailures: () => ({state: 'observed', reason: null, byIdentity: new Map()})
    }

    test('a healthy PARSED payload — the shape the proven client returns — reaches the adapter as on-rows', async () => {
        const calls  = []
        const reader = createPlaneWakeIdentitiesReader({
            callTool: async (name, args) => {
                calls.push([name, args])
                return {identities: ['@neo-gpt']}
            }
        })

        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'euclid', githubUsername: 'neo-gpt'}, {id: 'vega', githubUsername: 'neo-opus-vega'}],
            listActiveSubscriptionIdentities: reader,
            ...wired
        })

        expect(calls).toEqual([['manage_wake_subscription', {action: 'fleet-identities'}]])
        expect(capability).toMatchObject({state: 'wired', confidence: 'observed'})
        expect(states.map(row => row.wake)).toEqual(['on', 'off'])
    })

    test('the regression pin: a WIRE-ENVELOPE shape is rejected — re-adding an envelope parse upstream inverts the contract and this witness reds', async () => {
        const reader = createPlaneWakeIdentitiesReader({
            callTool: async () => ({structuredContent: {identities: ['@neo-gpt']}})
        })

        const {states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'euclid', githubUsername: 'neo-gpt'}],
            listActiveSubscriptionIdentities: reader,
            ...wired
        })

        expect(states[0]).toMatchObject({wake: 'unknown', confidence: 'none'})
        expect(states[0].reason).toBe('plane wake fleet-identities answer unreadable')
    })

    test('a refused plane call degrades honestly — the refusal reason survives into the row, no empty-fleet fabrication', async () => {
        const reader = createPlaneWakeIdentitiesReader({
            callTool: async () => { throw new Error('plane manage_wake_subscription failed: HTTP 401') }
        })

        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'euclid', githubUsername: 'neo-gpt'}],
            listActiveSubscriptionIdentities: reader,
            ...wired
        })

        expect(capability.state).toBe('degraded')
        expect(states[0].wake).toBe('unknown')
        expect(states[0].reason).toContain('plane manage_wake_subscription failed')
    })

    test('a payload without a top-level identities array throws the named contract error', async () => {
        const reader = createPlaneWakeIdentitiesReader({callTool: async () => ({})})

        await expect(reader()).rejects.toThrow('plane wake fleet-identities answer unreadable')
    })
})
