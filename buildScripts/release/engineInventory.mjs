#!/usr/bin/env node
/**
 * @summary Counts the engine's inventory in `src` and keeps the copies of those figures in the README, the Portal and
 * the learning section in step with it.
 *
 * A copy is a sentence a person wrote, so {@link MIRRORS} names each one by a pattern whose first group is the figure.
 * `--write` replaces that group with the counted value, and the unit spec fails when a sentence is reworded out of
 * its pattern. Nothing compares a copy with `src` on a pull request: the figures drift between cuts, and the cut
 * runs `--write` on the release candidate, so the README npm freezes carries that release's figures.
 *
 * The method is the one that wrote the first figures: a class is a module under `src/` that calls `Neo.setupClass(`,
 * a namespace is a top-level folder of `src/` that holds one, and a main-thread addon is such a module under
 * `src/main/addon/` other than its `Base.mjs`.
 * @module buildScripts/release/engineInventory
 */

import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @summary Every copy of a figure: its file, which figure it carries, and a pattern (flag `d`) whose first group is
 * the number. Each pattern matches exactly once in its file. A floor such as `460+` is no copy: it stays true.
 * @type {Object[]}
 */
export const MIRRORS = Object.freeze([
    {file: 'README.md',                                     figure: 'classes',    pattern: /batteries-included: `(\d+)` classes across `\d+` namespaces/d},
    {file: 'README.md',                                     figure: 'namespaces', pattern: /batteries-included: `\d+` classes across `(\d+)` namespaces/d},
    {file: 'README.md',                                     figure: 'addons',     pattern: /examples\/platform\) \(`(\d+)` main-thread addons\)/d},
    {file: 'README.md',                                     figure: 'classes',    pattern: /a complete `(\d+)`-class web application platform/d},
    {file: 'README.md',                                     figure: 'addons',     pattern: /DomApiRenderer`\) and (\d+) main-thread addons;/d},
    {file: 'apps/portal/view/home/parts/AudienceDoors.mjs', figure: 'classes',    pattern: /runtime — (\d+) classes across \d+ namespaces/d},
    {file: 'apps/portal/view/home/parts/AudienceDoors.mjs', figure: 'namespaces', pattern: /runtime — \d+ classes across (\d+) namespaces/d},
    {file: 'apps/portal/resources/data/seo.json',           figure: 'classes',    pattern: /platform — (\d+) classes in \d+ namespaces/d},
    {file: 'apps/portal/resources/data/seo.json',           figure: 'namespaces', pattern: /platform — \d+ classes in (\d+) namespaces/d},
    {file: 'apps/portal/resources/data/seo.json',           figure: 'namespaces', pattern: /more than \d+ classes in (\d+) namespaces/d},
    {file: 'learn/README.md',                               figure: 'classes',    pattern: /platform — (\d+) classes from grid/d},
    {file: 'learn/README.md',                               figure: 'classes',    pattern: /across all `(\d+)` platform classes/d},
    {file: 'learn/README.md',                               figure: 'addons',     pattern: /layouts, and `(\d+)` main-thread addons\./d},
    {file: 'learn/UsingTheseTopics.md',                     figure: 'classes',    pattern: /platform — (\d+) classes in \d+ namespaces/d},
    {file: 'learn/UsingTheseTopics.md',                     figure: 'namespaces', pattern: /platform — \d+ classes in (\d+) namespaces/d},
    {file: 'learn/UsingTheseTopics.md',                     figure: 'addons',     pattern: /docking to (\d+) main-thread addons/d},
    {file: 'learn/UsingTheseTopics.md',                     figure: 'classes',    pattern: /covering the `(\d+)`-class component library/d},
    {file: 'learn/benefits/body/ApplicationEngine.md',      figure: 'classes',    pattern: /\(`(\d+)` classes across `\d+` namespaces/d},
    {file: 'learn/benefits/body/ApplicationEngine.md',      figure: 'namespaces', pattern: /\(`\d+` classes across `(\d+)` namespaces/d},
    {file: 'learn/benefits/body/ApplicationEngine.md',      figure: 'addons',     pattern: /routing, and `(\d+)` main-thread addons\)/d},
    {file: 'learn/benefits/body/Features.md',               figure: 'namespaces', pattern: /classes in (\d+) namespaces: the components/d},
    {file: 'learn/benefits/body/Features.md',               figure: 'addons',     pattern: /\*\*(\d+) main-thread addons\*\*/d},
    {file: 'learn/benefits/body/Features.md',               figure: 'src/grid/',  pattern: /\(`src\/grid\/`, (\d+) classes\)/d}
]);

/**
 * @summary The folders whose class count a mirror copies: every {@link MIRRORS} figure named by its `src/` path.
 * @type {String[]}
 */
export const MIRROR_FOLDERS = Object.freeze([...new Set(MIRRORS.map(mirror => mirror.figure).filter(figure => figure.startsWith('src/')))]);

/**
 * @summary The figures for a list of class modules, as paths relative to the repository root (`src/…`): the totals,
 * plus one class count per folder a mirror names.
 * @param {String[]} classFiles
 * @param {String[]} [folders=MIRROR_FOLDERS] Folder prefixes such as `src/grid/`
 * @returns {Object} `addons`, `classes`, `namespaces`, and one count per folder, keyed by the folder
 */
export function countInventory(classFiles, folders=MIRROR_FOLDERS) {
    const namespaces = new Set(),
          figures    = {};
    let   addons     = 0;

    for (const folder of folders) {
        figures[folder] = classFiles.filter(file => file.startsWith(folder)).length
    }

    for (const file of classFiles) {
        const parts = file.split('/');

        parts.length > 2 && namespaces.add(parts[1]);

        if (file.startsWith('src/main/addon/') && file !== 'src/main/addon/Base.mjs') {
            addons++
        }
    }

    return {...figures, addons, classes: classFiles.length, namespaces: namespaces.size}
}

/**
 * @summary Where a mirror's figure stands in a text: how often its pattern matches, and for one match the figure
 * and the offsets of its digits.
 * @param {String} text
 * @param {Object} mirror An entry of {@link MIRRORS}
 * @returns {{count: Number, end: Number|null, start: Number|null, value: Number|null}}
 */
export function findMirror(text, mirror) {
    const matches = [...text.matchAll(new RegExp(mirror.pattern.source, 'gd'))];

    if (matches.length !== 1) {
        return {count: matches.length, end: null, start: null, value: null}
    }

    const [start, end] = matches[0].indices[1];

    return {count: 1, end, start, value: Number(text.slice(start, end))}
}

/**
 * @summary The text with one mirror's figure replaced. Throws unless the pattern matches exactly once, so a
 * reworded sentence is reported instead of skipped.
 * @param {String} text
 * @param {Object} mirror An entry of {@link MIRRORS}
 * @param {Number} value
 * @returns {String}
 */
export function stampMirror(text, mirror, value) {
    const {count, end, start} = findMirror(text, mirror);

    if (count !== 1) {
        throw new Error(`${mirror.file}: ${mirror.pattern} matches ${count} times; update MIRRORS in engineInventory.mjs`)
    }

    return text.slice(0, start) + value + text.slice(end)
}

/**
 * @summary The class modules under a checkout's `src`, as repository-relative paths.
 * @param {String} [root=repoRoot]
 * @returns {String[]}
 */
export function listClassFiles(root=repoRoot) {
    return fs.readdirSync(path.join(root, 'src'), {recursive: true})
        .filter(file => file.endsWith('.mjs'))
        .map(file => `src/${file.split(path.sep).join('/')}`)
        .filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes('Neo.setupClass('))
        .sort()
}

/**
 * @summary Reads every mirror of a checkout against the figures, and with `write` replaces the ones that differ.
 * @param {Object}  figures The result of {@link countInventory}
 * @param {Object}  [options]
 * @param {String}  [options.root=repoRoot]
 * @param {Boolean} [options.write=false]
 * @returns {Object[]} One row per mirror: `file`, `figure`, `found`, `expected`
 */
export function syncMirrors(figures, {root=repoRoot, write=false}={}) {
    const texts = new Map(),
          rows  = [];

    for (const mirror of MIRRORS) {
        const file     = path.join(root, mirror.file),
              expected = figures[mirror.figure];

        if (!texts.has(file) && !fs.existsSync(file)) {
            if (write) throw new Error(`${mirror.file} is missing; update MIRRORS in engineInventory.mjs`);

            rows.push({expected, figure: mirror.figure, file: mirror.file, found: null});
            continue
        }

        texts.has(file) || texts.set(file, fs.readFileSync(file, 'utf8'));

        const {value} = findMirror(texts.get(file), mirror);

        if (write && value !== expected) {
            texts.set(file, stampMirror(texts.get(file), mirror, expected))
        }

        rows.push({expected, figure: mirror.figure, file: mirror.file, found: value})
    }

    if (write) {
        for (const [file, text] of texts) {
            fs.readFileSync(file, 'utf8') === text || fs.writeFileSync(file, text)
        }
    }

    return rows
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args    = process.argv.slice(2),
          rootArg = args.indexOf('--root'),
          root    = rootArg > -1 ? path.resolve(args[rootArg + 1]) : repoRoot,
          figures = countInventory(listClassFiles(root));

    console.log(`classes ${figures.classes} · namespaces ${figures.namespaces} · main-thread addons ${figures.addons}`);

    for (const row of syncMirrors(figures, {root, write: args.includes('--write')}).filter(row => row.found !== row.expected)) {
        console.log(`${args.includes('--write') ? 'stamped' : 'differs'}: ${row.file} ${row.figure} ${row.found} → ${row.expected}`)
    }
}
