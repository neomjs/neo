import {setup}         from '../../../setup.mjs';
import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import Workspace       from '../../../../../apps/workstation/view/Workspace.mjs';
import GestureDriver   from '../../../../../apps/workstation/tour/GestureDriver.mjs';
import InstanceService from '../../../../../src/ai/client/InstanceService.mjs';

setup({appConfig: {name: 'WorkstationGestureDriverTest'}});

/** @summary A controlled async boundary with an explicit release. @returns {Object} */
function deferred() {
    let resolve;
    const promise = new Promise(done => resolve = done);
    return {promise, resolve}
}

/**
 * @summary Controls physical completion and the observed Group outcome while retaining real driver teardown.
 * @returns {Promise<Object>} Native-boundary fixture; adoption is a unit control, not a rendered witness.
 */
async function nativeReturnFixture() {
    const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
    const {default: WindowManager}       = await import('../../../../../src/manager/Window.mjs');
    const {default: coordinator}         = await import('../../../../../src/manager/DragCoordinator.mjs');
    const sourceWindowId                 = 'native-return-unit-popup', mainId = 'native-return-unit-main',
          sourceId = 'native-return-unit-vessel', targetId = 'native-return-unit-workspace',
          route = {ownerWindowId: mainId, targetWindowId: sourceWindowId, nativeHandleKey: 'native-return-unit-handle',
              capabilities: {position: true}},
          original = {x: 900, y: 500}, calls = [], begun = deferred(), move = deferred(),
          identities = {metrics: 'native-return-metrics-pane', commits: 'native-return-commits-pane'},
          group = {history: {current: {transactionId: 'before-return'}}},
          state = {windowId: sourceWindowId, committed: true, document: {
              root: 'root', items: {metrics: {}, commits: {}}, nodes: {
                  root : {type: 'edge-zone', zones: {center: {nodeId: 'stack'}}},
                  stack: {type: 'tabs', items: ['metrics', 'commits']}
              }
          }},
          workspace = {id: targetId, windowId: mainId, topologyGroupId: 'native-return-unit-group', isDestroyed: false,
              constructor    : {MAIN_WORKSPACE_ID: targetId, vesselWorkspaceId: () => sourceId},
              workspaceSet   : {has: () => true, manager: {get: () => group}},
              getPopupState  : id => id === sourceId ? state : null,
              getPaneIdentity: id => identities[id],
              dockModel      : {items: {}, nodes: {home: {type: 'tabs', items: []}}},
              tearOutHandlers: {peekPlacement: () => ({tabsNodeId: 'home'})},
              dragAffordances: {host: {down: ({dockNodeId}) => ({id: dockNodeId}),
                  getDomRect: async () => [{x: 10, y: 10, width: 400, height: 400}, {x: 450, y: 10, width: 300, height: 400}]}},
              readCrossWindowGestureSnapshot: () => ({ready: true, preview: {previewId: `preview-${calls.length}`}}),
              timeout                       : async () => {}
          },
          oldSource = coordinator.getNativeWindowDragSource,
          oldGeometry = Neo.Main.windowNativeGetGeometry, oldMove = Neo.Main.windowNativeMoveTo,
          driver = Neo.create(NativeGestureDriver, {workspace}), service = driver.interactionService;
    let mode = 'success';

    WindowManager.register({id: mainId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    WindowManager.register({id: sourceWindowId, nativeRoute: route});
    coordinator.getNativeWindowDragSource = id => id === sourceWindowId
        ? {widgetName: 'metrics', draggedItem: {dockGroupNodeId: 'stack'}} : oldSource.call(coordinator, id);
    Neo.Main.windowNativeGetGeometry = async () => original;
    Neo.Main.windowNativeMoveTo = async request => {
        calls.push(request);
        if (request.nativeEffect) return true;
        if (mode === 'deferred') {
            begun.resolve();
            return move.promise
        }
        if (calls.length === 3) adopt();
        return true
    };

    /** @summary Supplies a completed Group adoption at the controlled physical boundary. */
    function adopt() {
        const row = {transactionId: 'native-return-unit-transfer', cause: 'dock-transfer', operation: 'transferNode',
            sourceWorkspaceId: sourceId, targetWorkspaceId: targetId};
        group.history.current = row;
        workspace.dockModel.items = state.document.items;
        workspace.dockModel.nodes.home.items = ['metrics', 'commits'];
        state.document.items = {};
        workspace.lastCrossWindowTransfer = {...row, applied: true, descriptor: {operation: 'transferNode'},
            closeRequested: true, topologyExited: true,
            phases        : ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged']};
        WindowManager.unregister(sourceWindowId)
    }

    return {
        adopt, begun, calls, coordinator, driver, group, identities, mainId, move, original, route, service,
        sourceWindowId, state, WindowManager, workspace,
        defer() { mode = 'deferred' },
        execute() { return driver.executeNativeReturnStep({ownerItemId: 'metrics'}, {attempts: 2, moveDelay: 0, moveSteps: 1}) },
        async cleanup() {
            move.resolve(true);
            driver.isDestroyed || driver.destroy();
            await driver.settledPromise;
            coordinator.getNativeWindowDragSource = oldSource;
            coordinator.nativeWindowDropCandidates.delete(sourceWindowId);
            coordinator.nativeHoverTargets.delete(sourceWindowId);
            coordinator.nativeClaimArbiters.delete(sourceWindowId);
            Neo.Main.windowNativeGetGeometry = oldGeometry;
            Neo.Main.windowNativeMoveTo = oldMove;
            WindowManager.unregister(sourceWindowId);
            WindowManager.unregister(mainId)
        }
    }
}

test.describe('native return physical completion and driver teardown', () => {
    test('a settled whole-stack adoption reports the retained identities and physical exit', async () => {
        const f = await nativeReturnFixture();
        try {
            const receipt = await f.execute();
            expect(receipt.applied).toBe(true);
            expect(receipt.proof).toMatchObject({identityPreserved: true, sourceWindowGone: true,
                sourceItemIds: ['metrics', 'commits'],
                phaseOrder   : ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged']});
            expect(f.calls).toHaveLength(3);
            expect(f.calls.every(call => !call.nativeEffect && call.nativeHandleKey === f.route.nativeHandleKey)).toBe(true)
        } finally { await f.cleanup() }
    });

    test('destruction waits for physical movement before recovering the original frame', async () => {
        const f = await nativeReturnFixture();
        try {
            f.defer();
            const pending = f.execute();
            await f.begun.promise;
            f.coordinator.nativeWindowDropCandidates.set(f.sourceWindowId, {});
            f.coordinator.nativeHoverTargets.set(f.sourceWindowId, {});
            f.driver.destroy();
            await new Promise(setImmediate);
            expect(f.calls).toHaveLength(1);
            expect(f.service.isDestroyed).toBeFalsy();
            f.move.resolve(true);
            const receipt = await pending;
            await f.driver.settledPromise;
            expect(receipt).toMatchObject({applied: false, proof: {recovery: {restored: true}}});
            expect(f.calls).toHaveLength(2);
            expect(f.calls[1]).toMatchObject({...f.original, nativeHandleKey: f.route.nativeHandleKey,
                nativeEffect: {transactionId: expect.any(String), effectId: expect.any(String)}});
            expect(Object.keys(f.state.document.items)).toEqual(['metrics', 'commits']);
            expect(f.group.history.current.transactionId).toBe('before-return');
            expect(f.coordinator.nativeWindowDropCandidates.has(f.sourceWindowId)).toBe(false);
            expect(f.coordinator.nativeHoverTargets.has(f.sourceWindowId)).toBe(false);
            expect(f.service.isDestroyed).toBe(true)
        } finally { await f.cleanup() }
    });

    test('an adopted transfer settles through destruction without a recovery move', async () => {
        const f = await nativeReturnFixture();
        try {
            f.defer();
            const pending = f.execute();
            await f.begun.promise;
            f.driver.destroy();
            f.adopt();
            f.move.resolve(true);
            const receipt = await pending;
            expect(receipt.applied).toBe(true);
            expect(receipt.proof.transfer.transactionId).toBe('native-return-unit-transfer');
            expect(f.calls).toHaveLength(1);
            expect(f.service.isDestroyed).toBe(true)
        } finally { await f.cleanup() }
    });

    test('a replacement route retains its own candidate and hover when the old move settles', async () => {
        const f = await nativeReturnFixture();
        try {
            f.defer();
            const pending = f.execute();
            await f.begun.promise;
            const successor = {...f.route, nativeHandleKey: 'successor-handle'}, candidate = {phase: 'parking'}, hover = {};
            f.WindowManager.get(f.sourceWindowId).nativeRoute = successor;
            f.coordinator.nativeWindowDropCandidates.set(f.sourceWindowId, candidate);
            f.coordinator.nativeHoverTargets.set(f.sourceWindowId, hover);
            f.driver.destroy();
            f.move.resolve(true);
            expect(await pending).toMatchObject({applied: false, errors: ['native return lost its original window route']});
            expect(f.calls).toHaveLength(1);
            expect(f.coordinator.nativeWindowDropCandidates.get(f.sourceWindowId)).toBe(candidate);
            expect(f.coordinator.nativeHoverTargets.get(f.sourceWindowId)).toBe(hover)
        } finally { await f.cleanup() }
    });

    test('an owner route without position capability refuses before physical movement', async () => {
        const f = await nativeReturnFixture();
        try {
            f.route.capabilities.position = false;
            expect(await f.execute()).toMatchObject({applied: false,
                errors: ['native return has no current owner-granted position route']});
            expect(f.calls).toEqual([]);
            expect(Object.keys(f.state.document.items)).toEqual(['metrics', 'commits'])
        } finally { await f.cleanup() }
    })
});

const down = {targetId: 'source-tab', windowId: 'source-window', type: 'mousedown',
    options: {buttons: 1, clientX: 50, clientY: 60}},
      up = {...down, type: 'mouseup', options: {...down.options, buttons: 0}};

/**
 * @summary A tear-out driver with controlled birth and pacing, retaining real input cleanup.
 * @param {Object} [options={}]
 * @param {Boolean} [options.survived=true] Whether the post-birth survival probe still finds its vessel.
 * @param {Boolean} [options.entry=true] Whether the returning pointer emits the re-entry event.
 * @returns {Promise<Object>}
 */
async function birthHoldFixture({survived=true, entry=true}={}) {
    const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
    const {default: WindowManager}       = await import('../../../../../src/manager/Window.mjs');
    const windowId = 'gesture-birth-hold-window', calls = [], born = deferred(), hold = deferred(), listeners = new Map(),
          document = {items: {metrics: {}, audit: {}}, nodes: {source: {type: 'tabs', items: ['metrics', 'audit']}}},
          sortZone = {on() {}, un() {}, boundaryContainerRect: {x: 0, y: 0, width: 500, height: 400}},
          button = {id: 'gesture-birth-hold-tab', windowId,
              getDomRect: async () => [{x: 100, y: 100, width: 40, height: 20}]},
          workspace = {id: 'gesture-birth-hold-workspace', isDestroyed: false, dockModel: document,
              paneCache: {metrics: {}}, refreshPromise: null,
              getDockHost: () => ({down: () => ({on: (event, fn) => listeners.set(event, fn), un: event => listeners.delete(event),
                  getTabAtIndex: () => button, getTabBar: () => ({sortZone})})}),
              nativeWindows: {clearConnection() {}, getConnection: () => ({windowId: 'gesture-birth-hold-vessel'})},
              tearOutHandlers: {activeVessel: null}, tearOutEmbodiment: {isStaged: () => false}},
          driver = Neo.create(NativeGestureDriver, {workspace}),
          service = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    driver.timeout = async ms => {
        if (ms === 1234) {
            calls.push('hold');
            await hold.promise;
            calls.push('hold-settled')
        }
    };
    driver.waitForTearOutDragArmed = async () => true;
    driver.waitForTearOutVessel = async (itemId, {attempts}) => {
        calls.push('born');
        born.resolve();
        return attempts === 0 ? survived : true
    };
    driver.waitForTearOutVesselRetired = async () => true;
    driver.waitForTearOutCommit = async () => true;
    driver.getTearOutCommitState = () => ({
        transferCommitted: true,
        sourceDocument: {items: {audit: {}}, nodes: {}},
        targetDocument: {items: {metrics: {}}, nodes: {}}
    });
    service.simulateEvent = async ({events}) => {
        calls.push(events[0].type);
        if (entry && events[0].type === 'mousemove' && events[0].options.clientX < 200) {
            listeners.get('dockTearOutEntry')?.()
        }
        return true
    };
    service.dispatch = async ({type}) => {calls.push(type); return true};

    return {
        born, calls, driver, hold, service, sortZone, workspace,
        execute(options={}) {
            return driver.executeTearOutStep({itemId: 'metrics', sourceNodeId: 'source'},
                {moveDelay: 0, moveSteps: 2, ...options})
        },
        cleanup() {
            hold.resolve();
            driver.isDestroyed || driver.destroy();
            WindowManager.unregister(windowId)
        }
    }
}

test.describe('film birth pacing retains the pressed-pointer bracket', () => {
    for (const reenter of [false, true]) {
        test(`birth hold precedes ${reenter ? 're-entry' : 'terminal release'}`, async () => {
            const fixture = await birthHoldFixture();
            try {
                const pending = fixture.execute({birthDwellMs: 1234, reenter});
                await Promise.race([fixture.born.promise, pending.then(receipt => {
                    throw new Error('Tear-out ended before birth: ' + JSON.stringify(receipt))
                })]);
                await new Promise(setImmediate);
                expect(fixture.calls.at(-1)).toBe('hold');
                expect(fixture.calls).not.toContain('mouseup');
                expect([...fixture.driver.activeRuns][0].pointer.options.buttons).toBe(1);

                const heldCalls = [...fixture.calls];
                await new Promise(setImmediate);
                expect(fixture.calls, 'a held birth emits no further pointer movement').toEqual(heldCalls);
                fixture.hold.resolve();
                const receipt = await pending;
                expect(receipt.errors).toEqual([]);
                expect(receipt.proof.born).toBe(true);
                expect(receipt.proof.birthHold).toEqual({durationMs: 1234, survived: true,
                    claimCount: 0, hasTarget: false, hasPreview: false});
                expect(fixture.calls.indexOf('mouseup')).toBeGreaterThan(fixture.calls.indexOf('hold-settled'));
                if (reenter) {
                    expect(receipt.reentered).toBe(true);
                    expect(receipt.proof.documentsUnchanged).toBe(true)
                } else {
                    expect(receipt.applied).toBe(true)
                }
            } finally {
                fixture.cleanup()
            }
        })
    }

    test('omitting the hold preserves the ordinary terminal path', async () => {
        const fixture = await birthHoldFixture();
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(true);
            expect(fixture.calls).not.toContain('hold');
            expect(fixture.calls.filter(type => type === 'mouseup')).toHaveLength(1)
        } finally {
            fixture.cleanup()
        }
    });

    test('a vessel lost during the survival probe is not held for narration', async () => {
        const fixture = await birthHoldFixture({survived: false});
        try {
            const receipt = await fixture.execute({birthDwellMs: 1234});
            expect(receipt.proof.survivedProbe).toBe(false);
            expect(fixture.calls).not.toContain('hold')
        } finally {
            fixture.cleanup()
        }
    });

    test('destruction during the hold releases input without a late re-entry move', async () => {
        const fixture = await birthHoldFixture();
        try {
            const pending = fixture.execute({birthDwellMs: 1234, reenter: true});
            await Promise.race([fixture.born.promise, pending.then(receipt => {
                throw new Error('Tear-out ended before birth: ' + JSON.stringify(receipt))
            })]);
            await new Promise(setImmediate);
            expect(fixture.calls.at(-1)).toBe('hold');
            fixture.driver.destroy();
            const receipt = await pending;
            expect(receipt.applied).toBe(false);
            expect(receipt.errors.length).toBeGreaterThan(0);
            expect(fixture.calls.slice(fixture.calls.indexOf('hold') + 1)).toEqual(['keydown', 'mouseup']);
            expect(fixture.service.isDestroyed).toBe(true);
            expect(fixture.workspace.isDestroyed).toBe(false);
            fixture.hold.resolve();
            await new Promise(setImmediate);
            expect(fixture.calls.filter(type => type === 'mouseup')).toHaveLength(1);
            expect(fixture.calls.slice(fixture.calls.indexOf('hold') + 1)).not.toContain('mousemove')
        } finally {
            fixture.cleanup()
        }
    });

    for (const fault of ['vessel lost', 'drop preview armed']) {
        test(`${fault} during the hold cannot report re-entry`, async () => {
            const fixture = await birthHoldFixture();
            try {
                const pending = fixture.execute({birthDwellMs: 1234, reenter: true});
                await Promise.race([fixture.born.promise, pending.then(receipt => {
                    throw new Error('Tear-out ended before birth: ' + JSON.stringify(receipt))
                })]);
                await new Promise(setImmediate);
                expect(fixture.calls.at(-1)).toBe('hold');
                if (fault === 'vessel lost') {
                    fixture.driver.waitForTearOutVessel = async () => false
                } else {
                    fixture.sortZone.dragCoordinator = {
                        activeTargetZone: {currentPreview: {previewId: 'unexpected'}},
                        pointerClaimArbiter: {claimCount: 1}
                    }
                }
                fixture.hold.resolve();
                const receipt = await pending;
                expect(receipt.applied).toBe(false);
                expect(receipt.reentered).not.toBe(true);
                expect(receipt.errors).toEqual(['birth hold did not retain an unclaimed tear-out vessel']);
                expect(fixture.calls.slice(fixture.calls.indexOf('hold-settled') + 1).filter(call => call !== 'born'))
                    .toEqual(['keydown', 'mouseup'])
            } finally {
                fixture.cleanup()
            }
        })
    }

    test('retirement without a re-entry event cannot certify the morph', async () => {
        const fixture = await birthHoldFixture({entry: false});
        try {
            const pending = fixture.execute({birthDwellMs: 1234, reenter: true});
            fixture.hold.resolve();
            const receipt = await pending;
            expect(receipt.proof.retired).toBe(true);
            expect(receipt.proof.entrySeen).toBe(false);
            expect(receipt.reentered).toBe(false);
            expect(receipt.errors).toHaveLength(1)
        } finally {
            fixture.cleanup()
        }
    })
});

/**
 * @summary A rail-beat driver over a stub host: the pane's tab, its header pin action, the rail
 * and its reveal answer clicks by flipping the document and the overlay the way the product does.
 * @param {Object} [options={}]
 * @param {Boolean} [options.railAppears=true] Whether the rail grows a tab once the item folds.
 * @param {Boolean} [options.revealOffersPin=true] Whether the reveal carries its pin action.
 * @param {Boolean} [options.destroyOnPinCommit=false] Destroy the driver inside the pin click's own
 *     dispatch, right after the fold committed: the executor's trap rejects before it can read the fold.
 * @returns {Promise<Object>}
 */
async function railFixture({destroyOnPinCommit=false, railAppears=true, revealOffersPin=true}={}) {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
    const windowId                 = 'gesture-rail-window', calls = [], cursors = [],
          document  = {
              items: {audit: {autoHidden: false}, metrics: {autoHidden: false, pinned: false}},
              nodes: {source: {type: 'tabs', activeItemId: 'audit', items: ['metrics', 'audit']}}
          },
          rect      = async () => [{x: 100, y: 100, width: 40, height: 20}],
          // real focus is what mounts a focus-gated action; the synthetic click alone moves none
          button    = {id: 'rail-source-tab', windowId, getDomRect: rect, focus() {tabs.containsFocus = true; pinAction.mounted = true}},
          pinAction = {id: 'rail-pin-action', action: 'pin', hidden: true, mounted: false, windowId, getDomRect: rect},
          railTab   = {id: 'rail-tab', cls: ['neo-dashboard-dock-rail-tab'], dockItemId: 'metrics', windowId, getDomRect: rect},
          pinBack   = {id: 'reveal-pin', action: 'pin', windowId, getDomRect: rect},
          overlay   = {revealPaneItemId: null, visible: false, down: config => config.action === 'pin' && revealOffersPin ? pinBack : null},
          rail      = {
              edge: 'right', railed: false, revealOverlay: overlay,
              // the reveal's intent owner: Escape retires runtime reveal intent without a document operation
              revealMachine: {escape() {calls.push('reveal:escape'); overlay.visible = false; overlay.revealPaneItemId = null}},
              down(config, first=true) {
                  const hit = rail.railed && config.dockItemId === 'metrics';
                  return first ? (hit ? railTab : null) : (hit ? [railTab] : [])
              }
          },
          tabs      = {containsFocus: false, getTabAtIndex: () => button, getTabBar: () => ({getAction: name => name === 'pin' ? pinAction : null})},
          workspace = {
              id         : 'gesture-rail-workspace', isDestroyed: false, dockModel: document, refreshPromise: null,
              getDockHost: () => ({
                  down(config, first=true) {
                      if (config.dockNodeId === 'source') return tabs;
                      if (config.ntype === 'dashboard-dock-rail') return first ? rail : [rail];
                      return first ? null : []
                  }
              }),
              // the holder contract: the reducer returns a new document, the view-sync is the only writer
              applyDockZoneOperation(descriptor) {
                  calls.push(`operation:${descriptor.operation}:${descriptor.autoHidden}`);
                  if (descriptor.operation !== 'setItemAutoHidden') return {document: workspace.dockModel, errors: [`unexpected ${descriptor.operation}`]};
                  const next = structuredClone(workspace.dockModel);
                  next.items[descriptor.itemId].autoHidden = descriptor.autoHidden;
                  descriptor.autoHidden || (next.nodes.source.items = ['metrics', 'audit']);
                  return {document: next, errors: []}
              },
              async onDockZoneDocumentChange(next) {workspace.dockModel = next}
          },
          driver    = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    // the film cursor without a DOM: creation and retirement are recorded on the prototype, because
    // `core.Base#destroy` strips an instance's own members and a destroyed driver still retires its dot
    const proto                 = Object.getPrototypeOf(driver),
          originalCursorHelpers = {createFilmCursorDot: proto.createFilmCursorDot, retireFilmCursorDot: proto.retireFilmCursorDot};
    proto.createFilmCursorDot = () => {
        const dot = {isDestroyed: false, destroy() {dot.isDestroyed = true}};
        calls.push('cursor:create');
        cursors.push(dot);
        return dot
    };
    proto.retireFilmCursorDot = async dot => {
        if (!dot || dot.isDestroyed) return false;
        calls.push('cursor:retire');
        dot.destroy();
        return true
    };
    service.simulateEvent = async ({events}) => {
        for (const event of events) {
            calls.push(`${event.type}:${event.targetId}`);
            if (event.type !== 'click') continue;
            if (event.targetId === button.id)    {pinAction.hidden = false; document.nodes.source.activeItemId = 'metrics'}
            if (event.targetId === pinAction.id) {
                document.items.metrics.autoHidden = true; document.nodes.source.items = ['audit']; rail.railed = railAppears;
                // the fold's receipt has landed; the driver dies before the executor can read it
                destroyOnPinCommit && driver.destroy()
            }
            if (event.targetId === railTab.id)   {overlay.visible = true; overlay.revealPaneItemId = 'metrics'}
            if (event.targetId === pinBack.id)   {document.items.metrics.autoHidden = false; document.nodes.source.items = ['metrics', 'audit']; overlay.visible = false}
        }
        return true
    };
    service.dispatch = async ({type}) => {calls.push(type); return true};

    return {
        calls, cursors, driver, overlay, service, workspace,
        execute(options={}) {
            return driver.executeRailStep({itemId: 'metrics', sourceNodeId: 'source'}, {moveDelay: 0, moveSteps: 2, revealDelay: 0, ...options})
        },
        cleanup() {
            driver.isDestroyed || driver.destroy();
            Object.assign(proto, originalCursorHelpers);
            WindowManager.unregister(windowId)
        }
    }
}

test.describe('the rail beat folds a pane away and brings it home through the pointer', () => {
    test('focus, fold, reveal and pin back arrive as clicks in that order, and the document round-trips', async () => {
        const fixture = await railFixture();
        try {
            const receipt = await fixture.execute();
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof).toMatchObject({collapsed: true, documentsUnchanged: true, edge: 'right', restored: true, revealed: true});
            expect(fixture.calls.filter(call => call.startsWith('click:')))
                .toEqual(['click:rail-source-tab', 'click:rail-pin-action', 'click:rail-tab', 'click:reveal-pin']);
            expect(fixture.calls.filter(call => call.startsWith('mousedown:'))).toHaveLength(4);
            expect(fixture.calls.filter(call => call.startsWith('mouseup:'))).toHaveLength(4);
            expect(fixture.driver.activeRuns.size).toBe(0)
        } finally {
            fixture.cleanup()
        }
    });

    test('a rail that never grows the tab fails by name and brings the pane home through the document, not the pointer', async () => {
        const fixture = await railFixture({railAppears: false});
        try {
            const receipt = await fixture.execute({attempts: 3});
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual(["the rail never showed a tab for 'metrics'"]);
            expect(receipt.proof).toMatchObject({collapsed: true, settled: {committed: true, errors: [], foldKept: false, restoredHome: true, revealDismissed: false}});
            // the pane is reachable again: auto-hidden is off and its source node lists it
            expect(fixture.workspace.dockModel.items.metrics.autoHidden).toBe(false);
            expect(fixture.workspace.dockModel.nodes.source.items).toContain('metrics');
            expect(fixture.calls.filter(call => call.startsWith('click:'))).toEqual(['click:rail-source-tab', 'click:rail-pin-action']);
            expect(fixture.calls).toContain('operation:setItemAutoHidden:false');
            expect(fixture.calls).not.toContain('reveal:escape')
        } finally {
            fixture.cleanup()
        }
    });

    test('destruction while a reveal is genuinely open dismisses it through its owner, keeps the fold and clicks no late pin', async () => {
        const fixture = await railFixture();
        try {
            const railClicked = deferred(), original = fixture.service.simulateEvent;
            fixture.service.simulateEvent = async data => {
                const result = await original(data);
                data.events.some(event => event.type === 'click' && event.targetId === 'rail-tab') && railClicked.resolve();
                return result
            };
            // the reveal opens on the rail-tab click and the executor holds it for the reveal delay: destroy inside that hold
            const pending = fixture.execute({revealDelay: 10000, showCursor: true});
            await railClicked.promise;
            await new Promise(setImmediate);
            expect(fixture.overlay.visible, 'the reveal is open when the driver dies').toBe(true);
            fixture.driver.destroy();
            const receipt = await pending;
            expect(receipt.applied).toBe(false);
            expect(receipt.errors.length).toBeGreaterThan(0);
            expect(receipt.proof).toMatchObject({collapsed: true, settled: {committed: true, foldKept: true, restoredHome: false, revealDismissed: true}});
            expect(fixture.calls.filter(call => call.startsWith('click:'))).toEqual(['click:rail-source-tab', 'click:rail-pin-action', 'click:rail-tab']);
            expect(fixture.calls).toContain('reveal:escape');
            expect(fixture.overlay.visible).toBe(false);
            // the rail tab exists, so the committed fold stays: the pane is one click away, not stranded
            expect(fixture.workspace.dockModel.items.metrics.autoHidden).toBe(true);
            expect(fixture.calls).not.toContain('operation:setItemAutoHidden:false');
            // no cursor and no pressed pointer survive the cancellation
            expect(fixture.cursors).toHaveLength(1);
            expect(fixture.cursors[0].isDestroyed).toBe(true);
            expect(fixture.calls).toContain('cursor:retire');
            expect(fixture.calls.filter(call => call.startsWith('mousedown:'))).toHaveLength(fixture.calls.filter(call => call.startsWith('mouseup:')).length);
            await fixture.driver.settledPromise;
            expect(fixture.service.isDestroyed).toBe(true);
            expect(fixture.workspace.isDestroyed).toBe(false)
        } finally {
            fixture.cleanup()
        }
    });

    test('destruction after the fold committed but before the executor read it still brings the pane home', async () => {
        const fixture = await railFixture({destroyOnPinCommit: true});
        try {
            const receipt = await fixture.execute({showCursor: true});
            expect(receipt.applied).toBe(false);
            expect(receipt.errors.length).toBeGreaterThan(0);
            // the local flag was never assigned; the live document says the fold committed, and no rail was ever found
            expect(receipt.proof).toMatchObject({collapsed: false, settled: {committed: true, foldKept: false, restoredHome: true, revealDismissed: false}});
            expect(fixture.workspace.dockModel.items.metrics.autoHidden).toBe(false);
            expect(fixture.workspace.dockModel.nodes.source.items).toContain('metrics');
            expect(fixture.calls.filter(call => call.startsWith('click:'))).toEqual(['click:rail-source-tab', 'click:rail-pin-action']);
            expect(fixture.calls).toContain('operation:setItemAutoHidden:false');
            expect(fixture.cursors[0].isDestroyed).toBe(true);
            expect(fixture.calls.filter(call => call.startsWith('mousedown:'))).toHaveLength(fixture.calls.filter(call => call.startsWith('mouseup:')).length);
            await fixture.driver.settledPromise;
            expect(fixture.service.isDestroyed).toBe(true);
            expect(fixture.workspace.isDestroyed).toBe(false)
        } finally {
            fixture.cleanup()
        }
    });

    test('a reveal without a pin action fails by name, is dismissed through its owner, and the fold stays', async () => {
        const fixture = await railFixture({revealOffersPin: false});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual(['the reveal offers no pin action']);
            expect(receipt.proof).toMatchObject({collapsed: true, revealed: true, settled: {committed: true, errors: [], foldKept: true, restoredHome: false, revealDismissed: true}});
            expect(fixture.calls.filter(call => call.startsWith('click:'))).toEqual(['click:rail-source-tab', 'click:rail-pin-action', 'click:rail-tab']);
            expect(fixture.overlay.visible).toBe(false);
            expect(fixture.workspace.dockModel.items.metrics.autoHidden).toBe(true)
        } finally {
            fixture.cleanup()
        }
    })
});

/**
 * @summary A resize-beat driver over a stub host: the split's panes answer layout reads from a
 * pixel ledger, the splitter answers the terminal events the real one fires, and the drive is the
 * simulator's typed receipt — previewing the pair the moment it starts, committing on release.
 * @param {Object} [options={}]
 * @param {Number[]} [options.commit=[0.42, 0.58]] The vector the release commits; `null` commits nothing.
 * @param {Object} [options.driveError=null] A failure receipt's `{phase, code, message}` instead of a release.
 * @param {Boolean} [options.holdRelease=false] Hold the drive open until the fixture's `release()`.
 * @returns {Promise<Object>}
 */
async function resizeFixture({commit=[0.42, 0.58], driveError=null, duplicateTerminal=false, holdRelease=false, layoutAfterRelease=false, noPreview=false, prelude=0}={}) {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
    const windowId                 = 'gesture-resize-window', calls = [], cursors = [], listeners = {}, released = deferred(), midRead = deferred(),
          committed = deferred(),
          document  = {items: {}, nodes: {'split-main': {type: 'split', orientation: 'horizontal', children: ['scale-tabs', 'heavy-tabs'], sizes: [0.6, 0.4]}}},
          px        = {container: 1000, 'pane-a': 600, 'pane-b': 400},
          paneA     = {id: 'pane-a'}, paneB = {id: 'pane-b'},
          container = {id: 'container', async getLayoutRect(ids) {
              calls.push(`layout:${ids.join('+')}`);
              // the first pane read after the preview began is the executor's proof sample: the fake
              // drive releases after it — or, in the after-release control, holds the read's reply
              // until its commit has landed, so the box arrives with a document that no longer stands
              if (previewStarted && !midReadSeen) {
                  midReadSeen = true;
                  midRead.resolve()
              }
              layoutAfterRelease && previewStarted && await committed.promise;
              return ids.map(id => ({width: px[id], height: 500}))
          }},
          splitter  = {
              id                : 'splitter-main', boundaryIndex: 0, dockNodeType: 'splitter', splitNodeId: 'split-main', windowId, parent: container,
              getSplitChildItems: () => [paneA, paneB],
              getLayoutElementId: item => item.id,
              getSizeAxis       : () => 'width',
              getDomRect        : async () => [{x: 597, y: 100, width: 6, height: 500}],
              on (map) {Object.assign(listeners, map)},
              un (map) {Object.keys(map).forEach(name => delete listeners[name])}
          },
          workspace = {
              id         : 'gesture-resize-workspace', isDestroyed: false, dockModel: document, refreshPromise: null,
              getDockHost: () => ({down: config => config.dockNodeType === 'splitter' && config.splitNodeId === 'split-main' && config.boundaryIndex === 0 ? splitter : null})
          },
          driver    = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    const proto                 = Object.getPrototypeOf(driver),
          originalCursorHelpers = {createFilmCursorDot: proto.createFilmCursorDot, retireFilmCursorDot: proto.retireFilmCursorDot};
    proto.createFilmCursorDot = () => {
        const dot = {isDestroyed: false, style: {}, destroy() {dot.isDestroyed = true}};
        calls.push('cursor:create');
        cursors.push(dot);
        return dot
    };
    proto.retireFilmCursorDot = async dot => {
        if (!dot || dot.isDestroyed) return false;
        calls.push('cursor:retire');
        dot.destroy();
        return true
    };
    // the driver never dispatches pointer input of its own for this beat; any call here is a defect
    service.simulateEvent = async ({events}) => {events.forEach(event => calls.push(`${event.type}:${event.targetId}`)); return true};
    service.dispatch      = async ({type}) => {calls.push(type); return true};
    let previewStarted = false, midReadSeen = false;
    service.driveDrag     = async request => {
        calls.push(`drive:${request.source.targetId}:${request.destination.deltaX}:${request.destination.deltaY}:${request.steps}`);
        // the drive's own prelude (window and node resolution, addon imports) moves nothing yet
        for (let hop = 0; hop < prelude; hop++) await new Promise(setImmediate);
        // the main thread previews the pair from the first move on: the pane tracks the pointer while the document waits
        if (!noPreview) {
            px['pane-a'] = 600 + request.destination.deltaX / 2;
            px['pane-b'] = 400 - request.destination.deltaX / 2
        }
        previewStarted = true;
        // a held drive releases on the fixture's word (the driver may be dead by then, so no mid read
        // is awaited); an ordinary one releases once the executor has taken its proof sample, one
        // macrotask later, as a real release lands after the sample's own microtasks completed
        await (holdRelease ? released.promise : midRead.promise);
        layoutAfterRelease || await new Promise(setImmediate);
        if (driveError) {
            px['pane-a'] = 600; px['pane-b'] = 400;
            return {success: false, phase: driveError.phase, released: false, sensor: {delayMs: 100, minDistance: 5},
                observed: {started: false, moveCount: 0, ended: false}, dispatch: {down: true, moveCount: 1, up: true},
                error   : {code: driveError.code, message: driveError.message}}
        }
        if (commit) {
            px['pane-a'] = commit[0] * 1000; px['pane-b'] = commit[1] * 1000;
            workspace.dockModel = {...document, nodes: {...document.nodes, 'split-main': {...document.nodes['split-main'], sizes: commit.slice()}}};
            const terminal = {descriptor: {operation: 'resizeSplit', splitNodeId: 'split-main', sizes: commit.slice()}, result: {document: workspace.dockModel, errors: []}, splitter};
            listeners.dockSplitterResize?.(terminal);
            duplicateTerminal && listeners.dockSplitterResize?.(terminal)
        }
        committed.resolve();
        return {success: true, phase: 'released', released: true, sensor: {delayMs: 100, minDistance: 5},
            observed: {started: true, moveCount: request.steps, ended: true}, dispatch: {down: true, moveCount: request.steps + 1, up: true}}
    };

    return {
        calls, cursors, driver, listeners, service, workspace,
        release: () => released.resolve(),
        execute(options={}, step={sizes: [0.42, 0.58], splitNodeId: 'split-main'}) {
            return driver.executeResizeStep(step, {attempts: 5, moveDelay: 0, moveSteps: 2, sensorDelayMs: 0, ...options})
        },
        cleanup() {
            released.resolve();
            driver.isDestroyed || driver.destroy();
            Object.assign(proto, originalCursorHelpers);
            WindowManager.unregister(windowId)
        }
    }
}

test.describe('the resize beat drags a split boundary through the simulator\'s own drive', () => {
    test('the travel reaches the requested proportion, the preview is proven mid-drive, the release commits once', async () => {
        const fixture = await resizeFixture();
        try {
            const receipt = await fixture.execute({showCursor: true});
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof).toMatchObject({
                axis      : 'width', committedOnce: true, documentUnchangedDuringPreview: true, previewTracked: true, synced: true,
                sizesAfter: [0.42, 0.58], sizesBefore: [0.6, 0.4], travelPx: -180,
                drive     : {phase: 'released', sensor: {delayMs: 100, minDistance: 5}, observed: {started: true, ended: true}}
            });
            // one drive from the splitter's own node along the split axis, at the film's sampling; no input of the driver's own
            expect(fixture.calls.filter(call => call.startsWith('drive:'))).toEqual(['drive:splitter-main:-180:0:2']);
            expect(fixture.calls.filter(call => /^(mousedown|mousemove|mouseup|keydown|click)/.test(call))).toEqual([]);
            expect(fixture.calls).toEqual(expect.arrayContaining(['cursor:create', 'cursor:retire']));
            expect(fixture.cursors[0].isDestroyed).toBe(true);
            expect(Object.keys(fixture.listeners), 'the terminal listeners are released with the run').toEqual([]);
            expect(fixture.driver.activeRuns.size).toBe(0)
        } finally {
            fixture.cleanup()
        }
    });

    test('a failed drive commits nothing and names the simulator\'s phase and code', async () => {
        const fixture = await resizeFixture({driveError: {phase: 'arming', code: 'DRAG_NOT_ARMED', message: 'the live Mouse sensor emitted no correlated drag:start'}});
        try {
            const receipt = await fixture.execute({showCursor: true});
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual([`the drive failed in phase 'arming': DRAG_NOT_ARMED — the live Mouse sensor emitted no correlated drag:start`]);
            expect(receipt.proof).toMatchObject({sizesBefore: [0.6, 0.4], settled: {committed: false, driveSettled: true, errors: [], sizes: [0.6, 0.4]}});
            expect(fixture.workspace.dockModel.nodes['split-main'].sizes).toEqual([0.6, 0.4]);
            expect(fixture.cursors[0].isDestroyed).toBe(true);
            expect(fixture.calls.filter(call => /^(mousedown|mouseup|keydown)/.test(call)), 'no cleanup input of the driver\'s own').toEqual([])
        } finally {
            fixture.cleanup()
        }
    });

    test('destruction during the drive settles the physical drag before cleanup and reports the document as it is', async () => {
        const fixture = await resizeFixture({holdRelease: true});
        try {
            const pending = fixture.execute({showCursor: true});
            await expect.poll(() => fixture.calls.some(call => call.startsWith('drive:'))).toBe(true);
            fixture.driver.destroy();
            // the main thread finishes the drive on its own clock: the release commits after the driver died
            fixture.release();
            const receipt = await pending;
            expect(receipt.applied).toBe(false);
            expect(receipt.errors.length).toBeGreaterThan(0);
            expect(receipt.proof).toMatchObject({settled: {committed: true, driveSettled: true, errors: [], sizes: [0.42, 0.58]}});
            expect(fixture.cursors[0].isDestroyed).toBe(true);
            expect(fixture.calls).toContain('cursor:retire');
            expect(fixture.calls.filter(call => /^(mousedown|mouseup|keydown)/.test(call))).toEqual([]);
            await fixture.driver.settledPromise;
            expect(fixture.service.isDestroyed).toBe(true);
            expect(fixture.workspace.isDestroyed).toBe(false)
        } finally {
            fixture.cleanup()
        }
    });

    test('a boundary stopped short of the request fails by name and reports the vector it did commit', async () => {
        const fixture = await resizeFixture({commit: [0.5, 0.5]});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toHaveLength(1);
            expect(receipt.errors[0]).toBe('the boundary stopped at [0.500, 0.500] (bounded), 0.080 from the requested [0.420, 0.580]');
            expect(receipt.proof).toMatchObject({committedOnce: true, previewTracked: true, sizesAfter: [0.5, 0.5], settled: {committed: true, driveSettled: true}})
        } finally {
            fixture.cleanup()
        }
    });

    test('a drive whose prelude starts late is waited out: the preview is proven once it moves, not on the clock', async () => {
        const fixture = await resizeFixture({prelude: 3});
        try {
            const receipt = await fixture.execute();
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof).toMatchObject({committedOnce: true, documentUnchangedDuringPreview: true, previewTracked: true, sizesAfter: [0.42, 0.58]});
            expect(receipt.proof.samples, 'the proof came from a sample, not the clock').toBeGreaterThanOrEqual(1)
        } finally {
            fixture.cleanup()
        }
    });

    test('a drive that commits without ever previewing fails closed', async () => {
        const fixture = await resizeFixture({noPreview: true});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toHaveLength(1);
            expect(receipt.errors[0]).toMatch(/^no live preview was observed: \d+ pane samples, none moved 8px or more while the committed document stood$/);
            expect(receipt.proof).toMatchObject({previewTracked: false, documentUnchangedDuringPreview: false, committedOnce: true, sizesAfter: [0.42, 0.58], settled: {committed: true}})
        } finally {
            fixture.cleanup()
        }
    });

    test('a pane box read that lands after the release cannot pass as a preview', async () => {
        const fixture = await resizeFixture({layoutAfterRelease: true});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors[0]).toMatch(/^no live preview was observed/);
            // the moved box arrived with a committed document behind it: the bracket refuses it
            expect(receipt.proof).toMatchObject({previewTracked: false, documentUnchangedDuringPreview: false, committedOnce: true})
        } finally {
            fixture.cleanup()
        }
    });

    test('a second terminal fails the one-commit contract', async () => {
        const fixture = await resizeFixture({duplicateTerminal: true});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual(['the release reached 2 terminals on the splitter; exactly one commit is the contract']);
            expect(receipt.proof).toMatchObject({committedOnce: false, previewTracked: true, sizesAfter: [0.42, 0.58]})
        } finally {
            fixture.cleanup()
        }
    });

    test('an unknown split node or a wrong vector is refused before any input', async () => {
        const fixture = await resizeFixture();
        try {
            const unknown = await fixture.execute({}, {sizes: [0.42, 0.58], splitNodeId: 'nope'});
            expect(unknown).toEqual({applied: false, errors: [`resize step must name a split node; 'nope' is not one`]});
            const wrong = await fixture.execute({}, {sizes: [1], splitNodeId: 'split-main'});
            expect(wrong.applied).toBe(false);
            expect(wrong.errors).toEqual(['split "split-main" sizes length 1 != children length 2']);
            expect(fixture.calls.filter(call => call.startsWith('drive:'))).toEqual([]);
            expect(fixture.driver.activeRuns.size).toBe(0)
        } finally {
            fixture.cleanup()
        }
    })
});

