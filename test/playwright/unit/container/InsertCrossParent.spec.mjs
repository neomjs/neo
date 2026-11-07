import { setup } from '../../setup.mjs';

const appName = 'ContainerInsertCrossParentTest';

setup({
    appConfig: {
        name: appName
    }
});

import { test, expect } from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Button           from '../../../../src/button/Base.mjs';
import Container        from '../../../../src/container/Base.mjs';
import TreeBuilder      from '../../../../src/util/vdom/TreeBuilder.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get for the existing-instance insert path

test.describe('Neo.container.Base (insert across parents)', () => {
    test('the receiving container\'s next update carries the component it took from another parent', () => {
        const root   = Neo.create(Container, {
                  appName,
                  items: [
                      {module: Container, items: [{module: Button, text: 'moved'}]},
                      {module: Container, items: [{module: Button, text: 'stays'}]}
                  ]
              }),
              [source, target] = root.items,
              moved            = source.items[0];

        // Mounted children prune by depth. An earlier update of the receiver spent its depth: the update resets it to
        // the class default by writing `_updateDepth`, as `getVdomUpdatePayload` does, because the setter only widens
        moved.vnode           = {id: moved.id};
        target.items[0].vnode = {id: target.items[0].id};
        target._updateDepth   = 1;

        target.insert(0, moved);

        const [child] = TreeBuilder.getVdomTree(target.vdom, target.updateDepth).cn;

        expect(moved.parentId).toBe(target.id);
        expect(child.neoIgnore, 'the newcomer is not left as a placeholder').toBeUndefined();
        expect(child.id).toBe(moved.id);

        root.destroy()
    })
});
