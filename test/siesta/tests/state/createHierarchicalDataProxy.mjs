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
        data_: null
    }

    #dataConfigs = {};

    construct(config) {
        super.construct(config);
    }

    afterSetData(value, oldValue) {
        console.log(value);
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
            return {owner: this, propertyName: path};
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
Neo.setupClass(MockStateProvider);

StartTest(t => {
    t.it('should resolve data from a single provider', t => {
        const provider = Neo.create(MockStateProvider, {data: {name: 'Neo', version: 10}});
        let effectRunCount = 0;

        const effect = new Effect({
            fn: () => {
                effectRunCount++;
                const proxy = createHierarchicalDataProxy(provider);
                if (effectRunCount === 1) {
                    t.is(proxy.name, 'Neo', 'Should get name from proxy (initial)');
                    t.is(proxy.version, 10, 'Should get version from proxy (initial)');
                } else if (effectRunCount === 2) {
                    t.is(proxy.name, 'Neo.mjs', 'Should get name from proxy (updated)');
                    t.is(proxy.version, 10, 'Should get version from proxy (unchanged)');
                }
            }
        });

        t.is(effectRunCount, 1, 'Effect should run once initially');
        t.is(effect.dependencies.size, 2, 'Effect should track 2 dependencies');

        provider.getDataConfig('name').set('Neo.mjs');
        t.is(effectRunCount, 2, 'Effect should re-run when dependency changes');

        effect.destroy();
        provider.destroy();
    });

    t.it('should resolve nested data from a single provider', t => {
        const provider = Neo.create(MockStateProvider, {data: {user: {firstName: 'John', lastName: 'Doe'}}});
        let effectRunCount = 0;

        const effect = new Effect({
            fn: () => {
                effectRunCount++;
                const proxy = createHierarchicalDataProxy(provider);
                if (effectRunCount === 1) {
                    t.is(proxy.user.firstName, 'John', 'Should get nested firstName (initial)');
                    t.is(proxy.user.lastName, 'Doe', 'Should get nested lastName (initial)');
                } else if (effectRunCount === 2) {
                    t.is(proxy.user.firstName, 'Jane', 'Should get nested firstName (updated)');
                    t.is(proxy.user.lastName, 'Doe', 'Should get nested lastName (unchanged)');
                }
            }
        });

        t.is(effectRunCount, 1, 'Effect should run once initially');
        t.is(effect.dependencies.size, 2, 'Effect should track 2 nested dependencies');

        provider.getDataConfig('user.firstName').set('Jane');
        t.is(effectRunCount, 2, 'Effect should re-run when nested dependency changes');

        effect.destroy();
        provider.destroy();
    });

    t.it('should resolve data from parent providers', t => {
        const parentProvider = Neo.create(MockStateProvider, {data: {appTitle: 'My App', user: {firstName: 'Parent'}}});
        const childProvider = Neo.create(MockStateProvider, {data: {user: {lastName: 'Child'}}});
        childProvider._parent = parentProvider; // Manually set parent

        let effectRunCount = 0;

        const effect = new Effect({
            fn: () => {
                effectRunCount++;
                const proxy = createHierarchicalDataProxy(childProvider);
                if (effectRunCount === 1) {
                    t.is(proxy.appTitle, 'My App', 'Should get appTitle from parent (initial)');
                    t.is(proxy.user.firstName, 'Parent', 'Should get firstName from parent (initial)');
                    t.is(proxy.user.lastName, 'Child', 'Should get lastName from child (initial)');
                } else if (effectRunCount === 2) {
                    t.is(proxy.appTitle, 'New App Title', 'Should get appTitle from parent (updated)');
                    t.is(proxy.user.firstName, 'Parent', 'Should get firstName from parent (unchanged)');
                    t.is(proxy.user.lastName, 'Child', 'Should get lastName from child (unchanged)');
                } else if (effectRunCount === 3) {
                    t.is(proxy.appTitle, 'New App Title', 'Should get appTitle from parent (unchanged)');
                    t.is(proxy.user.firstName, 'Parent', 'Should get firstName from parent (unchanged)');
                    t.is(proxy.user.lastName, 'New Child', 'Should get lastName from child (updated)');
                } else if (effectRunCount === 4) {
                    t.is(proxy.appTitle, 'New App Title', 'Should get appTitle from parent (unchanged)');
                    t.is(proxy.user.firstName, 'New Parent', 'Should get firstName from parent (updated)');
                    t.is(proxy.user.lastName, 'New Child', 'Should get lastName from child (unchanged)');
                }
            }
        });

        t.is(effectRunCount, 1, 'Effect should run once initially');
        t.is(effect.dependencies.size, 3, 'Effect should track 3 dependencies across hierarchy');

        parentProvider.getDataConfig('appTitle').set('New App Title');
        t.is(effectRunCount, 2, 'Effect should re-run when parent dependency changes');

        childProvider.getDataConfig('user.lastName').set('New Child');
        t.is(effectRunCount, 3, 'Effect should re-run when child dependency changes');

        parentProvider.getDataConfig('user.firstName').set('New Parent');
        t.is(effectRunCount, 4, 'Effect should re-run when parent nested dependency changes');

        effect.destroy();
        parentProvider.destroy();
        childProvider.destroy();
    });

    t.it('should handle properties that are not data or nested paths', t => {
        const provider = Neo.create(MockStateProvider, {data: {foo: 'bar'}});
        let effectRunCount = 0;

        const effect = new Effect({
            fn: () => {
                effectRunCount++;
                const proxy = createHierarchicalDataProxy(provider);
                t.is(proxy.nonExistent, null, 'Should return null for non-existent property');
                t.is(proxy.foo, 'bar', 'Should still get existing data');
            }
        });

        t.is(effectRunCount, 1, 'Effect should run once initially');
        t.is(effect.dependencies.size, 1, 'Effect should only track existing data dependencies');

        effect.destroy();
        provider.destroy();
    });

    t.it('should not track dependencies when no effect is active', t => {
        const provider = Neo.create(MockStateProvider, {data: {test: 123}});
        const proxy = createHierarchicalDataProxy(provider);

        // No active effect
        t.is(EffectManager.getActiveEffect(), null, 'No active effect');

        // Access property without active effect
        const value = proxy.test;
        t.is(value, 123, 'Should get value correctly');

        // Verify no dependencies were added to a non-existent effect
        const mockEffect = { addDependency: t.fail }; // If this is called, test fails
        EffectManager.push(mockEffect); // Temporarily push a mock effect
        EffectManager.pop(); // Immediately pop it

        t.pass('No error when accessing proxy without active effect');

        provider.destroy();
    });
});
