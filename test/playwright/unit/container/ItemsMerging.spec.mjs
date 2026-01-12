import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ContainerItemsMergingTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Button         from '../../../../src/button/Base.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

test.describe('Container Items Merging', () => {

    test('Object-based items should be converted to array and preserve references', () => {
        class MyContainer extends Container {
            static config = {
                className: 'Neo.test.MyContainer',
                items: {
                    btn1: {
                        ntype: 'button',
                        text : 'Button 1'
                    },
                    btn2: {
                        ntype: 'button',
                        text : 'Button 2'
                    }
                }
            }
        }
        MyContainer = Neo.setupClass(MyContainer);

        const instance = Neo.create(MyContainer);

        expect(Array.isArray(instance.items)).toBe(true);
        expect(instance.items.length).toBe(2);

        const btn1 = instance.items.find(item => item.reference === 'btn1');
        const btn2 = instance.items.find(item => item.reference === 'btn2');

        expect(btn1).toBeDefined();
        expect(btn1.text).toBe('Button 1');
        expect(btn2).toBeDefined();
        expect(btn2.text).toBe('Button 2');
    });

    test('Subclass should deeply merge object-based items when using a proxy config', () => {
        // Base class using a proxy config 'contentItems' to avoid collision with 'items' setter in Base
        class BaseContainer extends Container {
            static config = {
                className: 'Neo.test.BaseContainer',
                // Define a new reactive config that uses deep merging
                contentItems_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        header: {
                            ntype : 'component',
                            text  : 'Header',
                            weight: 10
                        },
                        footer: {
                            ntype : 'component',
                            text  : 'Footer',
                            weight: 30
                        }
                    }
                }
            }

            // Map the proxy config to the actual items config
            afterSetContentItems(value) {
                this.items = value;
            }
        }
        BaseContainer = Neo.setupClass(BaseContainer);

        // Subclass overriding the proxy config
        class SubContainer extends BaseContainer {
            static config = {
                className: 'Neo.test.SubContainer',
                contentItems: {
                    // Override existing item
                    header: {
                        text: 'Custom Header',
                        cls : ['custom-header']
                    },
                    // Add new item
                    body: {
                        ntype : 'component',
                        text  : 'Body',
                        weight: 20
                    }
                }
            }
        }
        SubContainer = Neo.setupClass(SubContainer);

        const instance = Neo.create(SubContainer);

        // Verify items array creation
        expect(Array.isArray(instance.items)).toBe(true);
        expect(instance.items.length).toBe(3);

        // Sort items by weight to ensure predictable order for assertion
        const items = instance.items.sort((a, b) => (a.weight || 0) - (b.weight || 0));

        // 1. Header (Overridden)
        const header = items[0];
        expect(header.reference).toBe('header');
        expect(header.text).toBe('Custom Header'); // Overridden
        expect(header.cls).toEqual(['custom-header']); // Added
        expect(header.weight).toBe(10); // Inherited

        // 2. Body (New)
        const body = items[1];
        expect(body.reference).toBe('body');
        expect(body.text).toBe('Body');
        expect(body.weight).toBe(20);

        // 3. Footer (Inherited)
        const footer = items[2];
        expect(footer.reference).toBe('footer');
        expect(footer.text).toBe('Footer');
        expect(footer.weight).toBe(30);
    });

    test('Component with descriptor-based config should merge correctly when nested in Proxy Config item', () => {
        // 1. Define a child component that uses a descriptor for one of its configs
        class ChildComponent extends Component {
            static config = {
                className: 'Neo.test.ChildComponent',
                // A config that uses deep merge strategy
                details: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        theme: 'dark',
                        flags: {
                            visible: true,
                            active : false
                        }
                    }
                }
            }
        }
        ChildComponent = Neo.setupClass(ChildComponent);

        // 2. Define Base Container using Proxy Config Pattern
        class BaseContainer extends Container {
            static config = {
                className: 'Neo.test.BaseContainerWithNested',
                contentItems_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        myChild: {
                            module: ChildComponent,
                            weight: 10,
                            // Partial override of the child's 'details' config
                            details: {
                                flags: {
                                    active: true // Override
                                }
                            }
                        }
                    }
                }
            }

            afterSetContentItems(value) {
                this.items = value;
            }
        }
        BaseContainer = Neo.setupClass(BaseContainer);

        // 3. Define Subclass overriding the item
        class SubContainer extends BaseContainer {
            static config = {
                className: 'Neo.test.SubContainerWithNested',
                contentItems: {
                    myChild: {
                        // Further override of the child's 'details' config
                        details: {
                            theme: 'light', // Override
                            flags: {
                                highlighted: true // Add new
                            }
                        }
                    }
                }
            }
        }
        SubContainer = Neo.setupClass(SubContainer);

        // 4. Verify
        const instance = Neo.create(SubContainer);
        const child = instance.items[0];

        expect(child instanceof ChildComponent).toBe(true);
    });

    test('Neo.mergeConfig should deep merge correctly (Isolation Test)', () => {
        const defaultValue = {
            theme: 'dark',
            flags: {
                visible: true,
                active : false
            }
        };

        const instanceValue = {
            theme: 'light',
            flags: {
                active: true,
                highlighted: true
            }
        };

        const merged = Neo.mergeConfig(defaultValue, instanceValue, 'deep');

        expect(merged.theme).toBe('light');
        expect(merged.flags.visible).toBe(true);
        expect(merged.flags.active).toBe(true);
        expect(merged.flags.highlighted).toBe(true);
    });

    test('Structural Injection Pattern: Should inject separate config into items via afterSetContentItems', () => {
        // 1. Define Base Container
        class BaseContainer extends Container {
            static config = {
                className: 'Neo.test.BaseInjectionContainer',
                // The Skeleton
                contentItems_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        mainArea: {
                            ntype : 'component',
                            weight: 10,
                            // Default props
                            cls   : ['main-area']
                        }
                    }
                },
                // The Configuration Object to Inject
                mainAreaConfig_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        text: 'Base Text',
                        style: {
                            color: 'red'
                        }
                    }
                }
            }

            afterSetContentItems(value) {
                if (value) {
                    // Injection Logic
                    if (this.mainAreaConfig && value.mainArea) {
                        Neo.assignDefaults(value.mainArea, this.mainAreaConfig);
                    }
                    this.items = value;
                }
            }
        }
        BaseContainer = Neo.setupClass(BaseContainer);

        // 2. Define Subclass overriding the injected config
        class SubContainer extends BaseContainer {
            static config = {
                className: 'Neo.test.SubInjectionContainer',
                // Override the config object, NOT the item directly
                mainAreaConfig: {
                    text: 'Sub Text',
                    style: {
                        fontSize: '20px'
                    },
                    extraProp: 'foo'
                }
            }
        }
        SubContainer = Neo.setupClass(SubContainer);

        // 3. Create Instance
        const instance = Neo.create(SubContainer);
        const mainItem = instance.items[0];

        // 4. Assertions
        // Check Skeleton properties
        expect(mainItem.reference).toBe('mainArea');
        expect(mainItem.cls).toEqual(['main-area']);

        // Check Injected & Merged properties
        expect(mainItem.text).toBe('Sub Text'); // Overridden
        expect(mainItem.style.color).toBe('red'); // Inherited from Base mainAreaConfig
        expect(mainItem.style.fontSize).toBe('20px'); // Added in Sub mainAreaConfig
        expect(mainItem.extraProp).toBe('foo'); // Added
    });
});
