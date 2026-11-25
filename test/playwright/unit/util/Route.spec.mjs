import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';
import {
    STATIC_ASSET_EXTENSIONS,
    isManagedRoutePath,
    normalizeRoutePathname,
    parseQueryParams
} from '../../../../src/util/Route.mjs';

const
    root      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    routePath = path.join(root, 'src/util/Route.mjs'),
    execute   = promisify(execFile);

test.describe('Neo.util.Route', () => {
    test('imports cleanly with zero Neo globals or Base dependencies', async () => {
        const source = fs.readFileSync(routePath, 'utf8');

        expect(source).not.toMatch(/\bimport\b[\s\S]*?(?:Neo|Base)\.mjs/);
        expect(source).not.toMatch(/\bNeo\./);

        const {stdout} = await execute(process.execPath, [
            '--input-type=module',
            '-e',
            `import * as Route from './src/util/Route.mjs';
             console.log(JSON.stringify({hasNeo: 'Neo' in globalThis, exports: Object.keys(Route).sort()}));`
        ], {cwd: root, encoding: 'utf8', timeout: 10000});

        expect(JSON.parse(stdout.trim())).toEqual({
            exports: ['STATIC_ASSET_EXTENSIONS', 'isManagedRoutePath', 'normalizeRoutePathname', 'parseQueryParams'],
            hasNeo : false
        })
    });

    test('evaluates raw pathname in strict order: static asset extension -> routerIgnorePaths -> managed route', () => {
        const ignore = [
            '^/(?:dist|raw|resources|resources_pub|badges|node_modules|apps|test)(?:/|$)',
            '^/examples/[^/]+/',
            '^/docs/'
        ];

        expect(STATIC_ASSET_EXTENSIONS.has('html')).toBe(true);
        expect(STATIC_ASSET_EXTENSIONS.has('mjs')).toBe(true);

        // AC-1 core trio: '/examples/tree' managed, '/examples/tree/' ignored by '^/examples/[^/]+/', '/examples/tree/index.html' static .html
        expect(isManagedRoutePath('/examples/tree', ignore)).toBe(true);
        expect(isManagedRoutePath('/examples/tree/', ignore)).toBe(false);
        expect(isManagedRoutePath('/examples/tree/index.html', ignore)).toBe(false);

        // Missing .mjs assets and static files fall through even outside routerIgnorePaths
        expect(isManagedRoutePath('/missing-module.mjs', ignore)).toBe(false);
        expect(isManagedRoutePath('/examples/tree/app.mjs', [])).toBe(false);
        expect(isManagedRoutePath('/llms.txt', ignore)).toBe(false);
        expect(isManagedRoutePath('/sitemap.xml', ignore)).toBe(false);
        expect(isManagedRoutePath('/favicon.ICO', ignore)).toBe(false);

        // Root '/index.html' is managed; '/docs' SPA route is managed while '/docs/' directory is ignored
        expect(isManagedRoutePath('/', ignore)).toBe(true);
        expect(isManagedRoutePath('/index.html', ignore)).toBe(true);
        expect(isManagedRoutePath('/docs', ignore)).toBe(true);
        expect(isManagedRoutePath('/docs/', ignore)).toBe(false);

        // Dotted version segments are NOT false-positive static extensions
        expect(isManagedRoutePath('/news/releases/14.0.0', ignore)).toBe(true);

        // routerBasePath scoping preserves raw trailing slash for ignore evaluation
        expect(isManagedRoutePath('/portal/examples/tree', ['^/examples/[^/]+/'], '/portal')).toBe(true);
        expect(isManagedRoutePath('/portal/examples/tree/', ['^/examples/[^/]+/'], '/portal')).toBe(false);
        expect(isManagedRoutePath('/portal/index.html', ['^/examples/[^/]+/'], '/portal')).toBe(true);
        expect(isManagedRoutePath('/other/examples/tree', ['^/examples/[^/]+/'], '/portal')).toBe(false)
    });

    test('normalizeRoutePathname strips routerBasePath, collapses /index.html to /, and trims trailing slashes on non-root paths', () => {
        expect(normalizeRoutePathname('', '')).toBe('/');
        expect(normalizeRoutePathname('/', '')).toBe('/');
        expect(normalizeRoutePathname('/index.html', '')).toBe('/');
        expect(normalizeRoutePathname('/examples/tree/', '')).toBe('/examples/tree');
        expect(normalizeRoutePathname('/portal', '/portal')).toBe('/');
        expect(normalizeRoutePathname('/portal/', '/portal')).toBe('/');
        expect(normalizeRoutePathname('/portal/index.html', '/portal')).toBe('/');
        expect(normalizeRoutePathname('/portal/learn/Routing/', '/portal')).toBe('/learn/Routing');
        expect(normalizeRoutePathname('/portals/learn', '/portal')).toBe('/portals/learn')
    });

    test('parseQueryParams preserves repeated URLSearchParams keys and bracket arrays while rejecting prototype-pollution keys', () => {
        expect(parseQueryParams('')).toEqual({});
        expect(parseQueryParams('?')).toEqual({});
        expect(parseQueryParams('?view=compact&tag=a&tag=b&count=3')).toEqual({
            count: '3',
            tag  : ['a', 'b'],
            view : 'compact'
        });
        expect(parseQueryParams('categories[]=grid&categories[]=tree&solo[]=one')).toEqual({
            categories: ['grid', 'tree'],
            solo      : ['one']
        });

        const polluted = parseQueryParams('?__proto__=evil&constructor=bad&prototype=nope&__proto__[]=x&safe=ok');
        expect(polluted).toEqual({safe: 'ok'});
        expect(Object.prototype).not.toHaveProperty('evil')
    })
});
