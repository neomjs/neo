import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AppContentTreeListLazyLoadTest'
    }
});

import {test, expect}    from '@playwright/test';
import fs                from 'fs';
import path              from 'path';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import ContentStore      from '../../../../../apps/portal/store/Content.mjs';
import InstanceManager   from '../../../../../src/manager/Instance.mjs';
import LearnController   from '../../../../../apps/portal/view/learn/MainContainerController.mjs';
import TicketsController from '../../../../../apps/portal/view/news/tickets/MainContainerController.mjs';
import TicketsStore      from '../../../../../apps/portal/store/Tickets.mjs';
import TreeList          from '../../../../../src/app/content/TreeList.mjs';

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

test.describe('Portal tickets chunked tree adoption', () => {
    test('uses the chunked tickets index and renders chunk folders as ticket ranges', () => {
        const store = Neo.create(TicketsStore, {
            id  : 'portal-tickets-chunked-store-test',
            data: [{
                id       : 'Backlog',
                isLeaf   : false,
                parentId : null,
                collapsed: true
            }, {
                id         : 'Backlog/active-chunk-16',
                isLeaf     : false,
                parentId   : 'Backlog',
                title      : 'chunk-16',
                childCount : 9,
                childrenUrl: 'tickets/backlog/active-chunk-16.json'
            }, {
                id      : '12218',
                parentId: 'Backlog/active-chunk-16',
                title   : 'Opt-in load-on-folder-expand for the shared portal TreeList'
            }]
        });

        try {
            expect(store.url).toBe('../../apps/portal/resources/data/tickets/index.json');
            expect(store.get('Backlog').treeNodeName).toBe('Backlog');
            expect(store.get('Backlog/active-chunk-16').treeNodeName).toBe('Tickets 1501-1509');
            expect(store.get('Backlog/active-chunk-16').treeNodeName).not.toContain('chunk');
            expect(store.get('12218').treeNodeName).toBe(
                '<b>12218</b> <span class="ticket-title">Opt-in load-on-folder-expand for the shared portal TreeList</span>'
            )
        } finally {
            store.destroy()
        }
    })

    test('resolves the default route after loading the first ticket chunk', async () => {
        const store = Neo.create(TicketsStore, {
            id  : 'portal-tickets-default-route-store-test',
            data: [{
                id       : 'Backlog',
                isLeaf   : false,
                parentId : null,
                collapsed: true
            }, {
                id         : 'Backlog/active-chunk-16',
                isLeaf     : false,
                parentId   : 'Backlog',
                title      : 'chunk-16',
                childCount : 9,
                childrenUrl: 'tickets/backlog/active-chunk-16.json'
            }]
        });

        const stateProvider = {
            data    : {},
            getStore: () => store
        };

        const controller = Object.create(TicketsController.prototype);

        controller.getStateProvider = () => stateProvider;
        controller.getReference = () => ({
            async onFolderItemClick(record) {
                store.add([{
                    id      : '12218',
                    parentId: record.id,
                    title   : 'Opt-in load-on-folder-expand for the shared portal TreeList'
                }]);

                record.isChildrenLoaded = true
            }
        });

        try {
            expect(await controller.getDefaultRouteId()).toBe('12218');
            expect(stateProvider.data.countPages).toBe(3)
        } finally {
            store.destroy()
        }
    })
});

