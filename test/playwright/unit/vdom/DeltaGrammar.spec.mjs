import {test, expect} from '@playwright/test';
import {
    ACTIONS,
    ATTRIBUTE_REMOVAL_SENTINELS,
    FIELD_CONTRACTS,
    ID_SORTS,
    IMPLICIT_ACTION,
    RESERVED_TARGET_IDS,
    STRUCTURAL_ACTIONS,
    checkActionValidity,
    checkExplicitTarget,
    checkRemoveLastOrdering,
    checkRequiredFields,
    checkStructuralUniqueness,
    normalizeBatch,
    resolveAction,
    validateBatch
} from '../../../../src/vdom/util/DeltaGrammar.mjs';

/**
 * @summary Pins the delta-stream wire vocabulary and the universal batch predicates.
 *
 * The exemplar batches mirror the real producer shapes: the differ's action-less updateNode
 * accumulation, payload-split insertNode (vnode vs outerHTML by renderer), the conditional
 * removeNode parentId for comment-anchored sorts, and the remove-last two-queue ordering.
 * Findings are asserted by rule identity and presence — never by exact counts of unrelated
 * rules — so the spec survives vocabulary growth.
 *
 * Note this spec imports the module directly WITHOUT the shared setup helper: the kernel's
 * pure-module discipline (no Neo globals at import time) is itself one of the pinned contracts.
 */

const rulesOf = findings => findings.map(finding => finding.rule);

test.describe('DeltaGrammar vocabulary', () => {
    test('names the complete dispatched action set', () => {
        expect([...ACTIONS].sort()).toEqual([
            'focusNode', 'insertNode', 'moveNode', 'removeAll',
            'removeNode', 'replaceChild', 'updateNode', 'updateVtext'
        ]);

        expect(IMPLICIT_ACTION).toBe('updateNode')
    });

    test('resolveAction applies the implicit-updateNode wire spelling', () => {
        expect(resolveAction({id: 'neo-1', style: {color: 'red'}})).toBe('updateNode');
        expect(resolveAction({action: 'moveNode', id: 'neo-1'})).toBe('moveNode');
        expect(resolveAction(null)).toBeUndefined()
    });

    test('every action carries a field contract with addressable id sorts', () => {
        [...ACTIONS].forEach(action => {
            const contract = FIELD_CONTRACTS[action];

            expect(contract).toBeDefined();
            expect(Array.isArray(contract.required)).toBe(true);
            expect(contract.addressableSorts.length).toBeGreaterThan(0);
            contract.addressableSorts.forEach(sort => {
                expect(Object.values(ID_SORTS)).toContain(sort)
            })
        })
    });

    test('exposes the sentinel and reserved-target encodings', () => {
        expect(ATTRIBUTE_REMOVAL_SENTINELS).toEqual([null, '']);
        expect(RESERVED_TARGET_IDS.has('document.body')).toBe(true);
        expect(RESERVED_TARGET_IDS.has('neo-component-1')).toBe(false);
        expect(STRUCTURAL_ACTIONS.has('updateNode')).toBe(false);
        expect(STRUCTURAL_ACTIONS.has('moveNode')).toBe(true)
    });

    test('normalizeBatch mirrors the dispatch boundary EXACTLY — non-arrays wrap, including garbage', () => {
        expect(normalizeBatch([{id: 'a'}])).toEqual([{id: 'a'}]);
        expect(normalizeBatch({id: 'a'})).toEqual([{id: 'a'}]);
        // The runtime wraps null/undefined too (and would then throw dereferencing
        // delta.action) — the validator must see the same entry, not an empty batch.
        expect(normalizeBatch(null)).toEqual([null]);
        expect(normalizeBatch(undefined)).toEqual([undefined])
    });
});

