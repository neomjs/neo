import {test, expect}                from '@playwright/test';
import Neo                           from '../../../../src/Neo.mjs';
import * as core                     from '../../../../src/core/_export.mjs';
import {createHierarchicalDataProxy} from '../../../../src/state/createHierarchicalDataProxy.mjs';
import Effect                        from '../../../../src/core/Effect.mjs';
import EffectManager                 from '../../../../src/core/EffectManager.mjs';
import Config                        from '../../../../src/core/Config.mjs';
import Base                          from '../../../../src/core/Base.mjs';

// Mock StateProvider for testing purposes
class MockStateProvider extends Base {
    static config = {
        className: 'Mock.State.Provider',
        data_    : null
    }

    #dataConfigs = {};

    afterSetData(value, oldValue) {
        if (value) {
            this.processDataObject(value);
        }
    }

    processDataObject(obj, path = '') {
        Object.entries(obj).forEach(([key, value]) => {
            const fullPath = path ? `${path}.${key}` : key;
            if (Neo.typeOf(value) === 'Object') {
                this.processDataObject(value, fullPath);
            } else {
                const clonedValue = Neo.isObject(value) ? Neo.clone(value, true) : value; // Deep clone objects
                this.#dataConfigs[fullPath] = new Config(clonedValue);
            }
        });
    }

    getDataConfig(path) {
        return this.#dataConfigs[path] || null;
    }

    getOwnerOfDataProperty(path) {
        if (this.#dataConfigs[path]) {
            return { owner: this, propertyName: path };
        }
        const parent = this.getParent();
        if (parent) {
            return parent.getOwnerOfDataProperty(path);
        }
        return null;
    }

    hasNestedDataStartingWith(path) {
        const pathWithDot = `${path}.`;
        if (Object.keys(this.#dataConfigs).some(key => key.startsWith(pathWithDot))) {
            return true;
        }
        const parent = this.getParent();
        return parent ? parent.hasNestedDataStartingWith(path) : false;
    }

    getParent() {
        // For testing, we'll manually set a parent
        return this._parent || null;
    }
}

MockStateProvider = Neo.setupClass(MockStateProvider);

/**
 * @summary Verifies the functionality of createHierarchicalDataProxy for reactive state management.
 * This suite tests the proxy's ability to resolve data from single and multiple (parent/child) state providers.
 * It ensures that effects are correctly triggered when underlying data changes and that the proxy correctly
 * handles nested data structures and property lookups that do not exist in the data hierarchy.
 */
test.describe('state/createHierarchicalDataProxy', () => {
    test('should resolve data from a single provider', () => {
        const provider = Neo.create(MockStateProvider, { data: { name: 'Neo', version: 10 } });
        let effectRunCount = 0;

        const effect = new Effect(() => {
            effectRunCount++;
            const proxy = createHierarchicalDataProxy(provider);
            if (effectRunCount === 1) {
                expect(proxy.name).toBe('Neo');
                expect(proxy.version).toBe(10);
            } else if (effectRunCount === 2) {
                expect(proxy.name).toBe('Neo.mjs');
                expect(proxy.version).toBe(10);
            }
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(2);

        provider.getDataConfig('name').set('Neo.mjs');
        expect(effectRunCount).toBe(2);

        effect.destroy();
        provider.destroy();
    });

    test('should resolve nested data from a single provider', () => {
        const provider = Neo.create(MockStateProvider, { data: { user: { firstName: 'John', lastName: 'Doe' } } });
        let effectRunCount = 0;

        const effect = new Effect(() => {
            effectRunCount++;
            const proxy = createHierarchicalDataProxy(provider);
            if (effectRunCount === 1) {
                expect(proxy.user.firstName).toBe('John');
                expect(proxy.user.lastName).toBe('Doe');
            } else if (effectRunCount === 2) {
                expect(proxy.user.firstName).toBe('Jane');
                expect(proxy.user.lastName).toBe('Doe');
            }
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(2);

        provider.getDataConfig('user.firstName').set('Jane');
        expect(effectRunCount).toBe(2);

        effect.destroy();
        provider.destroy();
    });

    test('should resolve data from parent providers', () => {
        const parentProvider = Neo.create(MockStateProvider, { data: { appTitle: 'My App', user: { firstName: 'Parent' } } });
        const childProvider = Neo.create(MockStateProvider, { data: { user: { lastName: 'Child' } } });
        childProvider._parent = parentProvider; // Manually set parent

        let effectRunCount = 0;

        const effect = new Effect(() => {
            effectRunCount++;
            const proxy = createHierarchicalDataProxy(childProvider);
            if (effectRunCount === 1) {
                expect(proxy.appTitle).toBe('My App');
                expect(proxy.user.firstName).toBe('Parent');
                expect(proxy.user.lastName).toBe('Child');
            } else if (effectRunCount === 2) {
                expect(proxy.appTitle).toBe('New App Title');
                expect(proxy.user.firstName).toBe('Parent');
                expect(proxy.user.lastName).toBe('Child');
            } else if (effectRunCount === 3) {
                expect(proxy.appTitle).toBe('New App Title');
                expect(proxy.user.firstName).toBe('Parent');
                expect(proxy.user.lastName).toBe('New Child');
            } else if (effectRunCount === 4) {
                expect(proxy.appTitle).toBe('New App Title');
                expect(proxy.user.firstName).toBe('New Parent');
                expect(proxy.user.lastName).toBe('New Child');
            }
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(3);

        parentProvider.getDataConfig('appTitle').set('New App Title');
        expect(effectRunCount).toBe(2);

        childProvider.getDataConfig('user.lastName').set('New Child');
        expect(effectRunCount).toBe(3);

        parentProvider.getDataConfig('user.firstName').set('New Parent');
        expect(effectRunCount).toBe(4);

        effect.destroy();
        parentProvider.destroy();
        childProvider.destroy();
    });

    test('should handle properties that are not data or nested paths', () => {
        const provider = Neo.create(MockStateProvider, { data: { foo: 'bar' } });
        let effectRunCount = 0;

        const effect = new Effect(() => {
            effectRunCount++;
            const proxy = createHierarchicalDataProxy(provider);
            expect(proxy.nonExistent).toBe(undefined);
            expect(proxy.foo).toBe('bar');
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(1);

        effect.destroy();
        provider.destroy();
    });

    test('should not track dependencies when no effect is active', () => {
        const provider = Neo.create(MockStateProvider, {data: {test: 123}});
        const proxy    = createHierarchicalDataProxy(provider);

        // No active effect
        expect(EffectManager.getActiveEffect()).toBe(undefined);

        // Access property without active effect
        const value = proxy.test;
        expect(value).toBe(123);

        // Verify no dependencies were added to a non-existent effect
        const mockEffect = { addDependency: () => { throw new Error('addDependency should not be called'); } };
        EffectManager.push(mockEffect); // Temporarily push a mock effect
        EffectManager.pop(); // Immediately pop it

        provider.destroy();
    });
});
