import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockWorkspaceSetTest'
    },
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}           from '@playwright/test';
import {createDockWorkspaceSet} from '../../../../src/dashboard/DockWorkspaceSet.mjs';

/**
 * @summary The worker-owned `{workspaceId → document}` registry contract (harness docking design
 * record §2.1 / §2.8.3): stable semantic identity in, document truth out, fail-closed everywhere
 * a resolution cannot be proven, and both-or-neither adoption for an atomic transfer's committed
 * pair. Retirement never happens implicitly — the registry outlives any render target.
 */
test.describe('Neo.dashboard.DockWorkspaceSet — the workspace-set registry', () => {
    let set;

    test.beforeEach(() => {
        set = createDockWorkspaceSet()
    });

    /**
     * @param {Object} [document] initial document
     * @returns {Object} `{seams, current}` — accessor seams plus a live document handle
     */
    function createHolder(document = {rootId: 'root', items: []}) {
        const holder = {
            document,
            seams: {
                getDocument: () => holder.document,
                setDocument: next => holder.document = next
            }
        };

        return holder
    }

    test('register → resolve: document truth flows through the owner seam, live', () => {
        const holder = createHolder({rootId: 'root-main'});

        expect(set.register('main', holder.seams)).toBe(true);
        expect(set.has('main')).toBe(true);
        expect(set.ids()).toEqual(['main']);
        expect(set.getDocument('main')).toEqual({rootId: 'root-main'});

        // the seam is LIVE: the owner committing a new document changes the resolution
        holder.document = {rootId: 'root-main', revision: 2};

        expect(set.getDocument('main').revision).toBe(2)
    });

    test('an unknown workspace resolves to null — fail closed, never a guess', () => {
        expect(set.getDocument('never-registered')).toBeNull();
        expect(set.has('never-registered')).toBe(false)
    });

    test('registration validates its inputs: no id, non-string id, or missing accessor → refused', () => {
        expect(set.register('',        {getDocument: () => null})).toBe(false);
        expect(set.register(null,      {getDocument: () => null})).toBe(false);
        expect(set.register(42,        {getDocument: () => null})).toBe(false);
        expect(set.register('no-seam', {})).toBe(false);
        expect(set.register('no-seam')).toBe(false);

        expect(set.size).toBe(0)
    });

    test('re-registering the SAME stable id replaces the seams — a re-embodied vessel starts fresh', () => {
        const
            first  = createHolder({rootId: 'stale'}),
            second = createHolder({rootId: 'fresh'});

        set.register('popup-1', first.seams);
        set.register('popup-1', second.seams);

        expect(set.size).toBe(1);
        expect(set.getDocument('popup-1')).toEqual({rootId: 'fresh'})
    });

    test('adoptTransfer lands the committed pair on BOTH owners', () => {
        const
            main  = createHolder({rootId: 'main-before'}),
            popup = createHolder({rootId: 'popup-before'});

        set.register('main',    main.seams);
        set.register('popup-1', popup.seams);

        const adopted = set.adoptTransfer({
            sourceDocument   : {rootId: 'main-after'},
            sourceWorkspaceId: 'main',
            targetDocument   : {rootId: 'popup-after'},
            targetWorkspaceId: 'popup-1'
        });

        expect(adopted).toBe(true);
        expect(main.document).toEqual({rootId: 'main-after'});
        expect(popup.document).toEqual({rootId: 'popup-after'})
    });

    test('adoptTransfer is both-or-neither: a missing target leaves the source UNTOUCHED', () => {
        const main = createHolder({rootId: 'main-before'});

        set.register('main', main.seams);

        const adopted = set.adoptTransfer({
            sourceDocument   : {rootId: 'main-after'},
            sourceWorkspaceId: 'main',
            targetDocument   : {rootId: 'popup-after'},
            targetWorkspaceId: 'popup-never-registered'
        });

        // the half that COULD land must not: a half-adopted pair is the ownership-tier version
        // of the executor's forbidden half-transferred item
        expect(adopted).toBe(false);
        expect(main.document).toEqual({rootId: 'main-before'})
    });

    test('adoptTransfer refuses a read-only side — an entry without a setter cannot adopt', () => {
        const
            main  = createHolder({rootId: 'main-before'}),
            popup = createHolder({rootId: 'popup-before'});

        set.register('main', main.seams);
        set.register('popup-1', {getDocument: popup.seams.getDocument});

        const adopted = set.adoptTransfer({
            sourceDocument   : {rootId: 'main-after'},
            sourceWorkspaceId: 'main',
            targetDocument   : {rootId: 'popup-after'},
            targetWorkspaceId: 'popup-1'
        });

        expect(adopted).toBe(false);
        expect(main.document).toEqual({rootId: 'main-before'});
        expect(popup.document).toEqual({rootId: 'popup-before'})
    });

    test('adoptTransfer refuses a same-workspace pair and absent documents', () => {
        const main = createHolder();

        set.register('main', main.seams);

        expect(set.adoptTransfer({
            sourceDocument   : {rootId: 'x'},
            sourceWorkspaceId: 'main',
            targetDocument   : {rootId: 'y'},
            targetWorkspaceId: 'main'
        })).toBe(false);

        expect(set.adoptTransfer({
            sourceDocument   : null,
            sourceWorkspaceId: 'main',
            targetDocument   : {rootId: 'y'},
            targetWorkspaceId: 'main'
        })).toBe(false)
    });

    test('retirement is explicit and exact: unregister removes one entry, resolution fails closed afterwards', () => {
        const
            main  = createHolder(),
            popup = createHolder();

        set.register('main',    main.seams);
        set.register('popup-1', popup.seams);

        expect(set.unregister('popup-1')).toBe(true);
        expect(set.unregister('popup-1')).toBe(false);

        expect(set.has('main')).toBe(true);
        expect(set.getDocument('popup-1')).toBeNull();
        expect(set.ids()).toEqual(['main'])
    });

    test('identity is semantic only: the registry answers by workspace id and never consumes window identity', () => {
        const holder = createHolder({rootId: 'root'});

        // a caller passing runtime window identity alongside the seams gains nothing: the entry
        // stores the two accessor seams and the workspace id, full stop — resolution before and
        // after a simulated window swap is byte-identical because no window field participates
        set.register('main', {...holder.seams, windowId: 'win-1'});

        const before = set.getDocument('main');

        // the "window" changes; the registry cannot notice, which IS the assertion
        set.register('main', {...holder.seams, windowId: 'win-99'});

        expect(set.getDocument('main')).toEqual(before);
        expect(set.ids()).toEqual(['main'])
    })
});
