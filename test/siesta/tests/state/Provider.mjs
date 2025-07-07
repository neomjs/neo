import Provider from '../../../src/state/Provider.mjs';
import Component from '../../../src/component/Base.mjs';
import Neo       from '../../../src/Neo.mjs';

// Mock Component for testing purposes
class MockComponent extends Component {
    static config = {
        className: 'Mock.Component',
        testConfig_: null
    }
}
Neo.setupClass(MockComponent);

StartTest(t => {
    t.it('Provider should initialize with data and create configs', t => {
        const provider = new Provider({data: {name: 'Test', value: 123, user: {firstName: 'John'}}});

        t.is(provider.getDataConfig('name').value, 'Test', 'Name config should be created and have correct value');
        t.is(provider.getDataConfig('value').value, 123, 'Value config should be created and have correct value');
        t.is(provider.getDataConfig('user.firstName').value, 'John', 'Nested user.firstName config should be created');

        provider.destroy();
    });

    t.it('Provider should update data and trigger config changes', t => {
        const provider = new Provider({data: {counter: 0}});
        const component = new MockComponent();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.counter;
        });

        t.is(effectRunCount, 1, 'Binding effect should run once initially');
        t.is(component.testConfig, 0, 'Component config should be initialized with data value');

        provider.setData('counter', 1);
        t.is(effectRunCount, 2, 'Binding effect should re-run after setData');
        t.is(component.testConfig, 1, 'Component config should be updated after setData');

        provider.setData({counter: 2});
        t.is(effectRunCount, 3, 'Binding effect should re-run after setData with object');
        t.is(component.testConfig, 2, 'Component config should be updated after setData with object');

        provider.destroy();
        component.destroy();
    });

    t.it('Provider should handle hierarchical data access', t => {
        const parentProvider = new Provider({data: {appTitle: 'My App', user: {firstName: 'Parent'}}});
        const childProvider = new Provider({data: {user: {lastName: 'Child'}}});
        childProvider.parent = parentProvider; // Manually set parent

        const component = new MockComponent();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return `${data.appTitle} - ${data.user.firstName} ${data.user.lastName}`;
        });

        t.is(effectRunCount, 1, 'Binding effect should run once initially');
        t.is(component.testConfig, 'My App - Parent Child', 'Component config should reflect hierarchical data');

        parentProvider.setData('appTitle', 'New App Title');
        t.is(effectRunCount, 2, 'Binding effect should re-run after parent data change');
        t.is(component.testConfig, 'New App Title - Parent Child', 'Component config should update from parent data');

        childProvider.setData('user.lastName', 'New Child');
        t.is(effectRunCount, 3, 'Binding effect should re-run after child data change');
        t.is(component.testConfig, 'New App Title - Parent New Child', 'Component config should update from child data');

        parentProvider.setData('user.firstName', 'New Parent');
        t.is(effectRunCount, 4, 'Binding effect should re-run after parent nested data change');
        t.is(component.testConfig, 'New App Title - New Parent New Child', 'Component config should update from parent nested data');

        provider.destroy();
        component.destroy();
        parentProvider.destroy();
        childProvider.destroy();
    });

    t.it('Provider should remove bindings on component destroy', t => {
        const provider = new Provider({data: {test: 1}});
        const component = new MockComponent();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.test;
        });

        t.is(effectRunCount, 1, 'Effect ran initially');
        t.is(provider.#bindings.get(component.id).length, 1, 'Binding should be registered');

        component.destroy();
        t.is(provider.#bindings.has(component.id), false, 'Binding should be removed from provider');

        provider.setData('test', 2);
        t.is(effectRunCount, 1, 'Effect should not re-run after component destroyed');

        provider.destroy();
    });

    t.it('Provider should remove bindings on provider destroy', t => {
        const provider = new Provider({data: {test: 1}});
        const component = new MockComponent();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.test;
        });

        t.is(effectRunCount, 1, 'Effect ran initially');
        t.is(provider.#bindings.get(component.id).length, 1, 'Binding should be registered');

        provider.destroy();
        t.is(provider.#bindings.has(component.id), false, 'Binding should be removed from provider');

        // Attempt to change data after provider destroyed
        provider.setData('test', 2);
        t.is(effectRunCount, 1, 'Effect should not re-run after provider destroyed');

        component.destroy();
    });

    t.it('setData should create new data properties if they do not exist', t => {
        const provider = new Provider({data: {}});
        const component = new MockComponent();

        let effectRunCount = 0;
        provider.createBinding(component.id, 'testConfig', data => {
            effectRunCount++;
            return data.newProp;
        });

        t.is(effectRunCount, 1, 'Effect ran initially');
        t.is(component.testConfig, undefined, 'Component config should be undefined initially');

        provider.setData('newProp', 'hello');
        t.is(effectRunCount, 2, 'Effect re-ran after newProp was set');
        t.is(component.testConfig, 'hello', 'Component config should update with newProp');
        t.is(provider.getDataConfig('newProp').value, 'hello', 'newProp config should exist');

        provider.setData('nested.newProp', 'world');
        t.is(effectRunCount, 3, 'Effect re-ran after nested.newProp was set');
        t.is(provider.getDataConfig('nested.newProp').value, 'world', 'nested.newProp config should exist');

        provider.destroy();
        component.destroy();
    });
});