test.describe('Universal predicates — legal batches stay clean', () => {
    test('a differ-shaped mixed batch passes all guard-grade rules', () => {
        // Mirrors a real update: action-less updateNode accumulation, an insert with its
        // payload, moves, a vtext write, then the remove tail — default queue before removes.
        const batch = [
            {id: 'neo-grid-row-1', cls: {add: ['selected']}, style: {transform: 'translateY(32px)'}},
            {id: 'neo-grid-row-2', attributes: {'aria-rowindex': '7', title: null}},
            {action: 'insertNode', parentId: 'neo-grid-body-1', index: 3, outerHTML: '<div id="neo-cell-9"></div>'},
            {action: 'moveNode', id: 'neo-cell-4', parentId: 'neo-grid-row-1', index: 0},
            {action: 'updateVtext', id: 'neo-vtext-2', parentId: 'neo-label-1', value: 'Total: 42'},
            {action: 'removeAll', parentId: 'neo-list-1'},
            {action: 'removeNode', id: 'neo-tooltip-7'},
            {action: 'removeNode', id: 'neo-vtext-9', parentId: 'neo-label-2'}
        ];

        const {valid, findings} = validateBatch(batch);

        expect(findings).toEqual([]);
        expect(valid).toBe(true)
    });

    test('recycling-shaped updateNode runs are clean (pooled ids, in-place rewrites)', () => {
        const batch = [
            {id: 'body__row-0', cls: {add: ['neo-even']}, style: {transform: 'translateY(0px)'}},
            {id: 'body__row-0__cell-3', attributes: {'aria-colindex': '4'}, style: {display: null}},
            {id: 'body__row-1', cls: {remove: ['neo-even']}, style: {transform: 'translateY(28px)'}}
        ];

        expect(validateBatch(batch).valid).toBe(true);
        // The same pooled id updated in place is also invisible to the structural candidate.
        expect(checkStructuralUniqueness(batch)).toEqual([])
    });

    test('reserved global targets are sanctioned updateNode ids', () => {
        const batch = [
            {id: 'document.body', cls: {add: ['neo-theme-dark']}},
            {id: 'body', style: {overflow: 'hidden'}}
        ];

        expect(validateBatch(batch).valid).toBe(true)
    });

    test('insertNode payload contract follows the pinned renderer', () => {
        const vnodeOnly = [{action: 'insertNode', parentId: 'p', index: 0, vnode: {id: 'neo-x'}}];
        const htmlOnly  = [{action: 'insertNode', parentId: 'p', index: 0, outerHTML: '<div id="neo-x"></div>'}];
        const both      = [{action: 'insertNode', parentId: 'p', index: 0, vnode: {id: 'neo-x'}, outerHTML: '<div id="neo-x"></div>'}];

        expect(validateBatch(vnodeOnly, {useDomApiRenderer: true}).valid).toBe(true);
        expect(validateBatch(htmlOnly,  {useDomApiRenderer: false}).valid).toBe(true);
        // Manual producers legally carry both payloads; the consumer picks by config.
        expect(validateBatch(both, {useDomApiRenderer: true}).valid).toBe(true);
        expect(validateBatch(both, {useDomApiRenderer: false}).valid).toBe(true);
        expect(validateBatch(both).valid).toBe(true)
    });
});

