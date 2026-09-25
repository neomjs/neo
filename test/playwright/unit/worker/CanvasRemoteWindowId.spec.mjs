import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const repoRoot   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCAN_ROOTS = ['apps', 'examples', 'src'];

/**
 * @summary Every `.mjs` module under the scan roots, repo-relative, with its source.
 * @returns {Object[]} `{file, source}`
 */
function readModules() {
    return SCAN_ROOTS.flatMap(root => fs.readdirSync(path.join(repoRoot, root), {recursive: true})
        .filter(file => file.endsWith('.mjs'))
        .map(file => {
            let relative = path.join(root, file);
            return {file: relative, source: fs.readFileSync(path.join(repoRoot, relative), 'utf8')}
        }))
}

/**
 * @summary The balanced text from the bracket at `start` to its partner, exclusive.
 * @param {String} source
 * @param {Number} start Index of the opening bracket
 * @returns {String}
 */
function balanced(source, start) {
    let open  = source[start],
        close = {'(': ')', '{': '}'}[open],
        depth = 0;

    for (let i = start; i < source.length; i++) {
        if (source[i] === open) depth++;
        else if (source[i] === close && --depth === 0) return source.slice(start + 1, i)
    }

    return source.slice(start + 1)
}

/**
 * @summary The canvas worker's remote surface, read from the classes themselves: every class the canvas worker
 * loads (`*.canvas.*` or `Neo.worker.Canvas`) whose `remote` config exposes methods to the app worker.
 * @param {Object[]} modules
 * @returns {Object} `{classNames, files, methods}`
 */
function canvasSurface(modules) {
    let surface = {classNames: [], files: new Set(), methods: new Set()};

    modules.forEach(({file, source}) => {
        let className = source.match(/className\s*:\s*'([^']+)'/)?.[1],
            remoteAt  = source.search(/^\s*remote\s*:\s*\{/m),
            app;

        if (remoteAt < 0 || !/\.canvas\.|^Neo\.worker\.Canvas$/.test(className)) return;

        app = balanced(source, source.indexOf('{', remoteAt)).match(/\bapp\s*:\s*\[([^\]]*)\]/)?.[1];

        if (app) {
            surface.classNames.push(className);
            surface.files.add(file);
            app.match(/'[^']+'/g).forEach(name => surface.methods.add(name.slice(1, -1)))
        }
    });

    return surface
}

/**
 * @summary Matches a call into the surface: through the `renderer` getter app-side canvas components use for their
 * loaded class, or through any canvas class's namespace.
 * @param {String[]} classNames
 * @param {Set<String>} methods
 * @returns {RegExp}
 */
function callPattern(classNames, methods) {
    let receivers = ['\\brenderer', ...classNames.map(name => `\\b${name.replaceAll('.', '\\.')}`)];
    return new RegExp(`(${receivers.join('|')})\\s*\\??\\.\\s*(${[...methods].join('|')})\\s*(?:\\?\\.)?\\s*\\(`, 'g')
}

/**
 * @param {String} source
 * @param {RegExp} pattern
 * @returns {Object[]} `{args, line, method}`
 */
function findCalls(source, pattern) {
    return [...source.matchAll(pattern)].map(match => ({
        args  : balanced(source, match.index + match[0].length - 1),
        line  : source.slice(0, match.index).split('\n').length,
        method: match[2]
    }))
}

const passesWindowId = call => /\bwindowId\b/.test(call.args);

/**
 * With one canvas worker per window group, the app worker picks the group's port from the call's `windowId`. A call
 * without one is refused as soon as a second group exists, so every app-side call into a canvas remote must pass it —
 * including the shapes that used to take a scalar (`setTheme`) or nothing (`clearGraph`, `pause`, `resume`).
 */
test.describe('app-worker calls into canvas remotes pass windowId', () => {
    const modules = readModules(),
          surface = canvasSurface(modules),
          pattern = callPattern(surface.classNames, surface.methods),
          calls   = modules
              .filter(({file}) => !surface.files.has(file))
              .flatMap(({file, source}) => findCalls(source, pattern).map(call => ({...call, file})));

    test('the surface is read from the canvas classes and the scan reaches both receiver kinds', () => {
        expect(surface.classNames).toEqual(expect.arrayContaining(['Neo.canvas.Base', 'Neo.canvas.Sparkline', 'Neo.worker.Canvas']));
        expect([...surface.methods]).toEqual(expect.arrayContaining(['clearGraph', 'loadModule', 'setTheme', 'unregisterCanvas']));
        expect(calls.some(call => call.file === 'src/component/Sparkline.mjs')).toBe(true);
        expect(calls.some(call => call.method === 'loadModule')).toBe(true)
    });

    test('every call in the tree passes windowId', () => {
        expect(calls.filter(call => !passesWindowId(call)).map(({args, file, line, method}) => `${file}:${line} ${method}(${args.trim()})`)).toEqual([])
    });

    test('the classifier flags every receiver and argument shape without windowId, and nothing else', () => {
        const fixture  = callPattern(['Neo.canvas.Header', 'Neo.worker.Canvas'], new Set(['clearGraph', 'loadModule', 'pause', 'setTheme', 'updateNavRects', 'updateSize', 'updateTimeScale'])),
              classify = source => findCalls(source, fixture).map(passesWindowId);

        [
            'me.renderer.updateSize({height: 1, width: 2})',
            'this.renderer?.clearGraph()',
            'me.renderer.pause?.()',
            'me.renderer?.setTheme({theme})',
            'await Neo.worker.Canvas.loadModule({path: me.rendererImportPath})',
            'Neo.canvas.Header.updateTimeScale({value: 1})',
            'me.renderer.updateNavRects({\n    rects: me.navRects.map(rect => ({...rect}))\n})'
        ].forEach(source => expect(classify(source), source).toEqual([false]));

        [
            'me.renderer.updateSize({height, width, windowId})',
            'this.renderer?.clearGraph({windowId: this.windowId})',
            'Neo.worker.Canvas.loadModule({path, windowId})',
            'me.renderer.updateNavRects({\n    rects   : me.navRects.map(rect => ({...rect})),\n    windowId: me.windowId\n})'
        ].forEach(source => expect(classify(source), source).toEqual([true]));

        [
            'Neo.main.addon.MonacoEditor.setTheme({id, value})',
            'Neo.worker.CanvasGroups.resolveCarrier({mint})',
            'me.rendererImportPath.updateSize({height})'
        ].forEach(source => expect(classify(source), source).toEqual([]))
    })
});
