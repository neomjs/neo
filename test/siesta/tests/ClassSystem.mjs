import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

let valueA = 1,
    valueB = 2,
    instance;

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,       'Neo is imported as a JS module');
        t.ok(core.Base, 'core.Base is imported as a JS module');
    });

    t.it('Create instance', t => {
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
                t.isStrict(this.a, valueA, 'a value matches: ' + valueA);
                t.isStrict(this.b, valueB, 'b value matches: ' + valueB);
            }

            afterSetB(value, oldValue) {
                t.isStrict(this.a, valueA, 'a value matches: ' + valueA);
                t.isStrict(this.b, valueB, 'b value matches: ' + valueB);
            }
        }

        Neo.applyClassConfig(TestClass);

        instance = Neo.create(TestClass, {
            a: valueA,
            b: valueB
        });

        valueA = 2;
        valueB = 3;

        /*Object.assign(instance, { // this test will break => needs instance.set()
            a: valueA,
            b: valueB
        });*/
    });
});