test.describe('Universal predicates — illegal shapes produce findings', () => {
    test('U1: unknown action strings are flagged (the mid-batch abort class)', () => {
        const findings = checkActionValidity([
            {action: 'insertnode', parentId: 'p', index: 0, vnode: {id: 'x'}},
            {action: 'focusNode', id: 'neo-field-1'}
        ]);

        expect(rulesOf(findings)).toContain('U1');
        expect(findings[0].deltaIndex).toBe(0);
        expect(findings[0].detail).toContain('insertnode')
    });

    test('U1: non-object batch entries are flagged instead of throwing', () => {
        expect(rulesOf(checkActionValidity([null]))).toContain('U1');
        expect(rulesOf(checkActionValidity(['removeNode']))).toContain('U1')
    });

    test('U2: missing required fields are flagged per action', () => {
        const findings = checkRequiredFields([
            {action: 'moveNode', id: 'neo-1', parentId: 'p'},          // missing index
            {action: 'updateVtext', id: 'neo-2', parentId: 'p'},       // missing value
            {action: 'replaceChild', parentId: 'p', toId: 'neo-3'},    // missing fromId
            {action: 'removeNode', parentId: 'p'}                      // missing id
        ]);

        expect(rulesOf(findings)).toEqual(['U2', 'U2', 'U2', 'U2']);
        expect(findings.map(finding => finding.deltaIndex)).toEqual([0, 1, 2, 3])
    });

    test('U2: moveNode index 0 is present, not missing', () => {
        expect(checkRequiredFields([{action: 'moveNode', id: 'neo-1', parentId: 'p', index: 0}])).toEqual([])
    });

    test('U2: insertNode with no payload at all is flagged in every renderer mode', () => {
        const bare = [{action: 'insertNode', parentId: 'p', index: 0}];

        expect(rulesOf(checkRequiredFields(bare))).toContain('U2');
        expect(rulesOf(checkRequiredFields(bare, {useDomApiRenderer: true}))).toContain('U2');
        expect(rulesOf(checkRequiredFields(bare, {useDomApiRenderer: false}))).toContain('U2')
    });

    test('U2: insertNode missing the pinned renderer payload is flagged', () => {
        const htmlOnly = [{action: 'insertNode', parentId: 'p', index: 0, outerHTML: '<div></div>'}];

        const findings = checkRequiredFields(htmlOnly, {useDomApiRenderer: true});

        expect(rulesOf(findings)).toContain('U2');
        expect(findings[0].detail).toContain('vnode')
    });

    test('U3: a non-remove delta after the remove tail is flagged', () => {
        const findings = checkRemoveLastOrdering([
            {id: 'neo-1', style: {opacity: '0'}},
            {action: 'removeNode', id: 'neo-2'},
            {action: 'moveNode', id: 'neo-3', parentId: 'p', index: 1},
            {action: 'removeNode', id: 'neo-4'}
        ]);

        expect(rulesOf(findings)).toEqual(['U3']);
        expect(findings[0].deltaIndex).toBe(2);
        expect(findings[0].detail).toContain('moveNode')
    });

    test('U4: an id-less updateNode is flagged (the document.body misdirection)', () => {
        const findings = checkExplicitTarget([
            {style: {background: 'red'}},
            {id: '', cls: {add: ['x']}},
            {id: 'neo-ok-1', cls: {add: ['x']}}
        ]);

        expect(rulesOf(findings)).toEqual(['U4', 'U4']);
        expect(findings.map(finding => finding.deltaIndex)).toEqual([0, 1]);
        expect(findings[0].detail).toContain('document.body')
    });

    test('validateBatch aggregates U1-U4, never throws, and accepts single-object input', () => {
        // A null/undefined "batch" is NOT valid: the runtime would wrap it and throw on
        // delta.action — the validator reports the U1 finding instead of blessing it.
        expect(() => validateBatch(null)).not.toThrow();
        expect(validateBatch(null).valid).toBe(false);
        expect(rulesOf(validateBatch(null).findings)).toEqual(['U1']);
        expect(validateBatch(undefined).valid).toBe(false);

        // The empty ARRAY is the one legitimately valid empty input: the runtime loop
        // simply does not execute.
        expect(validateBatch([]).valid).toBe(true);
        expect(validateBatch([]).findings).toEqual([]);

        const single = validateBatch({style: {color: 'red'}});

        expect(single.valid).toBe(false);
        expect(rulesOf(single.findings)).toEqual(['U4'])
    });
});

test.describe('U5 stays a measurement candidate', () => {
    test('is marked candidate and excluded from validateBatch', () => {
        expect(checkStructuralUniqueness.candidate).toBe(true);

        const doubleTouch = [
            {action: 'removeNode', id: 'neo-1'},
            {action: 'insertNode', parentId: 'p', index: 0, vnode: {id: 'neo-1'}}
        ];

        // Direct invocation reports the double structural touch (via vnode.id for the insert) ...
        const findings = checkStructuralUniqueness(doubleTouch);

        expect(rulesOf(findings)).toEqual(['U5']);
        expect(findings[0].detail).toContain('neo-1');

        // ... but the guard-grade aggregate stays silent about U5 (U3 fires here instead:
        // the insert follows the remove tail — itself census-suspect ordering).
        expect(rulesOf(validateBatch(doubleTouch, {useDomApiRenderer: true}).findings)).toEqual(['U3'])
    });
});
