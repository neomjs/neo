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
 * A reference with a fallback is the author's explicit choice and is skipped. Definitions count
 * wherever they appear: the guard catches names that nothing defines, not scoping mistakes.
 * The runtime list and the stylesheet reading are shared with `theme-census` through `themeCss.mjs`.
 */
import fs                                      from 'node:fs';
import path                                    from 'node:path';
import {fileURLToPath}                         from 'node:url';
import isEntryModule                           from './isEntryModule.mjs';
import {RUNTIME_PROPERTIES, cssFiles, readCss} from './themeCss.mjs';

const
    repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    cssRoot  = path.join(repoRoot, 'resources/css');

/**
 * The trees this guard reads, as repo-relative globs (the form a workflow `paths:` filter takes).
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(
    ['src', 'theme-*'].map(dir => `${path.relative(repoRoot, cssRoot).replaceAll('\\', '/')}/${dir}/**/*.css`)
);

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
 * @summary Collects every fallback-free reference a theme cannot resolve. Pure over the filesystem:
 * no exit, no logging.
 * @param {Object} [options]
 * @param {String} [options.root=resources/css] Holds `src/` and the `theme-*` directories.
 * @param {Object<String,String>} [options.runtimeProperties=RUNTIME_PROPERTIES]
 * @returns {String[]} Failure messages, empty when every reference resolves.
 */
export function collectThemeVarReferenceFailures({root = cssRoot, runtimeProperties = RUNTIME_PROPERTIES} = {}) {
    const
        srcDir = path.join(root, 'src'),
        themes = fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.startsWith('theme-')).sort() : [];

    // Reading nothing must never look like a clean tree.
    if (!themes.length || !fs.existsSync(srcDir)) {
        return [`[surface] ${root} needs src/ and at least one theme-* directory, so references cannot be verified`]
    }

    const
        srcFiles = cssFiles(srcDir),
        shared   = definitionsIn(srcFiles),
        // a runtime row stays alive while any stylesheet reads it, structural rules included
        read     = readsIn(srcFiles),
        failures = [];

    for (const theme of themes) {
        const
            files   = cssFiles(path.join(root, theme)),
            defined = definitionsIn(files),
            missing = new Map();

        readsIn(files).forEach(name => read.add(name));

        for (const file of files) {
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

        missing.forEach((sites, name) => failures.push(`[undefined] ${theme} reads ${name}, which nothing defines: ${sites.join(', ')}`))
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
