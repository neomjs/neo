import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ConfigMergingTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Button         from '../../../../src/button/Base.mjs';
import {isDescriptor, mergeFrom} from '../../../../src/core/ConfigSymbols.mjs';

test.describe('Declarative Config Merging', () => {

    test('Should automatically merge referenced configs into items', () => {
        class AutoMergeContainer extends Container {
            static config = {
                className: 'Neo.test.AutoMergeContainer',
                
                // The config to inject
                headerConfig_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        text : 'Injected Header',
                        style: { color: 'blue' }
                    }
                },

                // The Structure
                items: {
                    header: {
                        ntype      : 'component',
                        [mergeFrom]: 'headerConfig', // The Declarative Link
                        cls        : ['header-cls']
                    }
                }
            }
        }
        AutoMergeContainer = Neo.setupClass(AutoMergeContainer);

        const instance = Neo.create(AutoMergeContainer);
        const header   = instance.items[0];

        // 1. Verify standard props
        expect(header.cls).toEqual(['header-cls']);

        // 2. Verify Injected props
        expect(header.text).toBe('Injected Header');
        expect(header.style.color).toBe('blue');
    });

    test('Should prioritize specific item props over merged config', () => {
        class OverrideContainer extends Container {
            static config = {
                className: 'Neo.test.OverrideContainer',
                
                btnConfig_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : {
                        text: 'Default Text',
                        iconCls: 'home'
                    }
                },

                items: {
                    myBtn: {
                        ntype      : 'button',
                        [mergeFrom]: 'btnConfig',
                        text       : 'Overridden Text' // Should win
                    }
                }
            }
        }
        OverrideContainer = Neo.setupClass(OverrideContainer);

        const instance = Neo.create(OverrideContainer);
        const btn      = instance.items[0];

        expect(btn.text).toBe('Overridden Text');
        expect(btn.iconCls).toBe('home');
    });

    test('Prototype Pollution: Subclasses should not share state when clone: deep is used', () => {
        // 1. Define Shared Base
        class SharedBase extends Container {
            static config = {
                className: 'Neo.test.Pollution.Shared',
                
                commonConfig_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : null // To be overridden
                },

                items: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    clone         : 'deep', // CRITICAL for isolation
                    value         : {
                        child: {
                            ntype      : 'component',
                            [mergeFrom]: 'commonConfig'
                        }
                    }
                }
            }
        }
        SharedBase = Neo.setupClass(SharedBase);

        // 2. Define Subclass A
        class ClassA extends SharedBase {
            static config = {
                className: 'Neo.test.Pollution.ClassA',
                commonConfig: {
                    text: 'Text A'
                }
            }
        }
        ClassA = Neo.setupClass(ClassA);

        // 3. Define Subclass B
        class ClassB extends SharedBase {
            static config = {
                className: 'Neo.test.Pollution.ClassB',
                commonConfig: {
                    text: 'Text B'
                }
            }
        }
        ClassB = Neo.setupClass(ClassB);

        // 4. Instantiate A
        const instanceA = Neo.create(ClassA);
        const childA = instanceA.items[0];
        expect(childA.text).toBe('Text A');

        // 5. Instantiate B
        const instanceB = Neo.create(ClassB);
        const childB = instanceB.items[0];
        
        // If pollution occurred, B might see 'Text A' or the mergeFrom symbol might be gone
        expect(childB.text).toBe('Text B');
    });

    test('Nested Object Items Pollution Check', () => {
        // Verify recursion + isolation
        class NestedBase extends Container {
            static config = {
                className: 'Neo.test.Pollution.NestedBase',
                
                targetConfig_: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    value         : null
                },

                items: {
                    [isDescriptor]: true,
                    merge         : 'deep',
                    clone         : 'deep',
                    value         : {
                        wrapper: {
                            ntype: 'container',
                            items: {
                                target: {
                                    ntype      : 'component',
                                    [mergeFrom]: 'targetConfig'
                                }
                            }
                        }
                    }
                }
            }
        }
        NestedBase = Neo.setupClass(NestedBase);

        class NestedA extends NestedBase {
            static config = {
                className: 'Neo.test.Pollution.NestedA',
                targetConfig: { cls: ['class-a'] }
            }
        }
        NestedA = Neo.setupClass(NestedA);

        class NestedB extends NestedBase {
            static config = {
                className: 'Neo.test.Pollution.NestedB',
                targetConfig: { cls: ['class-b'] }
            }
        }
        NestedB = Neo.setupClass(NestedB);

        const a = Neo.create(NestedA);
        // Note: wrapper is a Container. We need to check ITS items.
        // But Container items are lazily created or array-ified.
        // Wrapper item in 'a' is an instance? No, 'wrapper' in 'a.items' is an instance.
        // 'wrapper' instance has 'items'.
        const wrapperA = a.items[0];
        const targetA = wrapperA.items[0];
        expect(targetA.cls).toEqual(['class-a']);

        const b = Neo.create(NestedB);
        const wrapperB = b.items[0];
        const targetB = wrapperB.items[0];
        expect(targetB.cls).toEqual(['class-b']);
    });
});
