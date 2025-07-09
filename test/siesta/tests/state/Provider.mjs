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