test.describe('Portal learn API Docs link routing (#5574)', () => {
    test('learn/tree.json defines top-level API Docs entry with route /docs and TreeList#onLeafItemClick honors record.route', async () => {
        const treeData     = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'learn/tree.json'), 'utf8')).data,
              apiDocsEntry = treeData.find(node => node.id === 'ApiDocs'),
              originalMain = Neo.Main,
              routes       = [];

        expect(apiDocsEntry).toEqual({
            id      : 'ApiDocs',
            name    : 'API Docs',
            parentId: null,
            route   : '/docs'
        });

        Neo.Main = {
            ...originalMain,
            setRoute: payload => routes.push(payload)
        };

        const store = Neo.create(ContentStore, {
            id  : 'portal-learn-content-store-test',
            data: [
                {id: 'Glossary', name: 'Glossary', parentId: null},
                apiDocsEntry
            ]
        });

        const tree = Neo.create(TreeList, {
            appName                   : 'AppContentTreeListLazyLoadTest',
            id                        : 'portal-learn-tree-list-route-test',
            routePrefix               : '/learn',
            showCollapseExpandAllIcons: false,
            store,
            windowId                  : 'portal-window-1'
        });

        try {
            await tree.initVnode();

            await tree.onItemClick(tree.getVdomChild(tree.getItemId('Glossary')), {
                path: [{id: tree.getItemId('Glossary')}]
            });

            await tree.onItemClick(tree.getVdomChild(tree.getItemId('ApiDocs')), {
                path: [{id: tree.getItemId('ApiDocs')}]
            });

            expect(routes).toEqual([
                {value: '/learn/Glossary', windowId: 'portal-window-1'},
                {value: '/docs',           windowId: 'portal-window-1'}
            ])
        } finally {
            tree.destroy();
            store.destroy();
            Neo.Main = originalMain
        }
    });

    test('Learn MainContainerController routes record.route entries to /docs and restores selection on /learn return', async () => {
        const originalMain = Neo.Main,
              routes       = [],
              selected     = [];

        Neo.Main = {
            ...originalMain,
            setRoute: payload => routes.push(payload)
        };

        const store = Neo.create(ContentStore, {
            id  : 'portal-learn-controller-store-test',
            data: [
                {id: 'Glossary', name: 'Glossary', parentId: null},
                {id: 'ApiDocs',  name: 'API Docs', parentId: null, route: '/docs'}
            ]
        });

        const glossaryRecord = store.get('Glossary'),
              stateProvider  = {
                  data    : {currentPageRecord: glossaryRecord},
                  getStore: () => store
              },
              tree = {
                  routePrefix          : null,
                  expandAndScrollToItem: async () => {},
                  expandParents        : () => {},
                  selectionModel       : {
                      select: record => selected.push(record)
                  }
              },
              controller = new LearnController();

        controller.component        = {windowId: 'portal-window-1'};
        controller.getStateProvider = () => stateProvider;
        controller.getReference     = name => name === 'tree' ? tree : null;

        try {
            controller.navigateTo('Glossary');
            controller.navigateTo('ApiDocs');

            await controller.onRouteLearnItem({itemId: 'ApiDocs'}, {}, {hashString: '/learn/Glossary'});

            expect(stateProvider.data.currentPageRecord).toBe(glossaryRecord);

            controller.onRouteDefault({});

            expect(routes).toEqual([
                {value: '/learn/Glossary', windowId: 'portal-window-1'},
                {value: '/docs',           windowId: 'portal-window-1'},
                {value: '/docs',           windowId: 'portal-window-1'}
            ]);
            expect(selected).toEqual([glossaryRecord])
        } finally {
            store.destroy();
            Neo.Main = originalMain
        }
    });

    test('Retained Decisions in learn/tree.json shows all 8 substantive Engine ADRs and hides the 5 moved redirect stubs (#20526)', async () => {
        const treeData            = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'learn/tree.json'), 'utf8')).data,
              usingTheseTopics    = fs.readFileSync(path.resolve(process.cwd(), 'learn/UsingTheseTopics.md'), 'utf8'),
              visibleEngineLeaves = treeData.filter(node => node.isLeaf !== false && !node.hidden),
              decisions           = treeData.filter(node => node.parentId === 'AgentInterfaces/Decisions'),
              visible             = decisions.filter(node => !node.hidden).map(node => node.id),
              hidden              = decisions.filter(node => node.hidden === true).map(node => node.id);

        expect(visibleEngineLeaves).toHaveLength(132);
        expect(usingTheseTopics).toContain('composes `227` visible topics across ten sections (`132` Engine topics plus `95` federated guides');
        expect(usingTheseTopics).toContain('and `8` retained Architectural Decision Records (`78` topics).');

        expect(visible).toEqual([
            'agentos/decisions/0004-github-content-architecture',
            'agentos/decisions/0007-agents-md-compaction-taxonomy',
            'agentos/decisions/0008-skill-anatomy-and-authoring-contract',
            'agentos/decisions/0018-neo-identity-source-of-truth-model',
            'agentos/decisions/0021-extended-nl-multi-writer-write-enforcement',
            'agentos/decisions/0029-docking-design',
            'agentos/decisions/0031-target-architecture-composition',
            'agentos/decisions/0043-vdom-diff-placement'
        ]);

        expect(hidden).toEqual([
            'agentos/decisions/0020-agent-harness-concept',
            'agentos/decisions/0032-institution-cockpit-render-model',
            'agentos/decisions/0034-electron-shell-architecture',
            'agentos/decisions/0037-fleet-manager-outward-door-topology',
            'agentos/decisions/0038-fm-client-topology'
        ]);

        const store = Neo.create(ContentStore, {
            id  : 'portal-learn-retained-decisions-store-test',
            data: [
                treeData.find(node => node.id === 'AgentInterfaces'),
                treeData.find(node => node.id === 'AgentInterfaces/Decisions'),
                ...decisions
            ]
        });

        const tree = Neo.create(TreeList, {
            appName                   : 'AppContentTreeListLazyLoadTest',
            id                        : 'portal-learn-retained-decisions-tree-test',
            routePrefix               : '/learn',
            showCollapseExpandAllIcons: false,
            store
        });

        try {
            await tree.initVnode();
            expect(tree.getVdomChild(tree.getItemId('agentos/decisions/0004-github-content-architecture')).style.display).toBe('flex');
            expect(tree.getVdomChild(tree.getItemId('agentos/decisions/0007-agents-md-compaction-taxonomy')).style.display).toBe('flex');
            expect(tree.getVdomChild(tree.getItemId('agentos/decisions/0020-agent-harness-concept')).style.display).toBe('none');
            expect(tree.getVdomChild(tree.getItemId('agentos/decisions/0038-fm-client-topology')).style.display).toBe('none')
        } finally {
            tree.destroy();
            store.destroy()
        }
    })
});
