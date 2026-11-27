#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-property-prefix
 * @summary Enforces the I4 custom-property prefix invariant across multi-line CSS and complete identifiers:
 * 1. Every custom property declared or read in an engine stylesheet (`resources/css` outside `apps/` and
 *    `examples/` subtrees) starts with `--neo-` or is registered in `FOREIGN_PROPERTIES` (covering
 *    declarations, `@property` rules, and `var()` reads across arbitrary CSS whitespace/newlines).
 * 2. Every `--neo-*` custom property across `resources/css`, `src`, `apps`, `examples`, and `test` has a
 *    valid `kindOf(name)` (`palette`, one of the thirteen role categories, a temporary legacy `Global.css`
 *    token, or a component stem that collides with none of those reserved words), rejecting malformed
 *    complete identifiers such as `--neo-demo--atom`, `--neo-demo-`, or `--neo--demo`.
 */
import fs                  from 'node:fs';
import path                from 'node:path';
import {fileURLToPath}     from 'node:url';
import isEntryModule       from './isEntryModule.mjs';
import {stripJsComments}   from './check-theme-class-prefix.mjs';
import {cssFiles, readCss} from './themeCss.mjs';
import {
    FOREIGN_PROPERTIES,
    OLD_SKELETON_PREFIXES,
    PALETTE_EXTRAS,
    ROLE_CATEGORIES,
    ROLE_SECOND_SEGMENTS,
    kindOf
} from './themeNameShapes.mjs';

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
    CSS_IDENT_CHAR    = String.raw`(?:\\[^\n]|[A-Za-z0-9_\u0080-\uFFFF-])`,
    CSS_DECL_RE       = new RegExp('(?<![A-Za-z0-9_\\u0080-\\uFFFF-])(--' + CSS_IDENT_CHAR + '+)\\s*:', 'g'),
    CSS_AT_PROP_RE    = new RegExp('@[Pp][Rr][Oo][Pp][Ee][Rr][Tt][Yy](?![A-Za-z0-9_\\u0080-\\uFFFF-])\\s*(--' + CSS_IDENT_CHAR + '+)', 'g'),
    CSS_VAR_READ_RE   = new RegExp('(?<![A-Za-z0-9_\\u0080-\\uFFFF-])[Vv][Aa][Rr]\\(\\s*(--' + CSS_IDENT_CHAR + '+)', 'g'),
    CSS_NEO_PROP_RE   = new RegExp('(?<![A-Za-z0-9_\\u0080-\\uFFFF-])(--neo-' + CSS_IDENT_CHAR + '*)', 'g'),
    JS_NEO_PROP_RE    = /(?<![<!A-Za-z0-9_-])(--neo-[A-Za-z0-9_-]*)/g,
    KEBAB_STEM_RE     = /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    LEGACY_STEM_SET   = new Set(OLD_SKELETON_PREFIXES),
    ROLE_CATEGORY_SET = new Set(ROLE_CATEGORIES),
    SOURCE_DIRS       = Object.freeze(['src', 'apps', 'examples', 'test']);

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
 * @summary Validates a partial `--neo-<stem>-` prefix used in `.mjs` template interpolations (`--neo-event-${x}`),
 * regex/wildcard patterns (`--neo-desktop-[a-z-]+`, `--neo-board-*`), or prefix assertions (`'--neo-container-'`).
 * Rejects `--` double-hyphens and reserved second-segment collisions.
 * @param {String} prefix Token ending in a single `-`.
 * @returns {Boolean}
 */
function isAllowedNeoStemPrefix(prefix) {
    if (!prefix.startsWith('--neo-') || !prefix.endsWith('-') || prefix.endsWith('--')) {
        return false
    }

    const stem = prefix.slice(6, -1);

    if (stem === 'palette' || LEGACY_STEM_SET.has(stem)) {
        return true
    }

    if (!KEBAB_STEM_RE.test(stem)) {
        return false
    }

    if (ROLE_CATEGORY_SET.has(stem) || ROLE_CATEGORIES.some(cat => stem.startsWith(`${cat}-`))) {
        return true
    }

    const firstSegment = stem.split('-')[0];

    return firstSegment !== 'palette' && !ROLE_SECOND_SEGMENTS.has(firstSegment)
}

/**
 * @summary Blanks CSS string literals (`'...'` and `"..."`) to spaces while preserving quotes and line breaks,
 * so strings inside `content:` never masquerade as custom-property declarations or `var()` reads.
 * @param {String} css Comment-stripped CSS.
 * @returns {String}
 */
