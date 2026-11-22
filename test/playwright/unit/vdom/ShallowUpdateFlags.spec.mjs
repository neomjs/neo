import {setup} from '../../setup.mjs';

const appName = 'ShallowUpdateFlagsTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';

/**
 * @summary Mounts three nested containers, root → intermediate → host, and returns them.
 * @param {String} prefix Unique id prefix
 * @returns {Promise<Object>}
 */
async function mountTree(prefix) {
    const root = Neo.create(Container, {
        appName,
        id   : `${prefix}-root`,
        items: [{module: Container, id: `${prefix}-intermediate`, items: [{module: Container, id: `${prefix}-host`, items: []}]}]
    });

    await root.initVnode(true);
    root.mounted = true;
    await root.promiseUpdate();

    const [intermediate] = root.items,
          [host]         = intermediate.items;

    return {host, intermediate, root}
}

test.describe('A shallow update clears the needs-update flag only where its payload reaches', () => {
    test('a host promise merged into a staged intermediate survives a depth-1 update of the root', async () => {
        const {host, intermediate, root} = await mountTree('shallow');

        try {
            // The intermediate stages a deep update silently, and the host's update merges into it
            intermediate.silentVdomUpdate = true;
            intermediate.updateDepth      = -1;
            intermediate.update();
            host.updateDepth = -1;

            let   settled = false;
            const ticket  = host.promiseUpdate().then(() => {settled = true});

            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);

            // The root renders itself only: its payload carries neither the intermediate nor the host
            root.updateDepth = 1;
            await root.promiseUpdate();

            expect(intermediate.needsVdomUpdate, 'the staged intermediate keeps its owed update').toBe(true);
            expect(host.needsVdomUpdate,         'the merged host keeps its flag').toBe(true);
            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);
            expect(settled).toBe(false);

            // The intermediate's own flight carries the host and settles its promise
            intermediate.silentVdomUpdate = false;
            intermediate.updateDepth      = -1;
            await intermediate.promiseUpdate();
            await ticket;

            expect(settled).toBe(true);
            expect(host.needsVdomUpdate).toBe(false)
        } finally {
            root.destroy()
        }
    });

    test('a deep update still clears the flag of every descendant it renders', async () => {
        const {host, intermediate, root} = await mountTree('deep');

        try {
            intermediate._needsVdomUpdate = true;
            host._needsVdomUpdate         = true;

            root.updateDepth = -1;
            await root.promiseUpdate();

            expect(intermediate.needsVdomUpdate).toBe(false);
            expect(host.needsVdomUpdate).toBe(false)
        } finally {
            root.destroy()
        }
    })
});
