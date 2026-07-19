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
            draggedItem = {id: 'tab-1'},
            target      = {
                ...createTargetZone(null),
                acceptsRemoteDrag: () => true,
                onRemoteDragMove : async () => {}
            },
            source      = {
                ...createSourceZone(),
                getNativeWindowDrag: () => ({draggedItem}),
                suspendWindowDrag  : async () => {}
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
        expect(calls.some(([name]) => name === 'onRemoteDropOut')).toBe(false)
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
    let DragCoordinator, Rectangle, WindowManager;
    let calls;

    test.beforeAll(async () => {
        DragCoordinator = (await import('../../../../src/manager/DragCoordinator.mjs')).default;
        Rectangle       = (await import('../../../../src/util/Rectangle.mjs')).default;
        WindowManager   = (await import('../../../../src/manager/Window.mjs')).default
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
        DragCoordinator.pointerClaimArbiter = null
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
     */
    function move(source, screenX, screenY) {
        DragCoordinator.onDragMove({
            draggedItem   : {id: 'tab-1', reference: 'tab-1'},
            offsetX       : 10,
            offsetY       : 10,
            proxyRect     : {width: 100, height: 60},
            screenX,
            screenY,
            sourceSortZone: source
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

        registerWindow('win-source', 2000,   0, 400, 400);
        registerWindow('win-popup',   500, 500, 300, 200);
        registerWindow('win-target',  600, 550, 400, 300);

        DragCoordinator.register(source);
        DragCoordinator.register(target);

        // two geometry events while the popup's center (650, 600) sits over the target
        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});
        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        // preview rendered per event, BEFORE any dwell elapsed; nothing committed
        expect(calls.filter(([name]) => name === 'move').length).toBe(2);
        expect(calls.filter(([name]) => name === 'drop')).toEqual([]);

        // the popup leaves the target: the hover ends exact-once
        WindowManager.get('win-popup').innerRect = new Rectangle(3000, 3000, 300, 200);

        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        expect(calls.filter(([name]) => name === 'leave')).toEqual([['leave', 'workspace-b']]);
        expect(DragCoordinator.nativeHoverTargets.size).toBe(0);

        // the source drag ends (popup no longer carries a drag): the gesture's token dies
        source.getNativeWindowDrag = () => null;

        DragCoordinator.onWindowPositionChange({windowId: 'win-popup'});

        expect(DragCoordinator.nativeClaimArbiters.size).toBe(0)
    });

    test('conversion resolver receives one live INNER-viewport frame and owns engagement without legacy suspension', () => {
        const frames = [];
        const source = createSource();
        const target = createZone('workspace-a', 'win-a');

        source.isWindowDragging = true;
        source.resolveRemoteDragTransition = frame => {
            frames.push(frame);
            return {commitEligible: true, engage: true, retain: false}
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
        expect(DragCoordinator.activeSourceZone).toBe(source);
        expect(DragCoordinator.activeTargetCommitEligible).toBe(true);
        expect(DragCoordinator.activeTransitionOwned).toBe(true);

        WindowManager.get('win-a').innerRect = new Rectangle(110, 130, 360, 260);
        move(source, 210, 210);

        expect(frames[1].targetRect).toEqual({x: 110, y: 130, width: 360, height: 260})
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
});
