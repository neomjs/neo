#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-var-references
 * @summary Fails when a theme reads a custom property that it never defines.
 *
 * A `var(--x)` without a fallback whose `--x` exists nowhere is invalid at computed-value time, so
 * the property silently takes its inherited or initial value: an invalid field shows the text color
 * instead of its error color, and nothing reports it.
 *
 * Each theme resolves against its own files plus `resources/css/src`, because a page loads one theme.
 * A reference with a fallback is the author's explicit choice and is skipped. General definitions
 * count wherever they appear. A role used without a fallback in src/ must also have an unconditional
 * definition for each theme class in one of that class's mapped Global.css files.
 * The runtime list and the stylesheet reading are shared with `theme-census` through `themeCss.mjs`.
 */
import fs                      from 'node:fs';
import path                    from 'node:path';
import {fileURLToPath}         from 'node:url';
import {readThemeDeclarations} from './check-theme-palette.mjs';
import isEntryModule           from './isEntryModule.mjs';
import {
    RUNTIME_PROPERTIES,
    cssFiles,
    readCss,
    resolveThemeClassMap,
    resolveThemeFolders
}                                                                   from './themeCss.mjs';
import {kindOf}                                                     from './themeNameShapes.mjs';

const
    repoRoot   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    cssRoot    = path.join(repoRoot, 'resources/css'),
    relCssRoot = path.relative(repoRoot, cssRoot).replaceAll('\\', '/'),
    varDirs    = [
        'src',
        ...(fs.existsSync(path.join(cssRoot, 'theme-base')) ? ['theme-base'] : []),
        ...resolveThemeFolders({root: cssRoot})
    ];

/**
 * The trees this guard reads, as repo-relative globs (the form a workflow `paths:` filter takes).
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    ...varDirs.map(dir => `${relCssRoot}/${dir}/**/*.css`),
    `${relCssRoot}/*/Global.css`
]);

/**
 * @param {String[]} files
 * @returns {Set<String>} Every custom property the files declare.
 */
function definitionsIn(files) {
    return new Set(files.flatMap(file => [...readCss(file).matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1])))
}

/**
 * @param {String[]} files
 * @returns {Set<String>} Every custom property the files read, with or without a fallback.
 */
function readsIn(files) {
    return new Set(files.flatMap(file => [...readCss(file).matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1])))
}

/**
 * @summary Finds roles that structural sheets require each theme to supply.
 * @param {String[]} files
 * @returns {Set<String>}
 */
function requiredRolesIn(files) {
    const roles = new Set();

    for (const file of files) {
        for (const [, name] of readCss(file).matchAll(/(?<![\w-])var\(\s*(--[\w-]+)\s*\)/gi)) {
            if (kindOf(name) === 'role') roles.add(name);
        }
    }

    return roles
}

/**
 * @summary Collects every fallback-free reference a theme cannot resolve. Pure over the filesystem:
 * no exit, no logging.
 * @param {Object} [options]
 * @param {String} [options.root=resources/css] Holds `src/`, optional `theme-base/`, and mapped theme directories.
 * @param {Object<String,String>} [options.runtimeProperties=RUNTIME_PROPERTIES]
 * @param {String} [options.themeMapPath] Optional `theme-map.json` path override.
 * @returns {String[]} Failure messages, empty when every reference resolves.
 */
export function collectThemeVarReferenceFailures({root = cssRoot, runtimeProperties = RUNTIME_PROPERTIES, themeMapPath} = {}) {
    const
        srcDir   = path.join(root, 'src'),
        baseDir  = path.join(root, 'theme-base'),
        classMap = resolveThemeClassMap({root, themeMapPath}),
        groups   = new Map();

    for (const [themeClass, mappedFolders] of Object.entries(classMap)) {
        const folders = mappedFolders.filter(folder => (
            folder !== 'src' &&
            folder !== 'theme-base' &&
            fs.existsSync(path.join(root, folder))
        ));

        if (!folders.length) continue;

        const key   = folders.join('\0'),
              entry = groups.get(key) ?? {classes: [], folders};

        entry.classes.push(themeClass);
        groups.set(key, entry)
    }

    // Reading nothing must never look like a clean tree.
    if (!groups.size || !fs.existsSync(srcDir)) {
        return [`[surface] ${root} needs src/ and at least one mapped theme directory, so references cannot be verified`]
    }

    const
        srcFiles  = cssFiles(srcDir),
        baseFiles = fs.existsSync(baseDir) ? cssFiles(baseDir) : [],
        shared    = definitionsIn([...srcFiles, ...baseFiles]),
        roles     = requiredRolesIn(srcFiles),
        // a runtime row stays alive while any stylesheet reads it, structural and base files included
        read      = readsIn([...srcFiles, ...baseFiles]),
        failures  = [];

    for (const {classes, folders} of groups.values()) {
        const
            label   = folders.length === 1 ? folders[0] : classes.join(' / '),
            files   = folders.flatMap(folder => cssFiles(path.join(root, folder))),
            defined = definitionsIn(files),
            missing = new Map();

        if (roles.size) {
            const globals = folders.map(folder => path.join(root, folder, 'Global.css'))
                .filter(file => fs.existsSync(file))
                .map(file => readThemeDeclarations(readCss(file)));

            for (const themeClass of classes) {
                for (const role of roles) {
                    if (!globals.some(declarations => declarations.get(themeClass)?.has(role))) {
                        failures.push(`[undefined-role] ${themeClass} lacks an unconditional Global.css definition for ${role}, read without a fallback in src/`);
                    }
                }
            }
        }

        readsIn(files).forEach(name => read.add(name));

        for (const file of [...baseFiles, ...files]) {
            const css = readCss(file);

            for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
                const name = match[1];

                if (!defined.has(name) && !shared.has(name) && !(name in runtimeProperties)) {
                    const sites = missing.get(name) || [];

                    sites.push(`${path.relative(root, file).replaceAll('\\', '/')}:${css.slice(0, match.index).split('\n').length}`);
                    missing.set(name, sites)
                }
            }
        }

        missing.forEach((sites, name) => failures.push(`[undefined] ${label} reads ${name}, which nothing defines: ${sites.join(', ')}`))
    }

    for (const name of Object.keys(runtimeProperties)) {
        read.has(name) || failures.push(`[stale-runtime] no stylesheet reads ${name} any more, so remove its runtime row`)
    }

    return failures
}

if (isEntryModule(import.meta.url)) {
    const failures = collectThemeVarReferenceFailures();

    if (failures.length) {
        console.error('✗ theme var references FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        console.error('\n  Define the property in the theme (or resources/css/src), correct the name, or give the var() a fallback.');
        process.exit(1)
    }

    console.log('✓ theme var references: every fallback-free var() in every theme resolves.')
}
