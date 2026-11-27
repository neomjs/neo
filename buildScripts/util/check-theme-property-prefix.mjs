#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-property-prefix
 * @summary Enforces the I4 custom-property prefix invariant:
 * 1. Every custom property declared or read in an engine stylesheet (`resources/css` outside `apps/` and
 *    `examples/` subtrees) starts with `--neo-` or is registered in `FOREIGN_PROPERTIES`.
 * 2. Every `--neo-*` custom property across `resources/css`, `src`, `apps`, `examples`, and `test` has a
 *    valid `kindOf(name)` (`palette`, one of the thirteen role categories, a temporary legacy `Global.css`
 *    token, or a component stem that collides with none of those reserved words).
 */
import fs                                           from 'node:fs';
import path                                         from 'node:path';
import {fileURLToPath}                              from 'node:url';
import isEntryModule                                from './isEntryModule.mjs';
import {stripJsComments}                            from './check-theme-class-prefix.mjs';
import {cssFiles, readCss}                          from './themeCss.mjs';
import {FOREIGN_PROPERTIES, PALETTE_EXTRAS, kindOf} from './themeNameShapes.mjs';

export {FOREIGN_PROPERTIES, PALETTE_EXTRAS, kindOf};

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../..');

/**
 * Every tracked surface whose contents can change this guard's verdict, exported as repo-relative globs
 * for `ScanSurfaceAlignment.spec.mjs`.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    'resources/css/**/*.css',
    'src/**/*.mjs',
    'apps/**/*.mjs',
    'examples/**/*.mjs',
    'test/**/*.mjs'
]);

const
    CSS_DECL_RE     = /(?<![\w-])(--[A-Za-z0-9_-]+)\s*:/g,
    CSS_AT_PROP_RE  = /@property\s+(--[A-Za-z0-9_-]+)/g,
    CSS_VAR_READ_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g,
    NEO_PROP_RE     = /(?<![<!a-zA-Z0-9_-])(--neo-[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)(?![a-zA-Z0-9_<-])/g,
    SOURCE_DIRS     = Object.freeze(['src', 'apps', 'examples', 'test']);

/**
 * @summary Returns true when `name` is a valid `--neo-*` custom property (`palette`, `role`, `legacy`, or `component`).
 * @param {String} name
 * @returns {Boolean}
 */
export function isAllowedNeoProperty(name) {
    const kind = kindOf(name);

    return kind === 'palette' || kind === 'role' || kind === 'legacy' || kind === 'component'
}

/**
 * @summary Returns true when a `resources/css/<top>/...` relative path belongs to an engine folder
 * (neither `apps/` nor `examples/` as its second segment).
 * @param {String} cssRelPath Path relative to `resources/css`.
 * @returns {Boolean}
 */
function isEngineCssRelPath(cssRelPath) {
    const second = cssRelPath.split('/')[1];

    return second !== 'apps' && second !== 'examples'
}

/**
 * @summary Walks `dir` recursively and returns sorted `.mjs` absolute file paths.
 * @param {String} dir
 * @returns {String[]}
 */
function mjsFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return mjsFiles(full)
        }

        return entry.name.endsWith('.mjs') ? [full] : []
    }).sort()
}

/**
 * @summary Scans line-preserving comment-stripped text for invalid `--neo-*` custom properties.
 * @param {String} text
 * @param {String} relPath
 * @param {String[]} failures
 */
function scanNeoTokens(text, relPath, failures) {
    const lines = text.split('\n');

    for (let index = 0; index < lines.length; index++) {
        for (const match of lines[index].matchAll(NEO_PROP_RE)) {
            const token = match[1];

            if (!isAllowedNeoProperty(token)) {
                failures.push(
                    `[invalid-neo-property] ${relPath}:${index + 1} uses '${token}'; expected '--neo-palette-<slot>-<grade>', ` +
                    `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`
                )
            }
        }
    }
}

/**
 * @summary Scans an engine stylesheet for unprefixed non-foreign custom properties in declarations,
 * `@property` rules, and `var()` reads.
 * @param {String} css Comment-stripped CSS.
 * @param {String} relPath Repo-relative path.
 * @param {String[]} failures
 */
function scanEngineCssProperties(css, relPath, failures) {
    const lines = css.split('\n');

    for (let index = 0; index < lines.length; index++) {
        const
            line = lines[index],
            seen = new Set();

        for (const pattern of [CSS_DECL_RE, CSS_AT_PROP_RE, CSS_VAR_READ_RE]) {
            for (const match of line.matchAll(pattern)) {
                const token = match[1];

                if (seen.has(token)) continue;
                seen.add(token);

                if (!token.startsWith('--neo-') && kindOf(token) !== 'foreign') {
                    failures.push(
                        `[unprefixed-engine-property] ${relPath}:${index + 1} uses '${token}'; every engine custom property ` +
                        `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`
                    )
                }
            }
        }
    }
}

/**
 * @summary Collects custom-property prefix and shape failures across `resources/css`, `src`, `apps`, `examples`, and `test`.
 * @param {Object} [options={}]
 * @param {String} [options.root=repoRoot]
 * @returns {String[]}
 */
export function collectThemePropertyPrefixFailures({root = repoRoot} = {}) {
    const
        cssRoot  = path.join(root, 'resources/css'),
        srcCss   = path.join(cssRoot, 'src'),
        failures = [];

    if (!fs.existsSync(cssRoot) || !fs.existsSync(srcCss)) {
        return [`[surface] missing resources/css/src under ${root}`]
    }

    for (const file of cssFiles(cssRoot)) {
        const
            relPath    = path.relative(root, file).replaceAll('\\', '/'),
            cssRelPath = path.relative(cssRoot, file).replaceAll('\\', '/'),
            stripped   = readCss(file);

        if (isEngineCssRelPath(cssRelPath)) {
            scanEngineCssProperties(stripped, relPath, failures)
        }

        scanNeoTokens(stripped, relPath, failures)
    }

    for (const dirName of SOURCE_DIRS) {
        for (const file of mjsFiles(path.join(root, dirName))) {
            const
                relPath = path.relative(root, file).replaceAll('\\', '/'),
                source  = fs.readFileSync(file, 'utf8');

            scanNeoTokens(stripJsComments(source), relPath, failures)
        }
    }

    return failures
}

if (isEntryModule(import.meta.url)) {
    const failures = collectThemePropertyPrefixFailures();

    if (failures.length) {
        console.error('✗ theme property prefix FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exit(1)
    }

    console.log(
        '✓ theme property prefix — every engine custom property carries --neo- and every --neo-* name matches a valid shape.'
    )
}
