import {setup} from '../../setup.mjs';

const appName = 'StateProviderTest';

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
import Component       from '../../../../src/component/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';
import Store           from '../../../../src/data/Store.mjs';

// Mock Component for testing purposes
class MockComponent extends Component {
    static config = {
        className  : 'Mock.Component',
        appName,
        testConfig_: null,
        userObject_: null
    }
}
MockComponent = Neo.setupClass(MockComponent);

// Helper function to convert a proxy to a plain object for deep comparison
function proxyToObject(proxy) {
    return JSON.parse(JSON.stringify(proxy));
}

test.describe('Neo.state.Provider (Node.js)', () => {

    test('Provider should initialize with data and create configs', () => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {name: 'Test', value: 123, user: {firstName: 'John'}}
            }
        });
        const provider = component.getStateProvider();

        expect(provider.getDataConfig('name').get()).toBe('Test');
        expect(provider.getDataConfig('value').get()).toBe(123);
        expect(provider.getDataConfig('user.firstName').get()).toBe('John');

        component.destroy();
    });

    test('Provider should update data and trigger config changes', () => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {counter: 0}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.counter;
        });

        expect(effectRunCount).toBe(1);
        expect(component.testConfig).toBe(0);

        component.setState('counter', 1);
        expect(effectRunCount).toBe(2);
        expect(component.testConfig).toBe(1);

        component.setState({counter: 2});
        expect(effectRunCount).toBe(3);
        expect(component.testConfig).toBe(2);

        component.destroy();
    });

    test('Provider should handle hierarchical data access', () => {
        const parentComponent = Neo.create(MockComponent, {
            stateProvider: {data: {appTitle: 'My App', user: {firstName: 'Parent'}}}
        });
        const childComponent = Neo.create(MockComponent, {
            stateProvider: {data: {user: {lastName: 'Child'}}},
            parentComponent: parentComponent
        });

        let effectRunCount = 0;
        childComponent.getStateProvider().createBinding(childComponent.id, 'testConfig', data => {
            effectRunCount++;
            return `${data.appTitle} - ${data.user.firstName} ${data.user.lastName}`;
        });

        expect(effectRunCount).toBe(1);
        expect(childComponent.testConfig).toBe('My App - Parent Child');

        parentComponent.setState('appTitle', 'New App Title');
        expect(effectRunCount).toBe(2);
        expect(childComponent.testConfig).toBe('New App Title - Parent Child');

        childComponent.setState('user.lastName', 'New Child');
        expect(effectRunCount).toBe(3);
        expect(childComponent.testConfig).toBe('New App Title - Parent New Child');

        parentComponent.setState('user.firstName', 'New Parent');
        expect(effectRunCount).toBe(4);
        expect(childComponent.testConfig).toBe('New App Title - New Parent New Child');

        parentComponent.destroy();
        childComponent.destroy();
    });

    test('Provider should remove bindings on component destroy', () => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {test: 1}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        const bindingEffect = provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.test;
        });

        expect(effectRunCount).toBe(1);
        expect(bindingEffect.isDestroyed).toBe(false);

        component.destroy();
        expect(bindingEffect.isDestroyed).toBe(true);

        provider.setData('test', 2);
        expect(effectRunCount).toBe(1);
    });

    test('Provider should remove bindings on provider destroy', () => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {test: 1}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        const bindingEffect = provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.test;
        });

        expect(effectRunCount).toBe(1);
        expect(bindingEffect.isDestroyed).toBe(false);

        provider.destroy();
        expect(bindingEffect.isDestroyed).toBe(true);

        component.setState('test', 2);
        expect(effectRunCount).toBe(1);

        component.destroy();
    });

    test('setData should create new data properties if they do not exist', () => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.newProp;
        });

        expect(effectRunCount).toBe(1);
        expect(component.testConfig).toBe(null);

        component.setState('newProp', 'hello');
        expect(effectRunCount).toBe(2);
        expect(component.testConfig).toBe('hello');
        expect(provider.getDataConfig('newProp').get()).toBe('hello');

        component.setState('nested.newProp', 'world');
        expect(provider.getDataConfig('nested.newProp').get()).toBe('world');

        component.destroy();
    });

    test('Two-way binding should update state provider from component config changes', () => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {inputValue: 'initial'}
            },
            bind: {
                testConfig: {key: 'inputValue', twoWay: true}
            }
        });
        const provider = component.getStateProvider();

        expect(component.testConfig).toBe('initial');
        expect(provider.getDataConfig('inputValue').get()).toBe('initial');

        component.testConfig = 'updated from component';
        expect(provider.getDataConfig('inputValue').get()).toBe('updated from component');

        provider.setData('inputValue', 'updated from provider');
        expect(component.testConfig).toBe('updated from provider');

        component.destroy();
    });

    test('Two-way binding should handle nested data properties', () => {
        let userEffectRuns = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    user: {
                        name: 'initial'
                    }
                }
            },
            bind: {
                testConfig: { key: 'user.name', twoWay: true },
                userObject: 'user'
            }
        });
        const provider = component.getStateProvider();

        const userEffect = new Neo.core.Effect(() => {
            userEffectRuns++;
            return provider.getData('user');
        });

        expect(userEffectRuns).toBe(1);
        expect(component.testConfig).toBe('initial');
        expect(provider.getData('user.name')).toBe('initial');

        component.testConfig = 'updated from component';
        expect(provider.getData('user.name')).toBe('updated from component');
        expect(userEffectRuns).toBe(2);

        provider.setData('user.name', 'updated from provider');
        expect(component.testConfig).toBe('updated from provider');
        expect(userEffectRuns).toBe(3);

        const initialUserObject = component.userObject;
        provider.setData('user.name', 'another update');
        const newUserObject = component.userObject;

        expect(component.testConfig).toBe('another update');
        expect(provider.getData('user.name')).toBe('another update');
        expect(userEffectRuns).toBe(4);
        expect(newUserObject).not.toBe(initialUserObject);
        expect(newUserObject.name).toBe('another update');

        userEffect.destroy();
        component.destroy();
    });

    test('Formulas should calculate correctly and react to dependencies', () => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    price   : 10,
                    quantity: 2
                },
                formulas: {
                    total(data) {return data.price * data.quantity},
                    discountedTotal: (data) => data.total * 0.9
                }
            }
        });
        const provider = component.getStateProvider();

        expect(provider.getDataConfig('total').get()).toBe(20);
        expect(provider.getDataConfig('discountedTotal').get()).toBe(18);

        component.setState('price', 15);
        expect(provider.getDataConfig('total').get()).toBe(30);
        expect(provider.getDataConfig('discountedTotal').get()).toBe(27);

        component.setState('quantity', 5);
        expect(provider.getDataConfig('total').get()).toBe(75);
        expect(provider.getDataConfig('discountedTotal').get()).toBe(67.5);

        component.destroy();
    });

    test('Store management should correctly bind components to stores and react to store changes', () => {
        const store = Neo.create(Store, {
            data : [{id: 1, name: 'Item 1'}, {id: 2, name: 'Item 2'}],
            model: {fields: [{name: 'id', type: 'Int'}, {name: 'name', type: 'String'}]}
        });

        const component = Neo.create(MockComponent, {
            stateProvider: {
                stores: {
                    myStore: store
                }
            },
            bind: {
                testConfig: 'stores.myStore'
            }
        });

        expect(component.testConfig).toBe(store);
        expect(component.testConfig.count).toBe(2);

        store.add({id: 3, name: 'Item 3'});
        expect(component.testConfig.count).toBe(3);

        store.remove(store.get(1));
        expect(component.testConfig.count).toBe(2);

        component.destroy();
        store.destroy();
    });

    test('Store management with an inline store', () => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                stores: {
                    myStore: {
                        module: Store,
                        data  : [{id: 1, name: 'Item 1'}, {id: 2, name: 'Item 2'}],
                        model : {fields: [{name: 'id'}, {name: 'name'}]}
                    }
                }
            },
            bind: {
                testConfig: 'stores.myStore'
            }
        });

        const store = component.getStateProvider().getStore('myStore');

        expect(component.testConfig).toBe(store);
        expect(component.testConfig.count).toBe(2);

        store.add({id: 3, name: 'Item 3'});
        expect(component.testConfig.count).toBe(3);

        store.remove(store.get(1));
        expect(component.testConfig.count).toBe(2);

        component.destroy();
        store.destroy();
    });

    test('Provider data_ config should deep merge class and instance level data', () => {
        class ClassLevelProvider extends StateProvider {
            static config = {
                className: 'ClassLevelProvider',
                data:  {
                    a: 1,
                    b: { c: 2, d: 3 },
                    arr: [1, 2]
                }
            }
        }
        ClassLevelProvider = Neo.setupClass(ClassLevelProvider);

        const provider1 = Neo.create(ClassLevelProvider);
        expect(proxyToObject(provider1.data)).toEqual({ a: 1, b: { c: 2, d: 3 }, arr: [1, 2] });
        provider1.destroy();

        const provider2 = Neo.create(ClassLevelProvider, { data: { x: 10, y: 20 } });
        expect(proxyToObject(provider2.data)).toEqual({ a: 1, b: { c: 2, d: 3 }, arr: [1, 2], x: 10, y: 20 });
        provider2.destroy();

        const provider3 = Neo.create(ClassLevelProvider, { data: { b: { e: 4 }, arr: [3, 4], newProp: 'test' } });
        expect(proxyToObject(provider3.data)).toEqual({ a: 1, b: { c: 2, d: 3, e: 4 }, arr: [3, 4], newProp: 'test' });
        provider3.destroy();

        const provider4 = Neo.create(ClassLevelProvider, { data: { b: { c: 99 } } });
        expect(proxyToObject(provider4.data)).toEqual({ a: 1, b: { c: 99, d: 3 }, arr: [1, 2] });
        provider4.destroy();
    });

    test('Provider data_ config should deep merge across multi-level class inheritance', () => {
        class GrandparentProvider extends StateProvider {
            static config = {
                className: 'GrandparentProvider',
                data: { app: { name: 'My App', version: '1.0.0' }, user: { role: 'guest', settings: { theme: 'dark' } } }
            }
        }
        GrandparentProvider = Neo.setupClass(GrandparentProvider);

        class ParentProvider extends GrandparentProvider {
            static config = {
                className: 'ParentProvider',
                data: { app: { version: '1.1.0', author: 'Neo' }, user: { id: 123, settings: { notifications: true } }, newParentProp: 'parentValue' }
            }
        }
        ParentProvider = Neo.setupClass(ParentProvider);

        class ChildProvider extends ParentProvider {
            static config = {
                className: 'ChildProvider',
                data: { user: { role: 'admin', preferences: { language: 'en' } }, newChildProp: 'childValue' }
            }
        }
        ChildProvider = Neo.setupClass(ChildProvider);

        const provider1 = Neo.create(ChildProvider);
        expect(proxyToObject(provider1.data)).toEqual({
            app: { name: 'My App', version: '1.1.0', author: 'Neo' },
            user: { role: 'admin', id: 123, settings: { theme: 'dark', notifications: true }, preferences: { language: 'en' } },
            newParentProp: 'parentValue',
            newChildProp: 'childValue'
        });
        provider1.destroy();

        const provider2 = Neo.create(ChildProvider, {
            data: {
                app: { version: '2.0.0', status: 'beta' },
                user: { id: 456, settings: { theme: 'light', notifications: false } },
                newChildProp: 'overriddenChildValue',
                instanceOnlyProp: 'instanceValue'
            }
        });
        expect(proxyToObject(provider2.data)).toEqual({
            app: { name: 'My App', version: '2.0.0', author: 'Neo', status: 'beta' },
            user: { role: 'admin', id: 456, settings: { theme: 'light', notifications: false }, preferences: { language: 'en' } },
            newParentProp: 'parentValue',
            newChildProp: 'overriddenChildValue',
            instanceOnlyProp: 'instanceValue'
        });
        provider2.destroy();
    });

    test('Formulas in nested providers should combine own and parent data', () => {
        const parentComponent = Neo.create(MockComponent, {
            stateProvider: {
                data: { basePrice: 100, taxRate: 0.05 }
            }
        });
        const childComponent = Neo.create(MockComponent, {
            parentComponent,

            stateProvider: {
                data: { itemQuantity: 2 },
                formulas: {
                    totalCost: (data) => (data.basePrice * data.itemQuantity) * (1 + data.taxRate)
                }
            }
        });

        const parentProvider = parentComponent.getStateProvider();
        const childProvider  = childComponent.getStateProvider();

        expect(childProvider.getData('totalCost')).toBe((100 * 2) * (1 + 0.05));

        parentProvider.setData('basePrice', 120);
        expect(childProvider.getData('totalCost')).toBe((120 * 2) * (1 + 0.05));

        childProvider.setData('itemQuantity', 3);
        expect(childProvider.getData('totalCost')).toBe((120 * 3) * (1 + 0.05));

        parentProvider.setData('taxRate', 0.10);
        expect(childProvider.getData('totalCost')).toBe((120 * 3) * (1 + 0.10));

        parentComponent.destroy();
        childComponent.destroy();
    });
});