test('vessel survival reads a bound provisional connection or committed owner, never a headless owner', async () => {
    const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
    let   connection                     = {windowId: 'live-vessel'}, owner = null;
    const driver                         = Neo.create(NativeGestureDriver, {workspace: {
        id: 'vessel-survival', nativeWindows: {getConnection: () => connection, getOwner: () => owner}
    }});

    try {
        await expect(driver.waitForTearOutVessel('pane', {attempts: 0})).resolves.toBe(true);
        owner = connection;
        connection = null;
        await expect(driver.waitForTearOutVessel('pane', {attempts: 0})).resolves.toBe(true);
        owner = {windowId: 0};
        await expect(driver.waitForTearOutVessel('pane', {attempts: 0})).resolves.toBe(true);
        owner = {windowId: null};
        await expect(driver.waitForTearOutVessel('pane', {attempts: 0})).resolves.toBe(false)
    } finally {
        driver.destroy()
    }
});

test('normal construction stays driver-free; explicit calls reach one registered lazy owner', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          service   = Neo.create(InstanceService);
    try {
        expect(workspace.getController().getReference('tour-bar').controller).toBeFalsy();
        expect(workspace.gestureDriver).toBeUndefined();
        expect(workspace.executeTearOutStep).toBeUndefined();
        const controller      = await workspace.getController().getTourController();
        const [first, second] = await Promise.all([controller.getGestureDriver(), controller.getGestureDriver()]);
        expect(first).toBe(second);
        expect(first.workspace).toBe(workspace);
        expect(Neo.get(first.id)).toBe(first);
        const receipt = await service.callMethod({id: controller.id, method: 'gestureDriver.executeTearOutStep', args: [{}]});
        expect(receipt.result.applied).toBe(false);
        expect(receipt.result.errors.length).toBeGreaterThan(0);
        workspace.destroy();
        expect(first.isDestroyed).toBe(true)
    } finally {
        workspace.isDestroyed || workspace.destroy();
        service.destroy()
    }
});

