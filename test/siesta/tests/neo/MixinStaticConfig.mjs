import Neo       from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';

StartTest(t => {
    t.it('should merge static configs from mixins', t => {
        class TestMixin extends core.Base {
            static config = {
                className           : 'Neo.test.mixin.TestMixin',
                mixinConfig         : 'mixinValue',
                reactiveMixinConfig_: 'reactiveValue'
            }
        }

        Neo.setupClass(TestMixin);

        class TestClass extends core.Base {
            static config = {
                className           : 'Neo.test.mixin.TestClass',
                classConfig         : 'classValue',
                mixins              : [TestMixin],
                reactiveClassConfig_: 'reactiveValue'
            }
        }

        Neo.setupClass(TestClass);

        const instance = Neo.create(TestClass);
        t.is(instance.mixinConfig, 'mixinValue', 'mixinConfig should be merged from the mixin');
        t.is(instance.reactiveMixinConfig, 'reactiveValue', 'reactiveMixinConfig should be merged from the mixin and the underscore removed');
    });

    t.it('A class config should always win over a mixin config', t => {
        class MixinWithConfigs extends core.Base {
            static config = {
                className          : 'Neo.test.siesta.tests.neo.override.MixinWithConfigs',
                nonReactiveConfig  : 'mixinValue',
                reactiveConfig_    : 'mixinValue'
            }
        }
        Neo.setupClass(MixinWithConfigs);

        class ClassWithConfigs extends core.Base {
            static config = {
                className        : 'Neo.test.siesta.tests.neo.override.ClassWithConfigs',
                mixins           : [MixinWithConfigs],
                nonReactiveConfig: 'classValue',
                reactiveConfig_  : 'classValue'
            }
        }
        Neo.setupClass(ClassWithConfigs);

        const instance = Neo.create(ClassWithConfigs);

        t.is(instance.nonReactiveConfig, 'classValue', 'Class non-reactive config should win over mixin');
        t.is(instance.reactiveConfig, 'classValue', 'Class reactive config should win over mixin');
    });

    t.it('The first mixin in the array should win for conflicting configs', t => {
        class MixinA extends core.Base {
            static config = {
                className        : 'Neo.test.siesta.tests.neo.override.MixinA',
                a_reactive_      : 'a',
                common_reactive_ : 'a'
            }
        }
        Neo.setupClass(MixinA);

        class MixinB extends core.Base {
            static config = {
                className        : 'Neo.test.siesta.tests.neo.override.MixinB',
                b_reactive_      : 'b',
                common_reactive_ : 'b'
            }
        }
        Neo.setupClass(MixinB);

        class ClassWithTwoMixins extends core.Base {
            static config = {
                className: 'Neo.test.siesta.tests.neo.override.ClassWithTwoMixins',
                mixins   : [MixinA, MixinB]
            }
        }
        Neo.setupClass(ClassWithTwoMixins);

        const instance = Neo.create(ClassWithTwoMixins);

        t.is(instance.a_reactive, 'a', 'MixinA specific config should be applied');
        t.is(instance.b_reactive, 'b', 'MixinB specific config should be applied');
        t.is(instance.common_reactive, 'a', 'The first mixin (MixinA) should win for common_reactive_');
    });

    t.it('Mixin on base class should win over mixin on extended class', t => {
        class MixinA extends core.Base {
            static config = {
                className         : 'Neo.test.siesta.tests.neo.inheritance.MixinA',
                mixin_a_reactive_ : 'A',
                common_reactive_  : 'A'
            }
            methodA() { return 'A'; }
        }
        Neo.setupClass(MixinA);

        class MixinB extends core.Base {
            static config = {
                className         : 'Neo.test.siesta.tests.neo.inheritance.MixinB',
                mixin_b_reactive_ : 'B',
                common_reactive_  : 'B'
            }
            methodB() { return 'B'; }
        }
        Neo.setupClass(MixinB);

        class BaseClassWithMixin extends core.Base {
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

        t.is(instance.mixin_a_reactive, 'A', 'MixinA specific config should be applied');
        t.is(instance.mixin_b_reactive, 'B', 'MixinB specific config should be applied');
        t.is(instance.common_reactive, 'A', 'The mixin on the base class (MixinA) should win for common_reactive_');

        t.is(instance.methodA(), 'A', 'Method from MixinA should exist');
        t.is(instance.methodB(), 'B', 'Method from MixinB should exist');
    });
});