function blankCssStrings(css) {
    return css.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, literal =>
        literal[0] + literal.slice(1, -1).replace(/[^\n]/g, ' ') + literal[literal.length - 1]
    )
}

/**
 * @summary Builds a 1-based line-number lookup function over `text`.
 * @param {String} text
 * @returns {(offset: Number) => Number}
 */
function createLineLocator(text) {
    const lineStarts = [0];

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            lineStarts.push(i + 1)
        }
    }

    return offset => {
        let low  = 0,
            high = lineStarts.length - 1;

        while (low <= high) {
            const mid = (low + high) >> 1;

            if (lineStarts[mid] <= offset) {
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        return high + 1
    }
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
 * @summary Scans comment-stripped CSS or JS text for invalid complete `--neo-*` custom properties.
 * @param {String} text
 * @param {String} relPath
 * @param {String[]} failures
 * @param {Object} [options={}]
 * @param {Boolean} [options.isMjs=false]
 */
function scanNeoTokens(text, relPath, failures, {isMjs = false} = {}) {
    const
        lineOf  = createLineLocator(text),
        pattern = isMjs ? JS_NEO_PROP_RE : CSS_NEO_PROP_RE;

    for (const match of text.matchAll(pattern)) {
        const
            token    = match[1],
            matchEnd = match.index + token.length;

        if (isMjs && token.endsWith('-') && !token.endsWith('--')) {
            const nextChar = text[matchEnd] || '';

            if (text.slice(matchEnd, matchEnd + 2) === '${') {
                if (token === '--neo-' || isAllowedNeoStemPrefix(token)) {
                    continue
                }
            } else if (token === '--neo-' && `'"\`* [(<)`.includes(nextChar)) {
                continue
            } else if (`'"\`*[(<`.includes(nextChar) && isAllowedNeoStemPrefix(token)) {
                continue
            }
        }

        if (!isAllowedNeoProperty(token)) {
            failures.push(
                `[invalid-neo-property] ${relPath}:${lineOf(match.index)} uses '${token}'; expected '--neo-palette-<slot>-<grade>', ` +
                `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`
            )
        }
    }
}

/**
 * @summary Scans a full comment- and string-stripped engine stylesheet across whitespace/newlines for
 * unprefixed non-foreign custom properties in declarations, `@property` rules, and `var()` reads.
 * @param {String} css Comment- and string-blanked CSS.
 * @param {String} relPath Repo-relative path.
 * @param {String[]} failures
 */
function scanEngineCssProperties(css, relPath, failures) {
    const
        lineOf = createLineLocator(css),
        hits   = [],
        seen   = new Set();

    for (const pattern of [CSS_DECL_RE, CSS_AT_PROP_RE, CSS_VAR_READ_RE]) {
        for (const match of css.matchAll(pattern)) {
            const
                token      = match[1],
                tokenIndex = match.index + match[0].lastIndexOf(token),
                line       = lineOf(tokenIndex),
                dedupKey   = `${line}:${token}`;

            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            if (!token.startsWith('--neo-') && kindOf(token) !== 'foreign') {
                hits.push({
                    index  : tokenIndex,
                    message: `[unprefixed-engine-property] ${relPath}:${line} uses '${token}'; every engine custom property ` +
                             `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`
                })
            }
        }
    }

    hits.sort((a, b) => a.index - b.index);
    hits.forEach(hit => failures.push(hit.message))
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
            stripped   = blankCssStrings(readCss(file));

        if (isEngineCssRelPath(cssRelPath)) {
            scanEngineCssProperties(stripped, relPath, failures)
        }

        scanNeoTokens(stripped, relPath, failures, {isMjs: false})
    }

    for (const dirName of SOURCE_DIRS) {
        for (const file of mjsFiles(path.join(root, dirName))) {
            const
                relPath = path.relative(root, file).replaceAll('\\', '/'),
                source  = fs.readFileSync(file, 'utf8');

            scanNeoTokens(stripJsComments(source), relPath, failures, {isMjs: true})
        }
    }

    return failures
}

if (isEntryModule(import.meta.url)) {
    const failures = collectThemePropertyPrefixFailures();

    if (failures.length) {
        console.error('✗ theme property prefix FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exitCode = 1
    } else {
        console.log(
            '✓ theme property prefix — every engine custom property carries --neo- and every --neo-* name matches a valid shape.'
        )
    }
}