test('root destruction during the lazy import cannot create an orphan driver', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          pending   = workspace.getController().getTourController();
    workspace.destroy();
    await expect(pending).rejects.toBe(Neo.isDestroyed)
});

test('cancellation before dispatch emits no input', async () => {
    const workspace = {isDestroyed: false}, driver = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService, calls = [];
    service.simulateEvent = async () => {calls.push('input'); return true};
    service.dispatch = async () => {calls.push('cleanup'); return true};
    const pending = driver.runGesture(run => driver.simulateEvent(run, {events: [{...down, delay: 1000}]}));
    pending.catch(() => {});
    driver.destroy();
    await expect(pending).rejects.toBe(Neo.isDestroyed);
    expect(calls).toEqual([]);
    expect(service.isDestroyed).toBe(true);
    expect(workspace.isDestroyed).toBe(false)
});

test('a dispatched down settles before cancellation releases input and retires the service', async () => {
    const driver  = Neo.create(GestureDriver, {workspace: {isDestroyed: false}}),
          service = driver.interactionService, input = deferred(), started = deferred(), calls = [],
          destroy = service.destroy.bind(service);
    service.simulateEvent = () => {calls.push('down'); started.resolve(); return input.promise};
    service.dispatch = async ({type, windowId, id}) => {
        calls.push(type);
        expect(windowId).toBe('source-window');
        expect(id).toBe('document.body');
        return true
    };
    service.destroy = () => {calls.push('destroy'); destroy()};
    const pending = driver.runGesture(run => driver.simulateEvent(run, {events: [down, up]}));
    pending.catch(() => {});
    await started.promise;
    driver.destroy();
    await new Promise(setImmediate);
    expect(calls).toEqual(['down']);
    expect(Neo.get(service.id)).toBe(service);
    input.resolve(true);
    await expect(pending).rejects.toBe(Neo.isDestroyed);
    expect(calls).toEqual(['down', 'keydown', 'mouseup', 'destroy']);
    expect(service.isDestroyed).toBe(true)
});

