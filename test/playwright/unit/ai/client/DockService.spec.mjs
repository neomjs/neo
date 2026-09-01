import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../src/Neo.mjs';
import * as core            from '../../../../../src/core/_export.mjs';
import DockService          from '../../../../../src/ai/client/DockService.mjs';
import Operations           from '../../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence          from '../../../../../src/dashboard/dock/model/Persistence.mjs';
import PerspectiveLibrary   from '../../../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';

/**
 * @summary Creates a valid dockZone.v1 fixture for diff-tool assertions.
 * @returns {Object}
 */
function doc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'},
            terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
        },
        nodes: {
            root        : {type: 'edge-zone', zones: {center: {nodeId: 'main-split'}}},
            'main-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5, 0.5]},
            'main-tabs' : {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'},
            'side-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/**
 * @summary A second, item-disjoint dockZone.v1 fixture — the ADDITIONAL window for topology-scope
 * assertions (the reconciler validates workspace-global item disjointness across live windows).
 * @returns {Object}
 */
function doc2() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'},
            beta : {componentRef: 'beta',  title: 'Beta',  kind: 'panel'}
        },
        nodes: {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'only-tabs'}}},
            'only-tabs': {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'}
        }
    }
}

/**
 * @summary The doc() catalog rearranged (strategy moved across tabs nodes) — same items, different
 * shape fingerprint, so a restore toward doc() exercises the reconciler's changed-topology path.
 * @returns {Object}
 */
