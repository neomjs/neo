import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

let instance;

class TestClass extends core.Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.TestClass'
         * @private
         */
        className: 'Neo.TestClass',
        a_: 1,
        b_: 2
    }}

    afterSetA(value, oldValue) {
        console.log(this.a, this.b);
    }

    afterSetB(value, oldValue) {
        console.log(this.a, this.b);
    }
}

Neo.applyClassConfig(TestClass);

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,       'Neo is imported as a JS module');
        t.ok(core.Base, 'core.Base is imported as a JS module');
    });

    t.it('Create instance', t => {
        instance = Neo.create(TestClass, {

        });
    });
});