test('an Escape failure still attempts and awaits mouseup before retiring input', async () => {
    const driver  = Neo.create(GestureDriver, {workspace: {isDestroyed: false}}),
          service = driver.interactionService, input = deferred(), released = deferred(), cleanup = deferred(), calls = [];
    service.simulateEvent = () => input.promise;
    service.dispatch = async ({type}) => {
        calls.push(type);
        if (type === 'keydown') throw new Error('Escape transport failed');
        cleanup.resolve();
        return released.promise
    };
    const pending = driver.runGesture(run => driver.simulateEvent(run, {events: [down]}));
    pending.catch(() => {});
    driver.destroy();
    input.resolve(true);
    await cleanup.promise;
    expect(Neo.get(service.id)).toBe(service);
    released.resolve(true);
    await expect(pending).rejects.toThrow('Escape transport failed');
    expect(calls).toEqual(['keydown', 'mouseup']);
    expect(service.isDestroyed).toBe(true)
});

test('executor failure cleanup waits for dispatched input before releasing a destroyed driver', async () => {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
    const windowId                 = 'gesture-executor-window', input = deferred(), started = deferred(), calls = [],
          button = {id: 'gesture-executor-tab', windowId,
              getDomRect: async () => [{x: 100, y: 100, width: 40, height: 20}]},
          sortZone = {enableProxyToPopup: true},
          workspace = {refreshPromise: null,
              dockModel  : {nodes: {source: {type: 'tabs', items: ['item']}}},
              getDockHost: () => ({down: () => ({getTabAtIndex: () => button, getTabBar: () => ({sortZone})})})},
          driver = Neo.create(GestureDriver, {workspace}), service = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    service.simulateEvent = () => {calls.push('down'); started.resolve(); return input.promise};
    service.dispatch = async ({type, windowId: targetWindowId}) => {
        expect(targetWindowId).toBe(windowId);
        calls.push(type);
        return true
    };
    try {
        const pending = driver.executeCrossZoneShowcaseStep({itemId: 'item', sourceNodeId: 'source', dwells: [
            {targetNodeId: 'a', placementKind: 'before'}, {targetNodeId: 'b', placementKind: 'after'}
        ]});
        await started.promise;
        driver.destroy();
        delete button.windowId;
        await new Promise(setImmediate);
        expect(calls).toEqual(['down']);
        expect(Neo.get(service.id)).toBe(service);
        input.resolve(true);
        const result = await pending;
        expect(result.applied).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(calls).toEqual(['down', 'keydown', 'mouseup']);
        expect(sortZone.enableProxyToPopup).toBe(true);
        expect(service.isDestroyed).toBe(true)
    } finally {
        input.resolve(true);
        driver.isDestroyed || driver.destroy();
        WindowManager.unregister(windowId)
    }
});

