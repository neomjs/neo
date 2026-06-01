import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AppContentTreeListLazyLoadTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import TreeList       from '../../../../../src/app/content/TreeList.mjs';

test.describe('Neo.app.content.TreeList lazy child loading', () => {
    test('loads chunk children on folder expand and reconstructs markdown paths once', async () => {
        const originalFetch = globalThis.fetch;
        let fetchCount = 0,
            requestedUrl;

        globalThis.fetch = async url => {
            fetchCount++;
            requestedUrl = url;

            return {
                ok    : true,
                status: 200,
                json  : async () => [{
                    id      : '12218',
                    parentId: 'Backlog/active-chunk-16',
                    title   : 'Opt-in load-on-folder-expand for the shared portal TreeList'
                }]
            }
        };

        const tree = Neo.create(TreeList, {
            appName                   : 'AppContentTreeListLazyLoadTest',
            id                        : 'app-content-tree-list-lazy-load',
            lazyChildLoad             : true,
            lazyChildUrlPrefix        : '../../apps/portal/resources/data/',
            showCollapseExpandAllIcons: false,
            store: {
                model: {
                    fields: [
                        {name: 'childCount',  type: 'Integer'},
                        {name: 'childrenUrl', type: 'String'},
                        {name: 'collapsed',   type: 'Boolean', defaultValue: true},
                        {name: 'contentDir',  type: 'String'},
                        {name: 'filePrefix',  type: 'String'},
                        {name: 'id',          type: 'String'},
                        {name: 'isLeaf',      type: 'Boolean'},
                        {name: 'parentId',    type: 'String'},
                        {name: 'path',        type: 'String'},
                        {name: 'title',       type: 'String'}
                    ]
                },
                data: [{
                    id       : 'Backlog',
                    isLeaf   : false,
                    parentId : null,
                    collapsed: true
                }, {
                    id         : 'Backlog/active-chunk-16',
                    isLeaf     : false,
                    parentId   : 'Backlog',
                    collapsed  : true,
                    childrenUrl: 'tickets/backlog/active-chunk-16.json',
                    childCount : 1,
                    contentDir : 'resources/content/issues/chunk-16',
                    filePrefix : 'issue-'
                }]
            }
        });

        try {
            await tree.initVnode();

            await tree.onItemClick(tree.getVdomChild(tree.getItemId('Backlog')), {
                path: [{id: tree.getItemId('Backlog')}]
            });

            await tree.onItemClick(tree.getVdomChild(tree.getItemId('Backlog/active-chunk-16')), {
                path: [{id: tree.getItemId('Backlog/active-chunk-16')}]
            });

            const chunkRecord  = tree.store.get('Backlog/active-chunk-16'),
                  loadedRecord = tree.store.get('12218');

            expect(fetchCount).toBe(1);
            expect(requestedUrl).toBe('../../apps/portal/resources/data/tickets/backlog/active-chunk-16.json');
            expect(chunkRecord.isChildrenLoaded).toBe(true);
            expect(chunkRecord.collapsed).toBe(false);
            expect(loadedRecord.parentId).toBe('Backlog/active-chunk-16');
            expect(loadedRecord.path).toBe('resources/content/issues/chunk-16/issue-12218.md');

            await tree.onItemClick(tree.getVdomChild(tree.getItemId('Backlog/active-chunk-16')), {
                path: [{id: tree.getItemId('Backlog/active-chunk-16')}]
            });

            expect(fetchCount).toBe(1);
            expect(chunkRecord.collapsed).toBe(true);
            expect(tree.store.find('parentId', 'Backlog/active-chunk-16')).toHaveLength(1);
        } finally {
            tree.destroy();
            globalThis.fetch = originalFetch
        }
    });

    test('does not fetch child chunks when lazyChildLoad is disabled', async () => {
        const originalFetch = globalThis.fetch;
        let fetchCount = 0;

        globalThis.fetch = async () => {
            fetchCount++;
            return {ok: true, json: async () => []}
        };

        const tree = Neo.create(TreeList, {
            appName                   : 'AppContentTreeListLazyLoadTest',
            id                        : 'app-content-tree-list-lazy-off',
            showCollapseExpandAllIcons: false,
            store: {
                model: {
                    fields: [
                        {name: 'childrenUrl', type: 'String'},
                        {name: 'collapsed',   type: 'Boolean', defaultValue: true},
                        {name: 'id',          type: 'String'},
                        {name: 'isLeaf',      type: 'Boolean'},
                        {name: 'parentId',    type: 'String'},
                        {name: 'title',       type: 'String'}
                    ]
                },
                data: [{
                    id         : 'Backlog/active-chunk-16',
                    isLeaf     : false,
                    parentId   : null,
                    collapsed  : true,
                    childrenUrl: 'tickets/backlog/active-chunk-16.json'
                }]
            }
        });

        try {
            await tree.initVnode();
            await tree.onItemClick(tree.getVdomChild(tree.getItemId('Backlog/active-chunk-16')), {
                path: [{id: tree.getItemId('Backlog/active-chunk-16')}]
            });

            expect(fetchCount).toBe(0);
            expect(tree.store.get('Backlog/active-chunk-16').collapsed).toBe(false)
        } finally {
            tree.destroy();
            globalThis.fetch = originalFetch
        }
    })
});
