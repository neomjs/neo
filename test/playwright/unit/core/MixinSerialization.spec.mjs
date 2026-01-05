import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Mixin Serialization', () => {
    test('toJSON mixin aggregation and recursion guard', () => {
        class MyMixin extends core.Base {
            static config = {
                className: 'Neo.MyMixin',
                isMixin  : true
            }

            toJSON() {
                return {
                    mixinProp: 'mixinValue',
                    ...super.toJSON()
                }
            }
        }
        MyMixin = Neo.setupClass(MyMixin);

        class MyComponent extends core.Base {
            static config = {
                className: 'Neo.MyComponent',
                mixins   : [MyMixin]
            }

            toJSON() {
                return {
                    componentProp: 'componentValue',
                    ...super.toJSON()
                }
            }
        }
        MyComponent = Neo.setupClass(MyComponent);

        const instance = Neo.create(MyComponent);
        const json = instance.toJSON();

        // 1. Verify component's own toJSON logic is preserved
        expect(json.componentProp).toBe('componentValue');

        // 2. Verify mixin's toJSON logic is aggregated
        expect(json.mixinProp).toBe('mixinValue');

        // 3. Verify base properties are present
        expect(json.className).toBe('Neo.MyComponent');

        // 4. Ensure no shadowing happened (setupClass logic check)
        // If shadowing occurred, MyComponent.prototype.toJSON would equal MyMixin.prototype.toJSON
        // and 'componentProp' would be missing.
        expect(Object.hasOwn(MyComponent.prototype, 'toJSON')).toBe(true);
        expect(MyComponent.prototype.toJSON).not.toBe(MyMixin.prototype.toJSON);
    });
});
