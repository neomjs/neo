#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-class-prefix
 * @summary Enforces that the `neo-theme-` CSS class prefix is reserved exclusively for declared theme
 * classes (`neo-theme-<name>`) and `neo-theme-scope`.
 *
 * `theme-base` declares component variables on `[class*="neo-theme-"]` so every theme root and inline
 * role scope resolves component hooks against its local roles. Any widget or application class beginning
 * with `neo-theme-` (such as the retired `neo-theme-switcher`) matches `[class*="neo-theme-"]` and silently
 * turns that element into an unintended theme scope, clobbering ancestor component-variable overrides.
 *
 * Declared theme classes come from `collectThemeClassMap` over each theme folder's `Global.css`,
 * never from a hardcoded list, so adding a new theme folder automatically admits its theme class.
 */
import fs                                        from 'node:fs';
import path                                      from 'node:path';
import {fileURLToPath}                           from 'node:url';
import isEntryModule                             from './isEntryModule.mjs';
import {collectThemeClassMap, cssFiles, readCss} from './themeCss.mjs';

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../..');

/**
 * Every tracked surface whose contents can change this guard's verdict, exported as repo-relative globs
 * so `ScanSurfaceAlignment.spec.mjs` verifies CI workflow path coverage against what is actually read.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    'resources/css/**/*.css',
    'src/**/*.mjs',
    'apps/**/*.mjs',
    'examples/**/*.mjs',
    'apps/**/*.html',
    'examples/**/*.html'
]);

const
    RESERVED_NTYPE_RE = /\bntype\s*:\s*['"](theme(?:-[a-zA-Z0-9_-]+)?)['"]/g,
    RESERVED_TOKEN_RE = /(?<![a-zA-Z0-9_-])(neo-theme-[a-zA-Z0-9_-]+)/g,
    SOURCE_DIRS       = Object.freeze(['src', 'apps', 'examples']),
    HTML_DIRS         = Object.freeze(['apps', 'examples']);

/**
 * @summary Walks `dir` recursively and returns sorted absolute paths matching `extensions`.
 * @param {String} dir
 * @param {Set<String>} extensions
 * @returns {String[]}
 */
function walkFiles(dir, extensions) {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return walkFiles(full, extensions)
        }

        return extensions.has(path.extname(entry.name)) ? [full] : []
    }).sort()
}

/**
 * @summary Blanks JavaScript line and block comments to spaces while preserving string/template literals
 * and exact line numbers, so JSDoc `@example` prose does not false-fire and `//` inside URLs stays intact.
 * @param {String} source
 * @returns {String}
 */
export function stripJsComments(source) {
    let out = '',
        i   = 0;

    while (i < source.length) {
        const
            ch   = source[i],
            next = source[i + 1];

        if (ch === '/' && next === '*') {
            out += '  ';
            i += 2;

            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
                out += source[i] === '\n' ? '\n' : ' ';
                i++
            }

            if (i < source.length) {
                out += '  ';
                i += 2
            }

            continue
        }

        if (ch === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') {
                out += ' ';
                i++
            }

            continue
        }

        if (ch === "'" || ch === '"' || ch === '`') {
            const quote = ch;

            out += ch;
            i++;

            while (i < source.length) {
                const current = source[i];

                out += current;
                i++;

                if (current === '\\' && i < source.length) {
                    out += source[i];
                    i++;
                    continue
                }

                if (current === quote) break
            }

            continue
        }

        out += ch;
        i++
    }

    return out
}

/**
 * @summary Blanks HTML comments while keeping line breaks intact.
 * @param {String} source
 * @returns {String}
 */
function stripHtmlComments(source) {
    return source.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '))
}

/**
 * @summary Scans line-preserving stripped text for `neo-theme-*` tokens outside `allowed`.
 * @param {String} text
 * @param {String} relPath
 * @param {Set<String>} allowed
 * @param {String[]} failures
 */
function scanStrippedText(text, relPath, allowed, failures) {
    const lines = text.split('\n');

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        for (const match of line.matchAll(RESERVED_TOKEN_RE)) {
            const token = match[1];

            if (!allowed.has(token)) {
                failures.push(
                    `[reserved-prefix] ${relPath}:${index + 1} uses '${token}'; 'neo-theme-' is reserved ` +
                    `for declared theme classes and 'neo-theme-scope'`
                )
            }
        }
    }
}

/**
 * @summary Collects reserved `neo-theme-` class-prefix violations across CSS, `.mjs`, and `.html` files.
 * @param {Object} [options={}]
 * @param {String} [options.root=repoRoot]
 * @returns {String[]}
 */
export function collectThemeClassPrefixFailures({root = repoRoot} = {}) {
    const
        cssRoot  = path.join(root, 'resources/css'),
        srcCss   = path.join(cssRoot, 'src'),
        failures = [];

    if (!fs.existsSync(cssRoot) || !fs.existsSync(srcCss)) {
        return [`[surface] missing resources/css/src under ${root}`]
    }

    const
        themeClassMap = collectThemeClassMap([cssRoot]),
        themeClasses  = Object.keys(themeClassMap);

    if (themeClasses.length === 0) {
        return [`[surface] no theme classes declared in resources/css/*/Global.css under ${root}`]
    }

    const
        allowed = new Set([...themeClasses, 'neo-theme-scope']),
        mjsExt  = new Set(['.mjs']),
        htmlExt = new Set(['.html']);

    for (const file of cssFiles(cssRoot)) {
        const relPath = path.relative(root, file).replaceAll('\\', '/');

        scanStrippedText(readCss(file), relPath, allowed, failures)
    }

    for (const dirName of SOURCE_DIRS) {
        for (const file of walkFiles(path.join(root, dirName), mjsExt)) {
            const
                relPath  = path.relative(root, file).replaceAll('\\', '/'),
                source   = fs.readFileSync(file, 'utf8'),
                stripped = stripJsComments(source);

            scanStrippedText(stripped, relPath, allowed, failures);

            const lines = stripped.split('\n');

            for (let index = 0; index < lines.length; index++) {
                for (const match of lines[index].matchAll(RESERVED_NTYPE_RE)) {
                    failures.push(
                        `[reserved-prefix] ${relPath}:${index + 1} uses reserved ntype '${match[1]}', whose ` +
                        `component.Base#afterSetUi emits 'neo-${match[1]}-<ui>'; rename ntype so it is neither ` +
                        `'theme' nor 'theme-*'`
                    )
                }
            }
        }
    }

    for (const dirName of HTML_DIRS) {
        for (const file of walkFiles(path.join(root, dirName), htmlExt)) {
            const
                relPath = path.relative(root, file).replaceAll('\\', '/'),
                source  = fs.readFileSync(file, 'utf8');

            scanStrippedText(stripHtmlComments(source), relPath, allowed, failures)
        }
    }

    return failures
}

if (isEntryModule(import.meta.url)) {
    const failures = collectThemeClassPrefixFailures();

    if (failures.length) {
        console.error('✗ theme class prefix FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exit(1)
    }

    const themeCount = Object.keys(collectThemeClassMap([path.join(repoRoot, 'resources/css')])).length;

    console.log(
        `✓ theme class prefix reserved — ${themeCount} declared theme class(es) and neo-theme-scope only.`
    )
}
