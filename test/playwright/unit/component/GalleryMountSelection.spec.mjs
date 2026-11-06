import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import {setup}            from '../../setup.mjs';
import {test, expect}     from '@playwright/test';
import Gallery            from '../../../../src/component/Gallery.mjs';
import Store              from '../../../../src/data/Store.mjs';

const appName = 'GalleryMountSelectionTest';
setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: true, useDomApiRenderer: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

/** @summary Drains callbacks and the process's rejection-reporting boundary without a timing guess. */
const settle = () => new Promise(resolve => setImmediate(resolve));

test.describe('Gallery initial selection', () => {
    let view, store, originalRead, originalError, originalDeparture, read, errors;

    test.beforeEach(() => {
        errors = [];
        originalRead = Neo.currentWorker.promiseMessage;
        originalError = console.error;
        originalDeparture = Neo.currentWorker.isDeparture;
        read = async () => ({attributes: {offsetWidth: 600, offsetHeight: 400}});
        Neo.currentWorker.promiseMessage = (destination, data) => data.attributes?.includes('offsetHeight')
            ? read(destination, data)
            : originalRead(destination, data);
        console.error = (...args) => errors.push(args)
    });

    test.afterEach(async () => {
        await settle();
        view?.destroy();
        store?.destroy();
        Neo.currentWorker.promiseMessage = originalRead;
        Neo.currentWorker.isDeparture = originalDeparture;
        console.error = originalError
    });

    /**
     * @summary Creates the real view and Store; only the native dimension reply and mount delay are controlled.
     * @param {Object} config
     * @param {Object[]} data
     */
    async function create(config={}, data=[]) {
        store = Neo.create(Store, {
            model: {fields: [{name: 'id', type: 'Integer'}, {name: 'image', type: 'String'}]},
            data
        });
        await store.ready();
        view = Neo.create(Gallery, {appName, store, focusOnMount: false, maxItems: 12, ...config});
        await view.initVnode();
        view.timeout = async () => {}
    }

    /** @summary Observes the task returned by the real hook invoked through the mounted config. */
    function mount() {
        const original = view.afterSetMounted;
        let task;
        view.afterSetMounted = function(...args) { return task = original.apply(this, args) };
        view.mounted = true;
        view.afterSetMounted = original;
        return task
    }

    test('an empty mount retains one initial selection until records arrive', async () => {
        await create();
        await mount();
        await settle();
        expect(view.offsetWidth).toBe(600);
        expect(view.selectionModel.getSelection()).toEqual([]);
        expect(errors).toEqual([]);
        store.add([{id: 1, image: 'one.png'}, {id: 2, image: 'two.png'}]);
        expect(view.selectionModel.getSelection()).toEqual([view.getRecordId(store.get(1))]);
        view.selectionModel.deselectAll();
        store.sort({property: 'id', direction: 'DESC'});
        store.add({id: 3, image: 'three.png'});
        expect(view.selectionModel.getSelection()).toEqual([])
    });

    for (const disableAfterMount of [false, true]) {
        test(`late rows respect selectOnMount disabled ${disableAfterMount ? 'after' : 'before'} measurement`, async () => {
            await create({selectOnMount: disableAfterMount});
            await mount();
            view.selectOnMount = false;
            store.add({id: 1, image: 'one.png'});
            expect(view.selectionModel.getSelection()).toEqual([]);
            expect(errors).toEqual([])
        })
    }

    for (const [amountRows, size, index] of [[3, 6, 2], [1, 4, 3], [3, 1, 0]]) {
        test(`populated mount with ${size} records and ${amountRows} rows selects valid index ${index}`, async () => {
            await create({amountRows}, Array.from({length: size}, (_, id) => ({id, image: 'item.png'})));
            await mount();
            expect(view.selectionModel.getSelection()).toEqual([view.getRecordId(store.getAt(index))]);
            expect(errors).toEqual([])
        })
    }

    test('a valid existing business key zero survives the mount choice', async () => {
        await create({useInternalId: false}, Array.from({length: 6}, (_, id) => ({id, image: 'item.png'})));
        view.selectionModel.select(0);
        await settle();
        await mount();
        expect(view.selectionModel.getSelection()).toEqual([0]);
        expect(errors).toEqual([])
    });

    test('a pre-mount key waits through unrelated chunks for its record', async () => {
        await create();
        const {selectionModel} = view;
        selectionModel.select(0);
        await mount();
        expect(selectionModel.getSelection()).toEqual([0]);
        store.add({id: 1, image: 'one.png'});
        expect(selectionModel.getSelection()).toEqual([0]);
        store.add({id: 0, image: 'zero.png'});
        const key = view.getRecordId(store.get(0));
        expect(selectionModel.getSelection()).toEqual([key]);
        expect(view.getVdomChild(view.getItemVnodeId(key)).cls).toContain('neo-selected');
        expect(errors).toEqual([])
    });

    test('maxItems re-entry retires an older measurement without rearming later loads', async () => {
        await create({maxItems: 6, useInternalId: false}, Array.from({length: 6}, (_, id) => ({id, image: 'item.png'})));
        view.selectionModel.select(4);
        const releases = [];
        read = () => new Promise(resolve => releases.push(resolve));
        const oldTask = mount();
        await settle();
        const original = view.afterSetMounted;
        let reentry;
        view.afterSetMounted = function(...args) { return reentry = original.apply(this, args) };
        view.maxItems = 2;
        view.afterSetMounted = original;
        await settle();
        expect(releases).toHaveLength(2);
        releases[1]({attributes: {offsetWidth: 900, offsetHeight: 700}});
        await reentry;
        releases[0]({attributes: {offsetWidth: 100, offsetHeight: 50}});
        await oldTask;
        expect(view.offsetWidth).toBe(900);
        expect(view.selectionModel.getSelection()).toEqual([4]);
        view.selectionModel.deselectAll();
        store.sort({property: 'id', direction: 'DESC'});
        store.add({id: 6, image: 'six.png'});
        expect(view.selectionModel.getSelection()).toEqual([]);
        expect(errors).toEqual([])
    });

    for (const retirement of ['unmount', 'destroy', 'window change']) {
        test(`${retirement} invalidates a pending native dimension reply`, async () => {
            await create({}, [{id: 1, image: 'one.png'}]);
            let release;
            read = () => new Promise(resolve => { release = resolve });
            const task = mount();
            await settle();
            expect(release).toBeDefined();
            const before = view.offsetWidth;
            if (retirement === 'destroy') view.destroy();
            else if (retirement === 'unmount') view.mounted = false;
            else view.windowId = 'replacement-window';
            release({attributes: {offsetWidth: 900, offsetHeight: 700}});
            await task;
            expect(view.offsetWidth).toBe(before);
            expect(errors).toEqual([]);
            if (!view.isDestroyed) expect(view.selectionModel.getSelection()).toEqual([])
        })
    }

    test('an old mount reply cannot overwrite a newer remount', async () => {
        await create({}, [{id: 1, image: 'one.png'}]);
        const releases = [];
        read = () => new Promise(resolve => releases.push(resolve));
        const oldTask = mount();
        await settle();
        view.mounted = false;
        const newTask = mount();
        await settle();
        expect(releases).toHaveLength(2);
        releases[1]({attributes: {offsetWidth: 900, offsetHeight: 700}});
        await newTask;
        releases[0]({attributes: {offsetWidth: 100, offsetHeight: 50}});
        await oldTask;
        expect(view.offsetWidth).toBe(900);
        expect(view.selectionModel.getSelection()).toEqual([view.getRecordId(store.getAt(0))]);
        expect(errors).toEqual([])
    });

    test('a window change retires measured intent before late rows arrive', async () => {
        await create();
        await mount();
        view.windowId = 'new-render-window';
        store.add({id: 1, image: 'one.png'});
        expect(view.selectionModel.getSelection()).toEqual([]);
        view.mounted = false;
        await mount();
        expect(view.selectionModel.getSelection()).toEqual([view.getRecordId(store.get(1))]);
        expect(errors).toEqual([])
    });

    test('returning to an earlier window does not revive its retired native reply', async () => {
        await create({}, [{id: 1, image: 'one.png'}]);
        const firstWindow = view.windowId, before = view.offsetWidth;
        let release;
        read = () => new Promise(resolve => { release = resolve });
        const task = mount();
        await settle();
        view.windowId = 'intermediate-window';
        view.windowId = firstWindow;
        release({attributes: {offsetWidth: 900, offsetHeight: 700}});
        await task;
        expect(view.offsetWidth).toBe(before);
        expect(view.selectionModel.getSelection()).toEqual([]);
        expect(errors).toEqual([])
    });

    test('destruction cancels the owned mount delay without a native read or error', async () => {
        await create();
        view.timeout = core.Base.prototype.timeout;
        let reads = 0;
        read = async () => { reads++; return {attributes: {offsetWidth: 1, offsetHeight: 1}} };
        const task = mount();
        view.destroy();
        await task;
        expect(reads).toBe(0);
        expect(errors).toEqual([])
    });

    test('an unexpected native read failure stays observable', async () => {
        await create();
        const error = new Error('native dimension failure');
        read = async () => { throw error };
        await mount();
        expect(errors).toEqual([['Unable to initialize Gallery selection', error]])
    });

    for (const departed of [true, false]) {
        test(`a dead native port is ${departed ? 'quiet only for a verified departure' : 'reported without departure evidence'}`, async () => {
            await create();
            const windowId = view.windowId, error = Object.assign(new Error('dead port'), {code: 'NEO_DEAD_PORT'});
            let reject;
            read = () => new Promise((resolve, fail) => { reject = fail });
            Neo.currentWorker.isDeparture = (reason, target) => reason === error && target === windowId && departed;
            const task = mount();
            await settle();
            view.windowId = 'new-window';
            reject(error);
            await task;
            expect(errors).toEqual(departed ? [] : [['Unable to initialize Gallery selection', error]])
        })
    }
});