test('a successful release creates no cancellation input and leaves borrowed workspace alive', async () => {
    const workspace = {isDestroyed: false}, driver = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService, calls = [];
    service.simulateEvent = async ({events}) => {calls.push(events[0].type); return true};
    service.dispatch = async ({type}) => {calls.push(type); return true};
    await expect(driver.runGesture(run => driver.simulateEvent(run, {events: [down, up]}))).resolves.toBe(true);
    expect(calls).toEqual(['mousedown', 'mouseup']);
    expect(Neo.get(service.id)).toBe(service);
    driver.destroy();
    driver.destroy();
    expect(service.isDestroyed).toBe(true);
    expect(workspace.isDestroyed).toBe(false)
});

test.describe('tear-out commit ownership', () => {
    const cases = [
        {name: 'accepts a record placed in the expected vessel', expected: true, mutate() {}},
        {name: 'rejects a source-only detach', expected: false, mutate({source, documents, targetId}) {
            source.items.metrics = {};
            delete documents[targetId]
        }},
        {name: 'rejects an unregistered vessel', expected: false, mutate({documents, targetId}) {
            delete documents[targetId]
        }},
        {name: 'rejects a lost record', expected: false, mutate({target}) {
            delete target.items.metrics;
            target.nodes.target.items = []
        }},
        {name: 'rejects ownership in a different vessel', expected: false, mutate({documents, targetId, target}) {
            documents[Workspace.vesselWorkspaceId('audit')] = target;
            delete documents[targetId]
        }},
        {name: 'rejects duplicated source and vessel catalogs', expected: false, mutate({source}) {
            source.items.metrics = {}
        }},
        {name: 'rejects a source that still places the item', expected: false, mutate({source}) {
            source.nodes.source.items.push('metrics')
        }},
        {name: 'rejects an unplaced vessel record', expected: false, mutate({target}) {
            target.nodes.target.items = []
        }}
    ];

    for (const {name, expected, mutate} of cases) {
        test(name, async () => {
            const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
            const source                         = {items: {audit: {}}, nodes: {source: {type: 'tabs', items: ['audit']}}},
                  target = {items: {metrics: {}}, nodes: {target: {type: 'tabs', items: ['metrics']}}},
                  targetId = Workspace.vesselWorkspaceId('metrics'),
                  documents = {[Workspace.MAIN_WORKSPACE_ID]: source, [targetId]: target},
                  workspace = {constructor: Workspace, dockModel: source, isDestroyed: false,
                      getWorkspaceDocument: key => documents[key] ?? null},
                  driver = Neo.create(NativeGestureDriver, {workspace});

            mutate({source, target, targetId, documents});
            try {
                await expect(driver.waitForTearOutCommit('metrics', {attempts: 0})).resolves.toBe(expected)
            } finally {
                driver.destroy()
            }
        })
    }
});

