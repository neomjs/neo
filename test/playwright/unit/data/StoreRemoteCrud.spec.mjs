import {setup} from '../../setup.mjs';

const appName = 'StoreRemoteCrudTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Store           from '../../../../src/data/Store.mjs';

const
    apiNs = 'Test.backend.CrudService',
    model = {
        module: Model,
        fields: [
            {name: 'id',   type: 'Int'},
            {name: 'name', type: 'String'}
        ]
    };

/**
 * @summary Backend-first CRUD on Neo.data.Store: remoteCreate / remoteUpdate / remoteDestroy.
 * A fake api service is registered directly into the Neo namespace, so no real websocket /
 * remotes-api registration is involved — the methods just resolve `api.<verb>` and call it.
 */
test.describe.serial('Neo.data.Store remote CRUD', () => {
    test('remoteCreate persists, then inserts the server-authoritative record', async () => {
        Neo.ns(apiNs, true).create = async data => ({success: true, data: {...data, id: 99}});

        const store = Neo.create(Store, {keyProperty: 'id', model, api: {create: `${apiNs}.create`}}),
              added = await store.remoteCreate({name: 'New'});

        expect(store.count).toBe(1);
        expect(added[0].id).toBe(99);      // backend-assigned id is reflected
        expect(added[0].name).toBe('New');

        store.destroy()
    });

    test('remoteCreate rejects + fires mutationFailed + leaves the store unchanged on failure', async () => {
        Neo.ns(apiNs, true).create = async () => ({success: false, message: 'denied'});

        const store = Neo.create(Store, {keyProperty: 'id', model, api: {create: `${apiNs}.create`}});

        let failed = null, error = null;
        store.on('mutationFailed', data => failed = data);

        try { await store.remoteCreate({name: 'X'}) } catch (e) { error = e }

        expect(error).toBeTruthy();
        expect(error.message).toContain('denied');
        expect(store.count).toBe(0);
        expect(failed?.action).toBe('create');

        store.destroy()
    });

    test('remoteCreate falls back to a local add when no api.create is configured', async () => {
        const store = Neo.create(Store, {keyProperty: 'id', model, api: {read: `${apiNs}.read`}}),
              added = await store.remoteCreate({id: 1, name: 'Local'});

        expect(store.count).toBe(1);
        expect(added[0].name).toBe('Local');

        store.destroy()
    });

    test('remoteUpdate applies the server-authoritative response on success', async () => {
        Neo.ns(apiNs, true).update = async data => ({success: true, data: {...data, name: 'Server'}});

        const store  = Neo.create(Store, {keyProperty: 'id', model, api: {update: `${apiNs}.update`}, items: [{id: 1, name: 'A'}]}),
              record = store.get(1);

        await store.remoteUpdate(record, {name: 'Edited'});

        expect(record.name).toBe('Server');

        store.destroy()
    });

    test('remoteUpdate falls back to a local set when no api.update is configured', async () => {
        const store  = Neo.create(Store, {keyProperty: 'id', model, api: {read: `${apiNs}.read`}, items: [{id: 1, name: 'A'}]}),
              record = store.get(1);

        await store.remoteUpdate(record, {name: 'LocalEdit'});

        expect(record.name).toBe('LocalEdit');

        store.destroy()
    });

    test('remoteDestroy removes the record on success', async () => {
        Neo.ns(apiNs, true).destroy = async () => ({success: true});

        const store = Neo.create(Store, {keyProperty: 'id', model, api: {destroy: `${apiNs}.destroy`}, items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}]});

        await store.remoteDestroy(store.get(1));

        expect(store.count).toBe(1);
        expect(store.get(1)).toBeFalsy();

        store.destroy()
    });

    test('remoteDestroy rejects + leaves the store unchanged on failure', async () => {
        Neo.ns(apiNs, true).destroy = async () => ({success: false, message: 'locked'});

        const store = Neo.create(Store, {keyProperty: 'id', model, api: {destroy: `${apiNs}.destroy`}, items: [{id: 1, name: 'A'}]});

        let error = null;
        try { await store.remoteDestroy(store.get(1)) } catch (e) { error = e }

        expect(error).toBeTruthy();
        expect(store.count).toBe(1);

        store.destroy()
    });
});
