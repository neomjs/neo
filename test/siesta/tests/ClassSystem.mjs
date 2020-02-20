import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,       'Neo is imported as a JS module');
        t.ok(core.Base, 'core.Base is imported as a JS module');
    });

    t.it('Class configs', t => {
        let valueA = 1,
            valueB = 2,
            instance;

        t.diag('a=1, b=2');

        class TestClass extends core.Base {
            static getConfig() {return {
                /**
                 * @member {String} className='Neo.TestClass'
                 * @private
                 */
                className: 'Neo.TestClass',

                a_: valueA,
                b_: valueB
            }}

            afterSetA(value, oldValue) {
                t.isStrict(this.a, valueA, 'afterSetA: a equals ' + valueA);
                t.isStrict(this.b, valueB, 'afterSetA: b equals ' + valueB);
            }

            afterSetB(value, oldValue) {
                t.isStrict(this.a, valueA, 'afterSetB: a equals ' + valueA);
                t.isStrict(this.b, valueB, 'afterSetB: b equals ' + valueB);
            }
        }

        Neo.applyClassConfig(TestClass);

        instance = Neo.create(TestClass, {

        });

        t.diag('a=2');
        valueA = 2;
        instance.a = valueA;

        valueA = 3;
        valueB = 3;

        /*Object.assign(instance, { // this test will break => needs instance.set()
            a: valueA,
            b: valueB
        });*/
    });
});