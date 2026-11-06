import {parseExpressionAt}               from 'acorn';
import path                              from 'node:path';
import {fileURLToPath, pathToFileURL}    from 'node:url';
import {parse as parseHtml}              from 'parse5';
import {applySourceEdits, rewriteModule} from './moveSourceTransforms.mjs';

/**
 * @module buildScripts/util/moveDataTransforms
 * @summary Relocates known browser boot and catalogue references using the URL base of their actual reader.
 */

/**
 * @summary Preserves the resolved target of a relative URL when its reader or target moves.
 * @param {String} value Original reference.
 * @param {String} before Original reader URL, including directory slash when applicable.
 * @param {String} after Final reader URL.
 * @param {Function} mapPath Maps absolute paths.
 * @returns {String}
 */
function relocateUrl(value, before, after, mapPath) {
    if (!value || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(value)) return value;
    const original = new URL(value, before), unchanged = new URL(value, after);
    if (original.protocol !== 'file:' || unchanged.protocol !== 'file:') return value;
    const target = mapPath(fileURLToPath(original));
    if (path.resolve(fileURLToPath(unchanged)) === path.resolve(target)) return value;

    const directory = fileURLToPath(new URL('.', after));
    let   relative  = path.relative(directory, target).split(path.sep).map(encodeURIComponent).join('/');
    if (!relative) relative = '.';
    if (original.pathname.endsWith('/') && !relative.endsWith('/')) relative += '/';
    if (value.startsWith('./') && !relative.startsWith('.')) relative = `./${relative}`;
    return relative + original.search + original.hash
}

/**
 * @summary Maps a file URL's pathname without treating its query or fragment as a filename.
 * @param {String} value File URL.
 * @param {Function} mapPath Maps absolute paths.
 * @returns {String}
 */
function mappedUrl(value, mapPath) {
    const url = new URL(value);
    if (url.protocol !== 'file:') return value;
    const result = pathToFileURL(mapPath(fileURLToPath(url)));
    if (url.pathname.endsWith('/') && !result.pathname.endsWith('/')) result.pathname += '/';
    result.search = url.search;
    result.hash = url.hash;
    return result.href
}

/**
 * @summary Parses an HTML document and retargets URL attributes and inline module edges without reprinting it.
 * The returned context binds neo-config.json to document.baseURI and mainPath to the MicroLoader module URL.
 * @param {Object} options
 * @param {String} options.code HTML source.
 * @param {String} options.from Original absolute document path.
 * @param {String} options.to Final absolute document path.
 * @param {Function} options.mapPath Complete absolute path mapping.
 * @param {Map<String,String>} [options.classNames] Canonical namespace changes for inline modules.
 * @returns {Object} Code, document context and unresolved inline imports.
 */
