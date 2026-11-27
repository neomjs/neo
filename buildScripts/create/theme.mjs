#!/usr/bin/env node

import fs                from 'node:fs';
import path              from 'node:path';
import {createInterface} from 'node:readline/promises';
import postcss           from 'postcss';
import selectorParser    from 'postcss-selector-parser';
import {fileURLToPath}   from 'node:url';
import {parseArgs}       from 'node:util';
import {
    resolveThemeClassMap,
    resolveThemeFolders
}                           from '../util/themeCss.mjs';
import {themeCssRoots}      from '../util/themeCssRoots.mjs';

const folderNamePattern  = /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      destinationPattern = /^theme-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @summary The theme source roots the generator reads ({@link themeCssRoots}). It recognises the Engine
 * checkout by the exact package name `neo.mjs`, so a workspace named like `neo.mjs-demo` stays a consumer.
 * @param {String} cwd Workspace or Engine repository root.
 * @returns {String[]}
 */
function themeRoots(cwd) {
    const {name} = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));

    return themeCssRoots(cwd, {insideNeo: name === 'neo.mjs'})
}

/**
 * @summary Lists selectable base themes across Engine, component packages and workspace via `theme-map.json`
 * and `Global.css` `.neo-theme-*` class declarations, excluding `src` and `theme-base`.
 * @param {String} cwd Workspace or Engine repository root.
 * @returns {String[]}
 */
export function listThemes(cwd) {
    return resolveThemeFolders({cssRoots: themeRoots(cwd)});
}

/**
 * @summary Builds the selector-class replacement map for `baseTheme` → `themeName` from the resolved
 * `class → folders` theme map, preserving `-light` / `-dark` scheme suffixes when a single base folder
 * declares multiple theme classes.
 * @param {Object<String, String[]>} classMap Resolved `class → folders` map.
 * @param {String} baseTheme Existing base theme folder name.
 * @param {String} themeName Destination theme folder name (`theme-<slug>`).
 * @returns {Map<String, String>}
 */
function buildClassReplacementMap(classMap, baseTheme, themeName) {
    const baseClasses = Object.entries(classMap)
              .filter(([, folders]) => folders.includes(baseTheme))
              .map(([themeClass]) => themeClass)
              .sort(),
          slug         = themeName.replace(/^theme-/, ''),
          targetPrefix = `neo-theme-${slug}`,
          replacements = new Map();

    if (baseClasses.length === 1) {
        replacements.set(baseClasses[0], targetPrefix);
        return replacements
    }

    for (const baseClass of baseClasses) {
        const schemeMatch = baseClass.match(/-(light|dark)$/);

        replacements.set(
            baseClass,
            schemeMatch ? `${targetPrefix}-${schemeMatch[1]}` : `${targetPrefix}-${baseClass.replace(/^neo-theme-/, '')}`
        )
    }

    return replacements
}

/**
 * @summary Retargets a theme's selectors to the new theme class(es). Relative `@import` URLs need no
 * rewrite: the browser resolves them against the built sheet, and the build mirrors the source tree.
 * @param {String} content CSS source.
 * @param {String} source Original file.
 * @param {Map<String, String>} replacements Base class → target class map.
 * @returns {String}
 */
function retargetCss(content, source, replacements) {
    const root = postcss.parse(content, {from: source});

    root.walkRules(rule => {
        if ([...replacements.keys()].some(baseClass => rule.selector.includes(baseClass))) {
            rule.selector = selectorParser(selectors => selectors.walkClasses(node => {
                if (replacements.has(node.value)) {
                    node.value = replacements.get(node.value)
                }
            })).processSync(rule.selector);
        }
    });

    return root.toString();
}

/**
 * @summary Creates an editable theme snapshot without changing existing themes or application config.
 * @param {Object} options
 * @param {String} options.cwd Workspace or Engine repository root.
 * @param {String} options.baseTheme Existing theme folder resolved from the theme map, e.g. theme-neo-dark.
 * @param {String} options.themeName New theme folder, e.g. theme-acme.
 * @returns {String} Absolute generated theme directory.
 */
