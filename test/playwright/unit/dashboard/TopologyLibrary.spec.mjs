import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DashboardTopologyLibraryTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary A controlled I/O boundary; no timer or live storage enters these tests.
 * @returns {{promise: Promise, resolve: Function}}
 */
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done });

    return {promise, resolve}
};

test.describe('Neo.dashboard.dock.persistence.TopologyLibrary', () => {
    let Persistence, TopologyLibrary, Transaction, library, libraries, groupIds;

    /**
     * @summary Creates an owned test instance, cleaned up after each arm.
     * @param {Object} [config]
     * @returns {Neo.dashboard.dock.persistence.TopologyLibrary}
     */
    const create = config => {
        const instance = Neo.create(TopologyLibrary, config || {});

        libraries.push(instance);
        return instance
    };

    /**
     * @summary Captures two real keyed workspace documents through the shipped wire producer.
     * @param {String} layoutId
     * @param {String} [suffix=layoutId]
     * @returns {Object}
     */
    const topology = (layoutId, suffix = layoutId) => {
        const document = id => ({
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {[id]: {componentRef: id, title: id}},
            nodes : {root: {type: 'tabs', items: [id], activeItemId: id}}
        });
        const result = Persistence.captureTopologyPerspective({
            main  : document(`${suffix}-main`),
            detail: document(`${suffix}-detail`)
        }, {layoutId, title: layoutId});

        expect(result.errors).toEqual([]);
        return result.topology
    };

    /**
     * @summary Makes the persisted active choice explicit, independently of key insertion order.
     * @param {Object[]} records
     * @param {String|null} activeLayoutId
     * @returns {Object}
     */
    const collection = (records, activeLayoutId) => {
        const result = Persistence.createTopologyCollection(records, {activeLayoutId});

        expect(result.errors).toEqual([]);
        return result.collection
    };

    /**
     * @summary Registers an isolated real Group, retained in the cleanup list even after a failed arm.
     * @returns {Object}
     */
    const createGroup = () => {
        const identity = Transaction.bind({windowId: `topology-library-${crypto.randomUUID()}`});

        groupIds.push(identity.groupId);
        return Transaction.get(identity.groupId)
    };

    /**
     * @summary Lets the real reconnect lease expire before attaching persistence, without losing the Group.
     * @param {Object} group
     * @returns {Promise<void>}
     */
    const expireBinding = async group => {
        const expired  = deferred(),
              owner    = {},
              prior    = Transaction.reconnectLeaseMs,
              listener = {
                  leaseExpired: ({groupId}) => groupId === group.id && expired.resolve(),
                  scope       : {id: `topology-library-lease-${group.id}`}
              };

        Transaction.retainGroup(group.id, owner);
        Transaction.on(listener);
        Transaction.reconnectLeaseMs = 0;

        try {
            expect(Transaction.release(Transaction.getBinding(group.id, 'main').windowId)).toBe(true);
            Transaction.reconnectLeaseMs = prior;
            await expired.promise;
            expect(group.bindings.size).toBe(0)
        } finally {
            Transaction.reconnectLeaseMs = prior;
            Transaction.un(listener);
            Transaction.releaseGroup(group.id, owner)
        }
    };

    /**
     * @summary Attaches the library to a real Group with observable capture, storage and disposal boundaries.
     * @param {Object} group
     * @param {Function} [write]
     * @returns {Object}
     */
    const attachGroup = (group, write = async () => {}) => {
        const state = {captures: 0, disposals: [], record: topology('retirement'), writes: []};

        library.save(state.record, {activate: true});
        library.persistenceAdapter = {write: async value => {
            state.writes.push(value);
            await write(value)
        }};
        library.attachGroup({
            capture: () => {
                state.captures++;
                return {topology: state.record, errors: []}
            },
            dispose     : () => state.disposals.push(Transaction.get(group.id)),
            groupId     : group.id,
            manager     : Transaction,
            retryDelayMs: 60000
        });

        return state
    };

    test.beforeAll(async () => {
        Persistence = (await import('../../../../src/dashboard/dock/model/Persistence.mjs')).default;
        TopologyLibrary = (await import('../../../../src/dashboard/dock/persistence/TopologyLibrary.mjs')).default;
        Transaction = (await import('../../../../src/manager/Transaction.mjs')).default
    });

    test.beforeEach(() => {
        libraries = [];
        groupIds = [];
        library = create()
    });

    test.afterEach(() => {
        libraries.forEach(instance => instance.destroy());
        groupIds.forEach(groupId => Transaction.retireGroup(groupId))
    });

    test('selection uses the validated active id or an explicit id, never key insertion order', () => {
        const a = topology('a'), b = topology('b');

        for (const records of [[a, b], [b, a]]) {
            const current = create({collection: collection(records, 'b')});

            expect(current.resolve().topology.layoutId).toBe('b');
            expect(current.resolve('a').topology.layoutId).toBe('a');
            expect(current.collection.activeLayoutId, 'read-only resolution never activates').toBe('b');
            expect(current.resolve('missing').errors.length).toBeGreaterThan(0);
            expect(current.collection.activeLayoutId).toBe('b')
        }

        const invalid = collection([a, b], 'b');
        delete invalid.activeLayoutId;
        expect(library.adoptCollection(invalid).adopted).toBe(false);
        expect(library.collection).toBeNull();
        expect(library.resolve().topology).toBeNull()
    });

    test('save requires explicit first activation and explicit replacement; later saves retain the selection', () => {
        const a = topology('a');

        expect(library.save(a).saved, 'a first save cannot infer an active key').toBe(false);
        expect(library.collection).toBeNull();
        expect(library.save(a, {activate: true}).saved).toBe(true);
        expect(library.save(topology('b')).saved).toBe(true);
        expect(library.collection.activeLayoutId).toBe('a');

        const before   = JSON.stringify(library.collection);
        const changedA = topology('a', 'replacement');

        expect(library.save(changedA).collision).toMatchObject({layoutId: 'a'});
        expect(JSON.stringify(library.collection)).toBe(before);
        expect(library.save(changedA, {replace: true}).saved).toBe(true);
        expect(library.resolve('a').topology.workspaces.main.items).toHaveProperty('replacement-main');
        expect(library.collection.activeLayoutId).toBe('a');

        const invalid = {...topology('c'), schema: 'neo.dock.layout.v1'};
        expect(library.save(invalid, {activate: true}).saved).toBe(false);
        expect(Object.keys(library.collection.topologies)).toEqual(['a', 'b'])
    });

    test('collection adoption, public reads, and resolved records are isolated JSON', () => {
        const incoming = collection([topology('a')], 'a');

        expect(library.adoptCollection(incoming).adopted).toBe(true);
        const before = JSON.stringify(library.collection);

        incoming.topologies.a.title = 'external mutation';
        const exposed = library.collection;
        exposed.activeLayoutId = 'missing';
        exposed.topologies.a.workspaces.main.items['a-main'].title = 'external mutation';
        library.resolve().topology.workspaces.detail.items['a-detail'].title = 'external mutation';

        expect(JSON.stringify(library.collection)).toBe(before);
        expect(library.adoptCollection({...library.collection, activeLayoutId: 'missing'}).adopted).toBe(false);
        expect(JSON.stringify(library.collection)).toBe(before);
        expect(library.dirty).toBe(true)
    });

    test('selection preparation changes nothing until explicit adoption and refuses a stale version', () => {
        library.adoptCollection(collection([topology('a'), topology('b')], 'a'));
        const before   = JSON.stringify(library.collection), version = library.version;
        const prepared = library.prepareSelection('b');

        expect(prepared.errors).toEqual([]);
        expect(prepared.topology.layoutId).toBe('b');
        expect(prepared.collection.activeLayoutId).toBe('b');
        expect(prepared.version).toBe(version);
        expect(JSON.stringify(library.collection)).toBe(before);
        expect(library.version).toBe(version);

        library.save(topology('c'), {activate: true});
        const current = JSON.stringify(library.collection);
        expect(library.adoptCollection(prepared.collection, {expectedVersion: prepared.version}).adopted).toBe(false);
        expect(JSON.stringify(library.collection)).toBe(current);

        const fresh = library.prepareSelection('b');
        expect(library.adoptCollection(fresh.collection, {expectedVersion: fresh.version}).adopted).toBe(true);
        expect(library.collection.activeLayoutId).toBe('b')
    });

    test('hydrate adopts only validated storage and keeps its explicit active choice', async () => {
        let stored = collection([topology('a'), topology('b')], 'b');
        library.persistenceAdapter = {read: async () => stored};

        expect((await library.hydrate()).hydrated).toBe(true);
        expect(library.resolve().topology.layoutId).toBe('b');
        expect(library.dirty).toBe(false);
        stored.topologies.b.title = 'adapter retained a reference';
        expect(library.resolve().topology.title).toBe('b');

        const before = JSON.stringify(library.collection), version = library.version;
        stored = null;
        expect(await library.hydrate()).toMatchObject({hydrated: false, errors: []});
        expect(JSON.stringify(library.collection)).toBe(before);
        stored = {schema: 'old-topology', topologies: {}};
        expect((await library.hydrate()).errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(library.collection)).toBe(before);
        expect(library.version).toBe(version)
    });

    test('a failed read and a late read never replace newer in-memory truth', async () => {
        library.save(topology('a'), {activate: true});
        library.persistenceAdapter = {read: async () => { throw new Error('storage unavailable') }};
        expect((await library.hydrate()).errors).toContain('storage unavailable');
        expect(library.resolve().topology.layoutId).toBe('a');

        const started = deferred(), answer = deferred();
        library.persistenceAdapter = {read: () => { started.resolve(); return answer.promise }};
        const pending = library.hydrate();
        await started.promise;
        library.save(topology('b'), {activate: true});
        answer.resolve(collection([topology('old')], 'old'));

        expect((await pending).hydrated).toBe(false);
        expect(library.resolve().topology.layoutId).toBe('b');
        expect(library.dirty).toBe(true)
    });

    test('missing or rejected persistence preserves dirty truth and a later retry succeeds', async () => {
        library.save(topology('a'), {activate: true});
        const before = JSON.stringify(library.collection);

        expect((await library.persist()).persisted).toBe(false);
        library.persistenceAdapter = {write: async () => { throw new Error('quota exceeded') }};
        expect((await library.persist()).errors).toContain('quota exceeded');
        expect(JSON.stringify(library.collection)).toBe(before);
        expect(library.dirty).toBe(true);

        let written;
        library.persistenceAdapter = {write: async value => { written = value }};
        expect(await library.persist()).toMatchObject({persisted: true, current: true, errors: []});
        expect(library.dirty).toBe(false);
        expect(JSON.stringify(written)).toBe(before);
        written.topologies.a.title = 'adapter mutation';
        expect(JSON.stringify(library.collection)).toBe(before)
    });

    test('an older acknowledgement cannot mark a newer collection durably current', async () => {
        library.save(topology('a'), {activate: true});
        const started = deferred(), answer = deferred();
        library.persistenceAdapter = {write: () => { started.resolve(); return answer.promise }};

        const pending = library.persist();
        await started.promise;
        library.save(topology('b'), {activate: true});
        answer.resolve();

        expect(await pending).toMatchObject({persisted: true, current: false});
        expect(library.dirty).toBe(true);
        library.persistenceAdapter = {write: async () => {}};
        expect(await library.persist()).toMatchObject({persisted: true, current: true});
        expect(library.dirty).toBe(false)
    });

    test('writes serialize so an older slow write cannot overwrite the newer stored collection', async () => {
        library.save(topology('a'), {activate: true});
        const started = deferred(), answer = deferred(), calls = [];
        let stored;
        library.persistenceAdapter = {write: async value => {
            calls.push(value.activeLayoutId);
            if (calls.length === 1) { started.resolve(); await answer.promise }
            stored = value
        }};

        const first = library.persist();
        await started.promise;
        library.save(topology('b'), {activate: true});
        const second = library.persist();
        await Promise.resolve();
        expect(calls).toEqual(['a']);
        answer.resolve();
        await Promise.all([first, second]);

        expect(calls).toEqual(['a', 'b']);
        expect(stored.activeLayoutId).toBe('b');
        expect(library.dirty).toBe(false)
    });

    test('persist revalidates held bytes and sends no invalid candidate to the adapter', async () => {
        const writes = [];
        library.persistenceAdapter = {write: async value => writes.push(value)};
        library.save(topology('a'), {activate: true});
        // Whitebox corruption control: public access cannot reach this backing field.
        library._collection = {schema: 'invalid'};

        expect((await library.persist()).persisted).toBe(false);
        expect(writes).toEqual([])
    });

    test('Group retirement refuses a live binding without capturing, writing or disposing', async () => {
        const group = createGroup(), state = attachGroup(group);

        expect(group.retainedReferences.has(library)).toBe(true);
        expect(await library.retireIfHeadless()).toBe(false);
        expect(Transaction.get(group.id)).toBe(group);
        expect(state.captures).toBe(0);
        expect(state.writes).toEqual([]);
        expect(state.disposals).toEqual([])
    });

    test('a warm Group release and rebind performs no topology storage write', async () => {
        const group    = createGroup(), state = attachGroup(group),
              binding  = group.bindings.get('main'),
              identity = {groupId: group.id, workspaceKey: 'main', generationToken: binding.generationToken};

        expect(Transaction.release(binding.windowId)).toBe(true);
        const rebound = Transaction.bind({...identity, windowId: `warm-${group.id}`});

        expect(rebound.outcome).toBe('rebound');
        expect(await library.retireIfHeadless()).toBe(false);
        expect(Transaction.get(group.id)).toBe(group);
        expect(state.captures).toBe(0);
        expect(state.writes).toEqual([]);
        expect(state.disposals).toEqual([])
    });

    test('Group retirement waits for a current durable acknowledgement after lease expiry and disposes once', async () => {
        const group = createGroup(), started = deferred(), answer = deferred();
        const state = attachGroup(group, () => { started.resolve(); return answer.promise });

        await expireBinding(group);
        await started.promise;
        const pending = library.retireIfHeadless();
        expect(Transaction.get(group.id), 'pending storage still retains the only semantic truth').toBe(group);
        expect(state.disposals).toEqual([]);
        answer.resolve();

        expect(await pending).toBe(true);
        expect(Transaction.get(group.id)).toBeNull();
        expect(state.writes).toHaveLength(1);
        expect(state.writes[0].topologies.retirement.workspaces).toEqual(state.record.workspaces);
        expect(state.disposals, 'disposal sees an already retired Group').toEqual([null]);
        expect(await library.retireIfHeadless()).toBe(false);
        expect(state.disposals).toHaveLength(1)
    });

    test('Group retirement preserves headless-dirty truth on rejected storage and an explicit retry succeeds', async () => {
        const group = createGroup();
        let   fail  = true;

        await expireBinding(group);
        const state = attachGroup(group, async () => {
            if (fail) throw new Error('retirement storage unavailable')
        });
        const before = library.collection;

        expect(await library.retireIfHeadless()).toBe(false);
        expect(Transaction.get(group.id)).toBe(group);
        expect(group.persistenceState).toBe('headless-dirty');
        expect(group.retainedReferences.has(library)).toBe(true);
        expect(library.collection).toEqual(before);
        expect(library.dirty).toBe(true);
        expect(state.disposals).toEqual([]);

        fail = false;
        expect(await library.retireIfHeadless()).toBe(true);
        expect(state.writes).toHaveLength(2);
        expect(Transaction.get(group.id)).toBeNull();
        expect(state.disposals).toEqual([null])
    });

    test('headless persistence failure automatically retries on the bounded timer', async () => {
        const group  = createGroup(), disposed = deferred(), record = topology('automatic-retry');
        let   writes = 0;
        await expireBinding(group);

        library.persistenceAdapter = {
            read : async () => null,
            write: async () => {
                if (++writes === 1) throw new Error('first write refused')
            }
        };
        expect(library.attachGroup({
            manager     : Transaction,
            groupId     : group.id,
            capture     : () => ({topology: record, errors: []}),
            dispose     : () => disposed.resolve(),
            retryDelayMs: 1
        })).toBe(true);

        expect(await library.retireIfHeadless()).toBe(false);
        expect(group.persistenceState).toBe('headless-dirty');
        await disposed.promise;
        expect(writes).toBe(2);
        expect(Transaction.get(group.id)).toBeNull()
    });

    test('Group retirement cannot discard an external reference and succeeds after its exact release', async () => {
        const group = createGroup(), owner = {};

        await expireBinding(group);
        const state = attachGroup(group);
        Transaction.retainGroup(group.id, owner);

        expect(await library.retireIfHeadless()).toBe(false);
        expect(Transaction.get(group.id)).toBe(group);
        expect(group.retainedReferences.has(owner)).toBe(true);
        expect(group.retainedReferences.has(library)).toBe(true);
        expect(state.disposals).toEqual([]);

        expect(Transaction.releaseGroup(group.id, owner)).toBe(true);
        expect(await library.retireIfHeadless()).toBe(true);
        expect(state.disposals).toEqual([null])
    });

    test('Group retirement rechecks a late live binder after a pending write acknowledges', async () => {
        const group = createGroup(), started = deferred(), answer = deferred();

        await expireBinding(group);
        const state   = attachGroup(group, () => { started.resolve(); return answer.promise });
        const pending = library.retireIfHeadless();

        await started.promise;
        const reserved = Transaction.reserve({groupId: group.id, workspaceKey: 'main'});
        const bound    = Transaction.bind({...reserved, windowId: `late-${group.id}`});
        expect(bound.groupId).toBe(group.id);
        answer.resolve();

        expect(await pending).toBe(false);
        expect(Transaction.get(group.id)).toBe(group);
        expect(group.persistenceState).toBe('active');
        expect(group.retainedReferences.has(library)).toBe(true);
        expect(state.disposals).toEqual([])
    });

    test('Group retirement waits for the existing queue before capturing its final topology', async () => {
        const group = createGroup(), queue = deferred();

        await expireBinding(group);
        const state = attachGroup(group);
        group.queue = queue.promise;
        const pending = library.retireIfHeadless();

        await Promise.resolve();
        expect(state.captures).toBe(0);
        expect(state.writes).toEqual([]);
        state.record = topology('retirement', 'committed-after-queue');
        queue.resolve();

        expect(await pending).toBe(true);
        expect(state.writes[0].topologies.retirement.workspaces.main.items).toHaveProperty('committed-after-queue-main');
        expect(state.disposals).toEqual([null])
    });

    test('Group retirement refuses a changed queue during storage and a new attempt captures its truth', async () => {
        const group = createGroup(), started = deferred(), answer = deferred();

        await expireBinding(group);
        const state   = attachGroup(group, () => { started.resolve(); return answer.promise });
        const pending = library.retireIfHeadless();

        await started.promise;
        state.record = topology('retirement', 'new-queue');
        group.queue = Promise.resolve();
        answer.resolve();

        expect(await pending).toBe(false);
        expect(Transaction.get(group.id)).toBe(group);
        expect(state.disposals).toEqual([]);
        expect(await library.retireIfHeadless()).toBe(true);
        expect(state.writes).toHaveLength(2);
        expect(state.writes[1].topologies.retirement.workspaces.main.items).toHaveProperty('new-queue-main');
        expect(state.disposals).toEqual([null])
    });
});
