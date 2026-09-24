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
                    claimCount: 0, hasTarget: false, hasPreview: false, converted: false});
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
async function resizeFixture({commit=[0.42, 0.58], driveError=null, holdRelease=false}={}) {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
    const windowId                 = 'gesture-resize-window', calls = [], cursors = [], listeners = {}, released = deferred(), midRead = deferred(),
          document  = {items: {}, nodes: {'split-main': {type: 'split', orientation: 'horizontal', children: ['scale-tabs', 'heavy-tabs'], sizes: [0.6, 0.4]}}},
          px        = {container: 1000, 'pane-a': 600, 'pane-b': 400},
          paneA     = {id: 'pane-a'}, paneB = {id: 'pane-b'},
          container = {id: 'container', async getLayoutRect(ids) {
              calls.push(`layout:${ids.join('+')}`);
              // the executor's second read is its mid-drive preview proof: the fake drive releases only after it
              calls.filter(call => call.startsWith('layout:')).length === 2 && midRead.resolve();
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
    service.driveDrag     = async request => {
        calls.push(`drive:${request.source.targetId}:${request.destination.deltaX}:${request.destination.deltaY}:${request.steps}`);
        // the main thread previews the pair from the first move on: the pane tracks the pointer while the document waits
        px['pane-a'] = 600 + request.destination.deltaX / 2;
        px['pane-b'] = 400 - request.destination.deltaX / 2;
        // a held drive releases on the fixture's word (the driver may be dead by then, so no mid read
        // is awaited); an ordinary one releases once the executor has taken its mid-drive read
        await (holdRelease ? released.promise : midRead.promise);
        if (driveError) {
            px['pane-a'] = 600; px['pane-b'] = 400;
            return {success: false, phase: driveError.phase, released: false, sensor: {delayMs: 100, minDistance: 5},
                observed: {started: false, moveCount: 0, ended: false}, dispatch: {down: true, moveCount: 1, up: true},
                error   : {code: driveError.code, message: driveError.message}}
        }
        if (commit) {
            px['pane-a'] = commit[0] * 1000; px['pane-b'] = commit[1] * 1000;
            workspace.dockModel = {...document, nodes: {...document.nodes, 'split-main': {...document.nodes['split-main'], sizes: commit.slice()}}};
            listeners.dockSplitterResize?.({descriptor: {operation: 'resizeSplit', splitNodeId: 'split-main', sizes: commit.slice()}, result: {document: workspace.dockModel, errors: []}, splitter})
        }
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
                axis      : 'width', committedOnce: true, documentUnchangedDuringPreview: true, previewTracked: true,
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