export function generateTheme({cwd, baseTheme, themeName}) {
    cwd = fs.realpathSync(cwd);

    if (typeof themeName !== 'string' || !destinationPattern.test(themeName) || themeName === 'theme-base') {
        throw new Error('Theme names must use theme- followed by lowercase letters, numbers and single hyphens.');
    }

    if (typeof baseTheme !== 'string' || !folderNamePattern.test(baseTheme) || baseTheme === 'src' || baseTheme === 'theme-base') {
        throw new Error(`Invalid base theme folder: ${baseTheme}`);
    }

    const roots        = themeRoots(cwd),
          classMap     = resolveThemeClassMap({cssRoots: roots}),
          knownThemes  = resolveThemeFolders({cssRoots: roots}),
          replacements = buildClassReplacementMap(classMap, baseTheme, themeName),
          destination  = path.join(cwd, 'resources/css', themeName),
          files        = new Map();

    if (!knownThemes.includes(baseTheme) || replacements.size === 0) {
        throw new Error(`Unknown base theme: ${baseTheme}`);
    }

    for (const root of roots) {
        if (fs.existsSync(path.join(root, themeName))) {
            throw new Error(`Theme already exists: ${themeName}`);
        }
    }

    for (const directory of ['resources', 'resources/css', `resources/css/${themeName}`]) {
        const target = path.join(cwd, directory);
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
            throw new Error(`Refusing symbolic link destination: ${target}`);
        }
    }

    /**
     * @summary Reads and validates the complete source tree before creating a destination.
     * @param {String} directory Source directory.
     * @param {String} baseRoot Source theme root.
     * @returns {void}
     */
    function visit(directory, baseRoot) {
        if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`Refusing symbolic link source: ${directory}`);

        for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
            const source   = path.join(directory, entry.name),
                  relative = path.relative(baseRoot, source);

            if (entry.isDirectory()) {
                visit(source, baseRoot);
            } else if (entry.isFile()) {
                const content = fs.readFileSync(source);
                files.set(relative, source.endsWith('.css')
                    ? retargetCss(content.toString('utf8'), source, replacements)
                    : content);
            } else {
                throw new Error(`Unsupported theme source: ${source}`);
            }
        }
    }

    for (const root of roots) {
        const baseRoot = path.join(root, baseTheme);
        if (fs.existsSync(baseRoot)) visit(baseRoot, baseRoot);
    }

    if (!files.has('Global.css')) throw new Error(`Base theme must contain Global.css: ${baseTheme}`);

    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.mkdirSync(destination);

    try {
        for (const [relative, content] of files) {
            const target = path.join(destination, relative);
            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, content, {flag: 'wx'});
        }
    } catch (error) {
        fs.rmSync(destination, {recursive: true, force: true});
        throw error;
    }

    return destination;
}

/**
 * @summary Runs the interactive or flag-driven theme generator.
 * @returns {Promise<void>}
 */
async function main() {
    const {values: options} = parseArgs({options: {
        base       : {type: 'string', short: 'b'},
        help       : {type: 'boolean', short: 'h'},
        name       : {type: 'string', short: 'n'},
        noquestions: {type: 'boolean'}
    }}), cwd = process.cwd();

    if (options.help) {
        console.log('Create an editable workspace theme from an existing theme.\n\n' +
            'Usage: create-theme [options]\n' +
            '  -b, --base <theme>  Base folder, e.g. theme-neo-dark\n' +
            '  -n, --name <theme>  New folder, e.g. theme-acme\n' +
            '  --noquestions       Require explicit --name and --base; do not prompt\n' +
            '  -h, --help          Display help');
        return;
    }

    if (!options.noquestions && (!options.name || !options.base)) {
        if (!process.stdin.isTTY) throw new Error('Pass --name and --base with --noquestions for unattended use.');

        const input = createInterface({input: process.stdin, output: process.stdout});

        try {
            if (!options.name) options.name = (await input.question('New theme folder (theme-acme): ')).trim();
            if (!options.base) {
                console.log(`Available base themes: ${listThemes(cwd).join(', ')}`);
                options.base = (await input.question('Base theme: ')).trim();
            }
        } finally {
            input.close();
        }
    }

    const destination = generateTheme({cwd, baseTheme: options.base, themeName: options.name});
    console.log(`Created ${destination}`);
    console.log(`Add "neo-${options.name}" to your application's neo-config.json themes array to select it.`);
    console.log(`Build with: node ${path.relative(cwd, fileURLToPath(new URL('../build/themes.mjs', import.meta.url)))} -n -e dev -t ${options.name}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
