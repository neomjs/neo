import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardPerspectiveLibraryTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.dock.persistence.PerspectiveLibrary (B6 — the named perspective store)', () => {
    let WorkspaceDocument, Persistence, PerspectiveLibrary, store;

    const doc = ids => ({
        schema: 'neo.dock.zone.v1',
        root  : 'r',
        items : Object.fromEntries(ids.map(id => [id, {componentRef: id, title: id}])),
        nodes : {r: {type: 'tabs', items: [...ids], activeItemId: ids[0]}}
    });

    const makeLayout = (layoutId, name, ids = ['alpha']) => {
        const {layout, errors} = Persistence.createSavedLayout(doc(ids), {
            layoutId,
            perspectiveName: name,
            title          : `${name} title`
        });

        expect(errors).toEqual([]);
        return layout;
    };

    test.beforeAll(async () => {
        WorkspaceDocument           = (await import('../../../../src/dashboard/dock/model/WorkspaceDocument.mjs')).default;
        Persistence        = (await import('../../../../src/dashboard/dock/model/Persistence.mjs')).default;
        PerspectiveLibrary = (await import('../../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs')).default
    });

    test.beforeEach(() => {
        store = Neo.create(PerspectiveLibrary)
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
        expect(WorkspaceDocument.validate(loaded.document)).toEqual([]);   // a restorable primary document
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

    test('legacy-shaped and old-family records are rejected at the collection boundary — no migration survives', () => {
        // a legacy-SHAPED record: claims the current schema but misses the perspective fields.
        // Under the greenfield cut there is no reader that back-fills defaults; the contract is
        // whole or the record is out.
        const legacyShaped = {
            dockZone: doc(['alpha']),
            layoutId: 'legacy-1',
            schema  : 'neo.dock.layout.v1',
            title   : 'Legacy'
        };

        const shaped = PerspectiveLibrary.createSavedLayoutCollection([legacyShaped], {});
        expect(shaped.collection).toBe(null);
        expect(shaped.errors.join(' ')).toContain('captureScope');

        // an old-FAMILY record fails on the schema string itself (split literal on purpose —
        // the retired family name must survive rename sweeps only here, as the control).
        const oldFamily = {
            ...legacyShaped,
            captureScope     : 'window',
            schema           : ['neo', 'harness', 'dockLayout', 'v1'].join('.'),
            windowFingerprint: null
        };

        const family = PerspectiveLibrary.createSavedLayoutCollection([oldFamily], {});
        expect(family.collection).toBe(null);
        expect(family.errors.join(' ')).toContain('schema')
    });

    test('topology records cannot enter the single-workspace perspective library', () => {
        const topology = Persistence.captureTopologyPerspective({main: doc(['alpha'])}, {
                layoutId       : 'whole-app',
                perspectiveName: 'Whole App',
                title          : 'Whole App'
            }).topology,
            saved = store.savePerspective(topology);

        expect(saved.saved).toBe(false);
        expect(saved.errors.join(' ')).toContain(Persistence.LAYOUT_SCHEMA);
        expect(store.collection).toBeNull();

        const collection = PerspectiveLibrary.createSavedLayoutCollection([topology]);

        expect(collection.collection).toBeNull();
        expect(collection.errors.join(' ')).toContain(Persistence.LAYOUT_SCHEMA)
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
        expect(WorkspaceDocument.findNonJsonValue(payload)).toBeNull();

        // hydrate round-trips...
        const fresh = Neo.create(PerspectiveLibrary, {persistenceAdapter: store.persistenceAdapter});
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

    test('public reads are ISOLATED: getter mutations never reach held state, and persist() revalidates at the boundary', async () => {
        const written = [];
        const events  = [];

        store.persistenceAdapter = {read: async () => null, write: async payload => written.push(payload)};
        store.savePerspective(makeLayout('l-1', 'Coding'));

        const before = JSON.stringify(store.collection);
        store.on('collectionChange', () => events.push('change'));

        // attack the returned document every way a careless caller could
        const leaked = store.collection;
        leaked.layouts['l-1'].title = 'hacked';
        leaked.activeLayoutId       = 'ghost';
        leaked.layouts.injected     = {schema: 'garbage'};
        delete leaked.layouts['l-1'];

        // internal bytes unchanged, zero events, summaries untouched
        expect(JSON.stringify(store.collection)).toBe(before);
        expect(events).toEqual([]);
        expect(store.list()[0].title).toBe('Coding title');

        // persist writes the UNCORRUPTED bytes
        const {persisted} = await store.persist();
        expect(persisted).toBe(true);
        expect(JSON.stringify(written[0])).toBe(before);

        // the boundary revalidation itself (whitebox: force-corrupt the raw backing field) —
        // persist fails closed and the adapter never sees invalid bytes as persisted truth
        store._collection = {schema: 'garbage'};
        const refused = await store.persist();
        expect(refused.persisted).toBe(false);
        expect(refused.errors.length).toBeGreaterThan(0);
        expect(written.length).toBe(1)
    });

    test('removing the ACTIVE perspective repoints to a valid successor — derived, explicit, or null on the last record', () => {
        store.savePerspective(makeLayout('l-1', 'Coding'));
        store.savePerspective(makeLayout('l-2', 'Review',  ['beta']),  {activate: false});
        store.savePerspective(makeLayout('l-3', 'Scratch', ['gamma']), {activate: false});
        expect(store.collection.activeLayoutId).toBe('l-1');

        // derived successor: the first remaining record in insertion order
        expect(store.removePerspective('Coding')).toEqual({errors: [], removed: true});
        expect(store.collection.activeLayoutId).toBe('l-2');
        expect(PerspectiveLibrary.validateSavedLayoutCollection(store.collection)).toEqual([]);

        // an explicit successor wins over derivation
        store.savePerspective(makeLayout('l-4', 'Deep', ['delta']));
        expect(store.collection.activeLayoutId).toBe('l-4');
        expect(store.removePerspective('Deep', {replacementName: 'Scratch'})).toEqual({errors: [], removed: true});
        expect(store.collection.activeLayoutId).toBe('l-3');

        // a bogus successor fails closed — provided options are never silently ignored
        const bogus = store.removePerspective('Review', {replacementName: 'ghost'});
        expect(bogus.removed).toBe(false);
        expect(bogus.errors.join(' ')).toContain('no remaining perspective named');
        expect(store.exists('Review')).toBe(true);

        // draining the store: the last record clears the pointer to null
        expect(store.removePerspective('Review').removed).toBe(true);
        expect(store.removePerspective('Scratch').removed).toBe(true);
        expect(store.list()).toEqual([]);
        expect(store.collection.activeLayoutId).toBeNull()
    });

    test('one namespace: cross-key shadowing is a collision, prototype-shaped keys fail closed, both paths stay reachable', () => {
        store.savePerspective(makeLayout('alpha', 'Alpha'));

        // an incoming layoutId equal to an existing perspectiveName would win the name-first
        // scan and make the new record unaddressable by id — a collision, not a save
        const shadowed = store.savePerspective(makeLayout('Alpha', 'Boards', ['beta']));
        expect(shadowed.saved).toBe(false);
        expect(shadowed.collision).toMatchObject({holderLayoutId: 'alpha'});

        // replace retires the shadow holder; the new record is reachable through BOTH paths
        const replaced = store.savePerspective(makeLayout('Alpha', 'Boards', ['beta']), {replace: true});
        expect(replaced.saved).toBe(true);
        expect(Object.keys(store.collection.layouts)).toEqual(['Alpha']);
        expect(store.loadPerspective('Boards').errors).toEqual([]);
        expect(store.loadPerspective('Alpha').errors).toEqual([]);

        // symmetric: an incoming perspectiveName equal to an existing layoutId collides too
        const nameVsId = store.savePerspective(makeLayout('l-9', 'Alpha', ['gamma']));
        expect(nameVsId.saved).toBe(false);
        expect(nameVsId.collision).toMatchObject({holderLayoutId: 'Alpha'});

        // prototype-shaped keys are rejected at the write boundary, store byte-identical
        const before = JSON.stringify(store.collection);

        for (const evil of ['__proto__', 'constructor', 'prototype']) {
            const asName = store.savePerspective(makeLayout('safe-id', evil, ['delta']));
            expect(asName.saved).toBe(false);
            expect(asName.errors.join(' ')).toContain('not a usable perspective key');
        }

        const asId = store.savePerspective(makeLayout('__proto__', 'Fine', ['delta']));
        expect(asId.saved).toBe(false);

        expect(JSON.stringify(store.collection)).toBe(before);
        expect(store.exists('constructor')).toBe(false);   // inherited keys never satisfy lookups

        const evilRename = store.renamePerspective('Boards', '__proto__');
        expect(evilRename.renamed).toBe(false);
        expect(evilRename.errors.join(' ')).toContain('not a usable perspective key')
    });

    test('getPerspective is the read-only inspection seam: clone-isolated, both keys resolve, NOTHING advances', () => {
        store.savePerspective(makeLayout('l-1', 'Coding'));
        store.savePerspective(makeLayout('l-2', 'Review', ['beta']), {activate: false});
        expect(store.collection.activeLayoutId).toBe('l-1');

        const events = [];
        store.on('perspectiveLoaded', () => events.push(1));
        store.on('collectionChange',  () => events.push(1));

        // both resolution keys work, same rule as every other verb (name first, id second)
        expect(store.getPerspective('Review')?.layoutId).toBe('l-2');
        expect(store.getPerspective('l-2')?.layoutId).toBe('l-2');
        expect(store.getPerspective('ghost')).toBeNull();

        // the returned record is a CLONE — mutating it cannot reach the held collection
        const entry = store.getPerspective('Review');
        entry.layout.title = 'tampered';
        expect(store.getPerspective('Review').layout.title).toBe('Review title');

        // read-only means READ-ONLY: no active-pointer movement, no migration commit, no event
        expect(store.collection.activeLayoutId).toBe('l-1');
        expect(events).toEqual([])
    });

    test('rename with replace retires the target holder atomically and inherits its activeness', () => {
        store.savePerspective(makeLayout('l-1', 'Coding'));
        store.savePerspective(makeLayout('l-2', 'Review', ['beta']));   // active via the default
        expect(store.collection.activeLayoutId).toBe('l-2');

        const changes = [];
        store.on('collectionChange', () => changes.push(1));

        // ONE commit: the ACTIVE holder of the target name retires, the renamed record
        // inherits its activeness, and the collection stays whole-valid throughout
        const verdict = store.renamePerspective('Coding', 'Review', {replace: true});
        expect(verdict).toMatchObject({renamed: true, collision: null});
        expect(changes.length).toBe(1);
        expect(Object.keys(store.collection.layouts)).toEqual(['l-1']);
        expect(store.collection.layouts['l-1'].perspectiveName).toBe('Review');
        expect(store.collection.activeLayoutId).toBe('l-1');
        expect(PerspectiveLibrary.validateSavedLayoutCollection(store.collection)).toEqual([]);

        // without replace, the same rename stays the structured verdict (contract unchanged)
        store.savePerspective(makeLayout('l-3', 'Scratch', ['gamma']), {activate: false});
        const blocked = store.renamePerspective('Scratch', 'Review');
        expect(blocked.renamed).toBe(false);
        expect(blocked.collision).toMatchObject({holderLayoutId: 'l-1', name: 'Review'})
    });
});
