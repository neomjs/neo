import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import Component          from '../../../../src/component/Base.mjs';
import StateProvider      from '../../../../src/state/Provider.mjs';

// IMPORTANT: This test file uses real components and expects them to render.
// We need to enable unitTestMode for isolation, but also allow VDOM updates.
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;

class MockComponent extends Component {
    static config = {
        className: 'Mock.Component',
        appName: 'test-app',
        user_: null,
        userName_: null
    }
}
Neo.setupClass(MockComponent);

// Helper function to convert a proxy to a plain object for deep comparison
function proxyToObject(proxy) {
    if (proxy === null || typeof proxy !== 'object') {
        return proxy;
    }
    // A simple way to deep-clone and remove proxy
    return JSON.parse(JSON.stringify(proxy));
}

StartTest(t => {
    t.it('State Provider should trigger parent effects when a leaf node changes (bubbling)', t => {
        let effectRunCount = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    user: {
                        name: 'John',
                        age: 30
                    }
                }
            }
        });

        const provider = component.getStateProvider();

        // This binding depends on the 'user' object itself.
        provider.createBinding(component.id, 'user', data => {
            effectRunCount++;
            return data.user;
        });

        t.is(effectRunCount, 1, 'Effect should run once initially');
        t.isDeeply(proxyToObject(component.user), { name: 'John', age: 30 }, 'Initial user object is correct');

        // Change a leaf property. This should trigger the effect for the parent 'user' object.
        provider.setData('user.age', 31);

        t.is(effectRunCount, 2, 'Effect should re-run after changing a leaf property (user.age)');
        t.isDeeply(proxyToObject(component.user), { name: 'John', age: 31 }, 'User object is updated correctly in the component');

        // Change another leaf property
        provider.setData('user.name', 'Jane');

        t.is(effectRunCount, 3, 'Effect should re-run after changing another leaf property (user.name)');
        t.isDeeply(proxyToObject(component.user), { name: 'Jane', age: 31 }, 'User object is updated again');

        component.destroy();
    });

    t.it('Formulas should react to leaf node changes via bubbling', t => {
        let effectRunCount = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    user: {
                        firstName: 'John',
                        lastName: 'Doe'
                    }
                },
                formulas: {
                    // This formula depends on the 'user' object.
                    fullName: data => {
                        effectRunCount++;
                        return `${data.user.firstName} ${data.user.lastName}`;
                    }
                }
            }
        });

        const provider = component.getStateProvider();

        // The formula runs once on initialization.
        t.is(effectRunCount, 1, 'Formula should run once initially');
        t.is(provider.getData('fullName'), 'John Doe', 'Initial formula calculation is correct');

        // Change a leaf property. This should trigger the formula that depends on the parent 'user' object.
        provider.setData('user.firstName', 'Jane');

        t.is(effectRunCount, 2, 'Formula should re-run after changing a leaf property');
        t.is(provider.getData('fullName'), 'Jane Doe', 'Formula is correctly re-calculated');

        component.destroy();
    });

    t.it('State Provider should handle deeply nested data changes', t => {
        let effectRunCountL1 = 0,
            effectRunCountL2 = 0,
            effectRunCountL3 = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    level1: {
                        level2: {
                            level3: {
                                value: 10
                            }
                        }
                    }
                }
            }
        });

        const provider = component.getStateProvider();

        // Bindings to each level of the nested structure
        provider.createBinding(component.id, 'level1', data => {
            effectRunCountL1++;
            return data.level1;
        });
        provider.createBinding(component.id, 'level2', data => {
            effectRunCountL2++;
            return data.level1.level2;
        });
        provider.createBinding(component.id, 'level3', data => {
            effectRunCountL3++;
            return data.level1.level2.level3;
        });

        t.is(effectRunCountL1, 1, 'L1 Effect ran once initially');
        t.is(effectRunCountL2, 1, 'L2 Effect ran once initially');
        t.is(effectRunCountL3, 1, 'L3 Effect ran once initially');

        // Change the deepest leaf node
        provider.setData('level1.level2.level3.value', 20);

        t.is(effectRunCountL1, 2, 'L1 Effect re-ran due to bubbling');
        t.is(effectRunCountL2, 2, 'L2 Effect re-ran due to bubbling');
        t.is(effectRunCountL3, 2, 'L3 Effect re-ran due to bubbling');

        const finalState = proxyToObject(component.level1);
        t.is(finalState.level2.level3.value, 20, 'Deeply nested value is updated correctly');

        component.destroy();
    });

    t.it('Formulas should react to deeply nested data changes', t => {
        let formulaRunCount = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    config: {
                        settings: {
                            a: 1,
                            b: 2
                        }
                    },
                    multiplier: 10
                },
                formulas: {
                    // This formula depends on multiple deeply nested properties
                    calculated: data => {
                        formulaRunCount++;
                        return (data.config.settings.a + data.config.settings.b) * data.multiplier;
                    }
                }
            }
        });

        const provider = component.getStateProvider();

        t.is(formulaRunCount, 1, 'Formula ran once initially');
        t.is(provider.getData('calculated'), 30, 'Initial formula calculation is correct');

        // Change a deeply nested property
        provider.setData('config.settings.a', 5);

        t.is(formulaRunCount, 2, 'Formula re-ran after deep leaf change');
        t.is(provider.getData('calculated'), 70, 'Formula re-calculated correctly');

        // Change another property at a different level
        provider.setData('multiplier', 2);

        t.is(formulaRunCount, 3, 'Formula re-ran after sibling property change');
        t.is(provider.getData('calculated'), 14, 'Formula re-calculated correctly again');

        component.destroy();
    });

    t.it('Hierarchical providers should bubble reactivity from parent to child', t => {
        let childFormulaRunCount = 0;

        const parentComponent = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    user: {
                        name: 'Parent',
                        role: 'admin'
                    }
                }
            }
        });

        const childComponent = Neo.create(MockComponent, {
            parentComponent, // Establishes the hierarchy
            stateProvider: {
                data: {
                    prefix: 'User:'
                },
                formulas: {
                    // This formula depends on the parent's 'user' object and the child's 'prefix'
                    display: data => {
                        childFormulaRunCount++;
                        return `${data.prefix} ${data.user.name} (${data.user.role})`;
                    }
                }
            }
        });

        const parentProvider = parentComponent.getStateProvider();
        const childProvider = childComponent.getStateProvider();

        t.is(childFormulaRunCount, 1, 'Child formula ran once initially');
        t.is(childProvider.getData('display'), 'User: Parent (admin)', 'Initial hierarchical formula calculation is correct');

        // Modify a leaf node in the PARENT provider
        parentProvider.setData('user.role', 'editor');

        t.is(childFormulaRunCount, 2, 'Child formula re-ran after parent data change');
        t.is(childProvider.getData('display'), 'User: Parent (editor)', 'Hierarchical formula re-calculated correctly');

        // Modify a leaf node in the CHILD provider to ensure it also works
        childProvider.setData('prefix', 'Account:');

        t.is(childFormulaRunCount, 3, 'Child formula re-ran after child data change');
        t.is(childProvider.getData('display'), 'Account: Parent (editor)', 'Formula updates correctly from own data');

        parentComponent.destroy();
        childComponent.destroy();
    });
});
