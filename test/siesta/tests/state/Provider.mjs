import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Component       from '../../../../src/component/Base.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';
import Store           from '../../../../src/data/Store.mjs';


// Mock Component for testing purposes
class MockComponent extends Component {
    static config = {
        className  : 'Mock.Component',
        appName    : 'test-app',
        testConfig_: null
    }
}
Neo.setupClass(MockComponent);

StartTest(t => {
    // Helper function to convert a proxy to a plain object for deep comparison
    function proxyToObject(proxy) {
        return JSON.parse(JSON.stringify(proxy))
    }

    t.it('Provider should initialize with data and create configs', t => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {name: 'Test', value: 123, user: {firstName: 'John'}}
            }
        });
        const provider = component.getStateProvider();

        t.is(provider.getDataConfig('name').get(), 'Test', 'Name config should be created and have correct value');
        t.is(provider.getDataConfig('value').get(), 123, 'Value config should be created and have correct value');
        t.is(provider.getDataConfig('user.firstName').get(), 'John', 'Nested user.firstName config should be created');

        component.destroy();
    });

    t.it('Provider should update data and trigger config changes', t => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {counter: 0}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.counter;
        });

        t.is(effectRunCount, 1, 'Binding effect should run once initially');
        t.is(component.testConfig, 0, 'Component config should be initialized with data value');

        component.setState('counter', 1);
        t.is(effectRunCount, 2, 'Binding effect should re-run after setData');
        t.is(component.testConfig, 1, 'Component config should be updated after setData');

        component.setState({counter: 2});
        t.is(effectRunCount, 3, 'Binding effect should re-run after setData with object');
        t.is(component.testConfig, 2, 'Component config should be updated after setData with object');

        component.destroy();
    });

    t.it('Provider should handle hierarchical data access', t => {
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

        t.is(effectRunCount, 1, 'Binding effect should run once initially');
        t.is(childComponent.testConfig, 'My App - Parent Child', 'Component config should reflect hierarchical data');

        parentComponent.setState('appTitle', 'New App Title');
        t.is(effectRunCount, 2, 'Binding effect should re-run after parent data change');
        t.is(childComponent.testConfig, 'New App Title - Parent Child', 'Component config should update from parent data');

        childComponent.setState('user.lastName', 'New Child');
        t.is(effectRunCount, 3, 'Binding effect should re-run after child data change');
        t.is(childComponent.testConfig, 'New App Title - Parent New Child', 'Component config should update from child data');

        parentComponent.setState('user.firstName', 'New Parent');
        t.is(effectRunCount, 4, 'Binding effect should re-run after parent nested data change');
        t.is(childComponent.testConfig, 'New App Title - New Parent New Child', 'Component config should update from parent nested data');

        parentComponent.destroy();
        childComponent.destroy();
    });

    t.it('Provider should remove bindings on component destroy', t => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {test: 1}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        const bindingEffect = provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.test;
        });

        t.is(effectRunCount, 1, 'Effect ran initially');
        t.is(bindingEffect.isDestroyed, false, 'Binding effect should not be destroyed initially');

        component.destroy();
        t.is(bindingEffect.isDestroyed, true, 'Binding effect should be destroyed after component destroy');

        provider.setData('test', 2);
        t.is(effectRunCount, 1, 'Effect should not re-run after component destroyed');
    });

    t.it('Provider should remove bindings on provider destroy', t => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {test: 1}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        const bindingEffect = provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.test;
        });

        t.is(effectRunCount, 1, 'Effect ran initially');
        t.is(bindingEffect.isDestroyed, false, 'Binding effect should not be destroyed initially');

        provider.destroy();
        t.is(bindingEffect.isDestroyed, true, 'Binding effect should be destroyed after provider destroy');

        // Attempt to change data after provider destroyed
        component.setState('test', 2);
        t.is(effectRunCount, 1, 'Effect should not re-run after provider destroyed');

        component.destroy();
    });

    t.it('setData should create new data properties if they do not exist', t => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {}}});
        const provider = component.getStateProvider();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.newProp;
        });

        t.is(effectRunCount, 1, 'Effect ran initially');
        t.is(component.testConfig, undefined, 'Component config should be undefined initially');

        component.setState('newProp', 'hello');
        t.is(effectRunCount, 2, 'Effect re-ran after newProp was set');
        t.is(component.testConfig, 'hello', 'Component config should update with newProp');
        t.is(provider.getDataConfig('newProp').get(), 'hello', 'newProp config should exist');

        component.setState('nested.newProp', 'world');
        t.is(effectRunCount, 3, 'Effect re-ran after nested.newProp was set');
        t.is(provider.getDataConfig('nested.newProp').get(), 'world', 'nested.newProp config should exist');

        component.destroy();
    });

    t.it('Two-way binding should update state provider from component config changes', t => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {inputValue: 'initial'}
            },
            bind: {
                testConfig: {key: 'inputValue', twoWay: true}
            }
        });
        const provider = component.getStateProvider();

        t.is(component.testConfig, 'initial', 'Component config should be initialized from state provider');
        t.is(provider.getDataConfig('inputValue').get(), 'initial', 'State provider data should be initialized from component');

        component.testConfig = 'updated from component';
        t.is(provider.getDataConfig('inputValue').get(), 'updated from component', 'State provider data should update from component config change');

        provider.setData('inputValue', 'updated from provider');
        t.is(component.testConfig, 'updated from provider', 'Component config should update from state provider data change');

        component.destroy();
    });

    t.it('Two-way binding should handle nested data properties', t => {
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
                // Add a separate binding to the parent object to test reactivity bubbling
                userObject: 'user'
            }
        });
        const provider = component.getStateProvider();

        // Effect to monitor changes on the parent 'user' object
        const userEffect = new Neo.core.Effect(() => {
            userEffectRuns++;
            return provider.getData('user');
        });

        t.is(userEffectRuns, 1, 'User effect should run once initially');
        t.is(component.testConfig, 'initial', 'Component config should be initialized from nested state provider property');
        t.is(provider.getData('user.name'), 'initial', 'State provider data should be correct initially');

        // 1. Update component config => should update provider state
        component.testConfig = 'updated from component';

        t.is(provider.getData('user.name'), 'updated from component', 'Nested state provider data should update from component config change');
        t.is(userEffectRuns, 2, 'User effect should run again after nested property change (bubbling)');

        // 2. Update provider state => should update component config
        provider.setData('user.name', 'updated from provider');

        t.is(component.testConfig, 'updated from provider', 'Component config should update from nested state provider data change');
        t.is(userEffectRuns, 3, 'User effect should run again after direct state change');

        // 3. Verify the parent object reference has changed
        const initialUserObject = component.userObject;
        provider.setData('user.name', 'another update');
        const newUserObject = component.userObject;

        t.is(component.testConfig, 'another update', 'Component config updated again');
        t.is(provider.getData('user.name'), 'another update', 'Provider data updated again');
        t.is(userEffectRuns, 4, 'User effect should run again');
        t.isNot(newUserObject, initialUserObject, 'Parent user object reference should change to trigger reactivity');
        t.is(newUserObject.name, 'another update', 'New user object has the correct name property');

        userEffect.destroy();
        component.destroy();
    });

    t.it('Formulas should calculate correctly and react to dependencies', t => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    price   : 10,
                    quantity: 2
                },
                formulas: {
                    total(data) {return data.price * data.quantity},
                    discountedTotal: (data) => data.total * 0.9 // 10% discount
                }
            }
        });
        const provider = component.getStateProvider();

        t.is(provider.getDataConfig('total').get(), 20, 'Initial total formula calculation is correct');
        t.is(provider.getDataConfig('discountedTotal').get(), 18, 'Initial discountedTotal formula calculation is correct');

        component.setState('price', 15);
        t.is(provider.getDataConfig('total').get(), 30, 'Total formula updates when price changes');
        t.is(provider.getDataConfig('discountedTotal').get(), 27, 'DiscountedTotal formula updates when total changes');

        component.setState('quantity', 5);
        t.is(provider.getDataConfig('total').get(), 75, 'Total formula updates when quantity changes');
        t.is(provider.getDataConfig('discountedTotal').get(), 67.5, 'DiscountedTotal formula updates when total changes again');

        component.destroy();
    });

    t.it('Store management should correctly bind components to stores and react to store changes', t => {
        const store = Neo.create(Neo.data.Store, {
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

        t.is(component.testConfig, store, 'Component config should be bound to the store instance');
        t.is(component.testConfig.count, 2, 'Bound store should have correct initial count');

        store.add({id: 3, name: 'Item 3'});
        t.is(component.testConfig.count, 3, 'Bound store should reflect changes after adding a record');

        store.remove(store.get(1));
        t.is(component.testConfig.count, 2, 'Bound store should reflect changes after removing a record');

        component.destroy();
        store.destroy();
    });

    t.it('Store management  with an inline store', t => {
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

        t.is(component.testConfig, store, 'Component config should be bound to the store instance');
        t.is(component.testConfig.count, 2, 'Bound store should have correct initial count');

        store.add({id: 3, name: 'Item 3'});
        t.is(component.testConfig.count, 3, 'Bound store should reflect changes after adding a record');

        store.remove(store.get(1));
        t.is(component.testConfig.count, 2, 'Bound store should reflect changes after removing a record');

        component.destroy();
        store.destroy();
    });

    t.it('Provider data_ config should deep merge class and instance level data', t => {
        class ClassLevelProvider extends StateProvider {
            static config = {
                className: 'ClassLevelProvider',
                data:  {
                    a: 1,
                    b: {
                        c: 2,
                        d: 3
                    },
                    arr: [1, 2]
                }
            }
        }
        Neo.setupClass(ClassLevelProvider);

        // Test 1: Instance with no data, should reflect class-level data
        const provider1 = Neo.create(ClassLevelProvider);

        t.isDeeply(proxyToObject(provider1.data), {
            a: 1,
            b: {
                c: 2,
                d: 3
            },
            arr: [1, 2]
        }, 'Provider1 data should reflect class-level data when no instance data is provided');
        provider1.destroy();

        // Test 2: Instance with new top-level data
        const provider2 = Neo.create(ClassLevelProvider, {
            data: {
                x: 10,
                y: 20
            }
        });
        t.isDeeplyStrict(proxyToObject(provider2.data), {
            a: 1,
            b: {
                c: 2,
                d: 3
            },
            arr: [1, 2],
            x: 10,
            y: 20
        }, 'Provider2 data should deep merge new top-level instance data');
        provider2.destroy();

        // Test 3: Instance with overlapping data (deep merge)
        const provider3 = Neo.create(ClassLevelProvider, {
            data: {
                b: {
                    e: 4
                },
                arr: [3, 4], // Array replacement, not merge
                newProp: 'test'
            }
        });
        t.isDeeplyStrict(proxyToObject(provider3.data), {
            a: 1,
            b: {
                c: 2,
                d: 3,
                e: 4
            },
            arr: [3, 4], // Arrays are replaced by default merge strategy
            newProp: 'test'
        }, 'Provider3 data should deep merge overlapping instance data and replace arrays');
        provider3.destroy();

        // Test 4: Instance with overlapping data (deep merge) and modifying existing nested property
        const provider4 = Neo.create(ClassLevelProvider, {
            data: {
                b: {
                    c: 99
                }
            }
        });
        t.isDeeplyStrict(proxyToObject(provider4.data), {
            a: 1,
            b: {
                c: 99,
                d: 3
            },
            arr: [1, 2]
        }, 'Provider4 data should deep merge and modify existing nested property');
        provider4.destroy();
    });

    t.it('Provider data_ config should deep merge across multi-level class inheritance', t => {
        class GrandparentProvider extends StateProvider {
            static config = {
                className: 'GrandparentProvider',
                data: {
                    app: {
                        name: 'My App',
                        version: '1.0.0'
                    },
                    user: {
                        role: 'guest',
                        settings: {
                            theme: 'dark'
                        }
                    }
                }
            }
        }
        Neo.setupClass(GrandparentProvider);

        class ParentProvider extends GrandparentProvider {
            static config = {
                className: 'ParentProvider',
                data: {
                    app: {
                        version: '1.1.0', // Overrides grandparent version
                        author: 'Neo'
                    },
                    user: {
                        id: 123,
                        settings: {
                            notifications: true // Adds to grandparent settings
                        }
                    },
                    newParentProp: 'parentValue'
                }
            }
        }
        Neo.setupClass(ParentProvider);

        class ChildProvider extends ParentProvider {
            static config = {
                className: 'ChildProvider',
                data: {
                    user: {
                        role: 'admin', // Overrides parent role
                        preferences: {
                            language: 'en'
                        }
                    },
                    newChildProp: 'childValue'
                }
            }
        }
        Neo.setupClass(ChildProvider);

        // Test 1: Instance with no data, should reflect merged data from all levels
        const provider1 = Neo.create(ChildProvider);
        t.isDeeplyStrict(proxyToObject(provider1.data), {
            app: {
                name: 'My App',
                version: '1.1.0',
                author: 'Neo'
            },
            user: {
                role: 'admin',
                id: 123,
                settings: {
                    theme: 'dark',
                    notifications: true
                },
                preferences: {
                    language: 'en'
                }
            },
            newParentProp: 'parentValue',
            newChildProp: 'childValue'
        }, 'Provider1 data should reflect deep merge from all class inheritance levels');
        provider1.destroy();

        // Test 2: Instance with data overriding properties from different levels
        const provider2 = Neo.create(ChildProvider, {
            data: {
                app: {
                    version: '2.0.0', // Overrides ParentProvider's version
                    status: 'beta'
                },
                user: {
                    id: 456, // Overrides ParentProvider's id
                    settings: {
                        theme: 'light', // Overrides GrandparentProvider's theme
                        notifications: false // Overrides ParentProvider's notifications
                    }
                },
                newChildProp: 'overriddenChildValue',
                instanceOnlyProp: 'instanceValue'
            }
        });

        t.isDeeplyStrict(proxyToObject(provider2.data), {
            app: {
                name: 'My App',
                version: '2.0.0',
                author: 'Neo',
                status: 'beta'
            },
            user: {
                role: 'admin',
                id: 456,
                settings: {
                    theme: 'light',
                    notifications: false
                },
                preferences: {
                    language: 'en'
                }
            },
            newParentProp: 'parentValue',
            newChildProp: 'overriddenChildValue',
            instanceOnlyProp: 'instanceValue'
        }, 'Provider2 data should reflect deep merge with instance overrides across inheritance');
        provider2.destroy();
    });

    t.it('Formulas in nested providers should combine own and parent data', t => {
        const parentComponent = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    basePrice: 100,
                    taxRate  : 0.05
                }
            }
        });

        const childComponent = Neo.create(MockComponent, {
            parentComponent,

            stateProvider: {
                data: {
                    itemQuantity: 2
                },
                formulas: {
                    // Formula combines parent's basePrice and taxRate with child's itemQuantity
                    totalCost: (data) => (data.basePrice * data.itemQuantity) * (1 + data.taxRate)
                }
            }
        });

        const parentProvider = parentComponent.getStateProvider();
        const childProvider  = childComponent.getStateProvider();

        // Initial calculation
        t.is(childProvider.getData('totalCost'), (100 * 2) * (1 + 0.05), 'Initial totalCost calculation is correct');

        // Change parent data
        parentProvider.setData('basePrice', 120);
        t.is(childProvider.getData('totalCost'), (120 * 2) * (1 + 0.05), 'totalCost updates when parent basePrice changes');

        // Change child data
        childProvider.setData('itemQuantity', 3);
        t.is(childProvider.getData('totalCost'), (120 * 3) * (1 + 0.05), 'totalCost updates when child itemQuantity changes');

        // Change parent data again
        parentProvider.setData('taxRate', 0.10);
        t.is(childProvider.getData('totalCost'), (120 * 3) * (1 + 0.10), 'totalCost updates when parent taxRate changes');

        parentComponent.destroy();
        childComponent.destroy();
    });
});
