import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalRouteWindowIdAuditTest'
    },
    neoConfig: {
        basePath            : '../../',
        releaseNotesBasePath: '.github/RELEASE_NOTES/'
    }
});

import {test, expect}                      from '@playwright/test';
import * as acorn                          from 'acorn';
import fg                                  from 'fast-glob';
import fs                                  from 'node:fs';
import path                                from 'node:path';
import {fileURLToPath}                     from 'node:url';
import {extractExampleFamilyDefinitions}   from '../../../../../buildScripts/docs/seo/seoJson.mjs';
import Neo                                 from '../../../../../src/Neo.mjs';
import * as core                           from '../../../../../src/core/_export.mjs';
import InstanceManager                     from '../../../../../src/manager/Instance.mjs';
import {isManagedRoutePath}                from '../../../../../src/util/Route.mjs';
import AudienceDoors                       from '../../../../../apps/portal/view/home/parts/AudienceDoors.mjs';
import ContentBox                          from '../../../../../apps/portal/view/home/ContentBox.mjs';
import ExampleGroup                        from '../../../../../apps/portal/model/ExampleGroup.mjs';
import GroupIndex                          from '../../../../../apps/portal/view/examples/GroupIndex.mjs';
import ServicesContainer                   from '../../../../../apps/portal/view/services/Container.mjs';
import Store                               from '../../../../../src/data/Store.mjs';
import {resolveRepoLink, rewriteRepoLinks} from '../../../../../apps/portal/Util.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * @summary Walks an Acorn AST and invokes `visitor(node)` on every AST node.
 * @param {Object} root
 * @param {Function} visitor
 */
function walkAst(root, visitor) {
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return
        }
        if (typeof node.type === 'string') {
            visitor(node)
        }
        for (const [key, value] of Object.entries(node)) {
            if (key !== 'parent' && value && typeof value === 'object') {
                visit(value)
            }
        }
    };

    visit(root)
}

/**
 * @summary Extracts the callee method/function identifier from a `CallExpression` (`foo()` or `obj.foo()`).
 * @param {Object} callee
 * @returns {String|null}
 */
function calleeName(callee) {
    if (!callee) return null;
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed && callee.property?.type === 'Identifier') {
        return callee.property.name
    }
    return null
}