function docRearranged() {
    const d = doc();

    d.nodes['main-tabs'].items        = ['swarm'];
    d.nodes['main-tabs'].activeItemId = 'swarm';
    d.nodes['side-tabs'].items        = ['terminal', 'strategy'];

    return d
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
        expect(DockService.operations).toBe(Operations.operations);
        expect(Object.isFrozen(DockService.operations)).toBe(true)
    });

    test('the executor honors its reducer contract on a well-formed document (returns, never throws)', () => {
        const result = Operations.applyOperation({nodes: {}}, {operation: 'moveItem', itemId: 'missing', targetNodeId: 'nowhere'});

        expect(result).toHaveProperty('document');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true)
    });

    test('executeDockOperation rejects unknown operations fail-closed with the vocabulary enumerated', async () => {
        await expect(service.executeDockOperation({
            componentId: 'any',
            descriptor : {operation: 'teleportItem'}
        // the enumerated vocabulary derives from the Operations SSOT (never hand-listed), so this
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
            // no applyDockZoneOperation: the static Operations.applyOperation() path runs
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

    test('capturePerspective (window default) rides the landed producer — fingerprint-coherent, schema-valid, honest stored:false', async () => {
        const holder = {id: 'zone-6', dockZoneDocument: doc()};

        Neo.getComponent = () => holder;

        const captured = await service.capturePerspective({
            componentId: 'zone-6', layoutId: 'ws-1', perspectiveName: 'Coding', title: 'Coding view'
        });

        expect(captured.captured).toBe(true);
        expect(captured.stored).toBe(false);
        expect(captured.errors).toEqual([]);
        expect(captured.layout.layoutId).toBe('ws-1');
        expect(captured.layout.perspectiveName).toBe('Coding');
        expect(captured.layout.captureScope).toBe('window');
        // the landed producer computes the fingerprint from the PERSISTED tree — a null
        // fingerprint would mean the tool bypassed Persistence.capturePerspective()
        // Wire identity renamed by the v13.2 cut (#17837 / PR #17841): the `neo.harness.*` family
        // carried pre-release history, and the landed vocabulary is `neo.dock.*`. The assertion is
        // updated rather than the producer — this arm exists to prove the fingerprint comes from
        // Persistence, and the schema string is how it proves it.
        expect(captured.layout.windowFingerprint?.schema).toBe('neo.dock.shape.v1');
        expect(Persistence.restoreSavedLayout(captured.layout).errors).toEqual([])
    });

    test('capture scope vocabulary IS the CAPTURE_SCOPES SSOT: window accepted, workspace and junk refused with the executable set enumerated', async () => {
        Neo.getComponent = () => ({id: 'zone-6b', dockZoneDocument: doc()});

        // `window` is the executable SSOT scope — an implementation refusing it contradicts
        // Persistence.CAPTURE_SCOPES (the review falsifier that convicted the stale vocabulary)
        const win = await service.capturePerspective({componentId: 'zone-6b', layoutId: 'w-1', captureScope: 'window'});
        expect(win.captured).toBe(true);
        expect(win.layout.captureScope).toBe('window');

        // `workspace` is the ADR's capability LABEL, not a runtime enum value — minting it as a
        // third runtime scope is the drift this spec pins shut
        for (const bogus of ['workspace', 'teleport']) {
            const refused = await service.capturePerspective({componentId: 'zone-6b', layoutId: 'x', captureScope: bogus});

            expect(refused.captured).toBe(false);
            // the enumeration derives from the SSOT, never a hand-listed literal
            expect(refused.errors[0]).toContain(`the vocabulary is: ${Persistence.CAPTURE_SCOPES.join(', ')}`)
        }
    });

    test('capturePerspective (topology) captures the ordered multi-window workspace through the holder seam — and refuses without it', async () => {
        const holder = {
            id                      : 'zone-6c',
            dockZoneDocument        : doc(),
            getDockTopologyDocuments: () => [doc(), doc2()]
        };

        Neo.getComponent = () => holder;

        const captured = await service.capturePerspective({
            componentId: 'zone-6c', layoutId: 'topo-1', perspectiveName: 'Everything', captureScope: 'topology'
        });

        expect(captured.captured).toBe(true);
        expect(captured.layout.captureScope).toBe('topology');
        // slot 0 stays the primary dockZone; the ADDITIONAL window persists in windowDocuments
        expect(captured.layout.windowDocuments).toHaveLength(1);
        expect(Object.keys(captured.layout.windowDocuments[0].items)).toEqual(['alpha', 'beta']);
        expect(captured.layout.windowFingerprint?.schema).toBe('neo.dock.topologyShape.v1');
        expect(captured.layout.windowFingerprint?.windowCount).toBe(2);
        expect(Persistence.restoreSavedLayout(captured.layout).errors).toEqual([]);

        // no topology read seam = a declared refusal naming the seam — never a silent
        // downgrade to a window-scope record
        Neo.getComponent = () => ({id: 'zone-6d', dockZoneDocument: doc()});
        const refused = await service.capturePerspective({componentId: 'zone-6d', layoutId: 'x', captureScope: 'topology'});

        expect(refused.captured).toBe(false);
        expect(refused.errors[0]).toContain('getDockTopologyDocuments')
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

    test('restorePerspective inspects the record READ-ONLY first: no getPerspective seam and unknown names are declared refusals', async () => {
        // scope-honesty requires reading captureScope BEFORE any state moves — a store without
        // the read-only seam cannot make that promise, so the tool refuses rather than guessing
        Neo.getComponent = () => ({
            id              : 'zone-10',
            dockZoneDocument: doc(),
            perspectiveStore: {loadPerspective: () => ({document: doc(), errors: [], layout: {}})}
        });

        const blind = await service.restorePerspective({componentId: 'zone-10', name: 'Focus'});
        expect(blind.switched).toBe(false);
        expect(blind.errors[0]).toContain('getPerspective');

        Neo.getComponent = () => ({
            id              : 'zone-10b',
            dockZoneDocument: doc(),
            perspectiveStore: {getPerspective: () => null}
        });

        const missing = await service.restorePerspective({componentId: 'zone-10b', name: 'ghost'});
        expect(missing.switched).toBe(false);
        expect(missing.errors[0]).toContain('no perspective named "ghost"');

        // and a holder with no perspective surface at all refuses, never crashes
        Neo.getComponent = () => ({id: 'zone-10c', dockZoneDocument: doc()});
        const bare = await service.restorePerspective({componentId: 'zone-10c', name: 'Focus'});
        expect(bare.switched).toBe(false);
        expect(bare.errors[0]).toContain('getPerspective')
    });

    test('restorePerspective routes a WINDOW record through the holder switch seam after the scope inspection', async () => {
        const calls    = [],
              after    = doc(),
              windowed = Persistence.capturePerspective(doc(), {layoutId: 'w-1', perspectiveName: 'Focus', title: 'Focus'}).layout,
              holder   = {
                  id: 'zone-11',
                  activatePerspective(name) { calls.push(name); return {errors: [], switched: true} },
                  getDockZoneDocument: () => after,
                  perspectiveStore   : {getPerspective: () => ({layout: windowed, layoutId: 'w-1'})}
              };

        Neo.getComponent = () => holder;

        const result = await service.restorePerspective({componentId: 'zone-11', name: 'Focus'});
        expect(calls).toEqual(['Focus']);
        expect(result.switched).toBe(true);
        expect(result.captureScope).toBe('window');
        expect(result.document).toBe(after)
    });

    test('restorePerspective window store fallback: refusal leaves the holder byte-untouched; success commits through the landed plain-holder path', async () => {
        const restored = doc(),
              windowed = Persistence.capturePerspective(doc(), {layoutId: 'w-2', perspectiveName: 'Focus', title: 'Focus'}).layout,
              notified = [];

        // refusal: the store's structured errors pass through, the document never moves
        const refusingHolder = {
            id              : 'zone-12',
            dockZoneDocument: doc(),
            perspectiveStore: {
                getPerspective : () => ({layout: windowed, layoutId: 'w-2'}),
                loadPerspective: () => ({document: null, errors: ['collection validation failed'], layout: null})
            }
        };
        const before = JSON.stringify(refusingHolder.dockZoneDocument);

        Neo.getComponent = () => refusingHolder;

        const refused = await service.restorePerspective({componentId: 'zone-12', name: 'Focus'});
        expect(refused.switched).toBe(false);
        expect(refused.errors[0]).toContain('collection validation failed');
        expect(JSON.stringify(refusingHolder.dockZoneDocument)).toBe(before);

        // success on a plain holder: the same commit semantics executeDockOperation uses —
        // dockZoneDocument advances AND the change hook fires with the restore descriptor
        const plainHolder = {
            id              : 'zone-13',
            dockZoneDocument: doc(),
            onDockZoneDocumentChange(document, descriptor) { notified.push(descriptor) },
            perspectiveStore: {
                getPerspective : () => ({layout: windowed, layoutId: 'w-2'}),
                loadPerspective: () => ({document: restored, errors: [], layout: windowed})
            }
        };

        Neo.getComponent = () => plainHolder;

        const result = await service.restorePerspective({componentId: 'zone-13', name: 'Focus'});
        expect(result.switched).toBe(true);
        expect(result.captureScope).toBe('window');
        expect(result.document).toBe(restored);
        expect(plainHolder.dockZoneDocument).toBe(restored);
        expect(notified[0]).toMatchObject({name: 'Focus', operation: 'restorePerspective'})
    });

    test('restorePerspective routes a TOPOLOGY record through the reconciler + the atomic multi-document seam (real store, changed topology)', async () => {
        // the REAL producer + REAL store: the record is exactly what capture writes
        const captured = Persistence.captureTopologyPerspective([doc(), doc2()], {
                  layoutId: 'topo-1', perspectiveName: 'Everything', title: 'Everything'
              }).layout,
              store    = Neo.create(PerspectiveLibrary, {});

        expect(store.savePerspective(captured).saved).toBe(true);

        // live topology CHANGED since capture: primary window rearranged (shape mismatch →
        // the reconciler's adopt branch), second window byte-equal (incremental no-op branch)
        const liveDocs = [docRearranged(), doc2()],
              commits  = [],
              holder   = {
                  id                      : 'zone-14',
                  dockZoneDocument        : liveDocs[0],
                  perspectiveStore        : store,
                  getDockTopologyDocuments: () => liveDocs,
                  commitDockTopologyDocuments(documents, context) {
                      // the atomic seam sees ALL window documents in one call — and the store's
                      // active pointer has NOT moved yet at commit time (commit-then-activate)
                      commits.push({activeAtCommit: store.collection.activeLayoutId, context, documents})
                  }
              };

        Neo.getComponent = () => holder;

        const result = await service.restorePerspective({componentId: 'zone-14', name: 'Everything'});

        expect(result.switched).toBe(true);
        expect(result.captureScope).toBe('topology');
        expect(result.errors).toEqual([]);
        expect(commits).toHaveLength(1);
        expect(commits[0].documents).toHaveLength(2);
        expect(commits[0].context).toMatchObject({name: 'Everything', operation: 'restorePerspective'});
        // every captured item id lands in restored — windowDocuments were consumed, not dropped
        expect([...result.restored].sort()).toEqual(['alpha', 'beta', 'strategy', 'swarm', 'terminal']);
        expect(result.unrestored).toEqual([]);
        // the primary window adopted the captured arrangement (strategy back on main-tabs)
        expect(result.documents[0].nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
        expect(result.document).toBe(result.documents[0]);
        // the store's active pointer advanced only AFTER the workspace commit
        expect(commits[0].activeAtCommit).toBe('topo-1');
        expect(store.collection.activeLayoutId).toBe('topo-1');

        store.destroy()
    });

    test('a TOPOLOGY record without the atomic holder seam refuses — never the window seam, never a partial commit, store pointer unmoved', async () => {
        const captured = Persistence.captureTopologyPerspective([doc(), doc2()], {
                  layoutId: 'topo-2', perspectiveName: 'Spread', title: 'Spread'
              }).layout,
              windowed = Persistence.capturePerspective(doc(), {layoutId: 'w-9', perspectiveName: 'Decoy', title: 'Decoy'}).layout,
              store    = Neo.create(PerspectiveLibrary, {});

        expect(store.savePerspective(windowed).saved).toBe(true);              // active: w-9
        expect(store.savePerspective(captured, {activate: false}).saved).toBe(true);

        const activations = [],
              liveDocs    = [docRearranged(), doc2()],
              before      = JSON.stringify(liveDocs),
              holder      = {
                  id              : 'zone-15',
                  dockZoneDocument: liveDocs[0],
                  perspectiveStore: store,
                  // a window switch seam EXISTS — a topology record must still never ride it
                  activatePerspective(name) { activations.push(name); return {errors: [], switched: true} },
                  getDockTopologyDocuments: () => liveDocs
                  // no commitDockTopologyDocuments: the atomic seam is missing
              };

        Neo.getComponent = () => holder;

        const result = await service.restorePerspective({componentId: 'zone-15', name: 'Spread'});

        expect(result.switched).toBe(false);
        expect(result.captureScope).toBe('topology');
        expect(result.errors[0]).toContain('commitDockTopologyDocuments');
        expect(activations).toEqual([]);
        expect(JSON.stringify(liveDocs)).toBe(before);
        // the store's active pointer never moved off the decoy
        expect(store.collection.activeLayoutId).toBe('w-9');

        store.destroy()
    });

    test('a refused topology reconciliation fails byte-identical: no document commits, no store state advances', async () => {
        // a corrupt record can only enter through a non-validating surface — the tool must
        // still fail the ENTIRE restore closed on the reconciler's own validation
        const corrupt = {
                  schema         : 'neo.harness.dockLayout.v2',
                  layoutId       : 'topo-bad',
                  title          : 'Bad',
                  captureScope   : 'topology',
                  dockZone       : doc(),
                  windowDocuments: 'nonsense'
              },
              loads    = [],
              commits  = [],
              liveDocs = [doc(), doc2()],
              before   = JSON.stringify(liveDocs),
              holder   = {
                  id                      : 'zone-16',
                  dockZoneDocument        : liveDocs[0],
                  getDockTopologyDocuments: () => liveDocs,
                  commitDockTopologyDocuments(documents) { commits.push(documents) },
                  perspectiveStore        : {
                      getPerspective : () => ({layout: corrupt, layoutId: 'topo-bad'}),
                      loadPerspective: name => { loads.push(name); return {document: null, errors: [], layout: null} }
                  }
              };

        Neo.getComponent = () => holder;

        const result = await service.restorePerspective({componentId: 'zone-16', name: 'Bad'});

        expect(result.switched).toBe(false);
        expect(result.captureScope).toBe('topology');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.unrestored.length).toBeGreaterThan(0);
        expect(commits).toEqual([]);
        expect(loads).toEqual([]);
        expect(JSON.stringify(liveDocs)).toBe(before)
    });
});
