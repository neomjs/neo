import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockPerspectiveStoreTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.DockPerspectiveStore (B6 — the named perspective store)', () => {
    let DockPerspectiveStore, DockZoneModel, store;

    const doc = ids => ({
        schema: 'neo.harness.dockZone.v1',
        root  : 'r',
        items : Object.fromEntries(ids.map(id => [id, {componentRef: id, title: id}])),
        nodes : {r: {type: 'tabs', items: [...ids], activeItemId: ids[0]}}
    });

    const makeLayout = (layoutId, name, ids = ['alpha']) => {
        const {layout, errors} = DockZoneModel.createSavedLayout(doc(ids), {
            layoutId,
            perspectiveName: name,
            title          : `${name} title`
        });

        expect(errors).toEqual([]);
        return layout;
    };

    test.beforeAll(async () => {
        DockPerspectiveStore = (await import('../../../../src/dashboard/DockPerspectiveStore.mjs')).default;
        DockZoneModel        = (await import('../../../../src/dashboard/DockZoneModel.mjs')).default
    });

    test.beforeEach(() => {
        store = Neo.create(DockPerspectiveStore)
    });

    test.afterEach(() => {
        store?.destroy();
        store = null
    });

    test('CRUD round-trip: save → list → load → rename → remove, lifecycle events firing after commit', () => {
        const events = [];

        ['perspectiveSaved', 'perspectiveLoaded', 'perspectiveRenamed', 'perspectiveRemoved'].forEach(name =>
            store.on(name, data => events.push([name, data.name ?? data.to])));

        const saved = store.savePerspective(makeLayout('l-1', 'Coding'));
        expect(saved).toMatchObject({saved: true, layoutId: 'l-1', collision: null});

        expect(store.list()).toEqual([{
            captureScope   : 'window',
            layoutId       : 'l-1',
            perspectiveName: 'Coding',
            revision       : null,
            title          : 'Coding title'
        }]);
        expect(store.exists('Coding')).toBe(true);
        expect(store.exists('l-1')).toBe(true);        // technical key stays addressable
        expect(store.exists('Nope')).toBe(false);

        const loaded = store.loadPerspective('Coding');
        expect(loaded.errors).toEqual([]);
        expect(loaded.layout.perspectiveName).toBe('Coding');
        expect(DockZoneModel.validate(loaded.document)).toEqual([]);   // a restorable primary document
        expect(store.collection.activeLayoutId).toBe('l-1');

        const renamed = store.renamePerspective('Coding', 'Review');
        expect(renamed).toMatchObject({renamed: true, collision: null});
        expect(store.exists('Coding')).toBe(false);
        expect(store.exists('Review')).toBe(true);

        const removed = store.removePerspective('Review');
        expect(removed).toEqual({errors: [], removed: true});
        expect(store.list()).toEqual([]);
        expect(store.collection.activeLayoutId).toBeNull();           // no dangling active pointer

        expect(events).toEqual([
            ['perspectiveSaved',   'Coding'],
            ['perspectiveLoaded',  'Coding'],
            ['perspectiveRenamed', 'Review'],
            ['perspectiveRemoved', 'Review']
        ])
    });

    test('name collision returns the structured choice and saves NOTHING unless the caller decides', () => {
        store.savePerspective(makeLayout('l-1', 'Coding'));

        // a DIFFERENT record wants the same product name
        const verdict = store.savePerspective(makeLayout('l-2', 'Coding', ['beta']));
        expect(verdict.saved).toBe(false);
        expect(verdict.collision).toEqual({holderLayoutId: 'l-1', holderTitle: 'Coding title', name: 'Coding'});
        expect(Object.keys(store.collection.layouts)).toEqual(['l-1']);   // byte-untouched

        // the caller's explicit decision: replace retires the previous holder — one name, one record
        const replaced = store.savePerspective(makeLayout('l-2', 'Coding', ['beta']), {replace: true});
        expect(replaced.saved).toBe(true);
        expect(Object.keys(store.collection.layouts)).toEqual(['l-2']);

        // re-saving your OWN record under its own name is an update, not a dispute
        const selfUpdate = store.savePerspective(makeLayout('l-2', 'Coding', ['gamma']));
        expect(selfUpdate.saved).toBe(true);

        // rename obeys the same contract
        store.savePerspective(makeLayout('l-3', 'Scratch', ['delta']));
        const renameVerdict = store.renamePerspective('Scratch', 'Coding');
        expect(renameVerdict.renamed).toBe(false);
        expect(renameVerdict.collision).toMatchObject({holderLayoutId: 'l-2', name: 'Coding'})
    });

    test('loads migrate legacy v1 records honestly and converge the stored record forward', () => {
        // a legacy record: no perspective fields at all (pre-v2)
        const legacy = {
            dockZone: doc(['alpha']),
            layoutId: 'legacy-1',
            schema  : 'neo.harness.dockLayout.v1',
            title   : 'Legacy'
        };

        // adopt a collection carrying the legacy record as-is
        const {collection, errors} = DockZoneModel.createSavedLayoutCollection([legacy], {});
        expect(errors).toEqual([]);
        store.collection = collection;

        const loaded = store.loadPerspective('legacy-1');
        expect(loaded.errors).toEqual([]);
        // honest migration defaults: v1 could only capture one window's document
        expect(loaded.layout.captureScope).toBe('window');
        expect(loaded.layout.windowFingerprint).toBeNull();

        // the STORED record converged forward too — the migration is not a read-time illusion
        expect(store.collection.layouts['legacy-1'].captureScope).toBe('window')
    });

    test('fail-closed everywhere: invalid saves, unknown loads, missing removes, corrupt collection assignments', () => {
        // an invalid layout never enters
        const bad = store.savePerspective({schema: 'nope'});
        expect(bad.saved).toBe(false);
        expect(bad.errors.length).toBeGreaterThan(0);
        expect(store.collection).toBeNull();

        // unknown name loads/removes are structured errors, never silent
        expect(store.loadPerspective('ghost').errors.join(' ')).toContain('no perspective named');
        expect(store.removePerspective('ghost')).toMatchObject({removed: false});

        // a corrupt collection assignment is rejected; the previous value survives
        store.savePerspective(makeLayout('l-1', 'Coding'));
        const before = JSON.stringify(store.collection);

        store.collection = {schema: 'garbage'};
        expect(JSON.stringify(store.collection)).toBe(before);
        expect(store.lastErrors.length).toBeGreaterThan(0)
    });

    test('the persistence seam passes plain validated JSON both ways and adopts nothing corrupt', async () => {
        const written = [];

        store.persistenceAdapter = {
            read : async () => written[written.length - 1] ?? null,
            write: async payload => written.push(payload)
        };

        // nothing to persist yet — fail-closed, structured
        expect((await store.persist()).persisted).toBe(false);

        store.savePerspective(makeLayout('l-1', 'Coding'));
        const {persisted} = await store.persist();
        expect(persisted).toBe(true);

        // the payload is a PLAIN JSON clone: no functions, no live refs, not the store's own object
        const payload = written[0];
        expect(payload).not.toBe(store.collection);
        expect(JSON.stringify(payload)).toBe(JSON.stringify(store.collection));
        expect(DockZoneModel.findNonJsonValue(payload)).toBeNull();

        // hydrate round-trips...
        const fresh = Neo.create(DockPerspectiveStore, {persistenceAdapter: store.persistenceAdapter});
        expect((await fresh.hydrate()).hydrated).toBe(true);
        expect(fresh.exists('Coding')).toBe(true);

        // ...and a corrupt payload is refused with the store untouched
        written.push({schema: 'garbage'});
        const verdict = await fresh.hydrate();
        expect(verdict.hydrated).toBe(false);
        expect(verdict.errors.length).toBeGreaterThan(0);
        expect(fresh.exists('Coding')).toBe(true);

        fresh.destroy()
    });
});
