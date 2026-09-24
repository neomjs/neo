import {test, expect}                            from '@playwright/test';
import CanvasGroups, {CANVAS_WORKER_NAME_PREFIX} from '../../../../src/worker/CanvasGroups.mjs';

/**
 * @summary Settles a promise into `{value}` or `{error}` without letting a rejection escape the arm.
 * @param {Promise} promise
 * @returns {Promise<Object>}
 */
const settle = promise => promise.then(value => ({value}), error => ({error}));

/**
 * @summary A canvas channel end, as the app worker holds one.
 * @returns {MessagePort}
 */
const channel = () => new MessageChannel().port2;

/**
 * @summary Whether a promise is still pending after the microtask queue drained.
 * @param {Promise} promise
 * @returns {Promise<Boolean>}
 */
async function isPending(promise) {
    let done = false;
    promise.then(() => done = true, () => done = true);
    await new Promise(resolve => setTimeout(resolve, 0));
    return !done
}

/**
 * The canvas-group carrier rule and the app worker's per-group routing, readiness and lifetimes. The carrier arms are
 * the carrier table, one row each: only a live opener or a `reload` admits a stored id, because a copied id alone
 * proves no shared renderer process.
 */
test.describe('Neo.worker.CanvasGroups', () => {
    test.describe('carrier rule — one arm per row of the fold\'s carrier table', () => {
        const mint = () => 'fresh';

        const rows = [
            ['root first load',          {hasLiveOpener: false, navigationType: 'navigate'},                         'fresh'],
            ['opener popup',             {hasLiveOpener: true,  navigationType: 'navigate',     stored: 'opener'},   'opener'],
            ['opener popup, reloaded',   {hasLiveOpener: true,  navigationType: 'reload',       stored: 'opener'},   'opener'],
            ['root F5',                  {hasLiveOpener: false, navigationType: 'reload',       stored: 'own'},      'own'],
            ['duplicated tab',           {hasLiveOpener: false, navigationType: 'back_forward', stored: 'copied'},   'fresh'],
            ['session restore',          {hasLiveOpener: false, navigationType: 'back_forward', stored: 'restored'}, 'fresh'],
            ['no-opener popup',          {hasLiveOpener: false, navigationType: 'navigate',     stored: 'copied'},   'fresh'],
            ['unrelated tab',            {hasLiveOpener: false, navigationType: 'navigate'},                         'fresh'],
            ['inherited-id navigate',    {hasLiveOpener: false, navigationType: 'navigate',     stored: 'inherited'},'fresh']
        ];

        for (const [row, input, expected] of rows) {
            test(row, () => {
                expect(CanvasGroups.resolveCarrier({...input, mint})).toBe(expected)
            })
        }

        test('the worker name carries the group, and only a per-group name yields one', () => {
            expect(CanvasGroups.groupFromWorkerName(`${CANVAS_WORKER_NAME_PREFIX}g1`)).toBe('g1');
            expect(CanvasGroups.groupFromWorkerName('neomjs-canvas-worker')).toBeNull();
            expect(CanvasGroups.groupFromWorkerName(undefined)).toBeNull()
        });

        test('the mint needs no secure context: unique ids with `crypto.randomUUID` gone', () => {
            // What an insecure origin looks like to the boot: the method is absent, not throwing
            Object.defineProperty(crypto, 'randomUUID', {configurable: true, value: undefined});

            try {
                const ids = new Set(Array.from({length: 100}, () => CanvasGroups.mint()));

                expect(ids.size).toBe(100);
                ids.forEach(id => expect(id).toMatch(/^[0-9a-f]{32}$/))
            } finally {
                delete crypto.randomUUID
            }

            expect(typeof crypto.randomUUID, 'the rig\'s crypto is restored').toBe('function')
        })
    });

    test.describe('routing', () => {
        let groups;

        test.beforeEach(() => {
            groups = new CanvasGroups({startBound: 1000});
            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.setPort({group: 'g1', port: 'port-1'})
        });

        test('a registered window resolves to its own group\'s port', () => {
            expect(groups.portFor('w1')).toBe('port-1')
        });

        test('an unknown supplied windowId is refused even with one group', () => {
            expect(groups.portFor('stranger')).toBeNull();
            expect(groups.resolve('stranger').error.code).toBe('NEO_UNROUTABLE')
        });

        test('a missing windowId sends with one group and is refused with two', () => {
            expect(groups.portFor()).toBe('port-1');

            groups.addWindow({group: 'g2', windowId: 'w2'});
            groups.setPort({group: 'g2', port: 'port-2'});

            expect(groups.portFor()).toBeNull();
            expect(groups.resolve().error.code).toBe('NEO_UNROUTABLE')
        });

        test('no send ever reaches another group\'s port', () => {
            groups.addWindow({group: 'g2', windowId: 'w2'});
            groups.setPort({group: 'g2', port: 'port-2'});

            expect(groups.portFor('w1')).toBe('port-1');
            expect(groups.portFor('w2')).toBe('port-2')
        })
    });

    test.describe('readiness — the five outcomes', () => {
        test('send: a ready group resolves at once', async () => {
            const groups = new CanvasGroups({startBound: 1000}),
                  port   = channel();

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.setPort({group: 'g1', port});
            groups.markReady('g1', port);

            expect(groups.isReady('w1')).toBe(true);
            expect(await settle(groups.whenReady('w1'))).toEqual({value: undefined})
        });

        test('wait then send: a booting group resolves when its canvas remotes arrive', async () => {
            const groups = new CanvasGroups({startBound: 1000}),
                  port   = channel();

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.setPort({group: 'g1', port});

            const wait = groups.whenReady('w1');

            expect(await isPending(wait)).toBe(true);
            expect(groups.isReady('w1')).toBe(false);

            groups.markReady('g1', port);
            expect(await settle(wait)).toEqual({value: undefined})
        });

        test('departure: the waiting window leaves first', async () => {
            const groups = new CanvasGroups({startBound: 1000});

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.addWindow({group: 'g1', windowId: 'w1b'});

            const wait = settle(groups.whenReady('w1'));
            groups.removeWindow('w1');

            const {error} = await wait;
            expect(error.code).toBe('NEO_DEAD_PORT');
            expect(error.windowId).toBe('w1')
        });

        test('NEO_UNROUTABLE: a window in no group', async () => {
            const groups = new CanvasGroups({startBound: 1000});
            groups.addWindow({group: 'g1', windowId: 'w1'});

            expect((await settle(groups.whenReady('stranger'))).error.code).toBe('NEO_UNROUTABLE')
        });

        test('NEO_WORKER_START_FAILED: a load failure rejects waits now and later', async () => {
            const groups = new CanvasGroups({startBound: 1000});
            groups.addWindow({group: 'g1', windowId: 'w1'});

            const early = settle(groups.whenReady('w1'));
            groups.fail('g1', 'load');

            expect((await early).error).toMatchObject({code: 'NEO_WORKER_START_FAILED', cause: 'load', group: 'g1'});
            expect((await settle(groups.whenReady('w1'))).error.code).toBe('NEO_WORKER_START_FAILED')
        });

        test('NEO_WORKER_START_FAILED: a start that stays silent past the bound', async () => {
            const groups = new CanvasGroups({startBound: 20});
            groups.addWindow({group: 'g1', windowId: 'w1'});

            expect((await settle(groups.whenReady('w1'))).error).toMatchObject({code: 'NEO_WORKER_START_FAILED', cause: 'silent'})
        });

        test('a failure reported after the group is ready does not fail it', async () => {
            const groups = new CanvasGroups({startBound: 1000}),
                  port   = channel();

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.setPort({group: 'g1', port});
            groups.markReady('g1', port);
            groups.fail('g1', 'load');

            expect(groups.isReady('w1')).toBe(true)
        })
    });

    test.describe('lifetimes', () => {
        test('a departure cancels only its own waits, never a live sibling on the same group', async () => {
            const groups = new CanvasGroups({startBound: 1000}),
                  port   = channel();

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.addWindow({group: 'g1', windowId: 'w1b'});
            groups.setPort({group: 'g1', port});

            const leaver  = settle(groups.whenReady('w1')),
                  sibling = groups.whenReady('w1b');

            groups.removeWindow('w1');

            expect((await leaver).error.code).toBe('NEO_DEAD_PORT');
            expect(await isPending(sibling)).toBe(true);

            groups.markReady('g1', port);
            expect(await settle(sibling)).toEqual({value: undefined})
        });

        test('a group failure rejects every wait of that group', async () => {
            const groups = new CanvasGroups({startBound: 1000});

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.addWindow({group: 'g1', windowId: 'w1b'});

            const waits = [settle(groups.whenReady('w1')), settle(groups.whenReady('w1b'))];
            groups.fail('g1', 'load');

            for (const {error} of await Promise.all(waits)) {
                expect(error.code).toBe('NEO_WORKER_START_FAILED')
            }
        });

        test('late work from a departed window never takes a surviving sibling\'s port', () => {
            const departed = new Set(),
                  groups   = new CanvasGroups({isDeparted: id => departed.has(id), startBound: 1000});

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.addWindow({group: 'g1', windowId: 'w1b'});
            groups.setPort({group: 'g1', port: 'port-1'});

            departed.add('w1');
            groups.removeWindow('w1');

            expect(groups.portFor('w1')).toBeNull();
            expect(groups.portFor('w1b')).toBe('port-1');
            expect(groups.resolve('w1').error.code).toBe('NEO_DEAD_PORT')
        });

        test('a retired group is never revived by a late signal, not even for the reload that rejoins it', () => {
            const groups = new CanvasGroups({startBound: 1000}),
                  old    = channel();

            old.onmessage = () => {};

            groups.addWindow({group: 'g1', windowId: 'w1'});
            groups.setPort({group: 'g1', port: old});
            groups.markReady('g1', old);
            groups.removeWindow('w1');

            expect(old.onmessage).toBeNull();

            groups.setPort({group: 'g1', port: old});
            groups.markReady('g1', old);

            expect(groups.has('g1')).toBe(false);
            expect(groups.resolve('w1').error.code).toBe('NEO_UNROUTABLE');

            groups.addWindow({group: 'g1', windowId: 'w2'});

            expect(groups.isReady('w2')).toBe(false);
            expect(groups.portFor('w2')).toBeNull()
        });

        test('a port and readiness that arrive before the window announcement are kept for it', () => {
            const groups = new CanvasGroups({startBound: 1000}),
                  early  = channel();

            groups.setPort({group: 'g1', port: early});
            groups.markReady('g1', early);
            groups.addWindow({group: 'g1', windowId: 'w1'});

            expect(groups.portFor('w1')).toBe(early);
            expect(groups.isReady('w1')).toBe(true)
        })
    })
});
