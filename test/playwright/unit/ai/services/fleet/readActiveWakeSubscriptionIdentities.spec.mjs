import {setup} from '../../../../setup.mjs'

const appName = 'ReadActiveWakeSubscriptionIdentitiesTest'

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

import {readActiveWakeSubscriptionIdentities} from '../../../../../../ai/services/fleet/readActiveWakeSubscriptionIdentities.mjs'

/**
 * Models the GraphService contract this reader depends on: `db` does NOT exist until `initAsync()`
 * resolves. A reader that skips the await sees `undefined` and cannot reach either surface — which
 * is exactly the defect these specs pin.
 */
function graphServiceDouble({rows = null, items = null, initError = null} = {}) {
    let db = null

    const statements = []

    return {
        statements,
        async initAsync() {
            if (initError) throw new Error(initError)

            db = {
                ...(rows  && {storage: {db: {prepare(sql) { statements.push(sql); return {all: () => rows} }}}}),
                ...(items && {nodes  : {items}})
            }
        },
        get db() { return db }
    }
}

test.describe('readActiveWakeSubscriptionIdentities — the fleet wake axis bulk read', () => {
    test('reads DURABLE SQLite truth, not the in-process node cache — the cross-process invariant', async () => {
        // The cache carries a stale/partial projection; SQLite carries shared truth. A fleet server
        // in its own process must report the latter, or a subscribed agent renders `off`.
        const service = graphServiceDouble({
            rows : [{agentIdentity: '@neo-opus-grace'}, {agentIdentity: '@neo-gpt'}],
            items: [{label: 'WAKE_SUBSCRIPTION', properties: {status: 'active', agentIdentity: '@stale-cache-only'}}]
        })

        const identities = await readActiveWakeSubscriptionIdentities({graphService: service})

        expect(identities).toEqual(['@neo-opus-grace', '@neo-gpt'])
        expect(identities).not.toContain('@stale-cache-only')
    })

    test('the durable query is scoped to ACTIVE wake subscriptions — the contract, not just the result', async () => {
        const service = graphServiceDouble({rows: []})

        await readActiveWakeSubscriptionIdentities({graphService: service})

        const [sql] = service.statements

        expect(sql).toContain("json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'")
        expect(sql).toContain("COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'")
    })

    test('awaits service readiness before reading db — the pre-init read surface is absent by contract', async () => {
        const service = graphServiceDouble({rows: [{agentIdentity: '@neo-opus-grace'}]})

        expect(service.db).toBe(null)

        await expect(readActiveWakeSubscriptionIdentities({graphService: service})).resolves.toEqual(['@neo-opus-grace'])
    })

    test('malformed identities are dropped, never emitted as phantom subscribers', async () => {
        const service = graphServiceDouble({
            rows: [{agentIdentity: '@neo-opus-grace'}, {agentIdentity: null}, {agentIdentity: ''}, {agentIdentity: 42}]
        })

        expect(await readActiveWakeSubscriptionIdentities({graphService: service})).toEqual(['@neo-opus-grace'])
    })

    test('falls back to an injected cache double only when no SQLite handle exists', async () => {
        const service = graphServiceDouble({
            items: [
                {label: 'WAKE_SUBSCRIPTION', properties: {status: 'active', agentIdentity: '@neo-opus-grace'}},
                {label: 'WAKE_SUBSCRIPTION', properties: {status: 'retired', agentIdentity: '@retired'}},
                {label: 'WAKE_SUBSCRIPTION', properties: {agentIdentity: '@status-absent-means-active'}},
                {label: 'AGENT_IDENTITY',    properties: {status: 'active', agentIdentity: '@wrong-label'}}
            ]
        })

        expect(await readActiveWakeSubscriptionIdentities({graphService: service}))
            .toEqual(['@neo-opus-grace', '@status-absent-means-active'])
    })

    test('an unreachable graph THROWS — the adapter owns the degrade, this module never fabricates an empty fleet', async () => {
        await expect(readActiveWakeSubscriptionIdentities({graphService: graphServiceDouble({})}))
            .rejects.toThrow('graph read surface unavailable')
    })

    test('a failing init propagates — an un-initialised graph is not an empty fleet', async () => {
        await expect(readActiveWakeSubscriptionIdentities({graphService: graphServiceDouble({initError: 'graph init failed'})}))
            .rejects.toThrow('graph init failed')
    })
})
