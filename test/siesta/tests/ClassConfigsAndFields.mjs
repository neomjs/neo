import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

class TestClass extends core.Base {
    fieldA = 1;
    fieldB = 2;

    static getConfig() {return {
        className: 'Neo.TestClass',
        configA_: 3,
        configB_: 4
    }}

    beforeSetA(value) {
        return this.fieldA + value;
    }

    beforeSetB(value) {
        return this.fieldB + value;
    }
}

Neo.applyClassConfig(TestClass);

StartTest(t => {
    t.it('Class based class configs and fields', t => {
        t.diag("Testing class based values");

        let instance = Neo.create({
            className: 'Neo.TestClass'
        });

        t.isStrict(instance.configA, 3, 'configA equals ' + 3);
        t.isStrict(instance.configB, 4, 'configB equals ' + 4);
        t.isStrict(instance.fieldA,  1, 'fieldA equals '  + 1);
        t.isStrict(instance.fieldB,  2, 'fieldB equals '  + 2);
    });

    t.it('Instance based class configs and fields', t => {
        t.diag("Testing values which got set on instance level");

        let instance = Neo.create({
            className: 'Neo.TestClass',
            fieldA   : 5,
            configA  : 6,
            configB  : 7,
            fieldB   : 8
        });

        t.isStrict(instance.configA, 11, 'configA equals ' + 11); // 5 + 6
        t.isStrict(instance.configB, 15, 'configB equals ' + 15); // 8 + 7
        t.isStrict(instance.fieldA,   5, 'fieldA equals '  + 5);
        t.isStrict(instance.fieldB,   8, 'fieldB equals '  + 8);
    });

    t.it('Dynamically changed class configs and fields', t => {
        t.diag("Testing instance.set()");

        let instance = Neo.create({
            className: 'Neo.TestClass'
        });

        instance.set({
            fieldA : 5,
            configA: 6,
            configB: 7,
            fieldB : 8
        });

        t.isStrict(instance.configA, 11, 'configA equals ' + 11); // 5 + 6
        t.isStrict(instance.configB, 15, 'configB equals ' + 15); // 8 + 7
        t.isStrict(instance.fieldA,   5, 'fieldA equals '  + 5);
        t.isStrict(instance.fieldB,   8, 'fieldB equals '  + 8);
    });
});