export function rewriteDocument({code, from, to, mapPath, classNames=new Map()}) {
    const document = parseHtml(code, {sourceCodeLocationInfo: true}), nodes = [], edits = [], unresolved = [],
        visit      = node => { nodes.push(node); node.childNodes?.forEach(visit); if (node.content) visit(node.content); };
    visit(document);

    const attribute    = (node, name) => node.attrs?.find(item => item.name === name),
        baseNode       = nodes.find(node => node.tagName === 'base' && attribute(node, 'href')),
        documentBefore = pathToFileURL(from).href, documentAfter = pathToFileURL(to).href,
        oldBase        = baseNode ? attribute(baseNode, 'href').value : null,
        newBase        = oldBase === null ? null : relocateUrl(oldBase, documentBefore, documentAfter, mapPath),
        baseBefore     = new URL(oldBase ?? '', documentBefore).href,
        baseAfter      = new URL(newBase ?? '', documentAfter).href;

    const replaceAttribute = (node, attr, value) => {
        if (value === attr.value) return;
        const location = node.sourceCodeLocation?.attrs?.[attr.name];
        if (!location) throw new Error(`Missing HTML attribute location: ${attr.name}`);
        const raw   = code.slice(location.startOffset, location.endOffset), equals = raw.indexOf('='),
            start   = equals + 1 + /^\s*/.exec(raw.slice(equals + 1))[0].length,
            quote   = ['"', "'"].includes(raw[start]) ? raw[start] : null,
            escaped = value.replaceAll('&', '&amp;').replaceAll(quote ?? '"', quote === "'" ? '&#39;' : '&quot;');
        edits.push({start: location.startOffset + start + (quote ? 1 : 0),
            end: location.endOffset - (quote ? 1 : 0), value: quote ? escaped : `"${escaped}"`});
    };

    if (baseNode) replaceAttribute(baseNode, attribute(baseNode, 'href'), newBase);
    const loaders = [];

    for (const node of nodes) {
        if (node.tagName === 'base') continue;
        for (const attr of node.attrs ?? []) {
            if (!['src', 'href', 'action', 'poster'].includes(attr.name)) continue;
            const value = relocateUrl(attr.value, baseBefore, baseAfter, mapPath);
            replaceAttribute(node, attr, value);
            if (node.tagName === 'script' && attr.name === 'src') {
                const before = new URL(attr.value, baseBefore), after = new URL(value, baseAfter);
                if (before.pathname.endsWith('/MicroLoader.mjs')) loaders.push({before: before.href, after: after.href});
            }
        }
        if (node.tagName === 'script' && attribute(node, 'type')?.value === 'module' && !attribute(node, 'src')) {
            const text = node.childNodes?.find(child => child.nodeName === '#text');
            if (!text?.sourceCodeLocation) continue;
            if (new URL(baseBefore).protocol !== 'file:' || new URL(baseAfter).protocol !== 'file:') {
                unresolved.push({reason: 'Inline module has an external document base'});
                continue
            }
            const result = rewriteModule({code: text.value,
                from: fileURLToPath(new URL('__inline__.mjs', baseBefore)),
                to  : fileURLToPath(new URL('__inline__.mjs', baseAfter)), mapPath, classNames});
            if (result.code !== text.value) edits.push({start: text.sourceCodeLocation.startOffset,
                end: text.sourceCodeLocation.endOffset, value: result.code});
            unresolved.push(...result.unresolved);
        }
    }

    if (loaders.length > 1) unresolved.push({reason: 'Document has multiple MicroLoader scripts'});
    const config = new URL('./neo-config.json', baseBefore);
    if (loaders.length && config.protocol === 'file:' && new URL(baseAfter).protocol === 'file:' &&
        mapPath(fileURLToPath(config)) !== fileURLToPath(new URL('./neo-config.json', baseAfter))) {
        unresolved.push({reason: 'MicroLoader uses a fixed neo-config.json filename beside the document base'});
    }
    return {code: applySourceEdits(code, edits), unresolved, context: {
        configPath  : config.protocol === 'file:' ? fileURLToPath(config) : null, baseBefore, baseAfter,
        loaderBefore: loaders.length === 1 ? loaders[0].before : null,
        loaderAfter : loaders.length === 1 ? loaders[0].after : null
    }}
}

/**
 * @summary Rewrites known JSON reference carriers with their reader's base, preserving all other bytes.
 * Data from arbitrary JSON fields is not interpreted as a path. Conflicting document contexts remain unresolved.
 * @param {Object} options
 * @param {String} options.code JSON source.
 * @param {String} options.file Original absolute JSON path.
 * @param {String} options.root Repository/workspace root.
 * @param {Function} options.mapPath Complete absolute path mapping.
 * @param {String} [options.engineRoot] Engine package root, which can be an installed read-only dependency.
 * @param {Object[]} [options.documents] Contexts returned by rewriteDocument().
 * @param {Map<String,String>} [options.classNames] Canonical namespace changes.
 * @returns {Object} Code and unresolved boot references.
 */
