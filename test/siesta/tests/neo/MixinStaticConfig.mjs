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
});
