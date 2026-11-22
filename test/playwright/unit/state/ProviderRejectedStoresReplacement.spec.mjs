import {setup} from '../../setup.mjs';

const appName = 'StateProviderRejectedStoresTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';
import Store           from '../../../../src/data/Store.mjs';
import StoreManager    from '../../../../src/manager/Store.mjs';

// Rejects an otherwise well-formed config while its configs apply, after Base#construct registered its id
class RejectingStore extends Store {
    static config = {
        className: 'Test.Unit.State.ProviderRejectedStores.RejectingStore',
        rejects_ : false
    }

    beforeSetRejects(value) {
        if (value) {
            throw new Error('The store rejects its config')
        }

        return value
    }
}
RejectingStore = Neo.setupClass(RejectingStore);

/**
 * @summary A `stores` replacement that throws keeps the provider's previous stores live and registered for every
 * borrower, retires the successors it already built, and lets a corrected replacement succeed.
 */
test.describe('Neo.state.Provider rejected stores replacement', () => {
    const
        createPair = storeConfig => {
            const
                root  = Neo.create(StateProvider, {stores: {plan: storeConfig}}),
                child = Neo.create(StateProvider, {parent: root});

            return {child, original: child.getStore('plan'), root}
        },
        registered = id => ({instance: InstanceManager.get(id) || null, store: StoreManager.get(id) || null});

    test('a malformed later descriptor leaves the borrowed store live, and a corrected retry replaces it', () => {
        const {child, original, root} = createPair({module: Store, keyProperty: 'id', data: [{id: 'task'}]});

        expect(() => {
            root.stores = {plan: {module: Store, keyProperty: 'id'}, invalid: null}
        }).toThrow();

        expect(child.getStore('plan')).toBe(original);
        expect(original.isDestroyed).toBeFalsy();
        expect(original.getCount()).toBe(1);
        expect(registered(original.id)).toEqual({instance: original, store: original});

        // The successor built before the malformed entry is gone
        expect(registered(`${root.id}__plan__1`)).toEqual({instance: null, store: null});

        root.stores = {plan: {module: Store, keyProperty: 'id'}};

        const successor = child.getStore('plan');

        expect(successor).not.toBe(original);
        expect(successor.isDestroyed).toBeFalsy();
        expect(original.isDestroyed).toBe(true);
        expect(registered(successor.id)).toEqual({instance: successor, store: successor});

        child.destroy();
        root.destroy();

        expect(successor.isDestroyed).toBe(true)
    });

    test('a store that rejects its config leaves no successor or half-built store registered', () => {
        const {child, original, root} = createPair({module: Store, keyProperty: 'id', data: [{id: 'task'}]});

        expect(() => {
            root.stores = {
                plan : {module: Store, keyProperty: 'id'},
                audit: {module: RejectingStore, keyProperty: 'id', rejects: true}
            }
        }).toThrow('The store rejects its config');

        expect(child.getStore('plan')).toBe(original);
        expect(original.isDestroyed).toBeFalsy();
        expect(original.getCount()).toBe(1);
        expect(registered(original.id)).toEqual({instance: original, store: original});
        expect(registered(`${root.id}__plan__1`)).toEqual({instance: null, store: null});
        expect(registered(`${root.id}__audit__1`)).toEqual({instance: null, store: null});

        root.stores = {
            plan : {module: Store, keyProperty: 'id'},
            audit: {module: RejectingStore, keyProperty: 'id'}
        };

        expect(child.getStore('audit').isDestroyed).toBeFalsy();
        expect(original.isDestroyed).toBe(true);

        child.destroy();
        root.destroy()
    });

    test('an unrelated store already holding a failed descriptor\'s id survives the rollback', () => {
        const
            foreign                 = Neo.create(Store, {id: 'provider-rejected-replacement-foreign-store', keyProperty: 'id'}),
            {child, original, root} = createPair({module: Store, keyProperty: 'id'});

        expect(() => {
            root.stores = {
                plan : {module: Store, keyProperty: 'id'},
                clash: {module: RejectingStore, id: foreign.id, keyProperty: 'id', rejects: true}
            }
        }).toThrow('The store rejects its config');

        expect(foreign.isDestroyed).toBeFalsy();
        expect(registered(foreign.id)).toEqual({instance: foreign, store: foreign});
        expect(child.getStore('plan')).toBe(original);

        child.destroy();
        root.destroy();
        foreign.destroy()
    });

    test('a passed-through value between a built successor and the failure leaves the rollback whole', () => {
        const
            storeId                 = 'provider-rejected-replacement-mixed-store',
            {child, original, root} = createPair({module: Store, id: storeId, keyProperty: 'id', data: [{id: 'task'}]});

        // The string passes through beforeSetInstance as it is; the null entry then throws its own error
        expect(() => {
            root.stores = {plan: {module: Store, id: storeId, keyProperty: 'id'}, typo: 'oops', invalid: null}
        }).toThrow(/reading 'listeners'/);

        expect(child.getStore('plan')).toBe(original);
        expect(original.isDestroyed).toBeFalsy();
        expect(registered(storeId)).toEqual({instance: original, store: original});

        // The failed map left the generation where it was
        root.stores = {plan: {module: Store, id: storeId, keyProperty: 'id'}, extra: {module: Store, keyProperty: 'id'}};

        expect(child.getStore('extra').id).toBe(`${root.id}__extra__1`);
        expect(registered(storeId)).toEqual({instance: child.getStore('plan'), store: child.getStore('plan')});
        expect(original.isDestroyed).toBe(true);

        child.destroy();
        root.destroy()
    });

    test('an explicit id the failed map reused goes back to the original store', () => {
        const
            storeId                 = 'provider-rejected-replacement-explicit-store',
            {child, original, root} = createPair({module: Store, id: storeId, keyProperty: 'id', data: [{id: 'task'}]});

        expect(() => {
            root.stores = {plan: {module: Store, id: storeId, keyProperty: 'id'}, invalid: null}
        }).toThrow();

        expect(child.getStore('plan')).toBe(original);
        expect(original.isDestroyed).toBeFalsy();
        expect(registered(storeId)).toEqual({instance: original, store: original});

        root.stores = {plan: {module: Store, id: storeId, keyProperty: 'id'}};

        const successor = child.getStore('plan');

        expect(successor).not.toBe(original);
        expect(original.isDestroyed).toBe(true);
        expect(registered(storeId)).toEqual({instance: successor, store: successor});

        child.destroy();
        root.destroy()
    })
});
