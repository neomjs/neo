import {setup} from '../../../setup.mjs';

const appName = 'TreeNormalizerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import TreeNormalizer from '../../../../../src/data/normalizer/Tree.mjs';

test.describe('Neo.data.normalizer.Tree', () => {
    let normalizer;

    test.beforeEach(() => {
        normalizer = Neo.create(TreeNormalizer);
    });

    test.afterEach(() => {
        normalizer?.destroy();
    });

    test('can flatten hierarchical data and extract total count', () => {
        let data = [
            {
                id: 1,
                name: 'Root 1',
                children: [
                    { id: 11, name: 'Child 1.1' },
                    { id: 12, name: 'Child 1.2' }
                ]
            },
            {
                id: 2,
                name: 'Root 2',
                children: []
            }
        ];

        let result = normalizer.normalize(data);

        expect(result.totalCount).toBe(4);
        expect(result.data.length).toBe(4);

        expect(result.data[0].id).toBe(1);
        expect(result.data[0].parentId).toBe(null);
        expect(result.data[0].isLeaf).toBe(false);

        expect(result.data[1].id).toBe(11);
        expect(result.data[1].parentId).toBe(1);
        expect(result.data[1].isLeaf).toBe(true);

        expect(result.data[2].id).toBe(12);
        expect(result.data[2].parentId).toBe(1);
        expect(result.data[2].isLeaf).toBe(true);

        expect(result.data[3].id).toBe(2);
        expect(result.data[3].parentId).toBe(null);
        expect(result.data[3].isLeaf).toBe(true);
        
        // Ensure children properties are deleted
        expect(result.data[0].children).toBeUndefined();
    });
    
    test('respects custom childrenProperty and keyProperty', () => {
        let customNormalizer = Neo.create(TreeNormalizer, {
            childrenProperty: 'items',
            keyProperty: 'uuid'
        });

        let data = [
            {
                uuid: 'r1',
                name: 'Root 1',
                items: [
                    { uuid: 'c1', name: 'Child 1' }
                ]
            }
        ];

        let result = customNormalizer.normalize(data);

        expect(result.totalCount).toBe(2);
        expect(result.data.length).toBe(2);

        expect(result.data[0].uuid).toBe('r1');
        expect(result.data[0].parentId).toBe(null);
        expect(result.data[0].isLeaf).toBe(false);

        expect(result.data[1].uuid).toBe('c1');
        expect(result.data[1].parentId).toBe('r1');
        expect(result.data[1].isLeaf).toBe(true);
        
        expect(result.data[0].items).toBeUndefined();
        
        customNormalizer.destroy();
    });
    
    test('handles data passed as a single object instead of an array', () => {
        let data = {
            id: 1,
            name: 'Root 1',
            children: [
                { id: 11, name: 'Child 1.1' }
            ]
        };

        let result = normalizer.normalize(data);

        expect(result.totalCount).toBe(2);
        expect(result.data.length).toBe(2);
        expect(result.data[0].id).toBe(1);
        expect(result.data[1].id).toBe(11);
    });
});
