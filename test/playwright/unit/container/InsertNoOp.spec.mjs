
import { setup } from '../../setup.mjs';

const appName = 'ContainerInsertTest';

setup({
    appConfig: {
        name: appName
    }
});

import { test, expect } from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Container        from '../../../../src/container/Base.mjs';
import Button           from '../../../../src/button/Base.mjs';

test.describe('Neo.container.Base (Insert No-Op)', () => {

    test('Moving an item to the same index multiple times should be a no-op', () => {
        // 1. Create Container
        const container = Neo.create(Container, {
            appName: appName,
            items: [
                { module: Button, id: 'btn-1', text: 'Button 1' },
                { module: Button, id: 'btn-2', text: 'Button 2' }
            ]
        });

        const btn1 = container.items[0];
        const btn2 = container.items[1];

        expect(container.items.length).toBe(2);
        expect(container.items[0].id).toBe('btn-1');

        // 2. Insert at same index (No-Op expected)
        const ret1 = container.insert(0, btn1);

        expect(ret1).toBe(btn1);
        expect(container.items.length).toBe(2);
        expect(container.items[0].id).toBe('btn-1');
        
        // Check VDOM for duplicates
        expect(container.vdom.cn.length).toBe(2);
        
        const node0 = container.vdom.cn[0];
        expect(node0.id || node0.componentId).toBe('btn-1');

        // 3. Repeat (Simulate "fragment empty" bug condition)
        container.insert(0, btn1);
        container.insert(0, btn1);

        expect(container.items.length).toBe(2);
        expect(container.items[0].id).toBe('btn-1');
        expect(container.items[1].id).toBe('btn-2');
        expect(container.vdom.cn.length).toBe(2);
    });

    test('Moving an item to the same index (via forward shift) should be a no-op', () => {
        // [A, B, C] -> move A to 0 -> [A, B, C] (No-op)
        // [A, B, C] -> move B to 1 -> [A, B, C] (No-op)
        
        const container = Neo.create(Container, {
            appName: appName,
            items: [
                { module: Button, id: 'btn-a' },
                { module: Button, id: 'btn-b' },
                { module: Button, id: 'btn-c' }
            ]
        });
        
        const btnB = container.items[1];
        
        // Insert B at index 1
        container.insert(1, btnB);
        
        expect(container.items.length).toBe(3);
        expect(container.items[1].id).toBe('btn-b');
        expect(container.vdom.cn.length).toBe(3);
    });
});
