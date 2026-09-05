import {setup} from '../../setup.mjs';

const appName = 'ManagerDragCoordinatorTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Coordinator teardown hygiene: source retirement follows the gesture's OUTCOME, and no
 * terminal leaves residue behind.
 *
 * The defect these witness is that engagement was treated as commitment. `onRemoteDrop()` answers
 * whether the target actually took the item — returning the committed operation, or null when there
 * was no preview, no operation, or the commit declined — and the coordinator discarded that answer.
 * It then retired the source anyway, arming `remoteDropCommitted`, whose entire meaning is "a remote
 * target committed this transfer" and which suppresses the source's own in-window drop path on that
 * belief. So a no-commit drop left the item with no owner at all: the target never took it, and the
 * source had already let go of it.
 *
 * That makes the load-bearing assertion here a NEGATIVE — "the source was NOT retired" — which is the
 * assertion class most able to pass for the wrong reason. Every test below is therefore written to
 * fail against the unfixed coordinator, and was run that way before the fix existed.
 */
test.describe('Neo.manager.DragCoordinator — teardown hygiene (#15248)', () => {
    let DragCoordinator;
    let calls;

    // Imported dynamically, not statically: DragCoordinator pulls in `manager/Window`, whose singleton
    // construction calls `Neo.currentWorker.on(...)`. `setup()` stubs `Neo.currentWorker`, so the module
    // must load AFTER setup runs — a top-level import loads first and dies on an undefined worker.
    test.beforeAll(async () => {
        DragCoordinator = (await import('../../../../src/manager/DragCoordinator.mjs')).default
    });

    test.beforeEach(() => {
        calls = [];
        DragCoordinator.activeTargetZone = null;
        DragCoordinator.activeSourceZone = null;
        DragCoordinator.activeTargetCommitEligible = false;
        DragCoordinator.activeTransitionOwned = false;
        DragCoordinator.sortZones.clear();
        DragCoordinator.nativeWindowDropCandidates.clear()
    });

    test.afterEach(() => {
        DragCoordinator.activeTargetZone = null;
        DragCoordinator.activeSourceZone = null;
        DragCoordinator.activeTargetCommitEligible = false;
        DragCoordinator.activeTransitionOwned = false;
        DragCoordinator.sortZones.clear();
        DragCoordinator.nativeWindowDropCandidates.clear()
    });

    /**
     * @summary A target whose commit outcome the test controls.
     * @param {Object|null} operation What `onRemoteDrop()` returns — an operation, or null for a
     *   no-commit release. This IS the contract under test; a stub that always committed could not
     *   distinguish engagement from commitment.
     * @returns {Object}
     */
    function createTargetZone(operation) {
        return {
            sortGroup: 'dock',
            windowId : 2,
            onRemoteDrop(draggedItem) {
                calls.push(['onRemoteDrop', draggedItem.id]);
                return operation
            }
        }
    }

    /**
     * @summary A source zone recording whether it was retired.
     * @returns {Object}
     */
    function createSourceZone() {
        return {
            sortGroup       : 'dock',
            windowId        : 1,
            isWindowDragging: false,
            onRemoteDropOut(draggedItem) {
                calls.push(['onRemoteDropOut', draggedItem.id])
            },
            onTerminalWindowDrop(draggedItem) {
                calls.push(['onTerminalWindowDrop', draggedItem.id])
            }
        }
    }

    test('a COMMITTED drop retires the source — the happy path is unchanged', () => {
        const
            source = createSourceZone(),
            target = createTargetZone({type: 'transferItem'});

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        // Retirement is correct here: the target took the item, so suppressing the source's in-window
        // drop is exactly right — firing it would double-commit.
        expect(calls).toEqual([
            ['onRemoteDrop',    'tab-1'],
            ['onRemoteDropOut', 'tab-1']
        ]);
        expect(DragCoordinator.activeTargetZone).toBeNull()
    });

    test('a NULL-COMMIT drop does NOT retire the source — the item must keep an owner', () => {
        const
            source = createSourceZone(),
            target = createTargetZone(null);

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        // The target was asked and declined. Retiring the source here armed `remoteDropCommitted`,
        // suppressing the source's in-window drop path on the false belief the item had transferred
        // out — so nothing owned it. Leaving the source un-retired lets its ordinary path restore it.
        expect(calls).toEqual([['onRemoteDrop', 'tab-1']]);
        expect(calls.some(([name]) => name === 'onRemoteDropOut')).toBe(false);

        // The engagement is still cleared: a declined commit ends the gesture just as a taken one does.
        expect(DragCoordinator.activeTargetZone).toBeNull()
    });

    test('an undefined commit is a no-commit — absence of an operation is not an operation', () => {
        const
            source = createSourceZone(),
            target = createTargetZone(undefined);

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls).toEqual([['onRemoteDrop', 'tab-1']])
    });

    test('unregister clears a departing zone that is the live target — a gone vessel cannot stay droppable', () => {
        const target = createTargetZone({type: 'transferItem'});

        DragCoordinator.register(target);
        DragCoordinator.activeTargetZone = target;

        DragCoordinator.unregister(target);

        // Dropping the zone from the registry while leaving it installed here kept a departed window
        // reachable as the commit destination for the NEXT release.
        expect(DragCoordinator.activeTargetZone).toBeNull();
        expect(DragCoordinator.sortZones.has('dock')).toBe(false)
    });

    test('unregister leaves an UNRELATED live target alone — the guard is identity-scoped, not a blanket reset', () => {
        const
            activeTarget  = createTargetZone({type: 'transferItem'}),
            departingZone = {sortGroup: 'dock', windowId: 3};

        DragCoordinator.register(activeTarget);
        DragCoordinator.register(departingZone);
        DragCoordinator.activeTargetZone = activeTarget;

        DragCoordinator.unregister(departingZone);

        // Without this, "clear activeTargetZone on unregister" would satisfy the test above by
        // cancelling every in-flight gesture whenever any unrelated vessel departed.
        expect(DragCoordinator.activeTargetZone).toBe(activeTarget)
    });

    test('re-registering the same identity after unregister starts clean', () => {
        const target = createTargetZone({type: 'transferItem'});

        DragCoordinator.register(target);
        DragCoordinator.activeTargetZone = target;
        DragCoordinator.unregister(target);
        DragCoordinator.register(target);

        expect(DragCoordinator.activeTargetZone).toBeNull();
        expect(DragCoordinator.sortZones.get('dock').get(2)).toBe(target)
    });

    /**
     * The registry is keyed by `[sortGroup, windowId]`, and `register` OVERWRITES that key. So a
     * window whose zone is REPLACED briefly has two zone objects claiming one key, and the order
     * they resolve in decides what the coordinator can see.
     *
     * Replacement is not universal: an in-place geometry or retained-topology refresh reconciles
     * the existing shell and swaps no zone. A staged structural re-projection builds the successor
     * before retiring the predecessor, so the live sequence there is
     * register(new) → destroy(old) → unregister(old). A `delete(windowId)` that does not check
     * WHICH zone it is evicting therefore removes the zone that just replaced it.
     *
     * The failure is silent and remote: nothing throws, the surviving zone is perfectly healthy and
     * still answers `acceptsRemoteDrag`, but `resolveClaimedTarget` iterates the coordinator's map
     * and never reaches it — so a cross-window drag finds no candidate while every app-side
     * reconstruction of "would this zone accept?" says yes.
     *
     * The sibling guard below it is already identity-scoped ("leaves an UNRELATED live target
     * alone"); this is the same discipline one line up, on the registry rather than on
     * `activeTargetZone`.
     */
    test('unregister evicts only ITS OWN registration — a replaced zone must not delete its successor', () => {
        const
            retiring  = createTargetZone({type: 'transferItem'}),
            successor = createTargetZone({type: 'transferItem'});

        // Same identity, as a re-projection produces: one window, one sort group, two objects.
        expect(retiring.windowId, 'the two zones must contend for one key, or this proves nothing')
            .toBe(successor.windowId);
        expect(retiring).not.toBe(successor);

        DragCoordinator.register(retiring);
        DragCoordinator.register(successor);

        expect(DragCoordinator.sortZones.get('dock').get(2), 'the successor owns the key after registering')
            .toBe(successor);

        DragCoordinator.unregister(retiring);

        expect(DragCoordinator.sortZones.get('dock').get(2),
            'the retiring zone must not evict the successor that replaced it'
        ).toBe(successor)
    });

    test('unregister of the LAST holder still clears the key, and prunes an empty group', () => {
        // The guard above must not turn into "never delete": a zone that genuinely still owns its
        // key has to be removed, or a departed window stays reachable as a drag target forever.
        const departing = createTargetZone({type: 'transferItem'});

        DragCoordinator.register(departing);
        DragCoordinator.unregister(departing);

        expect(DragCoordinator.sortZones.has('dock'), 'the emptied group is pruned').toBe(false)
    });

    test('every terminal is idempotent — a second invocation is a witnessed no-op, not a second commit', () => {
        const
            source = createSourceZone(),
            target = createTargetZone({type: 'transferItem'});

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        const afterFirst = [...calls];

        // Exact-once: the second close finds no engagement and must not re-ask the target or re-retire
        // the source. `isWindowDragging` is false, so the native-drag branch stays shut too. This half
        // already held before the fix — it is pinned here as a regression guard, since making
        // retirement outcome-aware must not cost exact-once.
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});
        expect(calls).toEqual(afterFirst);

        // Unregister is idempotent for the same reason: a repeated vessel departure is normal. The
        // target is re-armed first — asserting a null after onDragEnd already nulled it would pass
        // without unregister doing anything at all.
        DragCoordinator.register(target);
        DragCoordinator.activeTargetZone = target;

        DragCoordinator.unregister(target);
        expect(DragCoordinator.activeTargetZone).toBeNull();

        DragCoordinator.unregister(target);
        expect(DragCoordinator.activeTargetZone).toBeNull();
        expect(calls).toEqual(afterFirst)
    });

    test('an ASYNC target resolving null does NOT retire — a Promise is truthy, so testing it IS the defect', async () => {
        // @neo-gpt's RA-1. `onDragEnd` is synchronous; `draggable/dashboard/SortZone.onRemoteDrop` is
        // async. `if (operation)` on a Promise is `if (true)` — so the outcome-aware gate read EVERY
        // async target as committed and retired the source anyway. The fix's own shape hid the fix's
        // own defect, and my sync-only stub could not see it.
        const
            source = createSourceZone(),
            target = {
                sortGroup: 'dock',
                windowId : 2,
                onRemoteDrop(draggedItem) {
                    calls.push(['onRemoteDrop', draggedItem.id]);
                    return Promise.resolve(null)
                }
            };

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        // let the resolution settle — the retirement decision is deferred, not skipped
        await Promise.resolve();
        await Promise.resolve();

        expect(calls).toEqual([['onRemoteDrop', 'tab-1']]);
        expect(DragCoordinator.activeTargetZone).toBeNull()
    });

    test('an ASYNC target resolving an operation DOES retire — deferred, not dropped', async () => {
        // The control: without this, "never retire on a thenable" would satisfy the test above and
        // silently break every async commit.
        const
            source = createSourceZone(),
            target = {
                sortGroup: 'dock',
                windowId : 2,
                onRemoteDrop(draggedItem) {
                    calls.push(['onRemoteDrop', draggedItem.id]);
                    return Promise.resolve({type: 'insertItem'})
                }
            };

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        await Promise.resolve();
        await Promise.resolve();

        expect(calls).toEqual([
            ['onRemoteDrop',    'tab-1'],
            ['onRemoteDropOut', 'tab-1']
        ])
    });

    test('a SYNC commit still retires on the SAME call stack — the source reads the flag synchronously', () => {
        // The deadline that forbids simply making onDragEnd async: DockTabSortZone's processDragEnd
        // reads `remoteDropCommitted` in its own synchronous continuation, so an awaited retirement
        // would arm the flag AFTER the decision it exists to inform. Sync targets must not be deferred.
        const
            source = createSourceZone(),
            target = createTargetZone({type: 'transferItem'});

        DragCoordinator.activeTargetZone = target;
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        // asserted with NO await: retirement already happened by the time onDragEnd returned
        expect(calls).toEqual([
            ['onRemoteDrop',    'tab-1'],
            ['onRemoteDropOut', 'tab-1']
        ])
    });

    test('the NATIVE-titlebar path obeys the same rule — the defect had a twin behind a different door', async () => {
        // @neo-gpt-emmy's delta: the pointer fix left `commitNativeWindowDrop` discarding
        // `await onRemoteDrop(...)` and retiring the source anyway. Same defect class, different
        // entry point — fixing the instance the ticket named is not fixing the class.
        const
            draggedItem  = {id: 'tab-1'},
            movePayloads = [],
            order        = [],
            target       = {
                ...createTargetZone(null),
                acceptsRemoteDrag: () => true,
                onRemoteDragMove : async payload => {
                    order.push('move');
                    movePayloads.push(payload)
                }
            },
            source      = {
                ...createSourceZone(),
                getNativeWindowDrag: () => ({draggedItem}),
                suspendWindowDrag  : async () => order.push('suspend')
            };

        // `commitNativeWindowDrop(windowId, candidate)` is POSITIONAL and guards on the candidate being
        // the registered one. A single-object call returns at the first guard and reaches nothing — the
        // first draft of this test did exactly that and passed against the defect it names.
        const candidate = {
            draggedItem, sourceSortZone: source, targetSortZone: target,
            localX: 0, localY: 0, offsetX: 0, offsetY: 0, proxyRect: {}, widgetName: 'w'
        };

        DragCoordinator.nativeWindowDropCandidates.set(7, candidate);

        await DragCoordinator.commitNativeWindowDrop(7, candidate);

        // The target declined, so the source keeps the item — exactly as on the pointer path.
        expect(calls).toEqual([['onRemoteDrop', 'tab-1']]);
        expect(calls.some(([name]) => name === 'onRemoteDropOut')).toBe(false);
        expect(order).toEqual(['suspend', 'move']);
        expect(movePayloads[0]).toMatchObject({
            draggedItem,
            embodyProxy   : true,
            sourceSortZone: source
        })
    });

    test('a THROWING commit still clears the engagement — a REJECTED terminal cannot park the target', () => {
        const
            source = createSourceZone(),
            target = {
                sortGroup: 'dock',
                windowId : 2,
                onRemoteDrop() { throw new Error('commit exploded') }
            };

        DragCoordinator.activeTargetZone = target;

        // The error propagates — cleanup must not swallow it, or a failing commit reads as a success.
        expect(() => DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source}))
            .toThrow(/commit exploded/);

        // ...and the terminal is still exact-once: leaving the target installed would hand the NEXT
        // release a commit destination belonging to a gesture that already failed.
        expect(DragCoordinator.activeTargetZone).toBeNull();
        expect(calls.some(([name]) => name === 'onRemoteDropOut')).toBe(false)
    });

    test('unregister ends the hover before dropping the pointer — a nulled target cannot clear its own preview', () => {
        let left = 0;

        const target = {
            sortGroup: 'dock',
            windowId : 2,
            onRemoteDragLeave() { left++ }
        };

        DragCoordinator.register(target);
        DragCoordinator.activeTargetZone = target;

        DragCoordinator.unregister(target);

        // Nulling alone orphans the target's preview and its owner's: onRemoteDragLeave is the only
        // path that clears them, and losing the reference first makes it unreachable forever.
        expect(left).toBe(1);
        expect(DragCoordinator.activeTargetZone).toBeNull()
    });

    test('a departing vessel takes its candidate timers with it — on either side of the gesture', () => {
        // AC-3 names the candidate timer as a cleanup surface, so it is pinned rather than assumed.
        // Unlike the witnesses above this one PASSES against dev: @neo-gpt-emmy read the loop as already
        // correct and I agree, so this is a regression guard, not a bite. Naming that is the point —
        // a test that cannot fail today should say why it exists.
        const
            source = createSourceZone(),
            target = createTargetZone({type: 'transferItem'});

        let sourceTimerCleared = false,
            targetTimerCleared = false;

        DragCoordinator.nativeWindowDropCandidates.set(11, {
            sourceSortZone: source,
            targetSortZone: {},
            timeoutId     : setTimeout(() => { sourceTimerCleared = false }, 60_000)
        });
        DragCoordinator.nativeWindowDropCandidates.set(12, {
            sourceSortZone: {},
            targetSortZone: target,
            timeoutId     : setTimeout(() => { targetTimerCleared = false }, 60_000)
        });
        DragCoordinator.nativeWindowDropCandidates.set(13, {
            sourceSortZone: {},
            targetSortZone: {},
            timeoutId     : setTimeout(() => {}, 60_000)
        });

        DragCoordinator.register(source);
        DragCoordinator.unregister(source);

        // The departing zone's candidate goes, whichever side of the gesture it was on...
        sourceTimerCleared = !DragCoordinator.nativeWindowDropCandidates.has(11);
        expect(sourceTimerCleared).toBe(true);

        DragCoordinator.register(target);
        DragCoordinator.unregister(target);
        targetTimerCleared = !DragCoordinator.nativeWindowDropCandidates.has(12);
        expect(targetTimerCleared).toBe(true);

        // ...and an unrelated vessel's candidate survives — cleanup is scoped, not a sweep.
        expect(DragCoordinator.nativeWindowDropCandidates.has(13)).toBe(true);

        // Idempotent: a repeated departure finds nothing left and does not throw.
        DragCoordinator.unregister(source);
        expect(DragCoordinator.nativeWindowDropCandidates.has(13)).toBe(true)
    });

    test('a mid-gesture vessel departure resolves to a clean terminal, not a commit into a dead window', () => {
        const
            source = createSourceZone(),
            target = createTargetZone({type: 'transferItem'});

        DragCoordinator.register(target);
        DragCoordinator.activeTargetZone = target;

        // The window closes under the drag.
        DragCoordinator.unregister(target);

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        // The departed target is never asked to commit, and the source is never retired into it — the
        // gesture terminates with the item still owned by its source.
        expect(calls).toEqual([]);
        expect(DragCoordinator.activeTargetZone).toBeNull()
    });
});

