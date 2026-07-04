import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSCreatedInstancesTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../src/core/_export.mjs';
import InstanceManager  from '../../../../../../src/manager/Instance.mjs';
import CreatedInstances from '../../../../../../apps/agentos/view/create/store/CreatedInstances.mjs';

// Each test uses its own instanceIds: the store is a singleton, so tests must never
// assert on ids they did not register themselves.
const gridSnapshot = title => ({
    schema: 'grid@1',
    title,
    config: {columns: [{field: 'name', text: 'Name'}]},
    data  : [{name: 'row-1'}]
});

test.describe('created-instance registry: live widgets as first-class store records', () => {
    test('full lifecycle round-trip: register → mutate → dispose, with the record kept', () => {
        const registered = CreatedInstances.registerCreated({
            instanceId       : 'rt-grid-1',
            blueprintSchema  : 'grid@1',
            title            : 'Roundtrip Grid',
            blueprintSnapshot: gridSnapshot('Roundtrip Grid')
        });

        expect(registered.accepted).toBe(true);
        expect(registered.record.state).toBe('live');
        expect(registered.record.paneRef).toBeNull();
        expect(registered.record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(registered.record.creationIndex).toBeGreaterThan(0);

        const mutated = CreatedInstances.markMutated('rt-grid-1', {
            title            : 'Roundtrip Grid XL',
            blueprintSnapshot: {...gridSnapshot('Roundtrip Grid XL'), config: {columns: [{field: 'name', text: 'Name'}], height: 600}}
        });

        expect(mutated.accepted).toBe(true);
        expect(mutated.record.title).toBe('Roundtrip Grid XL');
        expect(mutated.record.blueprintSnapshot.config.height).toBe(600);

        const disposed = CreatedInstances.markDisposed('rt-grid-1');

        expect(disposed.accepted).toBe(true);
        expect(disposed.record.state).toBe('disposed');

        // history-complete: the record survives dispose, resolvable by id in any state
        expect(CreatedInstances.resolveTarget({instanceId: 'rt-grid-1'}).state).toBe('disposed');
    });

    test('registration refuses bad identity, missing snapshot, and duplicate ids', () => {
        const base = {blueprintSchema: 'grid@1', title: 'Refusals', blueprintSnapshot: gridSnapshot('Refusals')};

        expect(CreatedInstances.registerCreated({...base, instanceId: ''}).accepted).toBe(false);
        expect(CreatedInstances.registerCreated({...base, instanceId: 'ref-1', blueprintSchema: '  '}).accepted).toBe(false);
        expect(CreatedInstances.registerCreated({...base, instanceId: 'ref-1', blueprintSnapshot: null}).accepted).toBe(false);
        expect(CreatedInstances.registerCreated({...base, instanceId: 'ref-1', blueprintSnapshot: []}).accepted).toBe(false);

        expect(CreatedInstances.registerCreated({...base, instanceId: 'ref-1'}).accepted).toBe(true);

        const duplicate = CreatedInstances.registerCreated({...base, instanceId: 'ref-1'});

        expect(duplicate.accepted).toBe(false);
        expect(duplicate.reason).toContain('already registered');
    });

    test('lifecycle refusals: unknown ids, disposed mutation, double dispose, foreign keys', () => {
        CreatedInstances.registerCreated({
            instanceId       : 'lc-grid-1',
            blueprintSchema  : 'grid@1',
            title            : 'Lifecycle Grid',
            blueprintSnapshot: gridSnapshot('Lifecycle Grid')
        });

        expect(CreatedInstances.markMutated('lc-missing', {title: 'x'}).accepted).toBe(false);
        expect(CreatedInstances.markDisposed('lc-missing').accepted).toBe(false);

        // only title/blueprintSnapshot may change — identity and lifecycle fields are immutable here
        const foreign = CreatedInstances.markMutated('lc-grid-1', {state: 'disposed'});
        expect(foreign.accepted).toBe(false);
        expect(foreign.reason).toContain('unexpected');
        expect(CreatedInstances.markMutated('lc-grid-1', null).accepted).toBe(false);

        expect(CreatedInstances.markDisposed('lc-grid-1').accepted).toBe(true);
        expect(CreatedInstances.markMutated('lc-grid-1', {title: 'too late'}).accepted).toBe(false);
        expect(CreatedInstances.markDisposed('lc-grid-1').accepted).toBe(false);
    });

    test('snapshots are registry-owned: caller mutations never rewrite recorded history', () => {
        const original = gridSnapshot('Ownership Grid');

        CreatedInstances.registerCreated({
            instanceId       : 'own-1',
            blueprintSchema  : 'grid@1',
            title            : 'Ownership Grid',
            blueprintSnapshot: original
        });

        // caller mutates their original AFTER registration — deep and shallow
        original.title             = 'HIJACKED';
        original.config.columns[0] = {field: 'evil', text: 'Evil'};
        original.data.push({name: 'injected'});

        const afterRegister = CreatedInstances.resolveTarget({instanceId: 'own-1'}).blueprintSnapshot;

        expect(afterRegister.title).toBe('Ownership Grid');
        expect(afterRegister.config.columns[0].field).toBe('name');
        expect(afterRegister.data).toHaveLength(1);

        // same rule on mutation: the caller's merged object stays theirs
        const mutated = gridSnapshot('Ownership Grid v2');

        CreatedInstances.markMutated('own-1', {blueprintSnapshot: mutated});
        mutated.config.columns[0].field = 'evil-again';

        expect(CreatedInstances.resolveTarget({instanceId: 'own-1'}).blueprintSnapshot.config.columns[0].field).toBe('name');

        // non-snapshot-safe content (the executable class) refuses instead of throwing — it cannot even be stored
        const withFunction = {...gridSnapshot('Fn Grid'), data: [{name: () => {}}]};

        expect(CreatedInstances.registerCreated({instanceId: 'own-2', blueprintSchema: 'grid@1', title: 'Fn Grid', blueprintSnapshot: withFunction}).accepted).toBe(false);
        expect(CreatedInstances.markMutated('own-1', {blueprintSnapshot: withFunction}).accepted).toBe(false);
        expect(CreatedInstances.resolveTarget({instanceId: 'own-1'}).blueprintSnapshot.title).toBe('Ownership Grid v2');
    });

    test('target resolution: by id, by title (latest live wins), latest-created fallback', () => {
        const register = (instanceId, title) => CreatedInstances.registerCreated({
            instanceId,
            blueprintSchema  : 'grid@1',
            title,
            blueprintSnapshot: gridSnapshot(title)
        });

        register('res-a', 'Sales Grid');
        register('res-b', 'Sales Grid');
        register('res-c', 'People Grid');

        // by id: exact, any state
        expect(CreatedInstances.resolveTarget({instanceId: 'res-a'}).instanceId).toBe('res-a');
        expect(CreatedInstances.resolveTarget({instanceId: 'res-nope'})).toBeNull();

        // by title: the LATEST live record with that title
        expect(CreatedInstances.resolveTarget({title: 'Sales Grid'}).instanceId).toBe('res-b');
        expect(CreatedInstances.resolveTarget({title: 'No Such Grid'})).toBeNull();

        // no selector: latest live overall (res-c is this worker's newest registration)
        expect(CreatedInstances.resolveTarget().instanceId).toBe('res-c');

        // dispose shifts resolution to the previous live record — disposed never resolves by title/latest
        CreatedInstances.markDisposed('res-c');
        CreatedInstances.markDisposed('res-b');

        expect(CreatedInstances.resolveTarget().instanceId).toBe('res-a');
        expect(CreatedInstances.resolveTarget({title: 'Sales Grid'}).instanceId).toBe('res-a');
        expect(CreatedInstances.resolveTarget({title: 'People Grid'})).toBeNull();
    });
});
