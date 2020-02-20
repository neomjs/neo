import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,        'Neo is imported as a JS module');
        t.ok(core.Base, 'core.Base is imported as a JS module');
    });
});