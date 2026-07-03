import {setup} from '../../setup.mjs';

const appName = 'DeltaUpdatesGrammarGuardTest';

setup({
    neoConfig: {
        unitTestMode: true,
        useDomApiRenderer: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Tests the Main-thread delta grammar guard wiring.
 *
 * The pure grammar predicates live in `DeltaGrammar.spec.mjs`; this suite pins the runtime
 * boundary: guard-off behavior stays untouched, guard-on failures throw before dispatch,
 * legal batches still dispatch without U5 noise, renderer mode reaches the insertNode payload
 * rule, and U5 remains observe-only.
 */
test.describe('Neo.main.DeltaUpdates grammar guard', () => {
    let DeltaUpdates, applied, originalConsoleError, originalConsoleWarn,
        originalInsertNode, originalMoveNode, originalRemoveAll, originalRemoveNode,
        originalUpdateNode, originalUpdateVtext;

    test.beforeAll(async () => {
        Neo.worker.Manager.on ??= () => {};
        globalThis.document ??= {
            addEventListener   : () => {},
            body               : {},
            createElement      : () => ({addEventListener: () => {}}),
            getElementById     : () => null,
            querySelector      : () => null,
            removeEventListener: () => {}
        };

        delete Neo.main.DomAccess;
        delete Neo.main.DeltaUpdates;
        Neo.main.render ??= {};
        Neo.main.render.DomApiRenderer ??= {};
        Neo.main.render.StringBasedRenderer ??= {};

        DeltaUpdates = (await import('../../../../src/main/DeltaUpdates.mjs')).default;
        originalInsertNode = DeltaUpdates.insertNode;
        originalMoveNode   = DeltaUpdates.moveNode;
        originalRemoveAll  = DeltaUpdates.removeAll;
        originalRemoveNode = DeltaUpdates.removeNode;
        originalUpdateNode = DeltaUpdates.updateNode
        originalUpdateVtext = DeltaUpdates.updateVtext
    });

    test.beforeEach(() => {
        applied = [];
        originalConsoleError = console.error;
        originalConsoleWarn  = console.warn;

        Neo.config.useDeltaGrammarGuards = false;
        Neo.config.useDomApiRenderer = true;

        DeltaUpdates.deltaGrammar = null;

        DeltaUpdates.updateNode = delta => applied.push(delta);
        DeltaUpdates.moveNode   = delta => applied.push(delta);
        DeltaUpdates.removeAll  = delta => applied.push(delta);
        DeltaUpdates.removeNode = delta => applied.push(delta);
        DeltaUpdates.insertNode = delta => applied.push(delta)
        DeltaUpdates.updateVtext = delta => applied.push(delta)
    });

    test.afterEach(() => {
        console.error = originalConsoleError;
        console.warn  = originalConsoleWarn;

        DeltaUpdates.insertNode = originalInsertNode;
        DeltaUpdates.moveNode   = originalMoveNode;
        DeltaUpdates.removeAll  = originalRemoveAll;
        DeltaUpdates.removeNode = originalRemoveNode;
        DeltaUpdates.updateNode = originalUpdateNode;
        DeltaUpdates.updateVtext = originalUpdateVtext;

        Neo.config.useDeltaGrammarGuards = false;
        Neo.config.useDomApiRenderer = true
    });

    test('default-off leaves the existing dispatch path untouched', () => {
        const batch = [
            {id: 'neo-valid-1', style: {color: 'green'}},
            {action: 'unknownAction', id: 'neo-invalid-1'}
        ];

        expect(() => DeltaUpdates.update({deltas: batch})).toThrow();
        expect(applied).toEqual([batch[0]])
    });

    test('enabled guard rejects illegal batches before the first dispatch', async () => {
        const
            batch      = [
                {id: 'neo-valid-1', style: {color: 'green'}},
                {action: 'unknownAction', id: 'neo-invalid-1'}
            ],
            errorCalls = [];

        Neo.config.useDeltaGrammarGuards = true;
        await DeltaUpdates.importDeltaInstruments();
        console.error = (...args) => errorCalls.push(args);

        expect(() => DeltaUpdates.update({deltas: batch})).toThrow(/delta grammar validation failed/);
        expect(applied).toEqual([]);
        expect(errorCalls).toHaveLength(1);
        expect(errorCalls[0][1].findings.map(finding => finding.rule)).toContain('U1');

        try {
            DeltaUpdates.update({deltas: batch})
        } catch (error) {
            expect(error.code).toBe('NEO_DELTA_GRAMMAR_INVALID');
            expect(error.findings.map(finding => finding.rule)).toContain('U1')
        }
    });

    test('enabled guard passes legal batches through unchanged', async () => {
        const
            batch = [
                {id: 'neo-grid-row-1', cls: {add: ['selected']}, style: {transform: 'translateY(32px)'}},
                {id: 'neo-grid-row-2', attributes: {'aria-rowindex': '7', title: null}},
                {action: 'insertNode', parentId: 'neo-grid-body-1', index: 3, vnode: {id: 'neo-cell-9'}},
                {action: 'moveNode', id: 'neo-cell-4', parentId: 'neo-grid-row-1', index: 0},
                {action: 'updateVtext', id: 'neo-vtext-2', parentId: 'neo-label-1', value: 'Total: 42'},
                {action: 'removeAll', parentId: 'neo-list-1'},
                {action: 'removeNode', id: 'neo-tooltip-7'},
                {action: 'removeNode', id: 'neo-vtext-9', parentId: 'neo-label-2'}
            ],
            warnCalls = [];

        Neo.config.useDeltaGrammarGuards = true;
        await DeltaUpdates.importDeltaInstruments();
        console.warn = (...args) => warnCalls.push(args);

        expect(() => DeltaUpdates.update({deltas: batch})).not.toThrow();
        expect(applied).toEqual(batch);
        expect(warnCalls).toEqual([])
    });

    test('forwards useDomApiRenderer into the insertNode payload contract', async () => {
        const htmlOnly = [{action: 'insertNode', parentId: 'neo-parent', index: 0, outerHTML: '<div></div>'}];

        Neo.config.useDeltaGrammarGuards = true;
        await DeltaUpdates.importDeltaInstruments();
        Neo.config.useDomApiRenderer = true;
        console.error = () => {};

        expect(() => DeltaUpdates.update({deltas: htmlOnly})).toThrow(/delta grammar validation failed/);
        expect(applied).toEqual([]);

        Neo.config.useDomApiRenderer = false;

        expect(() => DeltaUpdates.update({deltas: htmlOnly})).not.toThrow();
        expect(applied).toEqual(htmlOnly)
    });

    test('logs U5 candidate findings without blocking dispatch', async () => {
        const
            batch     = [
                {action: 'moveNode', id: 'neo-reused-1', parentId: 'neo-parent', index: 0},
                {action: 'moveNode', id: 'neo-reused-1', parentId: 'neo-parent', index: 1}
            ],
            warnCalls = [];

        Neo.config.useDeltaGrammarGuards = true;
        await DeltaUpdates.importDeltaInstruments();
        console.warn = (...args) => warnCalls.push(args);

        expect(() => DeltaUpdates.update({deltas: batch})).not.toThrow();
        expect(applied).toEqual(batch);
        expect(warnCalls).toHaveLength(1);
        expect(warnCalls[0][1].findings.map(finding => finding.rule)).toEqual(['U5'])
    });
});
