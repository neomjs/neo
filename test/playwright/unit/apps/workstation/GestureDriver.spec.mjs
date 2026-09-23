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
 * @returns {Promise<Object>}
 */
async function railFixture({railAppears=true}={}) {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
    const windowId                 = 'gesture-rail-window', calls = [],
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
          overlay   = {revealPaneItemId: null, visible: false, down: config => config.action === 'pin' ? pinBack : null},
          rail      = {
              edge: 'right', railed: false, revealOverlay: overlay,
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
              })
          },
          driver    = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    service.simulateEvent = async ({events}) => {
        for (const event of events) {
            calls.push(`${event.type}:${event.targetId}`);
            if (event.type !== 'click') continue;
            if (event.targetId === button.id)    {pinAction.hidden = false; document.nodes.source.activeItemId = 'metrics'}
            if (event.targetId === pinAction.id) {document.items.metrics.autoHidden = true; document.nodes.source.items = ['audit']; rail.railed = railAppears}
            if (event.targetId === railTab.id)   {overlay.visible = true; overlay.revealPaneItemId = 'metrics'}
            if (event.targetId === pinBack.id)   {document.items.metrics.autoHidden = false; document.nodes.source.items = ['metrics', 'audit']; overlay.visible = false}
        }
        return true
    };
    service.dispatch = async ({type}) => {calls.push(type); return true};

    return {
        calls, driver, overlay, service, workspace,
        execute(options={}) {
            return driver.executeRailStep({itemId: 'metrics', sourceNodeId: 'source'}, {moveDelay: 0, moveSteps: 2, revealDelay: 0, ...options})
        },
        cleanup() {
            driver.isDestroyed || driver.destroy();
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

    test('a rail that never grows the tab fails by name, after the fold and before any reveal click', async () => {
        const fixture = await railFixture({railAppears: false});
        try {
            const receipt = await fixture.execute({attempts: 3});
            expect(receipt.applied).toBe(false);
            expect(receipt.errors).toEqual(["the rail never showed a tab for 'metrics'"]);
            expect(receipt.proof).toEqual({collapsed: true});
            expect(fixture.calls.filter(call => call.startsWith('click:'))).toEqual(['click:rail-source-tab', 'click:rail-pin-action'])
        } finally {
            fixture.cleanup()
        }
    });

    test('destruction while the reveal is awaited settles the run without a late pin click', async () => {
        const fixture = await railFixture();
        try {
            const railClicked = deferred(), original = fixture.service.simulateEvent;
            // the overlay never reports visible, so the executor waits at the reveal until destroyed
            fixture.service.simulateEvent = async data => {
                const result = await original(data);
                if (data.events.some(event => event.type === 'click' && event.targetId === 'rail-tab')) {
                    fixture.overlay.visible = false;
                    railClicked.resolve()
                }
                return result
            };
            const pending = fixture.execute();
            await railClicked.promise;
            await new Promise(setImmediate);
            fixture.driver.destroy();
            const receipt = await pending;
            expect(receipt.applied).toBe(false);
            expect(receipt.errors.length).toBeGreaterThan(0);
            expect(fixture.calls.filter(call => call.startsWith('click:'))).not.toContain('click:reveal-pin');
            await fixture.driver.settledPromise;
            expect(fixture.service.isDestroyed).toBe(true);
            expect(fixture.workspace.isDestroyed).toBe(false)
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
