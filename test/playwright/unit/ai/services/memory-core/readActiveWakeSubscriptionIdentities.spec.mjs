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

import {readActiveWakeSubscriptionIdentities,
        readActiveWakeSubscriptionObservations} from '../../../../../../ai/services/memory-core/readActiveWakeSubscriptionIdentities.mjs'

/**
 * Models the `core.Base` contract this reader depends on: `db` does NOT exist until async init has
 * settled, and `ready()` is the only sanctioned external wait — `initAsync()` is framework-triggered
 * and running it from outside would execute it twice. The double therefore exposes `ready()` ONLY,
 * so a reader that reaches for `initAsync()` fails loud here instead of duplicating init in prod.
 */
function graphServiceDouble({rows = null, items = null, initError = null} = {}) {
    let db = null

    const statements = []

    return {
        statements,
        async ready() {
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

    test('waits via ready(), NEVER initAsync() — the framework already ran it; a second run duplicates init', async () => {
        // `core.Base`: initAsync is triggered during Neo.create(). Awaiting it from a consumer runs
        // it twice — a fatal-duplication class the guard inside GraphService would quietly absorb,
        // which is precisely why this needs a pin rather than a passing test.
        const service = graphServiceDouble({rows: [{agentIdentity: '@neo-opus-grace'}]})

        let initAsyncCalls = 0

        service.initAsync = async () => { initAsyncCalls++ }

        await readActiveWakeSubscriptionIdentities({graphService: service})

        expect(initAsyncCalls).toBe(0)
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

test.describe('readActiveWakeSubscriptionObservations — the redacted poll-recency projection', () => {
    test('the durable query aggregates recency in SQL: one row per identity, MAX(lastPollAt), the ISO-lexicographic contract', async () => {
        const service = graphServiceDouble({rows: []})

        await readActiveWakeSubscriptionObservations({graphService: service})

        const [sql] = service.statements

        expect(sql).toContain("MAX(json_extract(data, '$.properties.lastPollAt')) AS lastPollAt")
        expect(sql).toContain('GROUP BY agentIdentity')
    })

    test('durable rows carry the stamp when present and null when no poll ever landed — absence stays absence', async () => {
        const service = graphServiceDouble({
            rows: [
                {agentIdentity: '@neo-fable-clio', lastPollAt: '2026-08-14T15:00:00.000Z'},
                {agentIdentity: '@neo-opus-ada',   lastPollAt: null}
            ]
        })

        expect(await readActiveWakeSubscriptionObservations({graphService: service})).toEqual([
            {identity: '@neo-fable-clio', lastPollAt: '2026-08-14T15:00:00.000Z'},
            {identity: '@neo-opus-ada',   lastPollAt: null}
        ])
    })

    test('the cache-seam fallback aggregates like the SQL: the most recent stamp across an identity wins, and null never overwrites it', async () => {
        const service = graphServiceDouble({
            items: [
                {label: 'WAKE_SUBSCRIPTION', properties: {status: 'active', agentIdentity: '@two-routes', lastPollAt: '2026-08-14T09:00:00.000Z'}},
                {label: 'WAKE_SUBSCRIPTION', properties: {status: 'active', agentIdentity: '@two-routes', lastPollAt: '2026-08-14T15:00:00.000Z'}},
                {label: 'WAKE_SUBSCRIPTION', properties: {status: 'active', agentIdentity: '@two-routes'}},
                {label: 'WAKE_SUBSCRIPTION', properties: {status: 'active', agentIdentity: '@never-polled'}}
            ]
        })

        expect(await readActiveWakeSubscriptionObservations({graphService: service})).toEqual([
            {identity: '@two-routes',   lastPollAt: '2026-08-14T15:00:00.000Z'},
            {identity: '@never-polled', lastPollAt: null}
        ])
    })

    test('the identities read IS the observation projection — one scan, no second contract free to drift', async () => {
        const service = graphServiceDouble({
            rows: [
                {agentIdentity: '@neo-fable-clio', lastPollAt: '2026-08-14T15:00:00.000Z'},
                {agentIdentity: '@neo-opus-ada',   lastPollAt: null}
            ]
        })

        expect(await readActiveWakeSubscriptionIdentities({graphService: service}))
            .toEqual(['@neo-fable-clio', '@neo-opus-ada'])
    })
})
