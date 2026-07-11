import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DockService    from '../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../src/dashboard/DockZoneModel.mjs';

/**
 * @summary Creates a valid dockZone.v1 fixture for diff-tool assertions.
 * @returns {Object}
 */
function doc() {
    return {
        schema: 'neo.harness.dockZone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'},
            terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
        },
        nodes: {
            root        : {type: 'edge-zone', zones: {center: 'main-split'}},
            'main-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5, 0.5]},
            'main-tabs' : {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'},
            'side-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/**
 * @summary Tests for the worker-side Neural Link dock tools: fail-closed operation vocabulary,
 * holder resolution, and the landed dual commit path (override-preferred, reducer-fallback).
 */
test.describe.serial('Neo.ai.client.DockService', () => {
    let originalGetComponent, service;

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent;
        service              = Neo.create(DockService, {})
    });

    test.afterEach(() => {
        Neo.getComponent = originalGetComponent;
        service.destroy?.()
    });

    test('the operation vocabulary IS the executor export — one reference, no mirror to drift', () => {
        expect(DockService.operations).toBe(DockZoneModel.operations);
        expect(Object.isFrozen(DockService.operations)).toBe(true)
    });

    test('the executor honors its reducer contract on a well-formed document (returns, never throws)', () => {
        const result = DockZoneModel.applyOperation({nodes: {}}, {operation: 'moveItem', itemId: 'missing', targetNodeId: 'nowhere'});

        expect(result).toHaveProperty('document');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true)
    });

    test('executeDockOperation rejects unknown operations fail-closed with the vocabulary enumerated', async () => {
        await expect(service.executeDockOperation({
            componentId: 'any',
            descriptor : {operation: 'teleportItem'}
        // the enumerated vocabulary derives from the DockZoneModel SSOT (never hand-listed), so this
        // stays green as the operation family grows rather than pinning a brittle literal snapshot
        })).rejects.toThrow(new RegExp(`Unknown dock operation: teleportItem.*${DockService.operations.join(', ')}`))
    });

    test('executeDockOperation rejects a missing descriptor fail-closed', async () => {
        await expect(service.executeDockOperation({componentId: 'any'}))
            .rejects.toThrow(/Unknown dock operation/)
    });

    test('resolveHolder throws for an unknown component id', async () => {
        Neo.getComponent = () => null;

        await expect(service.getDockTopology({componentId: 'ghost-1'}))
            .rejects.toThrow('Component not found: ghost-1')
    });

    test('resolveHolder throws for a component that holds no dock document', async () => {
        Neo.getComponent = () => ({id: 'plain-1'});

        await expect(service.getDockTopology({componentId: 'plain-1'}))
            .rejects.toThrow(/holds no dock document/)
    });

    test('getDockTopology returns the document plus the executable vocabulary', async () => {
        const document = {root: {type: 'split', items: []}};

        Neo.getComponent = () => ({dockZoneDocument: document, id: 'zone-1'});

        const result = await service.getDockTopology({componentId: 'zone-1'});

        expect(result.document).toBe(document);
        expect(result.operations).toEqual(DockService.operations)
    });

    test('diffDockTopology compares a supplied before-document against the live holder document', async () => {
        const before = doc(),
              after  = doc();

        after.nodes['main-tabs'].items = ['swarm'];
        after.nodes['side-tabs'].items = ['terminal', 'strategy'];
        after.nodes['main-split'].sizes = [0.5005, 0.4995];

        Neo.getComponent = () => ({dockZoneDocument: after, id: 'zone-diff'});

        const result = await service.diffDockTopology({
            beforeDocument: before,
            componentId   : 'zone-diff',
            sizeEpsilon   : 0.0001
        });

        expect(result.errors).toEqual([]);
        expect(result.moves).toEqual([
            {itemId: 'strategy', from: {nodeId: 'main-tabs', index: 0}, to: {nodeId: 'side-tabs', index: 1}}
        ]);
        expect(result.resizes).toEqual([
            {nodeId: 'main-split', fromSizes: [0.5, 0.5], toSizes: [0.5005, 0.4995]}
        ])
    });

    test('diffDockTopology returns structured errors for malformed before-documents', async () => {
        const after = doc();

        Neo.getComponent = () => ({dockZoneDocument: after, id: 'zone-diff-errors'});

        const result = await service.diffDockTopology({
            beforeDocument: {schema: 'wrong'},
            componentId   : 'zone-diff-errors'
        });

        expect(result.moves).toEqual([]);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('before document failed the shape gate')
    });

    test('the canonical workspace shape (getDockZoneDocument + override, no plain field) reads BEFORE any write and never gains a stray field', async () => {
        // the examples/dashboard/dock MainContainer shape: document state lives in an internal
        // `dockModel` exposed only through the contract's read accessor — a plain-field read
        // would return null here before the first committed operation
        const before       = {root: {type: 'split', items: ['before']}};
        const nextDocument = {root: {type: 'split', items: ['after']}};
        const seen         = {change: null};

        const holder = {
            id       : 'zone-canonical',
            dockModel: before,
            getDockZoneDocument() {
                return this.dockModel
            },
            applyDockZoneOperation() {
                return {document: nextDocument, errors: []}
            },
            onDockZoneDocumentChange(doc) {
                seen.change = doc;
                this.dockModel = doc
            }
        };

        Neo.getComponent = () => holder;

        // read works pre-write against the canonical holder (the live-topology AC)
        const topology = await service.getDockTopology({componentId: 'zone-canonical'});
        expect(topology.document).toBe(before);

        const result = await service.executeDockOperation({
            componentId: 'zone-canonical',
            descriptor : {operation: 'setItemAutoHidden', itemId: 'pane-1', autoHidden: true}
        });

        expect(result.applied).toBe(true);
        expect(result.document).toBe(nextDocument);
        // the holder owns its state: synced through the callback, no stray divergent field
        expect(seen.change).toBe(nextDocument);
        expect(holder.dockModel).toBe(nextDocument);
        expect('dockZoneDocument' in holder).toBe(false);
        // and the post-write read reflects the commit through the same accessor
        expect((await service.getDockTopology({componentId: 'zone-canonical'})).document).toBe(nextDocument)
    });

    test('executeDockOperation prefers the holder applyDockZoneOperation override and commits on success', async () => {
        const nextDocument = {root: {type: 'split', items: ['after']}};
        const descriptor   = {operation: 'setItemAutoHidden', itemId: 'pane-1', autoHidden: true};
        const seen         = {apply: null, change: null};

        const holder = {
            id              : 'zone-2',
            dockZoneDocument: {root: {type: 'split', items: ['before']}},
            applyDockZoneOperation(desc, source) {
                seen.apply = {desc, source};
                return {document: nextDocument, errors: []}
            },
            onDockZoneDocumentChange(doc, desc, source) {
                seen.change = {doc, desc, source}
            }
        };

        Neo.getComponent = () => holder;

        const result = await service.executeDockOperation({componentId: 'zone-2', descriptor});

        expect(seen.apply.desc).toBe(descriptor);
        expect(result.applied).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.document).toBe(nextDocument);
        expect(holder.dockZoneDocument).toBe(nextDocument);
        expect(seen.change.doc).toBe(nextDocument);
        expect(seen.change.desc).toBe(descriptor)
    });

    test('executeDockOperation surfaces executor errors without committing (the policy-rejection path)', async () => {
        const before = {root: {type: 'split', items: ['before']}};

        const holder = {
            id              : 'zone-3',
            dockZoneDocument: before,
            applyDockZoneOperation() {
                return {document: null, errors: ['setItemPinned rejected: pinnable === false']}
            }
        };

        Neo.getComponent = () => holder;

        const result = await service.executeDockOperation({
            componentId: 'zone-3',
            descriptor : {operation: 'setItemPinned', itemId: 'pane-1', pinned: true}
        });

        expect(result.applied).toBe(false);
        expect(result.errors).toEqual(['setItemPinned rejected: pinnable === false']);
        expect(holder.dockZoneDocument).toBe(before)
    });

    test('executeDockOperation falls back to the static reducer for a document-only holder', async () => {
        const holder = {
            id              : 'zone-4',
            dockZoneDocument: {nodes: {}},
            // no applyDockZoneOperation: the static DockZoneModel.applyOperation() path runs
        };

        Neo.getComponent = () => holder;

        const result = await service.executeDockOperation({
            componentId: 'zone-4',
            descriptor : {operation: 'moveItem', itemId: 'missing', targetNodeId: 'nowhere'}
        });

        // an empty node map cannot satisfy the move: the reducer reports errors, nothing commits
        expect(result.applied).toBe(false);
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0)
    });

    test('a malformed holder document surfaces as structured errors, never a raw RPC crash', async () => {
        const malformed = {};

        Neo.getComponent = () => ({id: 'zone-5', dockZoneDocument: malformed});

        const result = await service.executeDockOperation({
            componentId: 'zone-5',
            descriptor : {operation: 'moveItem', itemId: 'x', targetNodeId: 'y'}
        });

        expect(result.applied).toBe(false);
        expect(result.errors[0]).toMatch(/Dock operation failed before commit:/);
        expect(result.document).toBe(malformed)
    });

    test('capturePerspective builds a valid record from the live document; scope vocabulary is exact and topology fails closed', async () => {
        const holder = {id: 'zone-6', dockZoneDocument: doc()};

        Neo.getComponent = () => holder;

        // workspace scope (the default): a schema-valid record, honest stored:false without a store
        const captured = await service.capturePerspective({
            componentId: 'zone-6', layoutId: 'ws-1', perspectiveName: 'Coding', title: 'Coding view'
        });

        expect(captured.captured).toBe(true);
        expect(captured.stored).toBe(false);
        expect(captured.errors).toEqual([]);
        expect(captured.layout.layoutId).toBe('ws-1');
        expect(captured.layout.perspectiveName).toBe('Coding');
        expect(DockZoneModel.restoreSavedLayout(captured.layout).errors).toEqual([]);

        // the settled two-scope vocabulary, exactly: topology is a declared refusal (not shipped),
        // anything else is an unknown-vocabulary refusal — never a silent workspace downgrade
        const topo = await service.capturePerspective({componentId: 'zone-6', layoutId: 'x', captureScope: 'topology'});
        expect(topo.captured).toBe(false);
        expect(topo.errors[0]).toContain('multi-window perspective tier');

        const junk = await service.capturePerspective({componentId: 'zone-6', layoutId: 'x', captureScope: 'window'});
        expect(junk.captured).toBe(false);
        expect(junk.errors[0]).toContain('vocabulary is: workspace, topology')
    });

    test('capturePerspective stores through the holder perspective store and surfaces its structured collision verdict', async () => {
        const saves  = [],
              holder = {
                  id              : 'zone-7',
                  dockZoneDocument: doc(),
                  perspectiveStore: {
                      savePerspective(layout, options) {
                          saves.push({layout, options});
                          return {collision: {holderLayoutId: 'other', holderTitle: 'Other', name: 'Coding'}, errors: [], layoutId: null, saved: false}
                      }
                  }
              };

        Neo.getComponent = () => holder;

        const result = await service.capturePerspective({
            componentId: 'zone-7', layoutId: 'ws-2', perspectiveName: 'Coding', replace: false
        });

        // capture succeeded, the store's collision verdict passes through untouched — the
        // agent gets the SAME structured decision surface a UI caller gets
        expect(result.captured).toBe(true);
        expect(result.stored).toBe(false);
        expect(result.collision).toMatchObject({holderLayoutId: 'other', name: 'Coding'});
        expect(saves[0].options).toEqual({replace: false})
    });

    test('listPerspectives reads the store surface and fails closed on a store-less holder', async () => {
        const listed = [{layoutId: 'a', perspectiveName: 'A', title: 'A view', captureScope: 'window', revision: null}];

        Neo.getComponent = () => ({
            id              : 'zone-8',
            dockZoneDocument: doc(),
            perspectiveStore: {collection: {activeLayoutId: 'a'}, list: () => listed}
        });

        const result = await service.listPerspectives({componentId: 'zone-8'});
        expect(result.perspectives).toBe(listed);
        expect(result.activeLayoutId).toBe('a');
        expect(result.errors).toEqual([]);

        // fail-closed: no store = a structured error, never an empty list masquerading as truth
        Neo.getComponent = () => ({id: 'zone-9', dockZoneDocument: doc()});
        const bare = await service.listPerspectives({componentId: 'zone-9'});
        expect(bare.perspectives).toBeNull();
        expect(bare.errors[0]).toContain('no perspective store')
    });

    test('restorePerspective prefers the holder switch seam and returns the post-restore document', async () => {
        const calls  = [],
              after  = doc(),
              holder = {
                  id: 'zone-10',
                  activatePerspective(name) { calls.push(name); return {errors: [], switched: true} },
                  getDockZoneDocument: () => after
              };

        Neo.getComponent = () => holder;

        const result = await service.restorePerspective({componentId: 'zone-10', name: 'Focus'});
        expect(calls).toEqual(['Focus']);
        expect(result.switched).toBe(true);
        expect(result.document).toBe(after)
    });

    test('restorePerspective store path: fail-closed refusal leaves the holder byte-untouched; success commits through the landed path', async () => {
        const restored = doc(),
              notified = [];

        // refusal: the store's structured errors pass through, the document never moves
        const refusingHolder = {
            id              : 'zone-11',
            dockZoneDocument: doc(),
            perspectiveStore: {loadPerspective: () => ({document: null, errors: ['no perspective named "ghost"'], layout: null})}
        };
        const before = JSON.stringify(refusingHolder.dockZoneDocument);

        Neo.getComponent = () => refusingHolder;

        const refused = await service.restorePerspective({componentId: 'zone-11', name: 'ghost'});
        expect(refused.switched).toBe(false);
        expect(refused.errors[0]).toContain('no perspective named');
        expect(JSON.stringify(refusingHolder.dockZoneDocument)).toBe(before);

        // success on a plain holder: the same commit semantics executeDockOperation uses —
        // dockZoneDocument advances AND the change hook fires with the restore descriptor
        const plainHolder = {
            id              : 'zone-12',
            dockZoneDocument: doc(),
            onDockZoneDocumentChange(document, descriptor) { notified.push(descriptor) },
            perspectiveStore: {loadPerspective: () => ({document: restored, errors: [], layout: {}})}
        };

        Neo.getComponent = () => plainHolder;

        const result = await service.restorePerspective({componentId: 'zone-12', name: 'Focus'});
        expect(result.switched).toBe(true);
        expect(result.document).toBe(restored);
        expect(plainHolder.dockZoneDocument).toBe(restored);
        expect(notified[0]).toMatchObject({name: 'Focus', operation: 'restorePerspective'});

        // and a holder with NEITHER seam is a structured refusal, never a crash
        Neo.getComponent = () => ({id: 'zone-13', dockZoneDocument: doc()});
        const bare = await service.restorePerspective({componentId: 'zone-13', name: 'Focus'});
        expect(bare.switched).toBe(false);
        expect(bare.errors[0]).toContain('no perspective surface')
    });
});