/**
 * @summary The §2.8.1 gesture/claim protocol at the coordinator tier: deterministic target
 * resolution on stable identity, replacing first-intersecting registration order on the dock path.
 *
 * The binding falsifier lives here verbatim — three OVERLAPPING windows, one gesture, exactly ONE
 * preview and exactly ONE commit — alongside the negative witness that PINS the legacy path's
 * registration-order dependence (the reason stable-identity zones are forbidden from riding it),
 * and the continuous-preview contract for native-titlebar hovers.
 *
 * Real coordinator, real `Neo.manager.Window` geometry (registered `Rectangle`s), plain-object
 * zones — the same harness idiom as the teardown-hygiene block above.
 */
test.describe('Neo.manager.DragCoordinator — the §2.8.1 claim protocol', () => {
    let DragCoordinator, Rectangle, WindowManager, createGestureClaimArbiter;
    let calls;

    test.beforeAll(async () => {
        DragCoordinator = (await import('../../../../src/manager/DragCoordinator.mjs')).default;
        Rectangle       = (await import('../../../../src/util/Rectangle.mjs')).default;
        WindowManager   = (await import('../../../../src/manager/Window.mjs')).default;

        ({createGestureClaimArbiter} = await import('../../../../src/manager/GestureClaimArbiter.mjs'))
    });

    function resetCoordinator() {
        DragCoordinator.activeTargetZone = null;
        DragCoordinator.activeSourceZone = null;
        DragCoordinator.activeTargetCommitEligible = false;
        DragCoordinator.activeTransitionOwned = false;
        DragCoordinator.sortZones.clear();
        DragCoordinator.nativeWindowDropCandidates.forEach(candidate => clearTimeout(candidate.timeoutId));
        DragCoordinator.nativeWindowDropCandidates.clear();
        DragCoordinator.nativeClaimArbiters.clear();
        DragCoordinator.nativeHoverTargets.clear();
        DragCoordinator.pointerClaimArbiter = null;
        DragCoordinator.claimTrace.length   = 0
    }

    function clearWindows() {
        [...WindowManager.items].forEach(item => WindowManager.unregister(item))
    }

    test.beforeEach(() => {
        calls = [];
        resetCoordinator();
        clearWindows()
    });

    test.afterEach(() => {
        resetCoordinator();
        clearWindows()
    });

    /**
     * @param {String} id
     * @param {Number} x
     * @param {Number} y
     * @param {Number} width
     * @param {Number} height
     * @param {Object} [rects] optional divergent inner/outer rects (chrome simulation)
     */
    function registerWindow(id, x, y, width, height, rects = null) {
        WindowManager.register({
            id,
            innerRect: rects?.innerRect ?? new Rectangle(x, y, width, height),
            outerRect: rects?.outerRect ?? new Rectangle(x, y, width, height)
        })
    }

    /**
     * @param {String|null} stableId null creates a LEGACY zone (no stable identity)
     * @param {String} windowId
     * @param {Object} [options]
     * @returns {Object}
     */
    function createZone(stableId, windowId, {accepts = () => true, operation = {type: 'transferItem'}} = {}) {
        const zone = {
            sortGroup: 'dock',
            windowId,
            acceptsRemoteDrag(localX, localY) {
                return accepts(localX, localY)
            },
            onRemoteDragMove(payload) {
                calls.push(['move', stableId ?? windowId, payload.localX, payload.localY])
            },
            onRemoteDragLeave() {
                calls.push(['leave', stableId ?? windowId])
            },
            onRemoteDrop(draggedItem) {
                calls.push(['drop', stableId ?? windowId, draggedItem.id]);
                return operation
            }
        };

        if (stableId != null) {
            zone.stableTargetId = stableId
        }

        return zone
    }

    /**
     * @returns {Object}
     */
    function createSource() {
        return {
            sortGroup       : 'dock',
            windowId        : 'win-source',
            isWindowDragging: false,
            suspendWindowDrag(widgetName) {
                calls.push(['suspend', widgetName])
            },
            resumeWindowDrag(widgetName) {
                calls.push(['resume', widgetName])
            },
            onRemoteDropOut(draggedItem) {
                calls.push(['dropOut', draggedItem.id])
            }
        }
    }

    /**
     * @param {Object} source
     * @param {Number} screenX
     * @param {Number} screenY
     * @param {Object} [overrides={}]
     */
    function move(source, screenX, screenY, overrides={}) {
        DragCoordinator.onDragMove({
            draggedItem   : {id: 'tab-1', reference: 'tab-1'},
            offsetX       : 10,
            offsetY       : 10,
            proxyRect     : {width: 100, height: 60},
            screenX,
            screenY,
            sourceSortZone: source,
            ...overrides
        })
    }

    test('THE OVERLAP FALSIFIER: three overlapping windows, one gesture → exactly ONE preview and exactly ONE commit', () => {
        const source = createSource();

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a',      0,     0, 800, 600);
        registerWindow('win-b',      100, 100, 800, 600);
        registerWindow('win-c',      200, 200, 800, 600);

        // Registered in REVERSE lexicographic order: an insertion-order resolver answers
        // 'workspace-c'; the protocol must answer 'workspace-a' (same-tick tie → lexicographic).
        const
            zoneC = createZone('workspace-c', 'win-c'),
            zoneB = createZone('workspace-b', 'win-b'),
            zoneA = createZone('workspace-a', 'win-a');

        DragCoordinator.register(zoneC);
        DragCoordinator.register(zoneB);
        DragCoordinator.register(zoneA);

        // (300, 300) lies inside ALL THREE target windows — the popup-over-popup overlap.
        move(source, 300, 300);
        move(source, 310, 310);

        // one gesture token, alive between moves and dead after the terminal
        expect(DragCoordinator.pointerClaimArbiter?.token).toBeTruthy();

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        const
            previewIds = new Set(calls.filter(([name]) => name === 'move').map(([, id]) => id)),
            dropCalls  = calls.filter(([name]) => name === 'drop');

        // exactly ONE window previews...
        expect([...previewIds]).toEqual(['workspace-a']);

        // ...and exactly ONE commit lands, on the deterministic winner
        expect(dropCalls).toEqual([['drop', 'workspace-a', 'tab-1']]);
        expect(calls.filter(([name]) => name === 'dropOut')).toEqual([['dropOut', 'tab-1']]);

        // the source's drag embodiment was suspended exactly once, on entering the claimed target
        expect(calls.filter(([name]) => name === 'suspend')).toEqual([['suspend', 'tab-1']]);

        // gesture terminal: the token is dead
        expect(DragCoordinator.pointerClaimArbiter).toBeNull()
    });

    test('a NATIVE hover frame carries the dwell clock the commit is scheduled from — the hold is the gesture', () => {
        // No pointer event and no release reach the page while the OS drags a popup, so the target
        // paints the hold from the same start and duration the coordinator commits on. A second frame
        // over the same target keeps the start: the clock belongs to the hold, not to the frame.
        const
            draggedItem = {id: 'tab-1'},
            payloads    = [],
            target      = {
                ...createZone('workspace-main', 'win-main'),
                onRemoteDragMove(payload) { payloads.push(payload) }
            },
            source = {
                ...createSource(),
                windowId           : 'win-popup',
                getNativeWindowDrag: windowId => windowId === 'win-popup'
                    ? {draggedItem, embodyNativeHover: true, widgetName: 'tab-1'}
                    : null
            };

        registerWindow('win-main',  0,   0,   800, 600);
        registerWindow('win-popup', 100, 100, 300, 200);

        DragCoordinator.register(target);
        DragCoordinator.register(source);

        try {
            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

            const first = payloads.at(-1)?.dwell;

            expect(first, 'the hover frame names the clock').toEqual({
                armedAt   : expect.any(Number),
                durationMs: DragCoordinator.nativeWindowDropDwellMs
            });

            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

            expect(payloads).toHaveLength(2);
            expect(payloads.at(-1).dwell.armedAt, 'the same hold keeps its start across frames').toBe(first.armedAt)
        } finally {
            // the commit timer is armed for the dwell — end the gesture before it can fire into a torn-down stage
            DragCoordinator.clearNativeWindowDropCandidate('win-popup');
            DragCoordinator.endNativeGesture?.('win-popup')
        }
    });

    test.describe('#18173 the hold restarts when the drop zone changes', () => {
        /**
         * Drives native geometry frames against ONE window whose target returns a controllable
         * preview. A real clock cannot express this: consecutive frames land in the same
         * millisecond, so a re-arm would be indistinguishable from a carry-over.
         * @param {String[]} previewIds One per frame; null means the frame resolved no preview.
         * @returns {{payloads: Object[], delays: Number[]}}
         */
        const runFrames = previewIds => {
            const
                draggedItem   = {id: 'tab-1'},
                payloads      = [],
                delays        = [],
                originalNow   = Date.now,
                originalST    = globalThis.setTimeout,
                originalDwell = DragCoordinator.nativeWindowDropDwellMs,
                // PINNED, never read from the live config. `DragCoordinator` is a singleton shared
                // across spec FILES in one worker, and `draggable/dashboard/SortZone.spec.mjs`
                // leaves `nativeWindowDropDwellMs` at 450 in its own afterEach. An expectation
                // derived from the ambient value therefore passes when this file runs alone and
                // fails in a full run — which is exactly what it did, and why it reproduced for
                // nobody who ran the spec on its own.
                //
                // The arithmetic also has to stay clear of `nativeWindowDropSettleMs` (250): the
                // scheduled delay is `Math.max(settle, remaining)`, so at 450 the third frame's
                // remainder went NEGATIVE and the floor answered instead of the hold.
                DWELL_MS      = 1200;

            let clock = 10_000,
                frame = 0;

            const target = {
                ...createZone('workspace-main', 'win-main'),
                onRemoteDragMove(payload) {
                    payloads.push(payload);
                    // The frame index advances per COORDINATOR frame, not per call: a re-arm re-sends
                    // the hover, and both sends belong to the same frame and the same resolved zone.
                    const id = previewIds[Math.min(frame, previewIds.length - 1)];
                    return id ? {previewId: id} : null
                }
            };

            const source = {
                ...createSource(),
                windowId           : 'win-popup',
                getNativeWindowDrag: windowId => windowId === 'win-popup'
                    ? {draggedItem, embodyNativeHover: true, widgetName: 'tab-1'}
                    : null
            };

            registerWindow('win-main',  0,   0,   800, 600);
            registerWindow('win-popup', 100, 100, 300, 200);

            DragCoordinator.register(target);
            DragCoordinator.register(source);

            Date.now = () => clock;
            globalThis.setTimeout = (fn, delay) => { delays.push(delay); return 0 };
            DragCoordinator.nativeWindowDropDwellMs = DWELL_MS;

            try {
                for (frame = 0; frame < previewIds.length; frame++) {
                    DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});
                    clock += 300   // the user travels; well inside the 1200ms hold
                }
            } finally {
                Date.now                                = originalNow;
                globalThis.setTimeout                   = originalST;
                DragCoordinator.nativeWindowDropDwellMs = originalDwell;
                DragCoordinator.clearNativeWindowDropCandidate('win-popup');
                DragCoordinator.endNativeGesture?.('win-popup')
            }

            return {delays, payloads}
        };

        test('AC-1/AC-2 a NEW zone restarts the hold — the commit is pushed out by the full duration', () => {
            const {delays, payloads} = runFrames(['preview:tab-1:node-a:tab-into', 'preview:tab-1:node-b:split-left']);

            // Frame 2 resolves a different zone 300ms in. Without the re-arm the commit stays
            // scheduled 300ms earlier and fires while the user is still choosing — the operator's
            // report: a main window always has a valid drop area, so the clock never restarted.
            expect(delays.at(-1), 'the hold starts over, it does not run down').toBe(1200);

            // AC-5: the target paints from the same start the commit was scheduled from, so the ring
            // does not drain against a timer that has just been pushed out.
            expect(payloads.at(-1).dwell.armedAt).toBe(10_300);
            expect(payloads.at(-1).dwell.armedAt).toBeGreaterThan(payloads[0].dwell.armedAt)
        });

        test('AC-3 a PLACEMENT change over one node restarts it too — that is a different drop', () => {
            const {delays} = runFrames(['preview:tab-1:node-a:tab-into', 'preview:tab-1:node-a:split-left']);

            // Same node, different placement. `previewId` carries both, which is why keying on a
            // node id alone would miss this one.
            expect(delays.at(-1)).toBe(1200)
        });

        test('AC-4 holding STILL keeps one clock — the hold is completable', () => {
            const {delays, payloads} = runFrames(Array(3).fill('preview:tab-1:node-a:tab-into'));

            // 600ms elapsed over three frames on one zone, so the remaining hold has shrunk by that
            // much. A re-arm here would make the gesture impossible to finish.
            // 600 elapsed, 600 remain — comfortably above the 250ms settle floor, so this asserts
            // the remaining hold rather than the floor.
            expect(delays.at(-1)).toBe(600);
            expect(payloads.at(-1).dwell.armedAt, 'one start, all three frames').toBe(payloads[0].dwell.armedAt)
        });

        test('AC-6 a frame resolving NO preview is a gap, not a new zone', () => {
            const {delays} = runFrames(['preview:tab-1:node-a:tab-into', null, 'preview:tab-1:node-a:tab-into']);

            // The middle frame resolves nothing while the sort zone still accepts the drag. Treating
            // that as a change would restart a hold the user is legitimately completing.
            expect(delays.at(-1)).toBe(600)
        });

        test('the hover frame is re-sent on a re-arm, and NOT re-sent otherwise', () => {
            expect(runFrames(['preview:tab-1:node-a:tab-into', 'preview:tab-1:node-b:tab-into']).payloads,
                'a zone change repaints the ring from its new start').toHaveLength(3);

            expect(runFrames(['preview:tab-1:node-a:tab-into', 'preview:tab-1:node-a:tab-into']).payloads,
                'a steady hold costs exactly one frame each').toHaveLength(2)
        })
    });

    test('THE OVERLAP FALSIFIER holds when the clock moves mid-pass — the winner is not the loop order', () => {
        const source = createSource();

        // The falsifier above passes only while the whole claim pass fits inside one millisecond,
        // which is a property of machine speed, not of the protocol. This runs the identical
        // geometry against a clock that ticks on EVERY read — the most hostile pass possible — so
        // the outcome depends on the pass sharing one acquisition instant and nothing else. With a
        // per-claim clock read the boundary orders the zones by iteration and 'workspace-c' wins.
        let tick = 1_000;

        DragCoordinator.pointerClaimArbiter = createGestureClaimArbiter({now: () => tick++});

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a',      0,     0, 800, 600);
        registerWindow('win-b',      100, 100, 800, 600);
        registerWindow('win-c',      200, 200, 800, 600);

        DragCoordinator.register(createZone('workspace-c', 'win-c'));
        DragCoordinator.register(createZone('workspace-b', 'win-b'));
        DragCoordinator.register(createZone('workspace-a', 'win-a'));

        move(source, 300, 300);
        move(source, 310, 310);

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect([...new Set(calls.filter(([name]) => name === 'move').map(([, id]) => id))]).toEqual(['workspace-a']);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([['drop', 'workspace-a', 'tab-1']])
    });

    test('the NEGATIVE witness: stable-identity-free zones resolve by REGISTRATION ORDER — the pinned legacy nondeterminism', () => {
        const source = createSource();

        // Round 1: windows registered a-first. `getWindowAt` finds the FIRST intersecting item.
        registerWindow('win-a', 0,     0, 800, 600);
        registerWindow('win-b', 100, 100, 800, 600);
        registerWindow('win-source', 2000, 0, 400, 400);

        DragCoordinator.register(createZone(null, 'win-a'));
        DragCoordinator.register(createZone(null, 'win-b'));

        move(source, 300, 300);

        expect(calls.filter(([name]) => name === 'move').map(([, id]) => id)).toEqual(['win-a']);

        DragCoordinator.onDragCancel({draggedItem: {id: 'tab-1'}, sourceSortZone: source});
        resetCoordinator();
        clearWindows();
        calls = [];

        // Round 2: the IDENTICAL layout, windows registered b-first — the winner flips with
        // registration order. This is the behavior the claim protocol exists to replace, pinned
        // here so the legacy path's semantics stay observable and documented.
        registerWindow('win-b', 100, 100, 800, 600);
        registerWindow('win-a', 0,     0, 800, 600);
        registerWindow('win-source', 2000, 0, 400, 400);

        DragCoordinator.register(createZone(null, 'win-a'));
        DragCoordinator.register(createZone(null, 'win-b'));

        move(source, 300, 300);

        expect(calls.filter(([name]) => name === 'move').map(([, id]) => id)).toEqual(['win-b'])
    });

    test('the legacy door is CLOSED to stable zones: first-intersecting resolution cannot reach a zone that failed to claim', () => {
        const source = createSource();

        // win-a's OUTER rect contains the point, its INNER rect does not (an 80px chrome band) —
        // so the zone cannot claim (inner containment fails), while `getWindowAt` (outer-rect,
        // first-intersecting) still resolves win-a. Without the guard, the legacy path would
        // hand this zone the gesture with chrome-space coordinates its blind hit-test accepts.
        registerWindow('win-a', 0, 0, 800, 600, {
            innerRect: new Rectangle(0, 80, 800, 520),
            outerRect: new Rectangle(0, 0,  800, 600)
        });
        registerWindow('win-source', 2000, 0, 400, 400);

        DragCoordinator.register(createZone('workspace-a', 'win-a', {accepts: () => true}));

        move(source, 300, 40);

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        // fail closed: no preview, no commit — §2.8.1's no-claim outcome
        expect(calls.filter(([name]) => name === 'move')).toEqual([]);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([]);
        expect(calls.filter(([name]) => name === 'dropOut')).toEqual([])
    });

    test('ownership admission (ADR 0029 §2.3): a target of another commit authority never claims, previews or commits — a declared null matches nothing, an undeclared surface meets only an undeclared source', () => {
        const source = createSource();

        source.ownershipId = 'group-a';

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a',      0,     0, 800, 600);
        registerWindow('win-b',      100, 100, 800, 600);
        registerWindow('win-null',   200, 200, 800, 600);
        registerWindow('win-plain',  300, 300, 800, 600);

        // Four targets all containing (350, 350). The other root's surface carries the SAME stable
        // identity as ours — the collision the admission keeps out of one arbiter.
        const
            zoneA     = createZone('workspace-main', 'win-a'),
            zoneB     = createZone('workspace-main', 'win-b'),
            zoneNull  = createZone('workspace-null', 'win-null'),
            zonePlain = createZone('workspace-plain', 'win-plain');

        zoneA.ownershipId    = 'group-a';
        zoneB.ownershipId    = 'group-b';
        zoneNull.ownershipId = null;

        zoneB.onRemoteDragMove = () => calls.push(['move', 'other-root']);
        zoneB.onRemoteDrop     = () => { calls.push(['drop', 'other-root']); return {type: 'transferItem'} };

        DragCoordinator.register(zoneB);
        DragCoordinator.register(zoneNull);
        DragCoordinator.register(zonePlain);
        DragCoordinator.register(zoneA);

        move(source, 350, 350);

        const record = DragCoordinator.claimTrace.at(-1);

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls.filter(([name]) => name === 'move').map(([, id]) => id), 'only the same-Group surface previews').toEqual(['workspace-main']);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([['drop', 'workspace-main', 'tab-1']]);

        expect(record.sourceOwnershipId).toBe('group-a');
        expect(record.candidates.filter(c => c.skipped === 'ownership').map(c => c.windowId).sort()).toEqual(['win-b', 'win-null', 'win-plain']);
        expect(record.candidates.find(c => c.windowId === 'win-b')).toMatchObject({ownershipId: 'group-b', stableTargetId: 'workspace-main'})
    });

    test('ownership tiers: a source whose Group is unresolved admits nothing, and a source outside the Group world meets only surfaces that declare none', () => {
        const source = createSource();

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a',     0,   0,   800, 600);
        registerWindow('win-plain', 100, 100, 800, 600);

        const
            zoneA     = createZone('workspace-a', 'win-a'),
            zonePlain = createZone('workspace-plain', 'win-plain');

        zoneA.ownershipId = 'group-a';

        DragCoordinator.register(zoneA);
        DragCoordinator.register(zonePlain);

        // declared but unresolved: fails closed — nothing previews, nothing commits
        source.ownershipId = null;
        move(source, 300, 300);

        expect(DragCoordinator.claimTrace.at(-1)).toMatchObject({outcome: 'no-claim', sourceOwnershipId: null});

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls.filter(([name]) => name === 'move' || name === 'drop')).toEqual([]);

        // outside the Group world: the undeclared surface is met, the declared one is not
        delete source.ownershipId;
        move(source, 300, 300);
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls.filter(([name]) => name === 'move').map(([, id]) => id)).toEqual(['workspace-plain']);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([['drop', 'workspace-plain', 'tab-1']])
    });

    test('the legacy first-intersecting door obeys the same admission: a stable-identity-free zone of another Group is never reached', () => {
        const source = createSource();

        source.ownershipId = 'group-a';

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-legacy', 0,    0, 800, 600);

        const legacy = createZone(null, 'win-legacy'); // no stable identity → the pinned legacy path

        legacy.ownershipId = 'group-b';
        DragCoordinator.register(legacy);

        move(source, 300, 300);
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls.filter(([name]) => name === 'move'), 'another Group\'s legacy zone is not reached').toEqual([]);

        legacy.ownershipId = 'group-a';
        move(source, 300, 300);
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls.filter(([name]) => name === 'move')).toEqual([['move', 'win-legacy', 300, 300]]);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([['drop', 'win-legacy', 'tab-1']])
    });

    test('the native path\'s legacy door obeys the admission too: a popup over another Group\'s stable-identity-free zone resolves no candidate', () => {
        const
            draggedItem = {id: 'tab-1'},
            source      = {
                ownershipId: 'group-a',
                sortGroup  : 'dock',
                windowId   : 'win-source',
                getNativeWindowDrag(windowId) {
                    return windowId === 'win-popup' ? {draggedItem, widgetName: 'tab-1'} : null
                },
                async suspendWindowDrag(widgetName) {
                    calls.push(['suspend', widgetName])
                }
            },
            legacy = createZone(null, 'win-target');

        legacy.ownershipId = 'group-b';

        registerWindow('win-source', 2000,   0, 400, 400);
        registerWindow('win-popup',   500, 500, 300, 200);
        registerWindow('win-target',  400, 400, 400, 400); // covers the popup's inset corner anchor

        DragCoordinator.register(source);
        DragCoordinator.register(legacy);

        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        expect(calls.filter(([name]) => name === 'move'), 'another Group\'s zone is never asked').toEqual([]);

        legacy.ownershipId = 'group-a';
        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        expect(calls.filter(([name]) => name === 'move').map(([, id]) => id)).toEqual(['win-target'])
    });

    test('a source that declares no ownership drags under the surface registered for its own window — registry identity, not dock semantics', () => {
        const
            headerZone = {sortGroup: 'dock', windowId: 'win-a'}, // a header sort zone: registers nothing, declares nothing
            surface    = createZone('workspace-a', 'win-a'),      // the window's registered surface
            lone       = {sortGroup: 'dock', windowId: 'win-lone'};

        surface.ownershipId = 'group-a';

        DragCoordinator.register(surface);
        DragCoordinator.register(lone);

        expect(DragCoordinator.resolveSourceOwnership(headerZone)).toBe('group-a');
        expect(DragCoordinator.resolveSourceOwnership(lone), 'a registered surface that is the source itself answers for itself').toBeUndefined();
        expect(DragCoordinator.resolveSourceOwnership({sortGroup: 'dock', windowId: 'win-none'}), 'no registered surface: undeclared').toBeUndefined();
        expect(DragCoordinator.resolveSourceOwnership({sortGroup: 'dock', windowId: 'win-a', ownershipId: null}), 'a declared null is not overridden by the registry').toBeNull();

        expect(DragCoordinator.admitsOwnership('group-a', 'group-a')).toBe(true);
        expect(DragCoordinator.admitsOwnership('group-a', 'group-b')).toBe(false);
        expect(DragCoordinator.admitsOwnership('group-a', undefined)).toBe(false);
        expect(DragCoordinator.admitsOwnership('group-a', null)).toBe(false);
        expect(DragCoordinator.admitsOwnership(null, null)).toBe(false);
        expect(DragCoordinator.admitsOwnership(undefined, undefined)).toBe(true);
        expect(DragCoordinator.admitsOwnership(undefined, 'group-a')).toBe(false)
    });

    test('claim seniority holds the winner steady — a later valid claimant cannot steal the hover', () => {
        const source = createSource();

        registerWindow('win-a', 0,     0, 800, 600);
        registerWindow('win-b', 100, 100, 800, 600);
        registerWindow('win-source', 2000, 0, 400, 400);

        let zoneBAccepts = false;

        // 'workspace-0' sorts lexicographically BEFORE 'workspace-a': if the second move's tie
        // fell to the lexicographic axis, B would win — seniority must dominate the tiebreak.
        const
            zoneA = createZone('workspace-a', 'win-a'),
            zoneB = createZone('workspace-0', 'win-b', {accepts: () => zoneBAccepts});

        DragCoordinator.register(zoneB);
        DragCoordinator.register(zoneA);

        move(source, 300, 300);

        // The coordinator claims on the REAL clock: advance it one millisecond so B's acquisition
        // is strictly younger — in the same-millisecond case the tie falls to the lexicographic
        // axis by contract, which is the arbiter spec's territory, not this witness's.
        const start = Date.now();
        while (Date.now() === start) {/* spin across the millisecond boundary */}

        zoneBAccepts = true;
        move(source, 310, 310);

        const previewIds = calls.filter(([name]) => name === 'move').map(([, id]) => id);

        // A previews on both moves; B never does; no leave — the hover does not flicker
        expect(previewIds).toEqual(['workspace-a', 'workspace-a']);
        expect(calls.filter(([name]) => name === 'leave')).toEqual([])
    });

    test('the winning claimant departing mid-gesture hands over deterministically: leave, then the successor previews', () => {
        const source = createSource();

        registerWindow('win-a', 0,     0, 800, 600);
        registerWindow('win-b', 100, 100, 800, 600);
        registerWindow('win-source', 2000, 0, 400, 400);

        const
            zoneA = createZone('workspace-a', 'win-a'),
            zoneB = createZone('workspace-b', 'win-b');

        DragCoordinator.register(zoneA);
        DragCoordinator.register(zoneB);

        move(source, 300, 300);

        // the winner's window closes under the drag
        DragCoordinator.unregister(zoneA);

        move(source, 310, 310);

        expect(calls.filter(([name]) => name === 'move' || name === 'leave')).toEqual([
            ['move',  'workspace-a', 300, 300],
            ['leave', 'workspace-a'],
            ['move',  'workspace-b', 210, 210]
        ])
    });

    test('NATIVE hover renders CONTINUOUS preview per geometry event — the dwell timer gates only the commit', () => {
        const nativePayloads = [];
        const
            draggedItem = {id: 'tab-1'},
            source      = {
                sortGroup: 'dock',
                windowId : 'win-source',
                getNativeWindowDrag(windowId) {
                    return windowId === 'win-popup' ? {draggedItem, widgetName: 'tab-1'} : null
                },
                async suspendWindowDrag(widgetName) {
                    calls.push(['suspend', widgetName])
                }
            },
            target = createZone('workspace-b', 'win-target');

        const onRemoteDragMove = target.onRemoteDragMove.bind(target);

        target.onRemoteDragMove = payload => {
            nativePayloads.push(payload);
            onRemoteDragMove(payload)
        };

        registerWindow('win-source', 2000,   0, 400, 400);
        registerWindow('win-popup',   500, 500, 300, 200);
        registerWindow('win-target',  400, 400, 400, 300);

        DragCoordinator.register(source);
        DragCoordinator.register(target);

        // two geometry events while the popup's corner anchor (508, 508) sits over the target
        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});
        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        // preview rendered per event, BEFORE any dwell elapsed; nothing committed
        expect(calls.filter(([name]) => name === 'move').length).toBe(2);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([]);
        expect(nativePayloads).toHaveLength(2);
        expect(nativePayloads.every(payload => payload.embodyProxy === false)).toBe(true);
        expect(nativePayloads.every(payload => payload.sourceSortZone === source)).toBe(true);

        // the popup leaves the target: the hover ends exact-once (the anchor reads the OUTER rect)
        Object.assign(WindowManager.get('win-popup'), {
            innerRect: new Rectangle(3000, 3000, 300, 200),
            outerRect: new Rectangle(3000, 3000, 300, 200)
        });

        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        expect(calls.filter(([name]) => name === 'leave')).toEqual([['leave', 'workspace-b']]);
        expect(DragCoordinator.nativeHoverTargets.size).toBe(0);

        // the source drag ends (popup no longer carries a drag): the gesture's token dies
        source.getNativeWindowDrag = () => null;

        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        expect(DragCoordinator.nativeClaimArbiters.size).toBe(0)
    });

    test('the NATIVE drop anchor is the popup\'s outer top-left corner, inset — the centre is the one point the popup always hides', () => {
        const
            nativePayloads = [],
            draggedItem    = {id: 'tab-1'},
            source         = {
                sortGroup: 'dock',
                windowId : 'win-source',
                getNativeWindowDrag(windowId) {
                    return windowId === 'win-popup' ? {draggedItem, widgetName: 'tab-1'} : null
                },
                async suspendWindowDrag(widgetName) {
                    calls.push(['suspend', widgetName])
                }
            },
            // the popup's content (inner) sits 30px below and 4px right of its frame (outer)
            popupInner = new Rectangle(504, 530, 300, 200),
            popupOuter = new Rectangle(500, 500, 308, 234),
            centreOnly = createZone('workspace-centre', 'win-centre'),
            cornerOnly = createZone('workspace-corner', 'win-corner'),
            oldInset   = DragCoordinator.nativeWindowDropAnchorInset,
            lastMove   = () => calls.filter(([name]) => name === 'move').at(-1);

        cornerOnly.onRemoteDragMove = payload => {
            nativePayloads.push(payload);
            calls.push(['move', 'workspace-corner', payload.localX, payload.localY])
        };

        registerWindow('win-source', 2000,   0, 400, 400);
        registerWindow('win-popup',     0,   0,   0,   0, {innerRect: popupInner, outerRect: popupOuter});
        registerWindow('win-centre',  600, 600, 400, 300); // covers the popup's centre (654, 630), not its corner
        registerWindow('win-corner',  400, 400, 180, 180); // covers the corner anchor (508, 508), not the centre

        DragCoordinator.register(source);
        DragCoordinator.register(centreOnly);
        DragCoordinator.register(cornerOnly);

        try {
            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

            // the corner's window previews, in ITS local space; the window under the centre is never asked
            expect(calls.filter(([name]) => name === 'move')).toEqual([['move', 'workspace-corner', 108, 108]]);
            expect(nativePayloads).toHaveLength(1);

            const [payload] = nativePayloads;

            // the proxy stands where the popup's CONTENT is, in the target's space, and the offsets
            // locate the anchor inside it — 4px in from the frame, 22px above the content
            expect(payload.proxyRect).toMatchObject({x: 104, y: 130, width: 300, height: 200});
            expect([payload.offsetX, payload.offsetY]).toEqual([4, -22]);

            // the inset is the config: at 0 the anchor is the frame's exact corner
            DragCoordinator.nativeWindowDropAnchorInset = 0;
            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});
            expect(lastMove()).toEqual(['move', 'workspace-corner', 100, 100]);

            // without an outer rect the content rect's corner anchors, inset again
            DragCoordinator.nativeWindowDropAnchorInset = oldInset;
            WindowManager.get('win-popup').outerRect = null;
            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});
            expect(lastMove()).toEqual(['move', 'workspace-corner', 112, 138])
        } finally {
            DragCoordinator.nativeWindowDropAnchorInset = oldInset
        }
    });

    test('a native source may name its physical popup separately so the originating main participation can claim', () => {
        const
            draggedItem = {id: 'terminal'},
            main        = createZone('workspace-main', 'win-main');

        main.getNativeWindowDrag = windowId => windowId === 'win-popup'
            ? {
                draggedItem,
                sourceWindowId: 'win-popup',
                widgetName    : 'terminal'
            }
            : null;

        registerWindow('win-main',  0,   0, 1000, 800);
        registerWindow('win-popup', 200, 200,  300, 200);
        DragCoordinator.register(main);

        const source    = DragCoordinator.getNativeWindowDragSource('win-popup'),
              candidate = DragCoordinator.getNativeWindowDropCandidate({windowId: 'win-popup'}, source);

        expect(source).toMatchObject({
            draggedItem,
            sourceSortZone: main,
            sourceWindowId: 'win-popup'
        });
        expect(candidate?.targetSortZone).toBe(main);
        expect(candidate?.targetWindowId).toBe('win-main');

        main.getNativeWindowDrag = () => ({draggedItem, widgetName: 'terminal'});

        expect(DragCoordinator.getNativeWindowDropCandidate(
            {windowId: 'win-popup'},
            DragCoordinator.getNativeWindowDragSource('win-popup')
        )).toBeNull()
    });

    /**
     * A native-titlebar drop settles while the user may still hold the popup's titlebar. A window
     * the OS is dragging can neither hand focus to the target nor be moved, so the strict park's
     * first answer is a refusal. There is no release event on this path: a park that finally
     * succeeds is how the coordinator learns the user let go, so a refusal must retry, not end.
     */
    test('a refused strict native park RETRIES with the disposition backoff and commits once the park succeeds', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [],
            source      = {
                getNativeWindowDrag: () => ({draggedItem, embodyNativeHover: true, sourceWindowId: 'win-popup', widgetName: 'terminal'}),
                onRemoteDropOut() {
                    order.push('retire');
                    return true
                },
                resumeWindowDrag: () => true,
                sortGroup       : 'dock',
                suspendWindowDrag() {
                    order.push('suspend');
                    // The OS still holds the popup for the first two attempts; the third parks.
                    return order.filter(entry => entry === 'suspend').length >= 3
                },
                windowId: 'win-main'
            },
            target = {
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: async () => true,
                onRemoteDragLeave() {
                    order.push('leave')
                },
                onRemoteDragMove(payload) {
                    order.push(payload.embodyProxy ? 'embody' : 'preview');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                }
            },
            candidate = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff = DragCoordinator.nativeWindowDropHandoffMs,
            oldRetry   = DragCoordinator.nativeWindowDispositionRetryMs;

        DragCoordinator.nativeWindowDropHandoffMs      = 0;
        DragCoordinator.nativeWindowDispositionRetryMs = 5;
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            // The first refusal schedules a retry instead of ending the gesture.
            expect(order).toEqual(['suspend']);
            expect(candidate.phase, 'the candidate waits in park-retry').toBe('park-retry');
            expect(candidate.parkAttempts).toBe(1);
            expect(DragCoordinator.nativeWindowDropCandidates.get('win-popup'), 'the candidate is retained').toBe(candidate);

            await expect.poll(() => order.includes('retire'), {timeout: 2000, intervals: [10, 25, 50]}).toBe(true);

            expect(order).toEqual(['suspend', 'suspend', 'suspend', 'embody', 'commit', 'retire']);
            expect(candidate.parkAttempts, 'two refusals were counted before the park succeeded').toBe(2);
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup'), 'the committed gesture releases its candidate').toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs      = oldHandoff;
            DragCoordinator.nativeWindowDispositionRetryMs = oldRetry
        }
    });

    test('the park retry is BOUNDED — past the limit the gesture ends exactly as a refusal did before retries', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [],
            source      = {
                getNativeWindowDrag: () => ({draggedItem, embodyNativeHover: true, sourceWindowId: 'win-popup', widgetName: 'terminal'}),
                sortGroup          : 'dock',
                suspendWindowDrag() {
                    order.push('suspend');
                    return false
                },
                windowId: 'win-main'
            },
            target = {
                acceptsRemoteDrag: () => true,
                onRemoteDragLeave() {
                    order.push('leave')
                },
                onRemoteDragMove: () => ({itemId: 'terminal'}),
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                }
            },
            candidate = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldLimit = DragCoordinator.nativeWindowParkRetryLimit,
            oldRetry = DragCoordinator.nativeWindowDispositionRetryMs;

        DragCoordinator.nativeWindowParkRetryLimit     = 3;
        DragCoordinator.nativeWindowDispositionRetryMs = 5;
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);
        DragCoordinator.nativeHoverTargets.set('win-popup', target);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);
            await expect.poll(() => order.includes('leave'), {timeout: 2000, intervals: [10, 25, 50]}).toBe(true);

            // the first attempt plus the limit's worth of RETRIES (three), then the hover ends
            expect(order, 'one attempt, three retries, then the hover ends').toEqual(['suspend', 'suspend', 'suspend', 'suspend', 'leave']);
            expect(order).not.toContain('commit');
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup'), 'the exhausted gesture releases its candidate').toBe(false);
            expect(DragCoordinator.nativeHoverTargets.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowParkRetryLimit     = oldLimit;
            DragCoordinator.nativeWindowDispositionRetryMs = oldRetry
        }
    });

    test('a source geometry update during park-retry REPLACES the candidate and clears the pending retry', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [],
            source      = {
                getNativeWindowDrag: windowId => windowId === 'win-popup'
                    ? {draggedItem, embodyNativeHover: true, sourceWindowId: 'win-popup', widgetName: 'terminal'}
                    : null,
                sortGroup: 'dock',
                suspendWindowDrag() {
                    order.push('suspend');
                    return false
                },
                windowId: 'win-source'
            },
            target = {
                acceptsRemoteDrag: () => true,
                onRemoteDragLeave() {
                    order.push('leave')
                },
                onRemoteDragMove(payload) {
                    order.push(payload.embodyProxy ? 'embody' : 'preview');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                },
                sortGroup: 'dock',
                windowId : 'win-target'
            },
            oldRetry = DragCoordinator.nativeWindowDispositionRetryMs;

        registerWindow('win-source', 2000,   0, 400, 400);
        registerWindow('win-popup',   500, 500, 300, 200);
        registerWindow('win-target',  400, 400, 400, 300); // covers the popup's corner anchor (508, 508)

        DragCoordinator.register(source);
        DragCoordinator.register(target);
        DragCoordinator.nativeWindowDispositionRetryMs = 40;

        try {
            // One geometry event over the target creates the candidate; force its commit now.
            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

            const stale = DragCoordinator.nativeWindowDropCandidates.get('win-popup');

            expect(stale, 'the hover produced a retained candidate').toBeTruthy();
            clearTimeout(stale.timeoutId);
            await DragCoordinator.commitNativeWindowDrop('win-popup', stale);

            expect(stale.phase).toBe('park-retry');
            expect(order.filter(entry => entry === 'suspend')).toHaveLength(1);

            // The user moved on: a new geometry event replaces the retained candidate...
            DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

            const fresh = DragCoordinator.nativeWindowDropCandidates.get('win-popup');

            expect(fresh, 'the geometry event installs a new candidate').toBeTruthy();
            expect(fresh).not.toBe(stale);
            expect(stale.cancelled, 'the replaced candidate is cancelled').toBe(true);

            // ...and the stale retry never fires: no second park attempt within its scheduled delay.
            await new Promise(resolve => setTimeout(resolve, 120));
            expect(order.filter(entry => entry === 'suspend'), 'the pending retry died with its candidate').toHaveLength(1)
        } finally {
            DragCoordinator.clearNativeWindowDropCandidate('win-popup');
            DragCoordinator.endNativeGesture('win-popup');
            DragCoordinator.unregister(source);
            DragCoordinator.unregister(target);
            DragCoordinator.nativeWindowDispositionRetryMs = oldRetry
        }
    });

    test('native embodiment is retained before semantic commit, then target commit precedes source retirement', async () => {
        let resolveRenderer;

        const
            draggedItem     = {id: 'terminal'},
            order           = [],
            rendererSettled = new Promise(resolve => resolveRenderer = resolve),
            source          = {
                getNativeWindowDrag: () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                onRemoteDropOut() {
                    order.push('retire');
                    return true
                },
                resumeWindowDrag() {
                    order.push('resume');
                    return true
                },
                sortGroup: 'dock',
                suspendWindowDrag() {
                    order.push('suspend');
                    return true
                },
                windowId: 'win-main'
            },
            target      = {
                acceptsRemoteDrag: () => true,
                awaitRemoteDragEmbodiment() {
                    order.push('await-renderer');
                    return rendererSettled
                },
                onRemoteDragLeave() {
                    order.push('leave')
                },
                onRemoteDragMove(payload) {
                    order.push(payload.embodyProxy ? 'embody' : 'preview');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                }
            },
            candidate   = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff = DragCoordinator.nativeWindowDropHandoffMs;

        DragCoordinator.nativeWindowDropHandoffMs = 20;
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        try {
            const committing = DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(order).toEqual(['suspend', 'embody', 'await-renderer']);
            expect(DragCoordinator.nativeWindowDropCandidates.get('win-popup')).toBe(candidate);

            await new Promise(resolve => setTimeout(resolve, 25));
            expect(order, 'the handoff timer cannot start before renderer settlement')
                .toEqual(['suspend', 'embody', 'await-renderer']);

            resolveRenderer(true);
            await committing;

            expect(order).toEqual(['suspend', 'embody', 'await-renderer', 'commit', 'retire']);
            expect(order.indexOf('commit')).toBeLessThan(order.indexOf('retire'));
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs = oldHandoff
        }
    });

    test('native model refusal restores the target before the physical popup and never retires it', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [],
            source      = {
                getNativeWindowDrag: () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                onRemoteDropOut() {
                    order.push('retire')
                },
                resumeWindowDrag() {
                    order.push('source-restored');
                    return true
                },
                suspendWindowDrag() {
                    order.push('suspend');
                    return true
                }
            },
            target      = {
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: () => true,
                onRemoteDragLeave() {},
                onRemoteDragMove() {
                    order.push('embody');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('target-restored');
                    return null
                }
            },
            candidate   = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff = DragCoordinator.nativeWindowDropHandoffMs;

        DragCoordinator.nativeWindowDropHandoffMs = 0;
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            expect(order).toEqual(['suspend', 'embody', 'target-restored', 'source-restored']);
            expect(order).not.toContain('retire');
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs = oldHandoff
        }
    });

    test('candidate cancellation during async native parking compensates the exact source and never embodies', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [];
        let resolveSuspend;

        const
            source    = {
                getNativeWindowDrag: () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                resumeWindowDrag() {
                    order.push('source-restored');
                    return true
                },
                suspendWindowDrag() {
                    order.push('suspend');
                    return new Promise(resolve => resolveSuspend = resolve)
                }
            },
            target    = {
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: () => true,
                onRemoteDragLeave() {
                    order.push('leave')
                },
                onRemoteDragMove() {
                    order.push('embody');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                }
            },
            candidate = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            };

        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        const committing = DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

        await Promise.resolve();

        DragCoordinator.clearNativeWindowDropCandidate('win-popup');
        resolveSuspend(true);
        await committing;

        expect(order).toEqual(['suspend', 'source-restored']);
        expect(order).not.toContain('embody');
        expect(order).not.toContain('commit');
        expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
    });

    test('a throwing native park releases its candidate instead of freezing future geometry', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [],
            source      = {
                getNativeWindowDrag: () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                suspendWindowDrag() {
                    order.push('suspend');
                    throw new Error('native park failed')
                }
            },
            target      = {
                acceptsRemoteDrag: () => true,
                onRemoteDragMove() {
                    order.push('embody')
                }
            },
            candidate   = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            };

        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        await expect(DragCoordinator.commitNativeWindowDrop('win-popup', candidate))
            .rejects.toThrow('native park failed');

        expect(order).toEqual(['suspend']);
        expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
    });

    test('a strict native retirement refusal retries only the physical close, never the target commit', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [];
        let retireCalls = 0;

        const
            source    = {
                getNativeWindowDrag: () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                onRemoteDropOut() {
                    order.push('retire');
                    return ++retireCalls > 1
                },
                resumeWindowDrag() {
                    order.push('resume');
                    return true
                },
                suspendWindowDrag() {
                    order.push('suspend');
                    return true
                }
            },
            target    = {
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: () => true,
                onRemoteDragLeave() {},
                onRemoteDragMove() {
                    order.push('embody');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                }
            },
            candidate = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff = DragCoordinator.nativeWindowDropHandoffMs,
            oldRetry   = DragCoordinator.nativeWindowDispositionRetryMs;

        DragCoordinator.nativeWindowDropHandoffMs      = 0;
        DragCoordinator.nativeWindowDispositionRetryMs = 20;
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            expect(order).toEqual(['suspend', 'embody', 'commit', 'retire']);
            expect(DragCoordinator.nativeWindowDropCandidates.get('win-popup'),
                'strict false retains the exact popup settlement generation').toBe(candidate);

            await expect.poll(() => retireCalls, {timeout: 1000}).toBe(2);

            expect(order).toEqual(['suspend', 'embody', 'commit', 'retire', 'retire']);
            expect(order.filter(value => value === 'commit')).toHaveLength(1);
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs      = oldHandoff;
            DragCoordinator.nativeWindowDispositionRetryMs = oldRetry
        }
    });

    test('a committed close retry survives same-participation unregister and rebinds to its successor', async () => {
        const
            draggedItem         = {id: 'terminal'},
            order               = [],
            createParticipation = ({successor=false}={}) => ({
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: () => true,
                getNativeWindowDrag      : () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                onRemoteDragLeave() {},
                onRemoteDragMove() {
                    order.push('embody');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    return {type: 'addTab'}
                },
                onRemoteDropOut() {
                    order.push(successor ? 'retire-successor' : 'retire-original');
                    return successor
                },
                resumeWindowDrag() {
                    order.push('resume');
                    return true
                },
                sortGroup     : 'dock-main',
                stableTargetId: 'workspace-main',
                suspendWindowDrag() {
                    order.push('suspend');
                    return true
                },
                windowId: 'win-main'
            }),
            original    = createParticipation(),
            successor   = createParticipation({successor: true}),
            candidate   = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : original,
                sourceWindowId   : 'win-popup',
                targetSortZone   : original,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff  = DragCoordinator.nativeWindowDropHandoffMs,
            oldRetry    = DragCoordinator.nativeWindowDispositionRetryMs;

        DragCoordinator.nativeWindowDropHandoffMs      = 0;
        DragCoordinator.nativeWindowDispositionRetryMs = 10000;
        DragCoordinator.register(original);
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            expect(order).toEqual(['suspend', 'embody', 'commit', 'retire-original']);
            expect(candidate.phase).toBe('settling-committed');

            DragCoordinator.unregister(original);

            expect(DragCoordinator.nativeWindowDropCandidates.get('win-popup')).toBe(candidate);
            expect(order).not.toContain('resume');

            DragCoordinator.register(successor);

            expect(candidate.sourceSortZone).toBe(successor);
            expect(candidate.targetSortZone).toBe(successor);
            await expect(DragCoordinator.settleNativeWindowDisposition(
                'win-popup',
                candidate,
                true
            )).resolves.toBe(true);

            expect(order).toEqual([
                'suspend',
                'embody',
                'commit',
                'retire-original',
                'retire-successor'
            ]);
            expect(order.filter(value => value === 'commit')).toHaveLength(1);
            expect(order).not.toContain('resume');
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs      = oldHandoff;
            DragCoordinator.nativeWindowDispositionRetryMs = oldRetry
        }
    });

    test('same-object registration refresh during commit preserves the committed terminal', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [],
            zone        = {
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: () => true,
                getNativeWindowDrag      : () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                onRemoteDragLeave() {
                    order.push('leave')
                },
                onRemoteDragMove() {
                    order.push('embody');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('commit');
                    DragCoordinator.unregister(zone);
                    DragCoordinator.register(zone);
                    return {type: 'addTab'}
                },
                onRemoteDropOut() {
                    order.push('retire');
                    return true
                },
                resumeWindowDrag() {
                    order.push('restore');
                    return true
                },
                sortGroup     : 'dock-main',
                stableTargetId: 'workspace-main',
                suspendWindowDrag() {
                    order.push('suspend');
                    return true
                },
                windowId: 'win-main'
            },
            candidate = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : zone,
                sourceWindowId   : 'win-popup',
                targetSortZone   : zone,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff = DragCoordinator.nativeWindowDropHandoffMs;

        DragCoordinator.nativeWindowDropHandoffMs = 0;
        DragCoordinator.register(zone);
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);
        DragCoordinator.nativeHoverTargets.set('win-popup', zone);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            expect(order).toEqual(['suspend', 'embody', 'commit', 'retire']);
            expect(order).not.toContain('restore');
            expect(order).not.toContain('leave');
            expect(DragCoordinator.sortZones.get('dock-main')?.get('win-main')).toBe(zone);
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs = oldHandoff
        }
    });

    test('a strict native restore refusal retains and retries the exact parked source generation', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [];
        let restoreCalls = 0;

        const
            source    = {
                getNativeWindowDrag: () => ({
                    draggedItem,
                    embodyNativeHover: true,
                    sourceWindowId   : 'win-popup',
                    widgetName       : 'terminal'
                }),
                onRemoteDropOut() {
                    order.push('retire');
                    return true
                },
                resumeWindowDrag() {
                    order.push('restore');
                    return ++restoreCalls > 1
                },
                suspendWindowDrag() {
                    order.push('suspend');
                    return true
                }
            },
            target    = {
                acceptsRemoteDrag        : () => true,
                awaitRemoteDragEmbodiment: () => true,
                onRemoteDragLeave() {},
                onRemoteDragMove() {
                    order.push('embody');
                    return {itemId: 'terminal'}
                },
                onRemoteDrop() {
                    order.push('target-refused');
                    return null
                }
            },
            candidate = {
                draggedItem,
                embodyNativeHover: true,
                localX           : 20,
                localY           : 30,
                offsetX          : 10,
                offsetY          : 10,
                proxyRect        : {},
                sourceSortZone   : source,
                sourceWindowId   : 'win-popup',
                targetSortZone   : target,
                targetWindowId   : 'win-main',
                widgetName       : 'terminal'
            },
            oldHandoff = DragCoordinator.nativeWindowDropHandoffMs,
            oldRetry   = DragCoordinator.nativeWindowDispositionRetryMs;

        DragCoordinator.nativeWindowDropHandoffMs      = 0;
        DragCoordinator.nativeWindowDispositionRetryMs = 20;
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);

        try {
            await DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            expect(order).toEqual(['suspend', 'embody', 'target-refused', 'restore']);
            expect(DragCoordinator.nativeWindowDropCandidates.get('win-popup')).toBe(candidate);

            await expect.poll(() => restoreCalls, {timeout: 1000}).toBe(2);

            expect(order).toEqual(['suspend', 'embody', 'target-refused', 'restore', 'restore']);
            expect(order).not.toContain('retire');
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs      = oldHandoff;
            DragCoordinator.nativeWindowDispositionRetryMs = oldRetry
        }
    });

    test('same-object target disconnect cancels async settlement exact-once and restores the source generation', async () => {
        const
            draggedItem = {id: 'terminal'},
            order       = [];
        let resolveDrop, signalDrop;

        const dropStarted = new Promise(resolve => signalDrop = resolve),
              zone        = {
                  acceptsRemoteDrag        : () => true,
                  awaitRemoteDragEmbodiment: () => true,
                  getNativeWindowDrag      : () => ({
                      draggedItem,
                      embodyNativeHover: true,
                      sourceWindowId   : 'win-popup',
                      widgetName       : 'terminal'
                  }),
                  onRemoteDragLeave() {
                      order.push('leave')
                  },
                  onRemoteDragMove() {
                      order.push('embody');
                      return {itemId: 'terminal'}
                  },
                  onRemoteDrop() {
                      order.push('target-settling');
                      signalDrop();
                      return new Promise(resolve => resolveDrop = resolve)
                  },
                  onRemoteDropOut() {
                      order.push('retire');
                      return true
                  },
                  resumeWindowDrag() {
                      order.push('restore');
                      return true
                  },
                  sortGroup: 'dock',
                  suspendWindowDrag() {
                      order.push('suspend');
                      return true
                  },
                  windowId: 'win-main'
              },
              candidate = {
                  draggedItem,
                  embodyNativeHover: true,
                  localX           : 20,
                  localY           : 30,
                  offsetX          : 10,
                  offsetY          : 10,
                  proxyRect        : {},
                  sourceSortZone   : zone,
                  sourceWindowId   : 'win-popup',
                  targetSortZone   : zone,
                  targetWindowId   : 'win-main',
                  widgetName       : 'terminal'
              },
              oldHandoff = DragCoordinator.nativeWindowDropHandoffMs;

        DragCoordinator.nativeWindowDropHandoffMs = 0;
        DragCoordinator.register(zone);
        DragCoordinator.nativeWindowDropCandidates.set('win-popup', candidate);
        DragCoordinator.nativeHoverTargets.set('win-popup', zone);
        DragCoordinator.nativeClaimArbiters.set('win-popup', {
            reset() {
                order.push('reset')
            }
        });

        try {
            const settling = DragCoordinator.commitNativeWindowDrop('win-popup', candidate);

            await dropStarted;
            DragCoordinator.unregister(zone);
            resolveDrop({type: 'addTab'});
            await settling;

            expect(order).toEqual([
                'suspend',
                'embody',
                'target-settling',
                'leave',
                'reset',
                'restore'
            ]);
            expect(order.filter(value => value === 'leave')).toHaveLength(1);
            expect(order).not.toContain('retire');
            expect(DragCoordinator.nativeWindowDropCandidates.has('win-popup')).toBe(false);
            expect(DragCoordinator.nativeClaimArbiters.has('win-popup')).toBe(false);
            expect(DragCoordinator.nativeHoverTargets.has('win-popup')).toBe(false)
        } finally {
            DragCoordinator.nativeWindowDropHandoffMs = oldHandoff
        }
    });

    test('conversion resolver receives one live INNER-viewport frame and owns engagement without legacy suspension', () => {
        const
            frames       = [],
            movePayloads = [];
        const source = createSource();
        const target = createZone('workspace-a', 'win-a');

        const onRemoteDragMove = target.onRemoteDragMove.bind(target);

        target.onRemoteDragMove = payload => {
            movePayloads.push(payload);
            onRemoteDragMove(payload)
        };

        source.isWindowDragging = true;
        source.resolveRemoteDragTransition = frame => {
            frames.push(frame);
            return {
                commitEligible: true,
                engage        : true,
                retain        : false,
                sourceRect    : {height: 520, width: 740, x: frame.logicalSourceRect.x, y: frame.logicalSourceRect.y}
            }
        };

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a', 80, 80, 440, 360, {
            innerRect: new Rectangle(100, 120, 400, 300),
            outerRect: new Rectangle(80, 80, 440, 360)
        });
        DragCoordinator.register(target);

        move(source, 200, 200);

        expect(frames[0]).toMatchObject({
            pointerInTarget  : true,
            logicalSourceRect: {x: 190, y: 190, width: 100, height: 60},
            targetId         : 'workspace-a',
            targetRect       : {x: 100, y: 120, width: 400, height: 300},
            targetWindowId   : 'win-a'
        });
        expect(calls.filter(([name]) => name === 'suspend')).toEqual([]);
        expect(calls.filter(([name]) => name === 'move')).toHaveLength(1);
        expect(movePayloads[0]).toMatchObject({
            embodyProxy   : true,
            proxyRect     : {height: 520, width: 740, x: 90, y: 70},
            sourceSortZone: source
        });
        expect(DragCoordinator.activeSourceZone).toBe(source);
        expect(DragCoordinator.activeTargetCommitEligible).toBe(true);
        expect(DragCoordinator.activeTransitionOwned).toBe(true);

        WindowManager.get('win-a').innerRect = new Rectangle(110, 130, 360, 260);
        move(source, 210, 210, {replayAfterTransition: true});

        expect(frames[1]).toMatchObject({
            replayAfterTransition: true,
            targetRect           : {x: 110, y: 130, width: 360, height: 260}
        })
    });

    test('async, throwing, and malformed transition decisions fail closed before preview', () => {
        const variants = [
            () => Promise.resolve({commitEligible: true, engage: true}),
            () => { throw new Error('resolver failed') },
            () => ({})
        ];

        for (const resolver of variants) {
            resetCoordinator();
            clearWindows();
            calls = [];

            const source = createSource();
            const target = createZone('workspace-a', 'win-a');

            source.isWindowDragging = true;
            source.resolveRemoteDragTransition = resolver;

            registerWindow('win-source', 2000, 0, 400, 400);
            registerWindow('win-a', 0, 0, 800, 600);
            DragCoordinator.register(target);

            move(source, 300, 300);

            expect(calls.filter(([name]) => name === 'move')).toEqual([]);
            expect(calls.filter(([name]) => name === 'suspend')).toEqual([]);
            expect(DragCoordinator.activeTargetZone).toBeNull()
        }
    });

    test('a resolver failure after engagement cancels the source conversion before clearing preview', () => {
        let   fail   = false;
        const source = createSource();
        const target = createZone('workspace-a', 'win-a');

        source.isWindowDragging = true;
        source.resolveRemoteDragTransition = () => {
            if (fail) throw new Error('frame authority lost');

            return {commitEligible: true, engage: true, retain: false}
        };
        source.cancelVesselConversion = () => calls.push(['cancel-conversion']);

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a', 0, 0, 800, 600);
        DragCoordinator.register(target);

        move(source, 300, 300);
        fail = true;
        move(source, 310, 310);

        expect(calls.filter(([name]) => ['cancel-conversion', 'leave'].includes(name))).toEqual([
            ['cancel-conversion'], ['leave', 'workspace-a']
        ]);
        expect(DragCoordinator.activeTargetZone).toBeNull();
        expect(DragCoordinator.activeTargetCommitEligible).toBe(false)
    });

    test('visual claim grace can retain hover, but release after raw loss cannot commit', () => {
        let   rawClaim = true;
        const source   = createSource();
        const target   = createZone('workspace-a', 'win-a', {accepts: () => rawClaim});

        source.isWindowDragging = true;
        source.resolveRemoteDragTransition = frame => frame.pointerInTarget
            ? {commitEligible: true, engage: true, retain: false}
            : {commitEligible: false, engage: true, retain: true};
        source.resetVesselConversion = () => calls.push(['reset']);

        registerWindow('win-source', 2000, 0, 400, 400);
        registerWindow('win-a', 0, 0, 800, 600);
        DragCoordinator.register(target);

        move(source, 300, 300);
        rawClaim = false;
        move(source, 310, 310);

        expect(DragCoordinator.activeTargetZone).toBe(target);
        expect(DragCoordinator.activeTargetCommitEligible).toBe(false);
        expect(calls.filter(([name]) => name === 'leave')).toEqual([]);

        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        expect(calls.filter(([name]) => name === 'drop')).toEqual([]);
        expect(calls.filter(([name]) => name === 'dropOut')).toEqual([]);
        expect(calls.filter(([name]) => name === 'leave')).toEqual([['leave', 'workspace-a']]);
        expect(calls.filter(([name]) => name === 'reset')).toEqual([['reset']])
    })

    test('the claim trace records each conjunct separately, so a refusal is distinguishable from a zone never asked', () => {
        // `&&` short-circuits: a nullish inner rect never calls `acceptsRemoteDrag`. A diagnostic
        // that records only the zone's answer cannot tell those apart, which is the gap that cost
        // five refuted hypotheses.
        registerWindow('win-source', 0, 0, 800, 600);
        registerWindow('win-target', 800, 0, 600, 520);

        const source = createZone('workspace-a', 'win-source'),
              target = createZone('workspace-b', 'win-target', {accepts: () => false});

        DragCoordinator.register(source);
        DragCoordinator.register(target);

        move(source, 1100, 260);

        const entry = DragCoordinator.claimTrace.at(-1);

        expect(entry.outcome).toBe('no-claim');
        expect(entry.groupSize).toBe(2);

        const candidate = entry.candidates.find(item => item.stableTargetId === 'workspace-b');

        // The zone WAS asked and said no — inner resolved, the point is inside, `accepts` is false.
        expect(candidate).toMatchObject({innerResolved: true, intersects: true, accepts: false});
        expect(entry.candidates.find(item => item.windowId === 'win-source').skipped).toBe('source-or-excluded')
    });

    test('a zone NEVER ASKED records `accepts: null`, which is not the `false` a refusal records', () => {
        // The other half of the conjunct pair. The refusal arm above proves `false`; without this one
        // the suite passes even if never-asked collapsed into refusal, which is the exact confusion
        // the trace exists to end.
        registerWindow('win-source', 0, 0, 800, 600);
        registerWindow('win-target', 800, 0, 600, 520);

        const asked  = [],
              source = createZone('workspace-a', 'win-source'),
              target = createZone('workspace-b', 'win-target', {accepts: () => { asked.push(1); return true }});

        DragCoordinator.register(source);
        DragCoordinator.register(target);

        // Inside the SOURCE window, so the target's inner rect resolves but does not intersect.
        move(source, 400, 260);

        const candidate = DragCoordinator.claimTrace.at(-1).candidates.find(item => item.stableTargetId === 'workspace-b');

        expect(candidate).toMatchObject({innerResolved: true, intersects: false, accepts: null});
        // The distinction is only real if the handler genuinely never ran — asserting the recorded
        // value alone would pass against an implementation that called it and discarded the answer.
        expect(asked).toEqual([]);
        expect(candidate.accepts).not.toBe(false)
    });

    test('a zone WITH a stable id but no accepts handler is not reported as having no identity', () => {
        // One label for two causes sent a reader hunting for a missing id that is right there.
        registerWindow('win-source', 0, 0, 800, 600);
        registerWindow('win-target', 800, 0, 600, 520);

        const source = createZone('workspace-a', 'win-source'),
              target = createZone('workspace-b', 'win-target');

        delete target.acceptsRemoteDrag;

        DragCoordinator.register(source);
        DragCoordinator.register(target);

        move(source, 1100, 260);

        const candidate = DragCoordinator.claimTrace.at(-1).candidates.find(item => item.windowId === 'win-target');

        expect(candidate.skipped).toBe('no-accepts-handler');
        expect(candidate.stableTargetId).toBe('workspace-b')
    });

    test('retained entries stay attributable to the gesture that produced them, across gestures', () => {
        // The ring is a session tail by design, so a read spans gestures. That is only safe because
        // every entry stamps the token live; without it the second read is an unattributable mixture.
        registerWindow('win-source', 0, 0, 800, 600);
        registerWindow('win-target', 800, 0, 600, 520);

        const source = createZone('workspace-a', 'win-source'),
              target = createZone('workspace-b', 'win-target', {accepts: () => false});

        DragCoordinator.register(source);
        DragCoordinator.register(target);

        move(source, 1100, 260);

        const firstToken = DragCoordinator.claimTrace.at(-1).gestureToken;

        // The real gesture terminal, not a hand-reset: `onDragEnd` retires the arbiter, so the next
        // move mints a fresh token. Reaching into `pointerClaimArbiter` would prove the assertion
        // against a boundary production never crosses.
        DragCoordinator.onDragEnd({draggedItem: {id: 'tab-1'}, sourceSortZone: source});

        move(source, 1120, 280);

        const secondToken = DragCoordinator.claimTrace.at(-1).gestureToken;

        expect(firstToken).toBeTruthy();
        expect(secondToken).toBeTruthy();
        expect(secondToken).not.toBe(firstToken);

        // Both gestures are still readable, and each entry says which one it belongs to — the first
        // gesture's records were not retro-labelled with the second's token.
        expect(DragCoordinator.claimTrace.filter(e => e.gestureToken === firstToken).length).toBeGreaterThan(0);
        expect(DragCoordinator.claimTrace.filter(e => e.gestureToken === secondToken).length).toBeGreaterThan(0)
    });

    test('an ABSENT sort group is recorded as its own outcome, not as an ordinary no-claim', () => {
        // The group missing and the group yielding nothing are different failures with different
        // repairs, and `resolveClaimedTarget` returns `null` for both.
        registerWindow('win-source', 0, 0, 800, 600);

        const source = createZone('workspace-a', 'win-source');

        DragCoordinator.register(source);
        DragCoordinator.sortZones.clear();

        move(source, 1100, 260);

        expect(DragCoordinator.claimTrace.at(-1)).toMatchObject({outcome: 'group-absent', groupSize: null})
    });

    test('the trace is bounded, so a long gesture cannot accumulate entries without limit', () => {
        registerWindow('win-source', 0, 0, 800, 600);

        const source = createZone('workspace-a', 'win-source');

        DragCoordinator.register(source);

        for (let i = 0; i < DragCoordinator.claimTraceLimit + 25; i++) {
            move(source, 100 + i, 260)
        }

        expect(DragCoordinator.claimTrace.length).toBe(DragCoordinator.claimTraceLimit)
    })
});
