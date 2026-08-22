import {test, expect} from '@playwright/test';

import {describeNameProvenance, NAME_PROVENANCE_STATES, resolveNameSlot} from '../../../../../../../../apps/agentos/util/nameSlot.mjs';

/**
 * Contract specs for the name-slot module — the pure render-correctness rule at name grain:
 * display name as mutable display state over the durable id, provenance stated honestly
 * (`declared-proxy` · `durable-id` live; `naming-layer` RESERVED until the record contract
 * carries a trail the render can surface). Pure module — no Neo runtime needed; the Brain-side
 * fold order it consumes is pinned in the assembler's own spec (`fleetCockpitStatus.spec.mjs`),
 * deliberately NOT re-implemented here.
 */
test.describe('nameSlot — display state over the durable id, provenance-honest', () => {
    test('a folded display name renders as display state, declared-proxy until a trail wires', () => {
        const slot = resolveNameSlot({agentId: 'neo-fable', displayName: 'Mnemosyne'});

        expect(slot.text).toBe('Mnemosyne');
        expect(slot.isFallback).toBe(false);
        expect(slot.provenance.state).toBe('declared-proxy');
        expect(slot.provenance.trail ?? null).toBe(null);
        // the long copy names BOTH the display-state nature and the durable anchor
        expect(slot.provenance.label).toContain('display state');
        expect(slot.provenance.label).toContain('neo-fable')
    });

    test('naming-layer is RESERVED: no input shape can reach it today — trail-shaped fields are ignored', () => {
        // the live FleetAgent record contract carries no nameProvenance field, so the classifier
        // honestly refuses the state for EVERY input shape (plain trail, Date, class instance,
        // inherited object) — the activation leaf flips one classifier branch when the field is real
        class FakeTrail {constructor() {this.sketchedBy = '@x'}}

        const shapes = [
            {sketchedBy: '@neo-opus-ada', assentAt: '2026-06-11T00:00:00Z'},
            new Date(),
            new FakeTrail(),
            Object.create({inherited: true}),
            []
        ];

        shapes.forEach(nameProvenance => {
            const slot = resolveNameSlot({agentId: 'neo-fable', displayName: 'Mnemosyne', nameProvenance});

            expect(slot.provenance.state).toBe('declared-proxy');
            expect(slot.text).toBe('Mnemosyne');
            expect('trail' in slot.provenance).toBe(false)
        })
    });

    test('no display name → the durable id renders in its place, flagged for the mono register', () => {
        const slot = resolveNameSlot({agentId: 'guest-agent-7'});

        expect(slot.text).toBe('guest-agent-7');
        expect(slot.isFallback).toBe(true);
        expect(slot.provenance.state).toBe('durable-id');
        expect(slot.provenance.label).toContain('never-renamed anchor')
    });

    test('blank-string names are not names; a trail on a nameless record cannot fabricate one', () => {
        expect(resolveNameSlot({agentId: 'x', displayName: '   '}).isFallback).toBe(true);
        // no name → durable-id even when a stray trail object is present (a trail grounds a NAME)
        expect(resolveNameSlot({agentId: 'x', nameProvenance: {sketchedBy: 'y'}}).provenance.state).toBe('durable-id')
    });

    test('null-everything renders the explicit empty marker, never a blank slot', () => {
        const slot = resolveNameSlot(null);

        expect(slot.text).toBe('—');
        expect(slot.isFallback).toBe(true);
        expect(slot.provenance.state).toBe('durable-id')
    });

    test('an array is not a trail (plain-object discipline)', () => {
        expect(resolveNameSlot({agentId: 'x', displayName: 'X', nameProvenance: []}).provenance.state).toBe('declared-proxy')
    });

    test('the chip rendering is density-calibrated: word only for the divergent state, glyph for the uniform one, nothing beside the mono id', () => {
        expect(NAME_PROVENANCE_STATES).toEqual(['naming-layer', 'declared-proxy', 'durable-id']);

        // naming-layer (RESERVED — the activation leaf's future divergent state) already maps to
        // the word, so activating it changes no presentation code
        expect(describeNameProvenance('naming-layer')).toMatchObject({hidden: false, text: 'named'});
        // declared-proxy (today's uniform reality) renders the quiet outline glyph
        expect(describeNameProvenance('declared-proxy')).toMatchObject({hidden: false, text: '◇'});
        // durable-id renders NO chip — the name slot's mono register already states it
        expect(describeNameProvenance('durable-id').hidden).toBe(true);

        // every chip carries the base class + its state class (the SCSS register contract)
        NAME_PROVENANCE_STATES.forEach(state => {
            const chip = describeNameProvenance(state);

            expect(chip.cls).toContain('fm-name-provenance');
            expect(chip.cls).toContain(`is-${state}`)
        })
    })
});