test.describe('cross-window target admission', () => {
    const cases = [
        {name: 'starts input for a committed popup with host-owned participation', input: true, mutate() {}},
        {name: 'refuses an uncommitted popup before input', mutate(state) {state.committed = false}},
        {name: 'refuses a closing popup before input', mutate(state) {state.closeRequested = true}},
        {name: 'refuses a popup without its current participation', mutate(state) {state.host.participation = null}},
        {name: 'refuses a missing popup before input', missing: true, mutate() {}}
    ];

    for (const {name, input=false, missing=false, mutate} of cases) {
        test(name, async () => {
            const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
            const {default: WindowManager}       = await import('../../../../../src/manager/Window.mjs');
            const sourceWindowId                 = 'gesture-admission-source', targetWindowId = 'gesture-admission-target',
                  state = {committed: true, windowId: targetWindowId, host: {participation: {}}},
                  calls = [], sortZone = {},
                  button = {id: 'gesture-admission-tab', windowId: sourceWindowId,
                      getDomRect: async () => [{x: 100, y: 100, width: 40, height: 20}]},
                  workspace = {constructor: Workspace, id: 'gesture-admission-workspace',
                      dockModel    : {items: {commits: {}}, nodes: {source: {type: 'tabs', items: ['commits']}}},
                      getDockHost  : () => ({down: () => ({getTabAtIndex: () => button, getTabBar: () => ({sortZone})})}),
                      getPopupState: () => missing ? null : state,
                      nativeWindows: {getOwner: () => ({windowId: targetWindowId}), clearConnection() {}},
                      paneCache    : {commits: {}}},
                  driver = Neo.create(NativeGestureDriver, {workspace});

            mutate(state);
            driver.interactionService.simulateEvent = async ({events}) => {calls.push(events[0].type); return true};
            driver.interactionService.dispatch = async () => true;
            driver.waitForTearOutDragArmed = async () => false;
            driver.cancelTearOutGesture = async () => ({cancelled: true});
            for (const id of [sourceWindowId, targetWindowId]) {
                WindowManager.register({id, windowId: id, innerRect: {x: 0, y: 0, width: 1200, height: 800}})
            }
            try {
                const receipt = await driver.executeCrossWindowDockStep({
                    itemId: 'commits', sourceNodeId: 'source', targetItemId: 'metrics'
                });
                expect(calls).toEqual(input ? ['mousedown', 'mousemove', 'mousemove'] : []);
                expect(receipt.applied).toBe(false);
                if (input) expect(receipt.errors).toEqual(['cross-window source drag did not arm'])
            } finally {
                driver.destroy();
                WindowManager.unregister(sourceWindowId);
                WindowManager.unregister(targetWindowId)
            }
        })
    }
});

