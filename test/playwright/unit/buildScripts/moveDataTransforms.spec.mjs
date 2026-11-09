import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';
import {rewriteDocument, rewriteData} from '../../../../buildScripts/util/moveDataTransforms.mjs';

const root    = path.resolve('move-data-fixture'),
    oldFolder = path.join(root, 'examples/probe/demo'),
    newFolder = path.join(root, 'examples/deeper/nested/probe/demo');

/** @summary Maps the complete example subtree, retaining all other physical paths. */
function mapPath(file) {
    return file === oldFolder || file.startsWith(oldFolder + path.sep) ?
        path.join(newFolder, path.relative(oldFolder, file)) : file
}

/** @summary Produces a document context using the same source/destination mapping as its data. */
function documentContext(code, name='index.html', mapper=mapPath) {
    const from = path.join(oldFolder, name);
    return rewriteDocument({code, from, to: mapper(from), mapPath: mapper})
}

const html = '<!doctype html>\r\n<title>../../../src/MicroLoader.mjs</title>\r\n' +
    '<!-- keep ../../../src/MicroLoader.mjs -->\r\n' +
    '<script type="module" src="../../../src/MicroLoader.mjs"></script>\r\n';

test.describe('moveDataTransforms (#5086)', () => {
    test('rebases the MicroLoader attribute while preserving surrounding HTML bytes and effective origins', () => {
        const result    = documentContext(html),
            original    = pathToFileURL(path.join(oldFolder, 'index.html')).href,
            destination = pathToFileURL(path.join(newFolder, 'index.html')).href,
            loader      = pathToFileURL(path.join(root, 'src/MicroLoader.mjs')).href;

        expect(result.code).toBe(html.replace('src="../../../src/MicroLoader.mjs"',
            'src="../../../../../src/MicroLoader.mjs"'));
        expect(result.context).toMatchObject({
            configPath  : path.join(oldFolder, 'neo-config.json'),
            baseBefore  : original, baseAfter: destination,
            loaderBefore: loader, loaderAfter: loader
        });
        expect(new URL('../../../../../src/MicroLoader.mjs', result.context.baseAfter).href).toBe(loader)
    });

    test('uses the document base element for both the config URL and the loader URL', () => {
        const code = '<head><base href="../../../"><title>keep</title></head>\n' +
                '<script src="./src/MicroLoader.mjs" type="module"></script>',
            result = documentContext(code),
            base = pathToFileURL(root + path.sep).href,
            config = '{ "mainPath": "./Main.mjs", "basePath": "./", "appPath": "examples/probe/demo/app.mjs" }',
            data = rewriteData({code: config, file: path.join(root, 'neo-config.json'), root, mapPath,
                documents: [result.context]});

        expect(result.code).toBe(code.replace('href="../../../"', 'href="../../../../../"'));
        expect(result.context).toMatchObject({
            configPath  : path.join(root, 'neo-config.json'), baseBefore: base, baseAfter: base,
            loaderBefore: new URL('src/MicroLoader.mjs', base).href,
            loaderAfter : new URL('src/MicroLoader.mjs', base).href
        });
        expect(data.unresolved).toEqual([]);
        expect(data.code).toBe(config.replace('"examples/probe/demo/app.mjs"',
            '"examples/deeper/nested/probe/demo/app.mjs"'))
    });

    test('preserves attribute spacing and quotes outside the rewritten URL value', () => {
        const code = "<script data-note='keep' src =   '../../../src/MicroLoader.mjs' type = 'module'></script>",
            result = documentContext(code);

        expect(result.code).toBe(code.replace('../../../src/MicroLoader.mjs', '../../../../../src/MicroLoader.mjs'))
    });

    test('reports no loader for a document without a MicroLoader script', () => {
        const code = '<script src="../../../src/Other.mjs"></script>',
            result = documentContext(code);

        expect(result.context.loaderBefore).toBeNull();
        expect(result.context.loaderAfter).toBeNull()
    });

    test('refuses an independent boot-config rename required by MicroLoader at its fixed filename', () => {
        const config = path.join(oldFolder, 'neo-config.json'),
            mapper   = file => file === config ? path.join(oldFolder, 'renamed.json') : file,
            result   = documentContext(html, 'index.html', mapper);

        expect(result.unresolved.some(reference => reference.reason.includes('fixed neo-config.json'))).toBe(true);
        expect(result.code).toBe(html)
    });

    for (const explicitWorker of [false, true]) {
        test(`rebases boot config against its document while preserving ${explicitWorker ? 'explicit' : 'omitted'} worker configuration`, () => {
            const {context} = documentContext(html),
                code        = '{\n  "appPath" : "examples/probe/demo/app.mjs",\n' +
                    '  "basePath" : "../../../",\n  "mainPath" : "./Main.mjs",\n' +
                    (explicitWorker ? '  "workerBasePath" : "../../../src/worker/",\n' : '') +
                    '  "environment" : "development",\n  "note" : "examples/probe/demo/app.mjs"\n}\n',
                result = rewriteData({code, file: path.join(oldFolder, 'neo-config.json'), root, mapPath,
                    documents: [context]}),
                before = JSON.parse(code), after = JSON.parse(result.code),
                expected = code.replace('"appPath" : "examples/probe/demo/app.mjs"',
                    '"appPath" : "examples/deeper/nested/probe/demo/app.mjs"')
                    .replace('"basePath" : "../../../"', '"basePath" : "../../../../../"')
                    .replace('"workerBasePath" : "../../../src/worker/"', '"workerBasePath" : "../../../../../src/worker/"');

            expect(result.unresolved).toEqual([]);
            expect(result.code).toBe(expected);
            expect(after.mainPath).toBe('./Main.mjs');
            expect(new URL(after.mainPath, context.loaderAfter).href).toBe(new URL(before.mainPath, context.loaderBefore).href);
            expect(new URL(after.basePath, context.baseAfter).href).toBe(new URL(before.basePath, context.baseBefore).href);
            expect(path.resolve(root, after.appPath)).toBe(mapPath(path.resolve(root, before.appPath)));
            expect(Object.hasOwn(after, 'workerBasePath')).toBe(explicitWorker);
            if (explicitWorker) {
                expect(new URL(after.workerBasePath, context.baseAfter).href)
                    .toBe(new URL(before.workerBasePath, context.baseBefore).href)
            }
        })
    }

    test('rewrites Docs scalar and array paths relative to the controller module, not the JSON file', () => {
        const code = '[\n  {"path": "../../../examples/probe/demo/Widget.mjs?mode=1#docs", "name": "examples/probe/demo"},\n' +
                '  {"path": ["../../../examples/probe/demo/Other.mjs", "../../../src/component/Base.mjs"]},\n' +
                '  {"path": null, "note": "../../../examples/probe/demo/Widget.mjs?mode=1#docs"}\n]\n',
            result = rewriteData({code, file: path.join(root, 'docs/examples.json'), root, mapPath}),
            origin = pathToFileURL(path.join(root, 'docs/app/view/MainContainerController.mjs')),
            before = JSON.parse(code), after = JSON.parse(result.code);

        expect(result.unresolved).toEqual([]);
        expect(result.code).toBe(code
            .replace('"path": "../../../examples/probe/demo/Widget.mjs?mode=1#docs"',
                '"path": "../../../examples/deeper/nested/probe/demo/Widget.mjs?mode=1#docs"')
            .replace('"path": ["../../../examples/probe/demo/Other.mjs"',
                '"path": ["../../../examples/deeper/nested/probe/demo/Other.mjs"'));
        for (const [oldPath, newPath] of [[before[0].path, after[0].path], [before[1].path[0], after[1].path[0]]]) {
            expect(fileURLToPath(new URL(newPath, origin))).toBe(mapPath(fileURLToPath(new URL(oldPath, origin))))
        }
        expect(new URL(after[0].path, origin).search).toBe('?mode=1');
        expect(new URL(after[0].path, origin).hash).toBe('#docs')
    });

    for (const [catalog, prefix] of [
        ['devmode', ''], ['dist_dev', 'dist/development/'], ['dist_esm', 'dist/esm/'], ['dist_prod', 'dist/production/']
    ]) {
        test(`retains the ${catalog} Portal environment prefix, query/hash and external URLs`, () => {
            const code = '[\n {"url": "' + prefix + 'examples/probe/demo/index.html?theme=dark#demo",\n' +
                    '  "sourceUrl": "examples/probe/demo?tab=source#Widget", "image": "examples/probe/demo/preview.png"},\n' +
                    ' {"url": "https://example.test/examples/probe/demo/", "sourceUrl": "https://github.test/org/demo"}\n]\n',
                result = rewriteData({code, file: path.join(root, `apps/portal/resources/data/examples_${catalog}.json`), root, mapPath}),
                after = JSON.parse(result.code);

            expect(result.unresolved).toEqual([]);
            expect(result.code).toBe(code
                .replace(prefix + 'examples/probe/demo/index.html?theme=dark#demo',
                    prefix + 'examples/deeper/nested/probe/demo/index.html?theme=dark#demo')
                .replace('"sourceUrl": "examples/probe/demo?tab=source#Widget"',
                    '"sourceUrl": "examples/deeper/nested/probe/demo?tab=source#Widget"'));
            expect(new URL(after[0].url, 'https://neomjs.com/').pathname)
                .toBe('/' + prefix + 'examples/deeper/nested/probe/demo/index.html');
            expect(new URL(after[0].sourceUrl, 'https://github.com/neomjs/neo/tree/dev/').pathname)
                .toBe('/neomjs/neo/tree/dev/examples/deeper/nested/probe/demo')
        })
    }

    for (const workspace of [false, true]) {
        test(`resolves loadItems module paths from the ${workspace ? 'installed' : 'local'} Engine root`, () => {
            const engineRoot = workspace ? path.join(root, 'node_modules/neo.mjs') : root,
                prefix       = workspace ? '../../' : '',
                code         = '{\n "modules": ["' + prefix + 'examples/probe/demo/Widget.mjs", "src/component/Button.mjs", "https://example.test/External.mjs"],\n' +
                    ' "items": [{"className": "Demo.Widget", "text": "Demo.Widget", "ntype": "demo-widget"}],\n' +
                    ' "note": "' + prefix + 'examples/probe/demo/Widget.mjs"\n}\n',
                result = rewriteData({code, file: path.join(root, 'resources/deep/layout.json'), root, engineRoot, mapPath,
                    classNames: new Map([['Demo.Widget', 'Demo.panels.Widget']])}),
                before = JSON.parse(code), after = JSON.parse(result.code);

            expect(result.unresolved).toEqual([]);
            expect(result.code).toBe(code
                .replace('"modules": ["' + prefix + 'examples/probe/demo/Widget.mjs"',
                    '"modules": ["' + prefix + 'examples/deeper/nested/probe/demo/Widget.mjs"')
                .replace('"className": "Demo.Widget"', '"className": "Demo.panels.Widget"'));
            expect(path.resolve(engineRoot, after.modules[0])).toBe(mapPath(path.resolve(engineRoot, before.modules[0])));
            expect(path.resolve(engineRoot, after.modules[1])).toBe(path.join(engineRoot, 'src/component/Button.mjs'))
        })
    }

    test('retains a shared boot config when distinct loader contexts require the same rewritten values', () => {
        const documents = [documentContext(html).context,
                documentContext('<script src="../../../alternate/src/MicroLoader.mjs"></script>', 'alternate.html').context],
            code = '{"mainPath":"./Main.mjs","basePath":"../../../"}',
            result = rewriteData({code, file: path.join(oldFolder, 'neo-config.json'), root, mapPath, documents});

        expect(result.unresolved).toEqual([]);
        expect(result.code).toBe('{"mainPath":"./Main.mjs","basePath":"../../../../../"}')
    });

    test('refuses shared boot contexts requiring conflicting mainPath values', () => {
        const mapper  = file => file === path.join(root, 'src/MicroLoader.mjs') ? path.join(root, 'src/boot/MicroLoader.mjs') : mapPath(file),
            documents = [documentContext(html, 'index.html', mapper).context,
                documentContext('<script src="../../../alternate/src/MicroLoader.mjs"></script>', 'alternate.html', mapper).context],
            code = '{"mainPath":"./Main.mjs","basePath":"../../../"}',
            result = rewriteData({code, file: path.join(oldFolder, 'neo-config.json'), root, mapPath: mapper, documents});

        expect(new URL('./Main.mjs', documents[0].loaderBefore).href).not.toBe(new URL('./Main.mjs', documents[0].loaderAfter).href);
        expect(new URL('./Main.mjs', documents[1].loaderBefore).href).toBe(new URL('./Main.mjs', documents[1].loaderAfter).href);
        expect(result.unresolved).toEqual(expect.arrayContaining([expect.objectContaining({key: 'mainPath'})]));
        expect(JSON.parse(result.code).mainPath).toBe('./Main.mjs')
    });

    for (const [flag, startup] of [['useCanvasWorkerStartingPoint', 'canvas.mjs'], ['useTaskWorker', 'task.mjs']]) {
        test(`refuses an independent ${startup} rename when ${flag} is enabled`, () => {
            const code   = JSON.stringify({appPath: 'examples/probe/demo/app.mjs', [flag]: true}),
                original = path.join(oldFolder, startup),
                mapper   = file => file === original ? path.join(oldFolder, 'renamed-' + startup) : file,
                result   = rewriteData({code, file: path.join(oldFolder, 'neo-config.json'), root, mapPath: mapper});

            expect(result.unresolved.length).toBeGreaterThan(0);
            expect(JSON.parse(result.code).appPath).toBe('examples/probe/demo/app.mjs')
        });

        test(`allows a whole-folder move preserving the fixed ${startup} sibling contract`, () => {
            const code = JSON.stringify({appPath: 'examples/probe/demo/app.mjs', [flag]: true}),
                result = rewriteData({code, file: path.join(oldFolder, 'neo-config.json'), root, mapPath}),
                after  = JSON.parse(result.code);

            expect(result.unresolved).toEqual([]);
            expect(after).toEqual({appPath: 'examples/deeper/nested/probe/demo/app.mjs', [flag]: true});
            expect(path.join(path.dirname(path.resolve(root, after.appPath)), startup))
                .toBe(mapPath(path.join(oldFolder, startup)))
        });

        test(`does not block an unrelated file move because ${flag} is enabled`, () => {
            const code = JSON.stringify({appPath: 'examples/probe/demo/app.mjs', [flag]: true}),
                mapper = file => file === path.join(oldFolder, 'Widget.mjs') ? path.join(oldFolder, 'Panel.mjs') : file,
                result = rewriteData({code, file: path.join(oldFolder, 'neo-config.json'), root, mapPath: mapper});

            expect(result.unresolved).toEqual([]);
            expect(result.code).toBe(code)
        })
    }

    test('leaves unrelated JSON strings untouched even when they resemble module or example paths', () => {
        const code = '{ "message": "examples/probe/demo", "path": "../../../examples/probe/demo/Widget.mjs",\n' +
                '  "url": "examples/probe/demo/index.html", "sourceUrl": "examples/probe/demo" }\n',
            result = rewriteData({code, file: path.join(root, 'resources/unrelated.json'), root, mapPath});

        expect(result.code).toBe(code);
        expect(result.unresolved).toEqual([])
    })
});