test.describe('SharedWorker route-href windowId call-site audit (#22175)', () => {
    test('every toRouteHref, rewriteRepoLinks, and resolveRepoLink call in src/ and apps/portal/ passes explicit windowId', async () => {
        const files      = await fg(['src/**/*.mjs', 'apps/portal/**/*.mjs'], {cwd: repoRoot}),
              minArgsMap = new Map([
                  ['toRouteHref',      2],
                  ['rewriteRepoLinks', 3],
                  ['resolveRepoLink',  3]
              ]),
              violations = [];

        expect(files.length).toBeGreaterThan(100);

        for (const relFile of files.sort()) {
            const absFile = path.join(repoRoot, relFile),
                  code    = fs.readFileSync(absFile, 'utf8'),
                  ast     = acorn.parse(code, {ecmaVersion: 'latest', locations: true, sourceType: 'module'});

            walkAst(ast, node => {
                if (node.type !== 'CallExpression') return;

                const name    = calleeName(node.callee),
                      minArgs = minArgsMap.get(name);

                if (minArgs && node.arguments.length < minArgs) {
                    violations.push(`${relFile}:${node.loc.start.line} ${name}(...) passed ${node.arguments.length} arg(s), expected >= ${minArgs}`)
                }
            })
        }

        expect(violations).toEqual([])
    });

    test('Portal.Util.rewriteRepoLinks and resolveRepoLink resolve per-window routerMode and routerBasePath in SharedWorker mode', () => {
        const prevWindowConfigs = Neo.windowConfigs,
              prevRouterMode    = Neo.config.routerMode;

        Neo.config.routerMode = 'hash';
        Neo.windowConfigs     = {
            1: {basePath: '../../', routerBasePath: '',                        routerMode: 'pathname'},
            2: {basePath: '../../', routerBasePath: '/dist/esm/apps/portal',   routerMode: 'pathname'},
            3: {basePath: '../../', routerBasePath: '',                        routerMode: 'hash'}
        };

        try {
            expect(resolveRepoLink('learn/benefits/Introduction.md#overview', null, 1)).toBe('/learn/benefits/Introduction#overview');
            expect(resolveRepoLink('learn/blog/v14.md', null, 2)).toBe('/dist/esm/apps/portal/news/blog/v14');
            expect(resolveRepoLink('learn/benefits/Introduction.md', null, 3)).toBe('#/learn/benefits/Introduction');

            // In pathname mode, internal '/learn/...' routes stay in-tab (no target="_blank"), while GitHub links get target="_blank"
            expect(rewriteRepoLinks('<a href="learn/Glossary.md">Glossary</a><a href="src/Neo.mjs">Neo</a>', null, 1))
                .toBe('<a href="/learn/Glossary">Glossary</a><a href="https://github.com/neomjs/neo/blob/dev/src/Neo.mjs" target="_blank">Neo</a>');

            expect(rewriteRepoLinks('<a href="learn/Glossary.md">Glossary</a>', null, 3))
                .toBe('<a href="#/learn/Glossary">Glossary</a>')
        } finally {
            Neo.windowConfigs     = prevWindowConfigs;
            Neo.config.routerMode = prevRouterMode
        }
    });

    test('Portal Home, Examples, and Services views format internal hrefs per windowId across pathname and hash windows', () => {
        const prevWindowConfigs = Neo.windowConfigs,
              prevRouterMode    = Neo.config.routerMode;

        Neo.config.routerMode = 'hash';
        Neo.windowConfigs     = {
            10: {basePath: '../../', environment: 'development', routerBasePath: '', routerMode: 'pathname'},
            20: {basePath: '../../', environment: 'development', routerBasePath: '', routerMode: 'hash'}
        };

        const instances = [];

        try {
            const box = Neo.create(ContentBox, {
                id      : 'test-portal-content-box-win',
                route   : '/learn/gettingstarted/Setup',
                windowId: 10
            });
            instances.push(box);
            expect(box.vdom.href).toBe('/learn/gettingstarted/Setup');
            box.windowId = 20;
            expect(box.vdom.href).toBe('#/learn/gettingstarted/Setup');

            const doors = Neo.create(AudienceDoors, {
                id      : 'test-portal-audience-doors-win',
                windowId: 10
            });
            instances.push(doors);
            expect(doors.getItem('door-agents-body').vdom.cn[4].cn[0].href).toBe('/news/pulls/15123');
            expect(doors.getItem('door-study-body').vdom.cn[4].cn[0].href).toBe('/learn/benefits/Introduction');
            doors.windowId = 20;
            expect(doors.getItem('door-agents-body').vdom.cn[4].cn[0].href).toBe('#/news/pulls/15123');
            expect(doors.getItem('door-study-body').vdom.cn[4].cn[0].href).toBe('#/learn/benefits/Introduction');

            const services = Neo.create(ServicesContainer, {
                id      : 'test-portal-services-win',
                windowId: 10
            });
            instances.push(services);
            expect(services.getItem('connect-build-body').vdom.cn[1].cn[1].href).toBe('/examples');
            services.windowId = 20;
            expect(services.getItem('connect-build-body').vdom.cn[1].cn[1].href).toBe('#/examples');

            const store = Neo.create(Store, {
                id   : 'test-portal-group-index-store',
                model: ExampleGroup,
                data : [{
                    band      : 'Grids & Data',
                    count     : 4,
                    crossCount: 0,
                    family    : 'grid',
                    iconCls   : 'fa fa-table',
                    order     : 1,
                    route     : '/examples/grid',
                    title     : 'Grid & Table'
                }]
            });
            instances.push(store);

            const groupIndex = Neo.create(GroupIndex, {
                featuredCount: 3,
                id           : 'test-portal-group-index-win',
                presentation : 'list',
                store,
                windowId     : 10
            });
            instances.push(groupIndex);
            expect(groupIndex.vdom.cn[0].href).toBe('/examples');
            expect(groupIndex.vdom.cn[2].cn[1].cn[0].cn[0].href).toBe('/examples/grid');
            groupIndex.windowId = 20;
            expect(groupIndex.vdom.cn[0].href).toBe('#/examples');
            expect(groupIndex.vdom.cn[2].cn[1].cn[0].cn[0].href).toBe('#/examples/grid')
        } finally {
            instances.reverse().forEach(instance => instance.destroy?.());
            Neo.windowConfigs     = prevWindowConfigs;
            Neo.config.routerMode = prevRouterMode
        }
    });

    test('apps/portal/neo-config.json routerIgnorePaths admits all 21 catalog groups while excluding trailing-slash and non-catalog standalone demos', () => {
        const portalConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/portal/neo-config.json'), 'utf8')),
              examplesCode = fs.readFileSync(path.join(repoRoot, 'apps/portal/view/examples/MainContainer.mjs'), 'utf8'),
              groups       = extractExampleFamilyDefinitions(examplesCode),
              ignorePaths  = portalConfig.routerIgnorePaths;

        expect(groups).toHaveLength(21);

        for (const {route} of groups) {
            expect(isManagedRoutePath(route, ignorePaths, ''), route).toBe(true);
            expect(isManagedRoutePath(`/apps/portal${route}`, ignorePaths, '/apps/portal'), `/apps/portal${route}`).toBe(true);
            expect(isManagedRoutePath(`${route}/`, ignorePaths, ''), `${route}/`).toBe(false)
        }

        for (const standalone of ['/examples/dialog', '/examples/dialog/', '/examples/tableFiltering', '/examples/fields', '/examples/grid/bigData']) {
            expect(isManagedRoutePath(standalone, ignorePaths, ''), standalone).toBe(false);
            expect(isManagedRoutePath(`/apps/portal${standalone}`, ignorePaths, '/apps/portal'), `/apps/portal${standalone}`).toBe(false)
        }
    })
});
