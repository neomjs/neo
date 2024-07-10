import { it }    from '@bryntum/siesta/index.js';
import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

class TestClass extends core.Base {
    fieldA = 1;
    fieldB = 2;

    static config = {
        className: 'Neo.TestClass',
        configA_ : 3,
        configB_ : 4
    }

    beforeSetConfigA(value) {
        return this.fieldA + value;
    }

    beforeSetConfigB(value) {
        return this.fieldB + value;
    }
}

Neo.applyClassConfig(TestClass);

it('Test section', t => {
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

    t.it('Neo default class fields inside constructors', t => {
        t.diag("Neo default class");

        class NeoCtorTest extends core.Base {
            fieldA = 1;
            fieldB = 2;

            construct(config) {
                super.construct(config);

                let me        = this,
                    extension = me.extension;

                t.isStrict(me.fieldA, extension ? 3 : 1, 'fieldA equals ' + (extension ? 3 : 1));
                t.isStrict(me.fieldB, extension ? 4 : 2, 'fieldB equals ' + (extension ? 4 : 2));
            }
        }

        Neo.applyClassConfig(NeoCtorTest);

        Neo.create(NeoCtorTest);

        t.diag("Neo default class extension");

        class NeoCtorTestExtension extends NeoCtorTest {
            extension = true; // flag for the base ctor tests
            fieldA    = 3;
            fieldB    = 4;

            construct(config) {
                super.construct(config);

                t.isStrict(this.fieldA, 3, 'fieldA equals ' + 3);
                t.isStrict(this.fieldB, 4, 'fieldB equals ' + 4);
            }
        }

        Neo.create(NeoCtorTestExtension);
    });

    t.it('Default class fields', t => {
        t.diag("Testing class fields");

        class DefaultTestClass {
            fieldA   = 1;
            fieldB   = 2;
            _configA = 3;
            _configB = 4;

            get configA() {
                return this._configA;
            }

            set configA(value) {
                this._configA = this.fieldA + value;
            }

            get configB() {
                return this._configB;
            }

            set configB(value) {
                this._configB = this.fieldB + value;
            }

            constructor(config) {
                Object.assign(this, config);
            }
        }

        const instance = new DefaultTestClass({
            fieldA : 5,
            configA: 6,
            configB: 7,
            fieldB : 8
        });

        // not consistent
        t.isStrict(instance.configA, 11, 'configA equals 11'); // 5 + 6 => new value of fieldA + new value of configA
        t.isStrict(instance.configB,  9, 'configB equals  9'); // 7 + 2 => old value of fieldB + new value of configB
        t.isStrict(instance.fieldA,   5, 'fieldA equals   5');
        t.isStrict(instance.fieldB,   8, 'fieldB equals   8');

        t.diag('Reversed order');

        const instance2 = new DefaultTestClass({
            fieldB : 8, // reversed order
            configB: 7,
            configA: 6,
            fieldA : 5
        });

        // not consistent
        t.isStrict(instance2.configA,  7, 'configA equals  7'); // 5 + 6 => old value of fieldA + new value of configA
        t.isStrict(instance2.configB, 15, 'configB equals 15'); // 8 + 7 => new value of fieldB + new value of configB
        t.isStrict(instance2.fieldA,   5, 'fieldA equals   5');
        t.isStrict(instance2.fieldB,   8, 'fieldB equals   8');
    });

    t.it('Class based class configs and fields', t => {
        t.diag("Testing class based values");

        const instance = Neo.create({
            className: 'Neo.TestClass'
        });

        t.isStrict(instance.configA, 4, 'configA equals 4'); // 1 + 3
        t.isStrict(instance.configB, 6, 'configB equals 6'); // 2 + 4
        t.isStrict(instance.fieldA,  1, 'fieldA equals  1');
        t.isStrict(instance.fieldB,  2, 'fieldB equals  2');
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

        t.isStrict(instance.configA, 11, 'configA equals 11'); // 5 + 6
        t.isStrict(instance.configB, 15, 'configB equals 15'); // 8 + 7
        t.isStrict(instance.fieldA,   5, 'fieldA equals   5');
        t.isStrict(instance.fieldB,   8, 'fieldB equals   8');

        t.diag('Reversed order');

        const instance2 = Neo.create({
            className: 'Neo.TestClass',
            fieldB   : 8, // reversed order
            configB  : 7,
            configA  : 6,
            fieldA   : 5
        });

        t.isStrict(instance2.configA, 11, 'configA equals 11'); // 5 + 6
        t.isStrict(instance2.configB, 15, 'configB equals 15'); // 8 + 7
        t.isStrict(instance2.fieldA,   5, 'fieldA equals   5');
        t.isStrict(instance2.fieldB,   8, 'fieldB equals   8');
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

        t.isStrict(instance.configA, 11, 'configA equals 11'); // 5 + 6
        t.isStrict(instance.configB, 15, 'configB equals 15'); // 8 + 7
        t.isStrict(instance.fieldA,   5, 'fieldA equals   5');
        t.isStrict(instance.fieldB,   8, 'fieldB equals   8');

        t.diag('Reversed order');

        const instance2 = Neo.create({
            className: 'Neo.TestClass'
        });

        instance2.set({
            fieldB : 8, // reversed order
            configB: 7,
            configA: 6,
            fieldA : 5
        });

        t.isStrict(instance2.configA, 11, 'configA equals 11'); // 5 + 6
        t.isStrict(instance2.configB, 15, 'configB equals 15'); // 8 + 7
        t.isStrict(instance2.fieldA,   5, 'fieldA equals   5');
        t.isStrict(instance2.fieldB,   8, 'fieldB equals   8');
    });

    t.it('Advanced configs and fields example', t => {
        class AdvancedClass extends core.Base {
            fieldA = 2;
            fieldB = 1;

            static config = {
                configA_: 0,
                configB_: 0,
                configC_: 0
            }

            afterSetConfigA(value, oldValue) {
                let me  = this,
                    sum = me.fieldA === 1 ? 21 : 6;

                t.isStrict(me.configA + me.configB + me.configC + me.fieldA + me.fieldB, sum, `sum equals ${sum}`);
            }

            afterSetConfigC(value, oldValue) {
                let me  = this,
                    sum = me.fieldA === 1 ? 21 : 6;

                t.isStrict(me.configA + me.configB + me.configC + me.fieldA + me.fieldB, sum, `sum equals ${sum}`);
            }

            beforeSetConfigA(value) {
                return this.fieldA + value;
            }

            beforeSetConfigB(value) {
                let me  = this,
                    sum = me.fieldA === 1 ? 21 : 6;

                t.isStrict(me.configA + me.configB + me.configC + me.fieldA + me.fieldB, sum, `sum equals ${sum}`);

                return value;
            }

            beforeSetConfigC(value) {
                return this.fieldB + value;
            }
        }

        Neo.applyClassConfig(AdvancedClass);

        let instance = Neo.create(AdvancedClass);

        instance.set({
            fieldA : 1,
            configA: 2,
            configB: 3,
            configC: 4,
            fieldB : 5
        });

        t.diag('Reversed order');

        let instance2 = Neo.create(AdvancedClass);

        instance2.set({
            fieldB : 5,
            configC: 4,
            configB: 3,
            configA: 2,
            fieldA : 1
        });
    });
});