/**
 * A grid pane whose scroll follows the fake main thread's arithmetic: the content moves 1:1 with
 * the hand from the press point on, as `GridDragScroll` does. `ack` gates each dispatched sample's
 * acknowledgement; `drift` makes the vertical scroll change on every read (a tail that never
 * settles); `perStroke` replaces the 1:1 arithmetic by a fixed travel per release; `columns` and
 * `clampX` shape the horizontal room and the bound the fake DOM clamps at.
 */
async function makeGridDragScrollFixture({ack=null, clampX=null, columns={count: 7, width: 150}, drift=false, perStroke=null}={}) {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs'),
          windowId                 = 'gesture-grid-window',
          calls                    = [], cursors = [], cursorAtDispatch = [],
          scroll                   = {left: 0, top: 0},
          view                     = {id: 'scale-view', getDomRect: async () => [{x: 100, y: 100, width: 300, height: 400}], get scrollTop() {return drift ? ++scroll.top : scroll.top}},
          body                     = {id: 'scale-body', availableHeight: 400, containerWidth: 300, rowHeight: 50, get scrollLeft() {return scroll.left},
                       columnPositions: {getCount: () => columns.count, getAt: index => ({x: index * columns.width, width: columns.width})}},
          pane      = {id: 'scale', isDestroyed: false, windowId, body, view, store: {getCount: () => 100000}},
          workspace = {id: 'gesture-grid-workspace', isDestroyed: false, windowId, appName: 'Workstation', paneCache: {scale: pane}, refreshPromise: null},
          driver    = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    const proto                 = Object.getPrototypeOf(driver),
          originalCursorHelpers = {createFilmCursorDot: proto.createFilmCursorDot, retireFilmCursorDot: proto.retireFilmCursorDot};
    proto.createFilmCursorDot = (x, y) => {
        const dot = {isDestroyed: false, style: {left: `${x - 8}px`, top: `${y - 8}px`}, destroy() {dot.isDestroyed = true}};
        cursors.push(dot);
        return dot
    };
    proto.retireFilmCursorDot = async dot => {
        if (!dot || dot.isDestroyed) return false;
        dot.destroy();
        return true
    };
    let last = null;
    service.simulateEvent = async ({events}) => {
        for (const event of events) {
            const {clientX: x, clientY: y} = event.options;
            calls.push(`${event.type}@${x},${y}`);
            // where the cursor stood when this sample reached the main thread
            cursorAtDispatch.push({type: event.type, x, y, left: cursors[0]?.style.left, top: cursors[0]?.style.top});
            ack && await ack(event);
            if (event.type === 'mousedown') {
                last = {x, y}
            } else if (last) {
                if (perStroke) {
                    if (event.type === 'mouseup') {scroll.left += perStroke.x; scroll.top += perStroke.y}
                } else {
                    scroll.left += last.x - x;
                    scroll.top  += last.y - y
                }
                last = event.type === 'mouseup' ? null : {x, y}
            }
            if (clampX !== null) scroll.left = Math.min(scroll.left, clampX)
        }
        return true
    };
    service.dispatch = async ({type}) => {calls.push(`cleanup:${type}`); return true};

    return {
        calls, cursors, cursorAtDispatch, driver, scroll, service,
        execute(options={}, step={anchor: {x: 0.5, y: 0.5}, deltaX: -120, deltaY: -60, paneId: 'scale', strokes: 2}) {
            return driver.executeGridDragScrollStep(step, {attempts: 10, moveDelay: 0, moveSteps: 4, showCursor: true, ...options})
        },
        cleanup() {
            driver.isDestroyed || driver.destroy();
            Object.assign(proto, originalCursorHelpers);
            WindowManager.unregister(windowId)
        }
    }
}

test.describe('the grid drag-scroll beat pans a grid pane by raw strokes the grid\'s own listener reads', () => {
    test('the strokes reach the requested travel on both axes, the tail settles and the receipt measures it', async () => {
        const fixture = await makeGridDragScrollFixture();
        try {
            const receipt = await fixture.execute();
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof.after).toEqual({scrollLeft: 240, scrollTop: 120, settled: true});
            expect(receipt.proof.dispatched, 'six samples per stroke: the press, four moves, the release').toEqual([6, 6]);
            expect(receipt.proof.travel).toEqual({
                deltaX   : -120, deltaY: -60,
                requested: {x: 240, y: 120}, room: {x: 750, y: 4999600}, expected: {x: 240, y: 120},
                observed : {x: 240, y: 120}, slack: {x: 60, y: 30}, met: {x: true, y: true}
            });
            // each stroke presses at the anchor and walks the diagonal to its end
            expect(fixture.calls.slice(0, 6)).toEqual(['mousedown@250,300', 'mousemove@220,285', 'mousemove@190,270', 'mousemove@160,255', 'mousemove@130,240', 'mouseup@130,240']);
            expect(fixture.calls[6]).toBe('mousedown@250,300');
            expect(fixture.calls.filter(call => call.startsWith('cleanup:')), 'the release left no pressed pointer to clean up').toEqual([]);
            expect(fixture.cursors[0].isDestroyed, 'the film cursor retired with the beat').toBe(true)
        } finally {
            fixture.cleanup()
        }
    });

    test('a throw winds up and whips: the samples share the travel eased in, the last ones carry the speed', async () => {
        const fixture = await makeGridDragScrollFixture();
        try {
            const receipt = await fixture.execute({curve: 'throw'}, {anchor: {x: 0.5, y: 0.5}, deltaX: -120, deltaY: -60, paneId: 'scale', strokes: 1});
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(fixture.calls).toEqual(['mousedown@250,300', 'mousemove@250,300', 'mousemove@243,296', 'mousemove@212,281', 'mousemove@130,240', 'mouseup@130,240']);
            expect(receipt.proof.travel.observed).toEqual({x: 120, y: 60})
        } finally {
            fixture.cleanup()
        }
    });

    test('a tail that never settles refuses success and keeps the proof it sampled', async () => {
        const fixture = await makeGridDragScrollFixture({drift: true});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toHaveLength(1);
            expect(receipt.errors[0]).toMatch(/^the grid had not settled 160 ms after the last release: scrollLeft 0 → 240, scrollTop 1 → \d+ for 2 stroke\(s\) of \(-120, -60\)$/);
            expect(receipt.proof.after.settled).toBe(false);
            expect(receipt.proof.before).toEqual({scrollLeft: 0, scrollTop: 1});
            expect(receipt.proof.travel.requested).toEqual({x: 240, y: 120});
            expect(fixture.cursors[0].isDestroyed).toBe(true)
        } finally {
            fixture.cleanup()
        }
    });

    test('travel short of the request fails by name: a pixel in the right direction is not a pan', async () => {
        const fixture = await makeGridDragScrollFixture({perStroke: {x: 1, y: 1}});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual([
                'the grid did not follow the hand: scrollLeft 0 → 2, scrollTop 0 → 2 for 2 stroke(s) of (-120, -60); '
                + 'expected at least (240, 120) less (60, 30) of slack within room (750, 4999600)'
            ]);
            expect(receipt.proof.after.settled).toBe(true);
            expect(receipt.proof.travel.observed).toEqual({x: 2, y: 2});
            expect(receipt.proof.travel.met).toEqual({x: false, y: false})
        } finally {
            fixture.cleanup()
        }
    });

    test('an axis the grid can no longer scroll is met at its room, not at the request', async () => {
        const fixture = await makeGridDragScrollFixture({clampX: 100, columns: {count: 2, width: 200}});
        try {
            const receipt = await fixture.execute();
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof.travel.room.x).toBe(100);
            expect(receipt.proof.travel.expected).toEqual({x: 100, y: 120});
            expect(receipt.proof.travel.observed).toEqual({x: 100, y: 120});
            expect(receipt.proof.travel.met).toEqual({x: true, y: true})
        } finally {
            fixture.cleanup()
        }
    });

    test('a request without an axis to move, a pane without geometry, or a refused sample fail by name', async () => {
        const fixture = await makeGridDragScrollFixture();
        try {
            expect(await fixture.execute({}, {paneId: 'metrics', deltaX: -10})).toEqual({applied: false, errors: ["grid drag-scroll step must name a rendered grid pane; 'metrics' is not one"]});
            expect(await fixture.execute({}, {paneId: 'scale', deltaX: 0, deltaY: 0})).toEqual({applied: false, errors: ['grid drag-scroll step needs a non-zero travel and at least one stroke']});
            expect(await fixture.execute({}, {paneId: 'scale', deltaX: -10, strokes: 0})).toEqual({applied: false, errors: ['grid drag-scroll step needs a non-zero travel and at least one stroke']});
            const original = fixture.service.simulateEvent;
            fixture.service.simulateEvent = async data => {await original(data); return data.events[0].type !== 'mousemove'};
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual(['stroke 1 could not be dispatched: mousemove at (220, 285) was refused']);
            expect(receipt.proof.dispatched, 'the press went out, the first move was refused').toEqual([1]);
            expect(fixture.cursors.at(-1).isDestroyed).toBe(true)
        } finally {
            fixture.cleanup()
        }
    });

    test('the cursor moves with each dispatched sample and holds while an acknowledgement is pending', async () => {
        const heldSamples = [];
        let   held        = false;
        const fixture     = await makeGridDragScrollFixture({ack: async event => {
            // the main thread takes its time over the first press: the cursor must wait with it
            if (event.type === 'mousedown' && !held) {
                held = true;
                for (let hop = 0; hop < 3; hop++) {
                    await new Promise(setImmediate);
                    heldSamples.push(fixture.cursors[0].style.left)
                }
            }
        }});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(true);
            expect(heldSamples, 'three hops into a pending press, the cursor still stands at the anchor').toEqual(['242px', '242px', '242px']);
            expect(fixture.cursorAtDispatch).toHaveLength(12);
            for (const sample of fixture.cursorAtDispatch) {
                expect({left: sample.left, top: sample.top}, `the cursor stood on the ${sample.type} sample it escorted`).toEqual({left: `${sample.x - 8}px`, top: `${sample.y - 8}px`})
            }
        } finally {
            fixture.cleanup()
        }
    })
});

