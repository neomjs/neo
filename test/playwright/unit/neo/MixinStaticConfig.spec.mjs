import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';

test.describe('neo/MixinStaticConfig', () => {
    test('should merge static configs from mixins', () => {
        class TestMixin extends Base {
            static config = {
                className           : 'Neo.test.mixin.TestMixin',
                mixinConfig         : 'mixinValue',
                reactiveMixinConfig_: 'reactiveValue'
            }
        }
        Neo.setupClass(TestMixin);

        class TestClass extends Base {
            static config = {
                className           : 'Neo.test.mixin.TestClass',
                classConfig         : 'classValue',
                mixins              : [TestMixin],
                reactiveClassConfig_: 'reactiveValue'
            }
        }
        Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);
        expect(instance.mixinConfig).toBe('mixinValue');
        expect(instance.reactiveMixinConfig).toBe('reactiveValue');
    });

    test('A class config should always win over a mixin config', () => {
        class MixinWithConfigs extends Base {
            static config = {
                className          : 'Neo.test.siesta.tests.neo.override.MixinWithConfigs',
                nonReactiveConfig  : 'mixinValue',
                reactiveConfig_    : 'mixinValue'
            }
        }
        Neo.setupClass(MixinWithConfigs);

        class ClassWithConfigs extends Base {
            static config = {
                className        : 'Neo.test.siesta.tests.neo.override.ClassWithConfigs',
                mixins           : [MixinWithConfigs],
                nonReactiveConfig: 'classValue',
                reactiveConfig_  : 'classValue'
            }
        }
        Neo.setupClass(ClassWithConfigs);

        const instance = Neo.create(ClassWithConfigs);

        expect(instance.nonReactiveConfig).toBe('classValue');
        expect(instance.reactiveConfig).toBe('classValue');
    });

    test('The first mixin in the array should win for conflicting configs', () => {
        class MixinA extends Base {
            static config = {
                className        : 'Neo.test.siesta.tests.neo.override.MixinA',
                a_reactive_      : 'a',
                common_reactive_ : 'a'
            }
        }
        Neo.setupClass(MixinA);

        class MixinB extends Base {
            static config = {
                className        : 'Neo.test.siesta.tests.neo.override.MixinB',
                b_reactive_      : 'b',
                common_reactive_ : 'b'
            }
        }
        Neo.setupClass(MixinB);

        class ClassWithTwoMixins extends Base {
            static config = {
                className: 'Neo.test.siesta.tests.neo.override.ClassWithTwoMixins',
                mixins   : [MixinA, MixinB]
            }
        }
        Neo.setupClass(ClassWithTwoMixins);

        const instance = Neo.create(ClassWithTwoMixins);

        expect(instance.a_reactive).toBe('a');
        expect(instance.b_reactive).toBe('b');
        expect(instance.common_reactive).toBe('a');
    });

    test('Mixin on base class should win over mixin on extended class', () => {
        class MixinA extends Base {
            static config = {
                className         : 'Neo.test.siesta.tests.neo.inheritance.MixinA',
                mixin_a_reactive_ : 'A',
                common_reactive_  : 'A'
            }
            methodA() { return 'A'; }
        }
        Neo.setupClass(MixinA);

        class MixinB extends Base {
            static config = {
                className         : 'Neo.test.siesta.tests.neo.inheritance.MixinB',
                mixin_b_reactive_ : 'B',
                common_reactive_  : 'B'
            }
            methodB() { return 'B'; }
        }
        Neo.setupClass(MixinB);

        class BaseClassWithMixin extends Base {
            static config = {
                className: 'Neo.test.siesta.tests.neo.inheritance.BaseClassWithMixin',
                mixins   : [MixinA]
            }
        }
        Neo.setupClass(BaseClassWithMixin);

        class ExtendedClassWithMixin extends BaseClassWithMixin {
            static config = {
                className: 'Neo.test.siesta.tests.neo.inheritance.ExtendedClassWithMixin',
                mixins   : [MixinB]
            }
        }
        Neo.setupClass(ExtendedClassWithMixin);

        const instance = Neo.create(ExtendedClassWithMixin);

        expect(instance.mixin_a_reactive).toBe('A');
        expect(instance.mixin_b_reactive).toBe('B');
        expect(instance.common_reactive).toBe('A');

        expect(instance.methodA()).toBe('A');
        expect(instance.methodB()).toBe('B');
    });
});
