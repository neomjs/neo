import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Component       from '../../../../src/component/Base.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';


// Mock Component for testing purposes
class MockComponent extends Component {
    static config = {
        className: 'Mock.Component',
        testConfig_: null,
        appName: 'test-app'
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
});