/**
 * A committed vessel whose owner-granted routes answer at a fake physical boundary: the geometry
 * follows the verified moves and resizes; `refuseResizeAt` refuses the n-th resize, `shortBy` lands
 * every resize short of its width, `screen` is the display's available area the frame is clamped to.
 */
async function vesselResizeFixture({refuseResizeAt=null, screen={availLeft: 0, availTop: 0, availWidth: 3000, availHeight: 1600}, shortBy=0}={}) {
    const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
    const {default: WindowManager}       = await import('../../../../../src/manager/Window.mjs');
    const vesselWindowId                 = 'vessel-resize-unit-popup', mainId = 'vessel-resize-unit-main', vesselId = 'vessel-resize-unit-vessel',
          route     = {ownerWindowId: mainId, targetWindowId: vesselWindowId, nativeHandleKey: 'vessel-resize-unit-handle', capabilities: {position: true, resize: true}},
          geometry  = {height: 540, width: 300, x: 1540, y: 1240},
          calls     = [],
          state     = {windowId: vesselWindowId, committed: true, document: {items: {scale: {}}, nodes: {}}},
          workspace = {id: 'vessel-resize-unit-workspace', windowId: mainId, isDestroyed: false, refreshPromise: null,
              constructor: {vesselWorkspaceId: () => vesselId}, getPopupState: id => id === vesselId ? state : null},
          original  = {data: Neo.Main.getWindowData, geometry: Neo.Main.windowNativeGetGeometry, move: Neo.Main.windowNativeMoveTo, resize: Neo.Main.windowNativeResizeTo},
          driver    = Neo.create(NativeGestureDriver, {workspace});

    WindowManager.register({id: mainId, innerRect: {x: 200, y: 287, width: 1320, height: 920}, outerRect: {x: 200, y: 200, width: 1320, height: 1007}});
    WindowManager.register({id: vesselWindowId, nativeRoute: route});
    Neo.Main.getWindowData           = async () => ({screen: {...screen}});
    Neo.Main.windowNativeGetGeometry = async () => ({...geometry});
    Neo.Main.windowNativeMoveTo      = async request => {
        // the main thread refuses an effect without both string ids; the fixture does the same
        const effect = request.nativeEffect, named = effect && ['transactionId', 'effectId'].every(key => typeof effect[key] === 'string' && effect[key].length);
        calls.push(`move:${request.x},${request.y}:${named ? effect.effectId : 'drag'}`);
        if (effect && !named) return false;
        geometry.x = request.x;
        geometry.y = request.y;
        return true
    };
    Neo.Main.windowNativeResizeTo    = async request => {
        calls.push(`resize:${request.width},${request.height}`);
        if (refuseResizeAt !== null && calls.filter(call => call.startsWith('resize')).length === refuseResizeAt) return false;
        geometry.width  = request.width - shortBy;
        geometry.height = request.height;
        return true
    };

    return {
        calls, driver, geometry, state, workspace,
        execute(options={}, step={itemId: 'scale', frame: {anchor: 'right-of-main', gap: 24, width: 900}}) {
            return driver.executeVesselResizeStep(step, {moveDelay: 0, moveSteps: 4, ...options})
        },
        async cleanup() {
            driver.isDestroyed || driver.destroy();
            await driver.settledPromise;
            Object.assign(Neo.Main, {getWindowData: original.data, windowNativeGetGeometry: original.geometry, windowNativeMoveTo: original.move, windowNativeResizeTo: original.resize});
            WindowManager.unregister(vesselWindowId);
            WindowManager.unregister(mainId)
        }
    }
}

test.describe('the vessel-resize beat grows a committed window through its owner-granted routes', () => {
    test('the frame walks to the derived target beside the main window, a verified move and resize per sample', async () => {
        const fixture = await vesselResizeFixture();
        try {
            const receipt = await fixture.execute();
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof.before).toEqual({height: 540, width: 300, x: 1540, y: 1240});
            expect(receipt.proof.target).toEqual({clamped: false, height: 1007, width: 900, x: 1544, y: 200});
            expect(receipt.proof.after).toEqual({height: 1007, width: 900, x: 1544, y: 200});
            expect(receipt.proof.samples).toBe(4);
            expect(receipt.proof.route).toEqual({windowId: 'vessel-resize-unit-popup'});
            // a resize, then a move carrying the scripted-effect identity, per sample
            expect(fixture.calls).toEqual([
                'resize:450,657', 'move:1541,980:sample-1', 'resize:600,774', 'move:1542,720:sample-2',
                'resize:750,890', 'move:1543,460:sample-3', 'resize:900,1007', 'move:1544,200:sample-4'
            ])
        } finally {
            await fixture.cleanup()
        }
    });

    test('a display without room to the right seats the frame against its edge over the main window, and records the clamp', async () => {
        const fixture = await vesselResizeFixture({screen: {availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080}});
        try {
            const receipt = await fixture.execute();
            expect(receipt.errors).toEqual([]);
            expect(receipt.applied).toBe(true);
            expect(receipt.proof.target).toEqual({clamped: true, height: 880, width: 900, x: 1020, y: 200});
            expect(receipt.proof.after).toEqual({height: 880, width: 900, x: 1020, y: 200})
        } finally {
            await fixture.cleanup()
        }
    });

    test('a refused resize fails by name with the frame as it stands', async () => {
        const fixture = await vesselResizeFixture({refuseResizeAt: 2});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual(['the window resize was refused at sample 2 of 4']);
            expect(receipt.proof.samples, 'one sample had settled before the refusal').toBe(1);
            expect(receipt.proof.before).toEqual({height: 540, width: 300, x: 1540, y: 1240});
            expect(receipt.proof.target.width).toBe(900);
            expect(fixture.calls, 'the first sample settled, the second stopped at its resize').toHaveLength(3)
        } finally {
            await fixture.cleanup()
        }
    });

    test('a frame that settles off its target fails by name', async () => {
        const fixture = await vesselResizeFixture({shortBy: 10});
        try {
            const receipt = await fixture.execute();
            expect(receipt.applied).toBe(false);
            expect(receipt.errors[0]).toMatch(/^the window frame ended off its target on width: /);
            expect(receipt.proof.after.width).toBe(890);
            expect(receipt.proof.samples).toBe(4)
        } finally {
            await fixture.cleanup()
        }
    });

    test('no committed vessel, no recipe, or no route fail by name before any frame moves', async () => {
        const fixture = await vesselResizeFixture();
        try {
            expect(await fixture.execute({}, {itemId: 'scale', frame: {anchor: 'right-of-main'}})).toEqual({applied: false, errors: ['vessel resize needs a frame {anchor: \'right-of-main\', width} and at least one sample']});
            fixture.state.committed = false;
            expect(await fixture.execute()).toEqual({applied: false, errors: ['vessel resize needs \'scale\' committed in a window of its own']});
            fixture.state.committed = true;
            const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
            WindowManager.unregister('vessel-resize-unit-popup');
            WindowManager.register({id: 'vessel-resize-unit-popup', nativeRoute: {ownerWindowId: 'vessel-resize-unit-main', targetWindowId: 'vessel-resize-unit-popup', nativeHandleKey: 'h', capabilities: {position: true}}});
            expect(await fixture.execute()).toEqual({applied: false, errors: ['vessel resize has no owner-granted resize route for \'scale\'']});
            expect(fixture.calls, 'nothing moved').toEqual([])
        } finally {
            await fixture.cleanup()
        }
    })
});
