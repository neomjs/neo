import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

let startCount;

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,             'Neo is imported as a JS module');
        t.ok(InstanceManager, 'InstanceManager is imported as a JS module');
    });

    t.it('Adding & removing items', t => {
        startCount = InstanceManager.getCount();

        t.diag("Create 3 Neo instances");

        const
            item1 = Neo.create('Neo.core.Base'),
            item2 = Neo.create('Neo.core.Base'),
            item3 = Neo.create('Neo.core.Base');

        t.is(InstanceManager.getCount() - startCount, 3, '3 instances got added');

        t.is(InstanceManager.findFirst(item2), item2, 'Found item via reference');

        t.is(InstanceManager.findFirst({id: item3.id}), item3, 'Found item via id');

        item1.destroy();
        item2.destroy();
        item3.destroy()

        t.is(InstanceManager.getCount(), startCount, '3 instances got removed');
    });
});
