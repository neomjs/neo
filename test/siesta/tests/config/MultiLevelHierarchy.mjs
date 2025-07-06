import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

// Level 1
class BaseComponent extends core.Base {
    static config = {
        className    : 'Neo.Test.MultiLevel.BaseComponent',
        myConfig_    : 'baseValue',
        arrayConfig_ : {
            [isDescriptor]: true,
            value         : [1, 2],
            merge         : 'replace'
        },
        objectConfig_: {
            [isDescriptor]: true,
            value         : {a: 1, b: {c: 2}},
            merge         : 'deep'
        }
    }
}
Neo.setupClass(BaseComponent);

// Level 2
class MidLevelComponent extends BaseComponent {
    static config = {
        className   : 'Neo.Test.MultiLevel.MidLevelComponent',
        arrayConfig : [3, 4],
        objectConfig: {b: {c: 3, d: 4}, e: 5}
    }
}
Neo.setupClass(MidLevelComponent);

// Level 3
class TopLevelComponent extends MidLevelComponent {
    static config = {
        className   : 'Neo.Test.MultiLevel.TopLevelComponent',
        myConfig    : 'topValue',
        objectConfig: {b: {d: 99}, f: 6} // Override again
    }
}
Neo.setupClass(TopLevelComponent);


StartTest(t => {
    t.it('Initial values for a three-level hierarchy instance', t => {
        const instance = Neo.create(TopLevelComponent);

        // myConfig is defined in Base, overridden in Top (Mid doesn't touch it)
        t.is(instance.myConfig, 'topValue', 'myConfig should be the value from the top-level class');

        // arrayConfig is defined in Base, overridden in Mid (Top doesn't touch it)
        t.isDeeplyStrict(instance.arrayConfig, [3, 4], 'arrayConfig should be replaced by the mid-level class value');

        // objectConfig is defined in Base, merged in Mid, and merged again in Top
        const expectedObject = {
            a: 1,             // from Base
            b: {c: 3, d: 99}, // c from Mid, d from Top
            e: 5,             // from Mid
            f: 6              // from Top
        };
        t.isDeeplyStrict(instance.objectConfig, expectedObject, 'objectConfig should be a deep merge of all three levels');
    });

    t.it('Instance-level config overrides on a three-level hierarchy', t => {
        const instance = Neo.create(TopLevelComponent, {
            myConfig    : 'instanceValue',
            arrayConfig : [10, 11],
            objectConfig: {a: 100, b: {c: 101}, g: 102}
        });

        t.is(instance.myConfig, 'instanceValue', 'myConfig should be the value from the instance config');
        t.isDeeplyStrict(instance.arrayConfig, [10, 11], 'arrayConfig should be replaced by the instance config value');

        const expectedObject = {
            a: 100,             // from instance
            b: {c: 101, d: 99}, // c from instance, d from Top
            e: 5,               // from Mid
            f: 6,               // from Top
            g: 102              // from instance
        };

        t.isDeeplyStrict(instance.objectConfig, expectedObject, 'objectConfig from instance should be deep-merged into the class hierarchy defaults');
    });
});
