import {setup} from '../../../../../setup.mjs'

const appName = 'FleetCardFactoryTest'

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
import Neo            from '../../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../../src/core/_export.mjs'

import {createFleetCockpitStatus} from '../../../../../../../src/ai/fleet/fleetCockpitStatus.mjs'
import {
    agentCardComponentRef,
    createFleetCardDescriptors,
    toAgentCardDescriptor
} from '../../../../../../../apps/agentos/view/fleet/fleetCardFactory.mjs'

test.describe('fleetCardFactory — cockpit DTO → dock card descriptors (#14799)', () => {
    test('maps each cockpit DTO row to a descriptor with a stable, agentId-keyed componentRef', () => {
        const snapshot = createFleetCockpitStatus({
            agents: [
                {id: 'vega',  githubUsername: 'neo-opus-vega', displayName: 'Vega'},
                {id: 'grace', githubUsername: 'neo-opus-grace'}
            ],
            fleetStatus: []
        })

        const cards = createFleetCardDescriptors(snapshot)

        expect(cards).toHaveLength(2)
        expect(cards[0].componentRef).toBe('fm-agent-card-vega')
        expect(cards[1].componentRef).toBe('fm-agent-card-grace')
        // the ref is keyed on the durable agentId — the same helper the dock resolves against
        expect(cards[0].componentRef).toBe(agentCardComponentRef('vega'))
    })

    test('emits a fully JSON-serializable blueprint (ntype + record field bag — no live objects)', () => {
        const snapshot = createFleetCockpitStatus({
            agents     : [{id: 'vega', githubUsername: 'neo-opus-vega', displayName: 'Vega'}],
            fleetStatus: []
        })

        const [card] = createFleetCardDescriptors(snapshot)

        expect(card.blueprint.ntype).toBe('fm-agent-card')
        expect(card.blueprint.record.agentId).toBe('vega')
        expect(card.blueprint.record.displayName).toBe('Vega')
        // the avatar auto-derived through the DTO (from the GitHub account) rides into the blueprint
        expect(card.blueprint.record.avatarUrl).toBe('https://github.com/neo-opus-vega.png?size=80')

        // serializable end-to-end — a captured perspective can restore a real card from the blueprint
        expect(() => JSON.stringify(card.blueprint)).not.toThrow()
        expect(JSON.parse(JSON.stringify(card.blueprint))).toEqual(card.blueprint)
    })

    test('policy hints default to all-true for agent cards', () => {
        const card = toAgentCardDescriptor({id: 'vega'})

        expect(card.policy).toEqual({closable: true, pinnable: true, movable: true})
    })

    test('null-safe + forward-compatible: a sparse row yields null display fields, never undefined', () => {
        const card = toAgentCardDescriptor({id: 'ghost'})
        const data = card.blueprint.record

        expect(card.componentRef).toBe('fm-agent-card-ghost')
        expect(data.agentId).toBe('ghost')
        // fields the DTO does not carry yet (pending enrichment / the activity+runtime wires) → null
        expect(data.engineTag).toBeNull()
        expect(data.family).toBeNull()
        expect(data.laneLine).toBeNull()
        expect(data.avatarUrl).toBeNull()
        // no session state known yet → the benched/offline default
        expect(data.state).toBe('off')
        // no undefined leaking into the serializable metadata
        expect(card.metadata.githubUsername).toBeNull()
    })

    test('maps the session state through from the DTO lifecycle axis', () => {
        const card = toAgentCardDescriptor({id: 'vega', lifecycle: {state: 'ok'}})

        expect(card.blueprint.record.state).toBe('ok')
    })

    test('createFleetCardDescriptors tolerates a rowless / empty DTO', () => {
        expect(createFleetCardDescriptors({})).toEqual([])
        expect(createFleetCardDescriptors()).toEqual([])
    })
})
