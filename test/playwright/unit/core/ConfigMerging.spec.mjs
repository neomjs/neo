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
import Button         from '../../../../src/button/Base.mjs'; // Required for ntype: button
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
});