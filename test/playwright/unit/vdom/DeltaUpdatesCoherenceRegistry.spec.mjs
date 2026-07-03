import {setup} from '../../setup.mjs';

const appName = 'DeltaUpdatesCoherenceRegistryTest';

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
 * @summary Tests the Main-thread delta coherence registry wiring.
 *
 * The pure ledger semantics live in `DeltaCoherenceRegistry.spec.mjs`; this suite pins the
 * runtime boundary: registry-off behavior stays untouched (no instance, no checks, no logs),
 * registry-on findings are observe-mode only (logged, never thrown, never blocking dispatch),
 * and the ledger commits strictly AFTER a batch applied — a guard-rejected or
 * mid-application-aborted batch never mutates it.
 */
test.describe('Neo.main.DeltaUpdates coherence registry', () => {
    let DeltaUpdates, applied, originalConsoleError, originalConsoleWarn,
        originalInsertNode, originalInsertNodeBatch, originalMoveNode, originalRemoveAll,
        originalRemoveNode, originalUpdateNode, originalUpdateVtext;

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
        originalInsertNode      = DeltaUpdates.insertNode;
        originalInsertNodeBatch = DeltaUpdates.insertNodeBatch;
        originalMoveNode    = DeltaUpdates.moveNode;
        originalRemoveAll   = DeltaUpdates.removeAll;
        originalRemoveNode  = DeltaUpdates.removeNode;
        originalUpdateNode  = DeltaUpdates.updateNode;
        originalUpdateVtext = DeltaUpdates.updateVtext
    });

    test.beforeEach(() => {
        applied = [];
        originalConsoleError = console.error;
        originalConsoleWarn  = console.warn;

        Neo.config.useDeltaCoherenceRegistry = false;
        Neo.config.useDeltaGrammarGuards     = false;
        Neo.config.useDomApiRenderer         = true;

        // Each test starts with a fresh ledger AND an unloaded instrument ref — the dynamic
        // import is part of the wiring under test.
        DeltaUpdates.coherenceRegistry?.clear();
        DeltaUpdates.coherenceRegistry = null;
        DeltaUpdates.deltaGrammar      = null;

        DeltaUpdates.updateNode      = delta => applied.push(delta);
        DeltaUpdates.moveNode        = delta => applied.push(delta);
        DeltaUpdates.removeAll       = delta => applied.push(delta);
        DeltaUpdates.removeNode      = delta => applied.push(delta);
        DeltaUpdates.insertNode      = delta => applied.push(delta);
        DeltaUpdates.insertNodeBatch = batch => batch.forEach(delta => applied.push(delta));
        DeltaUpdates.updateVtext     = delta => applied.push(delta)
    });

    test.afterEach(() => {
        console.error = originalConsoleError;
        console.warn  = originalConsoleWarn;

        DeltaUpdates.insertNode      = originalInsertNode;
        DeltaUpdates.insertNodeBatch = originalInsertNodeBatch;
        DeltaUpdates.moveNode        = originalMoveNode;
        DeltaUpdates.removeAll       = originalRemoveAll;
        DeltaUpdates.removeNode      = originalRemoveNode;
        DeltaUpdates.updateNode      = originalUpdateNode;
        DeltaUpdates.updateVtext     = originalUpdateVtext;

        DeltaUpdates.coherenceRegistry?.clear();
        DeltaUpdates.coherenceRegistry = null;
        DeltaUpdates.deltaGrammar      = null;

        Neo.config.useDeltaCoherenceRegistry = false;
        Neo.config.useDeltaGrammarGuards     = false;
        Neo.config.useDomApiRenderer         = true
    });

    test('default-off never loads the registry module and never logs', async () => {
        const warnCalls = [];

        console.warn = (...args) => warnCalls.push(args);

        // Both flags off: the loader is a no-op — Main bundles stay tiny.
        await DeltaUpdates.importDeltaInstruments();

        DeltaUpdates.update({deltas: [
            {action: 'insertNode', parentId: 'neo-parent', index: 0, vnode: {id: 'neo-a', nodeName: 'div'}},
            {action: 'insertNode', parentId: 'neo-parent', index: 1, vnode: {id: 'neo-a', nodeName: 'div'}}
        ]});

        expect(DeltaUpdates.coherenceRegistry).toBeNull();
        expect(DeltaUpdates.deltaGrammar).toBeNull();
        expect(warnCalls).toEqual([]);
        expect(applied).toHaveLength(2)
    });

    test('a set flag stays inert until the dynamic import lands (boot-race grace)', () => {
        const warnCalls = [];

        console.warn = (...args) => warnCalls.push(args);
        Neo.config.useDeltaCoherenceRegistry = true;

        // Flag on, module not yet loaded: dispatch proceeds, nothing evaluates, nothing throws.
        DeltaUpdates.update({deltas: [{id: 'neo-pre-load', style: {color: 'red'}}]});

        expect(DeltaUpdates.coherenceRegistry).toBeNull();
        expect(warnCalls).toEqual([]);
        expect(applied).toHaveLength(1)
    });

    test('enabled registry logs cross-batch findings WITHOUT blocking dispatch (observe-mode)', async () => {
        const
            birth     = {action: 'insertNode', parentId: 'neo-parent', index: 0, vnode: {id: 'neo-dup', nodeName: 'div'}},
            warnCalls = [];

        Neo.config.useDeltaCoherenceRegistry = true;
        await DeltaUpdates.importDeltaInstruments();
        console.warn = (...args) => warnCalls.push(args);

        DeltaUpdates.update({deltas: [birth]});
        expect(warnCalls).toEqual([]);

        // The stale-baseline cross-batch replay: each batch is per-batch-legal, the collision is
        // only visible against ledger state — and it must surface as a warning, never a throw.
        expect(() => DeltaUpdates.update({deltas: [{...birth, index: 1}]})).not.toThrow();

        expect(applied).toHaveLength(2);
        expect(warnCalls).toHaveLength(1);
        expect(warnCalls[0][0]).toBe('Delta coherence findings');
        expect(warnCalls[0][1].findings.map(finding => finding.rule)).toEqual(['C-insert'])
    });

    test('the ledger commits after application: state advances batch by batch', async () => {
        Neo.config.useDeltaCoherenceRegistry = true;
        await DeltaUpdates.importDeltaInstruments();

        const baseCount = DeltaUpdates.coherenceRegistry.batchCount;

        DeltaUpdates.update({deltas: [{action: 'insertNode', parentId: 'neo-parent', index: 0, vnode: {id: 'neo-x', nodeName: 'div'}}]});
        DeltaUpdates.update({deltas: [{action: 'removeNode', id: 'neo-x'}]});

        const registry = DeltaUpdates.coherenceRegistry;

        expect(registry.batchCount - baseCount).toBe(2);
        expect(registry.liveSnapshot.has('neo-x')).toBe(false);
        expect(registry.retiredSnapshot.has('neo-x')).toBe(true)
    });

    test('a guard-rejected batch never reaches the ledger (guards throw before the registry evaluates)', async () => {
        Neo.config.useDeltaCoherenceRegistry = true;
        Neo.config.useDeltaGrammarGuards     = true;
        await DeltaUpdates.importDeltaInstruments();
        console.error = () => {};

        const baseCount = DeltaUpdates.coherenceRegistry.batchCount;

        DeltaUpdates.update({deltas: [{action: 'insertNode', parentId: 'neo-parent', index: 0, vnode: {id: 'neo-keeper', nodeName: 'div'}}]});

        expect(() => DeltaUpdates.update({deltas: [
            {action: 'removeNode', id: 'neo-keeper'},
            {action: 'unknownAction', id: 'neo-bad'}
        ]})).toThrow(/delta grammar validation failed/);

        const registry = DeltaUpdates.coherenceRegistry;

        // The rejected batch left no trace: the keeper is still live, the sequence unmoved.
        expect(registry.batchCount - baseCount).toBe(1);
        expect(registry.liveSnapshot.has('neo-keeper')).toBe(true)
    });

    test('a mid-application abort never commits the ledger (it mirrors what reached the DOM)', async () => {
        Neo.config.useDeltaCoherenceRegistry = true;
        await DeltaUpdates.importDeltaInstruments();

        const baseCount = DeltaUpdates.coherenceRegistry.batchCount;

        DeltaUpdates.update({deltas: [{action: 'insertNode', parentId: 'neo-parent', index: 0, vnode: {id: 'neo-keeper-2', nodeName: 'div'}}]});

        // Guards are OFF: the unknown action passes evaluation untracked, then explodes in the
        // dispatch loop AFTER the removeNode applied — the partial-application hazard. The
        // uncommitted ledger under-counts (the keeper reads live although the DOM dropped it);
        // first-touch absorbs the drift as missed findings, never false ones.
        expect(() => DeltaUpdates.update({deltas: [
            {action: 'removeNode', id: 'neo-keeper-2'},
            {action: 'unknownAction', id: 'neo-bad-2'}
        ]})).toThrow();

        expect(applied).toHaveLength(2); // mount + the applied removeNode prefix

        const registry = DeltaUpdates.coherenceRegistry;

        expect(registry.batchCount - baseCount).toBe(1);
        expect(registry.liveSnapshot.has('neo-keeper-2')).toBe(true)
    });

    test('the loaded registry is the per-realm singleton and carries the windowId label', async () => {
        Neo.config.useDeltaCoherenceRegistry = true;
        await DeltaUpdates.importDeltaInstruments();

        DeltaUpdates.update({deltas: [{id: 'neo-touch-1', style: {color: 'red'}}]});

        const registry = DeltaUpdates.coherenceRegistry;

        expect(registry).toBeDefined();
        expect(registry.windowId).toBe(Neo.config.windowId ?? null);

        DeltaUpdates.update({deltas: [{id: 'neo-touch-2', style: {color: 'blue'}}]});
        expect(DeltaUpdates.coherenceRegistry).toBe(registry)
    });
});
