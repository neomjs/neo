import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

class TestClass extends core.Base {
    fieldA = 1;
    fieldB = 2;

    static getConfig() {return {
        className: 'Neo.TestClass',
        configA_ : 3,
        configB_ : 4
    }}

    beforeSetConfigA(value) {
        return this.fieldA + value;
    }

    beforeSetConfigB(value) {
        return this.fieldB + value;
    }
}

Neo.applyClassConfig(TestClass);

StartTest(t => {
    t.it('Default class fields inside constructors', t => {
        t.diag("Default class");

        class CtorTest {
            fieldA = 1;
            fieldB = 2;

            constructor() {
                t.isStrict(this.fieldA, 1, 'fieldA equals ' + 1);
                t.isStrict(this.fieldB, 2, 'fieldB equals ' + 2);
            }
        }

        new CtorTest();

        t.diag("Default class extension");

        class CtorTestExtension extends CtorTest {
            fieldA = 3;
            fieldB = 4;

            constructor() {
                super();

                t.isStrict(this.fieldA, 3, 'fieldA equals ' + 3);
                t.isStrict(this.fieldB, 4, 'fieldB equals ' + 4);
            }
        }

        new CtorTestExtension();
    });

    t.it('Default class fields', t => {
        t.diag("Testing class fields");

        class DefaultTestClass {
            _fieldA = 1;
            _fieldB = 2;

            get fieldA() {
                return this._fieldA;
            }

            set fieldA(value) {
                this._fieldA = this.fieldB + value;
            }

            get fieldB() {
                return this._fieldB;
            }

            set fieldB(value) {
                this._fieldB = this.fieldA + value;
            }

            constructor(config) {
                Object.assign(this, config);
            }
        }

        const instance = new DefaultTestClass({
            fieldA: 3,
            fieldB: 4
        });

        // not consistent
        t.isStrict(instance.fieldA, 5, 'fieldA equals ' + 5); // 2 + 3 => old value of fieldB + new value of fieldA
        t.isStrict(instance.fieldB, 9, 'fieldB equals ' + 9); // 5 + 4 => new value of fieldA + new value of fieldB

        Object.assign(instance, {
            fieldA: 5,
            fieldB: 6
        });

        // not consistent
        t.isStrict(instance.fieldA, 14, 'fieldA equals ' + 14); //  9 + 5 => old value of fieldB + new value of fieldA
        t.isStrict(instance.fieldB, 20, 'fieldB equals ' + 20); // 14 + 6 => new value of fieldA + new value of fieldB

        t.diag('Reversed order');

        const instance2 = new DefaultTestClass({
            fieldB: 4, // reversed order
            fieldA: 3
        });

        // not consistent
        t.isStrict(instance2.fieldA, 8, 'fieldA equals ' + 8); // 5 + 3 => new value of fieldB + new value of fieldA
        t.isStrict(instance2.fieldB, 5, 'fieldB equals ' + 5); // 1 + 4 => old value of fieldA + new value of fieldB

        Object.assign(instance2, {
            fieldB: 6, // reversed order
            fieldA: 5
        });

        // not consistent
        t.isStrict(instance2.fieldA, 19, 'fieldA equals ' + 19); // 14 + 5 => new value of fieldB + new value of fieldA
        t.isStrict(instance2.fieldB, 14, 'fieldB equals ' + 14); //  8 + 6 => old value of fieldA + new value of fieldB
    });

    t.it('Class based class configs and fields', t => {
        t.diag("Testing class based values");

        const instance = Neo.create({
            className: 'Neo.TestClass'
        });

        t.isStrict(instance.configA, 4, 'configA equals ' + 4); // 1 + 3
        t.isStrict(instance.configB, 6, 'configB equals ' + 6); // 2 + 4
        t.isStrict(instance.fieldA,  1, 'fieldA equals '  + 1);
        t.isStrict(instance.fieldB,  2, 'fieldB equals '  + 2);
    });

    t.it('Instance based class configs and fields', t => {
        t.diag("Testing values which got set on instance level");

        const instance = Neo.create({
            className: 'Neo.TestClass',
            fieldA   : 5,
            configA  : 6,
            configB  : 7,
            fieldB   : 8
        });

        t.isStrict(instance.configA, 11, 'configA equals ' + 11); // 5 + 6
        t.isStrict(instance.configB, 15, 'configB equals ' + 15); // 8 + 7
        t.isStrict(instance.fieldA,   5, 'fieldA equals '  +  5);
        t.isStrict(instance.fieldB,   8, 'fieldB equals '  +  8);

        t.diag('Reversed order');

        const instance2 = Neo.create({
            className: 'Neo.TestClass',
            fieldB   : 8, // reversed order
            configB  : 7,
            configA  : 6,
            fieldA   : 5
        });

        t.isStrict(instance2.configA, 11, 'configA equals ' + 11); // 5 + 6
        t.isStrict(instance2.configB, 15, 'configB equals ' + 15); // 8 + 7
        t.isStrict(instance2.fieldA,   5, 'fieldA equals '  +  5);
        t.isStrict(instance2.fieldB,   8, 'fieldB equals '  +  8);
    });

    t.it('Dynamically changed class configs and fields', t => {
        t.diag("Testing instance.set()");

        const instance = Neo.create({
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
        t.isStrict(instance.fieldA,   5, 'fieldA equals '  +  5);
        t.isStrict(instance.fieldB,   8, 'fieldB equals '  +  8);
    });
});