export function rewriteData({code, file, root, mapPath, engineRoot=root, documents=[], classNames=new Map()}) {
    const value      = JSON.parse(code), ast = parseExpressionAt(code, 0, {ecmaVersion: 'latest'}), edits = [], unresolved = [],
        relative     = path.relative(root, file).split(path.sep).join('/'),
        isBoot       = path.basename(file) === 'neo-config.json',
        isPackage    = path.basename(file) === 'package.json',
        isDocs       = relative === 'docs/examples.json',
        isPortal     = /^apps\/portal\/resources\/data\/examples_(devmode|dist_dev|dist_prod|dist_esm)\.json$/.test(relative),
        isLayout     = Array.isArray(value?.modules) && Array.isArray(value?.items),
        appModule    = pathToFileURL(path.join(engineRoot, 'src/worker/App.mjs')).href,
        appBefore    = new URL('../../', appModule).href,
        appAfter     = new URL('../../', mappedUrl(appModule, mapPath)).href,
        docsReader   = pathToFileURL(path.join(root, 'docs/app/view/MainContainerController.mjs')).href,
        layoutReader = pathToFileURL(path.join(engineRoot, 'src/container/Base.mjs')).href,
        contexts     = documents.filter(document => document.configPath === file);

    const appReference = original => {
        const extension = original.endsWith('.mjs') ? '' : '.mjs';
        let   next      = relocateUrl(original + extension, appBefore, appAfter, mapPath);
        if (extension) next = next.replace(/\.mjs$/, '');
        return next
    };

    if (isBoot && typeof value.appPath === 'string') {
        const nextApp = appReference(value.appPath),
            startup   = (app, worker) => `${app.endsWith('.mjs') ? app.slice(0, -8) : app}/${worker.toLowerCase()}.mjs`;

        for (const [flag, worker] of [['useCanvasWorkerStartingPoint', 'Canvas'], ['useTaskWorker', 'Task']]) {
            if (!value[flag]) continue;
            const reader = pathToFileURL(path.join(engineRoot, `src/worker/${worker}.mjs`)).href,
                before   = fileURLToPath(new URL(startup(value.appPath, worker), new URL('../../', reader))),
                expected = fileURLToPath(new URL(startup(nextApp, worker), new URL('../../', mappedUrl(reader, mapPath))));

            if (path.resolve(mapPath(before)) !== path.resolve(expected)) {
                unresolved.push({key: flag, reason: `${worker} startup uses a fixed sibling filename; move the application folder as a unit`});
            }
        }
    }

    const portalPath = reference => {
        if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference)) return reference;
        const match = /^(dist\/(?:development|production|esm)\/)?(.*)$/.exec(reference),
            prefix  = match[1] ?? '', base = pathToFileURL(root + path.sep).href,
            next    = relocateUrl(match[2], base, base, mapPath);
        return prefix + next
    };

    const visit = (node, keys=[]) => {
        if (node.type === 'ObjectExpression') {
            node.properties.forEach(property => visit(property.value, [...keys, property.key.value]));
            return
        }
        if (node.type === 'ArrayExpression') {
            node.elements.forEach((element, index) => visit(element, [...keys, index]));
            return
        }
        if (node.type !== 'Literal' || typeof node.value !== 'string') return;
        const key  = keys.filter(item => typeof item === 'string').at(-1), original = node.value;
        let   next = original;

        if (key === 'className' && classNames.has(original)) next = classNames.get(original);
        else if (isDocs && key === 'path') next = relocateUrl(original, docsReader, mappedUrl(docsReader, mapPath), mapPath);
        else if (isPortal && ['url', 'sourceUrl'].includes(key)) next = portalPath(original);
        else if (isPackage && (['imports', 'exports'].includes(keys[0]) && original.startsWith('./') ||
            ['main', 'module', 'types', 'typings', 'bin'].includes(keys[0]))) {
            if (original.includes('*')) {
                unresolved.push({key: keys.join('.'), reason: 'Package pattern requires an explicit reference scope'});
            } else next = relocateUrl(original, pathToFileURL(file).href, pathToFileURL(mapPath(file)).href, mapPath);
        } else if (isLayout && keys[0] === 'modules') {
            next = relocateUrl(original, new URL('../../', layoutReader).href,
                new URL('../../', mappedUrl(layoutReader, mapPath)).href, mapPath);
        } else if (isBoot && keys.length === 1) {
            if (key === 'appPath') {
                next = appReference(original);
            }
            else if (['mainPath', 'basePath', 'workerBasePath'].includes(key)) {
                const candidates = contexts.map(context => {
                    const before = key === 'mainPath' ? context.loaderBefore : context.baseBefore,
                        after    = key === 'mainPath' ? context.loaderAfter : context.baseAfter;
                    return before && after ? relocateUrl(original, before, after, mapPath) : null
                });
                if (!candidates.length || candidates.includes(null) || new Set(candidates).size > 1) {
                    unresolved.push({key, reason: 'Boot reference has no single origin-preserving rewrite'});
                } else next = candidates[0];
            }
        }

        if (next !== original) edits.push({start: node.start, end: node.end, value: JSON.stringify(next)});
    };
    visit(ast);
    return {code: applySourceEdits(code, edits), unresolved}
}
