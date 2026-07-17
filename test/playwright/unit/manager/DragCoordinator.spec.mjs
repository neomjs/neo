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
        DragCoordinator.sortZones.clear();
        DragCoordinator.nativeWindowDropCandidates.clear()
    });

    test.afterEach(() => {
        DragCoordinator.activeTargetZone = null;
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
