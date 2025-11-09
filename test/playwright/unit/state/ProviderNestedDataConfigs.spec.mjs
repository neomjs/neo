import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ProviderNestedDataTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Component       from '../../../../src/component/Base.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';

class MockComponent extends Component {
    static config = {
        className: 'Mock.Component',
        appName  : 'test-app',
        user_    : null,
        userName_: null
    }
}
MockComponent = Neo.setupClass(MockComponent);

// Helper function to convert a proxy to a plain object for deep comparison
function proxyToObject(proxy) {
    if (proxy === null || typeof proxy !== 'object') {
        return proxy;
    }
    return JSON.parse(JSON.stringify(proxy));
}

test.describe('State Provider Nested Data Configs', () => {

    //All tests are now reverted to their clean, original state
    test('State Provider should trigger parent effects when a leaf node changes (bubbling)', () => {
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

        provider.createBinding(component.id, 'user', data => {
            effectRunCount++;
            return data.user;
        });

        expect(effectRunCount).toBe(1);
        expect(proxyToObject(component.user)).toEqual({ name: 'John', age: 30 });

        provider.setData('user.age', 31);
        expect(effectRunCount).toBe(2);
        expect(proxyToObject(component.user)).toEqual({ name: 'John', age: 31 });

        provider.setData('user.name', 'Jane');
        expect(effectRunCount).toBe(3);
        expect(proxyToObject(component.user)).toEqual({ name: 'Jane', age: 31 });

        component.destroy();
    });

    test('setData with a nested object should deep-merge and bubble reactivity', () => {
        const component = Neo.create(MockComponent, {
            stateProvider: {
                data: {
                    user: {
                        firstname: 'John',
                        lastname : 'Doe'
                    }
                }
            }
        });

        const provider = component.getStateProvider();
        let effectRunCount = 0;

        provider.createBinding(component.id, 'user', data => {
            effectRunCount++;
            return data.user;
        });

        expect(effectRunCount).toBe(1);
        expect(proxyToObject(component.user)).toEqual({ firstname: 'John', lastname: 'Doe' });

        // ACTION: Set data with a nested object. This should MERGE, not replace.
        provider.setData({
            user: { firstname: 'Jane' }
        });

        // ASSERT: The object was merged, and the old 'lastname' property is preserved.
        expect(effectRunCount).toBe(2);

        const updatedUser = proxyToObject(component.user);
        expect(updatedUser).toEqual({ firstname: 'Jane', lastname: 'Doe' });
        expect(updatedUser.lastname).toBe('Doe');

        // For contrast, let's show the path-based "bubbling" behavior which has the same outcome.
        // First, reset the state.
        provider.setData({
            user: {
                firstname: 'John',
                lastname: 'Doe'
            }
        });
        expect(effectRunCount).toBe(3);

        // ACTION: Set a leaf node using a path string.
        provider.setData({
            'user.firstname': 'Robert'
        });

        expect(effectRunCount).toBe(4);

        const mergedUser = proxyToObject(component.user);
        expect(mergedUser).toEqual({ firstname: 'Robert', lastname: 'Doe' });
        expect(updatedUser.lastname).toBe('Doe');
        component.destroy();
    });

    test('Formulas should react to leaf node changes via bubbling', () => {
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
        expect(effectRunCount).toBe(1);
        expect(provider.getData('fullName')).toBe('John Doe');

         // Change a leaf property. This should trigger the formula that depends on the parent 'user' object.
        provider.setData('user.firstName', 'Jane');

        expect(effectRunCount).toBe(2);
        expect(provider.getData('fullName')).toBe('Jane Doe');
        component.destroy();
    });

    test('State Provider should handle deeply nested data changes', () => {
        let effectRunCountL1 = 0, effectRunCountL2 = 0, effectRunCountL3 = 0;

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

        provider.createBinding(component.id, 'level1', data => { effectRunCountL1++; return data.level1; });

        provider.createBinding(component.id, 'level2', data => { effectRunCountL2++; return data.level1.level2; });

        provider.createBinding(component.id, 'level3', data => { effectRunCountL3++; return data.level1.level2.level3; });

        expect(effectRunCountL1).toBe(1);
        expect(effectRunCountL2).toBe(1);
        expect(effectRunCountL3).toBe(1);


        provider.setData('level1.level2.level3.value', 20);

        expect(effectRunCountL1).toBe(2);
        expect(effectRunCountL2).toBe(2);
        expect(effectRunCountL3).toBe(2);

        const finalState = proxyToObject(component.level1);

        expect(finalState.level2.level3.value).toBe(20);
        component.destroy();
    });

    test('Formulas should react to deeply nested data changes', () => {
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

        expect(formulaRunCount).toBe(1);
        expect(provider.getData('calculated')).toBe(30);

        provider.setData('config.settings.a', 5);
        expect(formulaRunCount).toBe(2);
        expect(provider.getData('calculated')).toBe(70);

        provider.setData('multiplier', 2);
        expect(formulaRunCount).toBe(3);
        expect(provider.getData('calculated')).toBe(14);

        component.destroy();
    });

    test('Hierarchical providers should bubble reactivity from parent to child', () => {
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

        expect(childFormulaRunCount).toBe(1);
        expect(childProvider.getData('display')).toBe('User: Parent (admin)');

        // Modify a leaf node in the PARENT provider
        parentProvider.setData('user.role', 'editor');

        expect(childFormulaRunCount).toBe(2);
        expect(childProvider.getData('display')).toBe('User: Parent (editor)');

        // Modify a leaf node in the CHILD provider to ensure it also works
        childProvider.setData('prefix', 'Account:');

        expect(childFormulaRunCount).toBe(3);
        expect(childProvider.getData('display')).toBe('Account: Parent (editor)');

        parentComponent.destroy();
        childComponent.destroy();
    });
});
