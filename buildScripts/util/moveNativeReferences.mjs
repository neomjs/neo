import {parse}               from 'acorn';
import path                  from 'node:path';
import {sourceHash}          from './moveReferenceScopes.mjs';
import {keyName, visitNodes} from './moveSourceTransforms.mjs';

/**
 * @module buildScripts/util/moveNativeReferences
 * @summary Identifies pinned native import readers whose owned carriers have separate relocation transforms.
 * These adapters identify readers, not arbitrary caller dataflow. Changed or relocated readers require
 * renewed inspection; their computed imports remain unresolved when no adapter matches.
 */

/** @summary Source-bound native readers and the carrier transforms that authorize their admission. */
export const nativeReaderContracts = [{
    root  : 'workspace', file: 'docs/app/view/MainContainerController.mjs', owner: 'MainContainerController',
    method: 'onExamplesListLeafClick', carrier: 'docs/examples.json:path', expressions: ['record.path', 'path'],
    hash  : 'b49f3bf9143b7c74887eb16b980a473b8e656ca20a3ec10980f6944b0ed09ab3'
}, {
    root  : 'engine', file: 'src/container/Base.mjs', owner: 'Container',
    method: 'loadItems', carrier: 'loadItems:modules', expressions: ['modulePath'],
    hash  : 'ec282aaae21862f80afa231b932650a68557a9aa4144aafdc7a0df697d87d7a1'
}, {
    root  : 'engine', file: 'src/worker/App.mjs', owner: 'App',
    method: 'createNeoInstance', carrier: 'createNeoInstance:importPath', expressions: ['config.importPath'],
    hash  : '1cb480915cc87bbd47574272b5845d1cc1a5077d10ca56bb2ebb6635f31f2ab0'
}, {
    root  : 'engine', file: 'src/worker/App.mjs', owner: 'App',
    method: 'loadModule', carrier: 'App.loadModule:path', expressions: ['path'],
    hash  : '462bdd144c85d5b0c9632746b2cc5bd245ad5c77458b0b7f5185ac49f8831e4e'
}, {
    root  : 'engine', file: 'src/worker/App.mjs', owner: 'App',
    method: 'importApp', carrier: 'neo-config.json:appPath', expressions: ['`../../${path}.mjs`'],
    hash  : '7eefcacc57b823e2d503bf67c8cdba0dace9383ac69e3bc556559a24f7baf7ad'
}];

/**
 * @summary Matches canonical reader paths, declaring classes, nearest methods and complete method source hashes.
 * Keys are ImportExpression argument offsets, matching rewriteModule().unresolved[].start. The caller must
 * still account for owned carriers and unresolved runtime callers; an empty map grants no exemptions.
 * @param {Object} options
 * @param {String} options.code Original source, never executed.
 * @param {String} options.file Original absolute reader path.
 * @param {String} options.engineRoot Engine package root, including an installed read-only dependency.
 * @param {String} options.root Owned workspace/repository root.
 * @param {Function} options.mapPath Complete original-to-final path mapping.
 * @returns {Map<Number,String>} Exact import argument offsets and carrier labels.
 */
export function nativeReferenceSites({code, file, engineRoot, root, mapPath}) {
    const sites    = new Map(), original = path.resolve(file),
        candidates = nativeReaderContracts.filter(reader => path.resolve(reader.root === 'engine' ? engineRoot : root, reader.file) === original);
    if (!candidates.length || path.resolve(mapPath(original)) !== original) return sites;

    visitNodes(parse(code, {ecmaVersion: 'latest', sourceType: 'module'}), (node, parent, ancestors) => {
        if (node.type !== 'ImportExpression') return;
        const method = [...ancestors].reverse().find(item => item.type === 'MethodDefinition'),
            owner    = [...ancestors].reverse().find(item => ['ClassDeclaration', 'ClassExpression'].includes(item.type));
        if (!method || !owner || ancestors.slice(0, ancestors.indexOf(owner)).some(item =>
            !['Program', 'ExportDefaultDeclaration', 'ExportNamedDeclaration'].includes(item.type))) return;

        const reader = candidates.find(item => item.owner === owner.id?.name && item.method === keyName(method.key));
        if (!reader || sourceHash(code.slice(method.start, method.end)) !== reader.hash ||
            !reader.expressions.includes(code.slice(node.source.start, node.source.end))) return;

        sites.set(node.source.start, reader.carrier)
    });

    return sites
}
