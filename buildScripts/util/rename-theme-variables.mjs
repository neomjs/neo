#!/usr/bin/env node
/**
 * @module buildScripts/util/rename-theme-variables
 * @summary Applies the canonical custom-property rename map (`theme-variable-renames.json`)
 * across stylesheets, `.html` fixtures, `.mjs` modules/specs, `.github/CODING_GUIDELINES.md`,
 * and `learn`/`apps`/`docs`/`examples` Markdown docs, reports dynamic `--...${...}` templates and
 * dashless `setCssVariable` calls, and verifies zero old names remain.
 *
 * Designed to run idempotently and fail closed on both `neomjs/neo` and sibling repositories:
 *
 *     node ./buildScripts/util/rename-theme-variables.mjs
 *     node ./buildScripts/util/rename-theme-variables.mjs --verify-targets-free
 *     node ./buildScripts/util/rename-theme-variables.mjs --root ../neo-agent-institution
 *     node ./buildScripts/util/rename-theme-variables.mjs --check
 */
import fs                from 'node:fs';
import path              from 'node:path';
import {fileURLToPath}   from 'node:url';
import isEntryModule     from './isEntryModule.mjs';
import {stripJsComments} from './check-theme-class-prefix.mjs';

const
    dirname        = path.dirname(fileURLToPath(import.meta.url)),
    defaultRoot    = path.resolve(dirname, '../..'),
    defaultMapPath = path.join(dirname, 'theme-variable-renames.json'),
    DOC_FILES      = new Set(['.github/CODING_GUIDELINES.md']),
    DOC_ROOT_DIRS  = new Set(['apps', 'docs', 'examples', 'learn']),
    IGNORED_DIRS   = new Set([
        '.git',
        '.neo-ai-data',
        '.stage',
        'coverage',
        'dist',
        'dist-artifacts',
        'node_modules',
        'output',
        'playwright-report',
        'test-results'
    ]),
    KNOWN_BOOL_FLAGS = new Set(['--check', '--dry-run', '--json', '--verify-targets-free']),
    KNOWN_OPT_FLAGS  = new Set(['--map', '--root']),
    TARGET_EXTS      = new Set(['.css', '.html', '.mjs', '.scss']),
    CUSTOM_PROP_RE   = /(?<![<!A-Za-z0-9_-])(--[A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g,
    DYNAMIC_PROP_RE  = /`[^`]*?(?<![A-Za-z0-9_$}])(--[A-Za-z0-9_-]*\$\{[^`\n]+)`/g;

/**
 * @summary Validates that `dirPath` exists and is a directory; throws fail-closed otherwise.
 * @param {String} dirPath
 * @returns {String} Resolved absolute directory path.
 */
function assertExistingDirectory(dirPath) {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
        throw new Error('A non-empty --root directory path is required.')
    }

    const resolved = path.resolve(dirPath);

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error(`Target --root directory does not exist or is not a directory: "${resolved}"`)
    }

    return resolved
}

/**
 * @summary Validates that `filePath` exists and is a regular file; throws fail-closed otherwise.
 * @param {String} filePath
 * @returns {String} Resolved absolute file path.
 */
function assertExistingFile(filePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('A non-empty --map file path is required.')
    }

    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        throw new Error(`Rename --map file does not exist or is not a file: "${resolved}"`)
    }

    return resolved
}

/**
 * @summary Parses CLI arguments and fails closed on missing operands, flag-shaped operands (`--root --check`),
 * or unknown flags.
 * @param {String[]} args `process.argv.slice(2)`
 * @returns {{check: Boolean, dryRun: Boolean, jsonMode: Boolean, mapPath: String, root: String, verifyTargetsFree: Boolean}}
 */
export function parseCliArgs(args) {
    let check             = false,
        dryRun            = false,
        jsonMode          = false,
        verifyTargetsFree = false,
        mapPath           = defaultMapPath,
        root              = defaultRoot;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (KNOWN_BOOL_FLAGS.has(arg)) {
            if (arg === '--check')               check             = true;
            if (arg === '--dry-run')             dryRun            = true;
            if (arg === '--json')                jsonMode          = true;
            if (arg === '--verify-targets-free') verifyTargetsFree = true;
            continue
        }

        if (KNOWN_OPT_FLAGS.has(arg)) {
            const value = args[i + 1];

            if (!value || value.startsWith('-')) {
                throw new Error(`Option "${arg}" requires a path operand (received "${value ?? ''}").`)
            }

            if (arg === '--root') root    = path.resolve(value);
            if (arg === '--map')  mapPath = path.resolve(value);
            i++;
            continue
        }

        throw new Error(`Unknown CLI argument "${arg}". Usage: rename-theme-variables.mjs [--root <dir>] [--map <file>] [--dry-run] [--check] [--verify-targets-free] [--json]`)
    }

    assertExistingDirectory(root);
    assertExistingFile(mapPath);

    return {check, dryRun, jsonMode, mapPath, root, verifyTargetsFree}
}

/**
 * @summary Returns 1-based line numbers for arbitrary offsets in `text`.
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
 * @summary Advances past a JavaScript single/double-quoted string or template literal starting at `start`,
 * handling escapes and nested `${...}` expressions inside template literals.
 * @param {String} source
 * @param {Number} start Index of opening `'`, `"`, or `` ` ``.
 * @returns {{end: Number, hasInterpolation: Boolean}}
 */
function skipJsQuoted(source, start) {
    const quote = source[start];
    let   i     = start + 1,
        hasInterpolation = false;

    while (i < source.length) {
        const ch = source[i];

        if (ch === '\\') {
            i += 2;
            continue
        }

        if (quote === '`' && ch === '$' && source[i + 1] === '{') {
            hasInterpolation = true;
            i += 2;
            let braceDepth = 1;

            while (i < source.length && braceDepth > 0) {
                const inner = source[i];

                if (inner === "'" || inner === '"' || inner === '`') {
                    i = skipJsQuoted(source, i).end;
                    continue
                }

                if (inner === '/' && source[i + 1] === '/') {
                    while (i < source.length && source[i] !== '\n') i++;
                    continue
                }

                if (inner === '/' && source[i + 1] === '*') {
                    i += 2;
                    while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
                    i += 2;
                    continue
                }

                if (inner === '{') braceDepth++;
                else if (inner === '}') braceDepth--;
                i++
            }

            continue
        }

        if (ch === quote) {
            return {end: i + 1, hasInterpolation}
        }

        i++
    }

    return {end: source.length, hasInterpolation}
}

/**
 * @summary Scans `.mjs` source for `setCssVariable({...})` calls using balanced brace/quote/comment tracking,
 * extracting top-level `key:` properties regardless of property order or nested object literals
 * (e.g. `setCssVariable({value: compute({r: 1}), key: 'button-background-color'})`).
 * @param {String} source
 * @returns {Array<{contentEnd?: Number, contentStart?: Number, key?: String, kind: 'literal'|'template'|'expression', line: Number, raw: String}>}
 */
export function scanSetCssVariableCalls(source) {
    const
        calls  = [],
        lineOf = createLineLocator(source),
        callRe = /\bsetCssVariable\s*\(\s*\{/y;

    let i = 0;

    while (i < source.length) {
        const
            ch   = source[i],
            next = source[i + 1];

        if (ch === "'" || ch === '"' || ch === '`') {
            i = skipJsQuoted(source, i).end;
            continue
        }

        if (ch === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            continue
        }

        if (ch === '/' && next === '*') {
            i += 2;
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
            i += 2;
            continue
        }

        callRe.lastIndex = i;
        const match = callRe.exec(source);

        if (!match) {
            i++;
            continue
        }

        // Walk the balanced `{ ... }` config object passed to `setCssVariable(`
        let cursor       = callRe.lastIndex,
            braceDepth   = 1,
            parenDepth   = 0,
            bracketDepth = 0,
            expectProp   = true;

        while (cursor < source.length && braceDepth > 0) {
            const c = source[cursor];

            if (/\s/.test(c)) {
                cursor++;
                continue
            }

            if (c === '/' && source[cursor + 1] === '/') {
                while (cursor < source.length && source[cursor] !== '\n') cursor++;
                continue
            }

            if (c === '/' && source[cursor + 1] === '*') {
                cursor += 2;
                while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) cursor++;
                cursor += 2;
                continue
            }

            if (braceDepth === 1 && parenDepth === 0 && bracketDepth === 0 && expectProp) {
                const propMatch = /^(?:(['"])key\1|key)\s*:\s*/.exec(source.slice(cursor));

                if (propMatch) {
                    const
                        valStart = cursor + propMatch[0].length,
                        valLine  = lineOf(valStart),
                        first    = source[valStart];

                    if (first === "'" || first === '"' || first === '`') {
                        const {end, hasInterpolation} = skipJsQuoted(source, valStart),
                              raw                     = source.slice(valStart, end),
                              inner                   = source.slice(valStart + 1, end - 1);

                        if (first === '`' && hasInterpolation) {
                            calls.push({kind: 'template', line: valLine, raw})
                        } else if (!inner.includes('\\')) {
                            calls.push({
                                contentEnd  : end - 1,
                                contentStart: valStart + 1,
                                key         : inner,
                                kind        : 'literal',
                                line        : valLine,
                                raw
                            })
                        } else {
                            calls.push({kind: 'expression', line: valLine, raw})
                        }

                        cursor     = end;
                        expectProp = false;
                        continue
                    }

                    // Non-string expression up to top-level `,` or closing `}`
                    let exprCursor = valStart,
                        subBrace   = 0,
                        subParen   = 0,
                        subBracket = 0;

                    while (exprCursor < source.length) {
                        const ec = source[exprCursor];

                        if (ec === "'" || ec === '"' || ec === '`') {
                            exprCursor = skipJsQuoted(source, exprCursor).end;
                            continue
                        }

                        if (ec === '/' && source[exprCursor + 1] === '/') {
                            while (exprCursor < source.length && source[exprCursor] !== '\n') exprCursor++;
                            continue
                        }

                        if (ec === '/' && source[exprCursor + 1] === '*') {
                            exprCursor += 2;
                            while (exprCursor < source.length && !(source[exprCursor] === '*' && source[exprCursor + 1] === '/')) exprCursor++;
                            exprCursor += 2;
                            continue
                        }

                        if (subBrace === 0 && subParen === 0 && subBracket === 0 && (ec === ',' || ec === '}')) {
                            break
                        }

                        if (ec === '{')      subBrace++;
                        else if (ec === '}') subBrace--;
                        else if (ec === '(') subParen++;
                        else if (ec === ')') subParen--;
                        else if (ec === '[') subBracket++;
                        else if (ec === ']') subBracket--;

                        exprCursor++
                    }

                    const rawExpr = source.slice(valStart, exprCursor).trim();

                    if (rawExpr) {
                        calls.push({kind: 'expression', line: valLine, raw: rawExpr})
                    }

                    cursor     = exprCursor;
                    expectProp = false;
                    continue
                }
            }

            if (c === "'" || c === '"' || c === '`') {
                cursor     = skipJsQuoted(source, cursor).end;
                expectProp = false;
                continue
            }

            if (c === '{') {
                braceDepth++;
                expectProp = false
            } else if (c === '}') {
                braceDepth--;
                expectProp = false
            } else if (c === '(') {
                parenDepth++;
                expectProp = false
            } else if (c === ')') {
                parenDepth = Math.max(0, parenDepth - 1);
                expectProp = false
            } else if (c === '[') {
                bracketDepth++;
                expectProp = false
            } else if (c === ']') {
                bracketDepth = Math.max(0, bracketDepth - 1);
                expectProp = false
            } else if (c === ',' && braceDepth === 1 && parenDepth === 0 && bracketDepth === 0) {
                expectProp = true
            } else {
                expectProp = false
            }

            cursor++
        }

        i = cursor
    }

    return calls
}

/**
 * @summary Collects target files under `root`: all `.css`, `.html`, `.mjs`, and `.scss` files plus
 * `.github/CODING_GUIDELINES.md` and `.md` files under `learn/`, `apps/`, `docs/` (excluding `docs/output`),
 * and `examples/`, skipping generated/ignored directories and the map itself.
 * Fails closed when `root` does not exist or is not a directory.
 * @param {String} root
 * @param {String} resolvedMapPath
 * @returns {String[]}
 */
export function collectTargetFiles(root, resolvedMapPath) {
    const
        resolvedRoot = assertExistingDirectory(root),
        results      = [];

    function walk(currentDir, inDocTree) {
        const dirEntries = fs.readdirSync(currentDir, {withFileTypes: true})
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of dirEntries) {
            if (entry.isSymbolicLink()) continue;

            const
                full = path.join(currentDir, entry.name),
                rel  = path.relative(resolvedRoot, full).replaceAll('\\', '/');

            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name)) continue;
                if (rel === 'docs/output') continue;

                walk(full, inDocTree || DOC_ROOT_DIRS.has(rel));
                continue
            }

            if (resolvedMapPath && path.resolve(full) === resolvedMapPath) continue;

            const ext = path.extname(entry.name);

            if (TARGET_EXTS.has(ext) || ((inDocTree || DOC_FILES.has(rel)) && ext === '.md')) {
                results.push(full)
            }
        }
    }

    walk(resolvedRoot, false);

    return results
}

/**
 * @summary Loads and validates a rename-map JSON file (`{rules, entries}`). When `options.root` is supplied,
 * also verifies that every target custom property in the map is free across target files under `options.root`
 * (including dashless `setCssVariable({..., key: '<target-without-dashes>'})` calls in `.mjs` files).
 * @param {String} [mapPath=defaultMapPath]
 * @param {Object} [options={}]
 * @param {String} [options.root] Optional repository root to check for pre-existing target collisions.
 * @returns {{entries: Map<String, {to: String, rule: String, reason?: String}>, rules: Object<String, String>}}
 */
export function loadRenameMap(mapPath = defaultMapPath, {root} = {}) {
    const
        resolvedMapPath = assertExistingFile(mapPath),
        parsed          = JSON.parse(fs.readFileSync(resolvedMapPath, 'utf8')),
        rules           = parsed?.rules || {},
        raw             = parsed?.entries || {},
        entries         = new Map(),
        targets         = new Map();

    for (const [oldName, spec] of Object.entries(raw)) {
        const
            to     = typeof spec === 'string' ? spec : spec?.to,
            rule   = typeof spec === 'object' ? spec?.rule : undefined,
            reason = typeof spec === 'object' ? spec?.reason : undefined;

        if (!oldName.startsWith('--') || typeof to !== 'string' || !to.startsWith('--')) {
            throw new Error(`Invalid rename entry "${oldName}" -> "${to}" in ${resolvedMapPath}`)
        }

        if (oldName === to) {
            throw new Error(`Identity rename entry "${oldName}" in ${resolvedMapPath}`)
        }

        if (!rule && !reason) {
            throw new Error(`Entry "${oldName}" in ${resolvedMapPath} must state a rule or a one-line reason`)
        }

        if (rule) {
            for (const part of rule.split('+')) {
                if (!Object.hasOwn(rules, part.trim())) {
                    throw new Error(`Entry "${oldName}" references unknown rule "${part.trim()}" in ${resolvedMapPath}`)
                }
            }
        }

        if (targets.has(to)) {
            throw new Error(`Duplicate rename target "${to}" from "${targets.get(to)}" and "${oldName}"`)
        }

        targets.set(to, oldName);
        entries.set(oldName, {to, rule, ...(reason ? {reason} : {})})
    }

    for (const [oldName, {to}] of entries) {
        if (entries.has(to)) {
            throw new Error(`Chained rename "${oldName}" -> "${to}" -> "${entries.get(to).to}" is forbidden; map directly to final name`)
        }
    }

    if (root !== undefined && root !== null) {
        const
            resolvedRoot = assertExistingDirectory(root),
            files        = collectTargetFiles(resolvedRoot, resolvedMapPath);

        for (const file of files) {
            const
                rel      = path.relative(resolvedRoot, file).replaceAll('\\', '/'),
                fileText = fs.readFileSync(file, 'utf8'),
                lines    = fileText.split('\n');

            for (let i = 0; i < lines.length; i++) {
                for (const match of lines[i].matchAll(CUSTOM_PROP_RE)) {
                    const token = match[1];

                    if (targets.has(token)) {
                        throw new Error(
                            `Rename target "${token}" (from "${targets.get(token)}") already exists in ${rel}:${i + 1}`
                        )
                    }
                }
            }

            if (file.endsWith('.mjs')) {
                for (const call of scanSetCssVariableCalls(fileText)) {
                    if (call.kind !== 'literal') continue;

                    const dashed = call.key.startsWith('--') ? call.key : '--' + call.key;

                    if (targets.has(dashed)) {
                        throw new Error(
                            `Rename target "${dashed}" (from "${targets.get(dashed)}") already exists as setCssVariable key "${call.key}" in ${rel}:${call.line}`
                        )
                    }
                }
            }
        }
    }

    return {entries, rules}
}

/**
 * @summary Replaces exact `--old-name` custom-property tokens and dashless `setCssVariable({..., key: 'old-name'})`
 * calls in `.mjs` files using `entries`.
 * @param {String} content
 * @param {Map<String, {to: String}>} entries
 * @param {Boolean} [isMjs=false]
 * @returns {{changed: Boolean, count: Number, nextContent: String}}
 */
export function rewriteContent(content, entries, isMjs = false) {
    let count       = 0,
        nextContent = content;

    if (isMjs) {
        const dashlessEdits = scanSetCssVariableCalls(nextContent)
            .filter(call => call.kind === 'literal' && !call.key.startsWith('--') && entries.has('--' + call.key))
            .sort((a, b) => b.contentStart - a.contentStart);

        for (const edit of dashlessEdits) {
            const mapped = entries.get('--' + edit.key);

            nextContent = nextContent.slice(0, edit.contentStart) + mapped.to.slice(2) + nextContent.slice(edit.contentEnd);
            count++
        }
    }

    nextContent = nextContent.replace(CUSTOM_PROP_RE, (full, token) => {
        const mapped = entries.get(token);

        if (!mapped) {
            return full
        }

        count++;
        return mapped.to
    });

    return {
        changed: nextContent !== content,
        count,
        nextContent
    }
}

/**
 * @summary Runs the theme-variable rename (or check/dry-run) over `root`.
 * Fails closed when `root` or `mapPath` does not exist.
 * @param {Object} [options={}]
 * @param {Boolean} [options.check=false] Verify zero old names remain without modifying files.
 * @param {Boolean} [options.dryRun=false] Report what would change without writing files.
 * @param {String} [options.mapPath=defaultMapPath]
 * @param {String} [options.root=defaultRoot]
 * @param {Boolean} [options.verifyTargetsFree=false] Refuse to run if any target already exists in `root`.
 * @returns {{dashlessCalls: String[], dynamicTemplates: String[], modifiedFiles: String[], remainingMatches: Array<{file: String, line: Number, token: String}>, remainingOldCount: Number, replacements: Number}}
 */
export function runThemeVariableRename({
    check             = false,
    dryRun            = false,
    mapPath           = defaultMapPath,
    root              = defaultRoot,
    verifyTargetsFree = false
} = {}) {
    const
        resolvedRoot     = assertExistingDirectory(root),
        resolvedMapPath  = assertExistingFile(mapPath),
        {entries}        = loadRenameMap(resolvedMapPath, verifyTargetsFree ? {root: resolvedRoot} : {}),
        files            = collectTargetFiles(resolvedRoot, resolvedMapPath),
        modifiedFiles    = [],
        dashlessCalls    = [],
        dynamicTemplates = [],
        remainingMatches = [];

    let replacements = 0;

    for (const file of files) {
        const
            rel       = path.relative(resolvedRoot, file).replaceAll('\\', '/'),
            isMjs     = file.endsWith('.mjs'),
            current   = fs.readFileSync(file, 'utf8'),
            result    = check ? {changed: false, count: 0, nextContent: current} : rewriteContent(current, entries, isMjs),
            finalText = (check || dryRun) ? result.nextContent : (result.changed ? (fs.writeFileSync(file, result.nextContent, 'utf8'), result.nextContent) : current);

        if (result.changed) {
            modifiedFiles.push(rel);
            replacements += result.count
        }

        const lines = finalText.split('\n');

        for (let i = 0; i < lines.length; i++) {
            for (const match of lines[i].matchAll(CUSTOM_PROP_RE)) {
                if (entries.has(match[1])) {
                    remainingMatches.push({file: rel, line: i + 1, token: match[1]})
                }
            }
        }

        if (isMjs) {
            const
                stripped      = stripJsComments(finalText),
                strippedLines = stripped.split('\n');

            for (let i = 0; i < strippedLines.length; i++) {
                for (const match of strippedLines[i].matchAll(DYNAMIC_PROP_RE)) {
                    dynamicTemplates.push(`${rel}:${i + 1}: \`${match[1]}\``)
                }
            }

            for (const call of scanSetCssVariableCalls(finalText)) {
                if (call.kind === 'template' || call.kind === 'expression') {
                    dynamicTemplates.push(`${rel}:${call.line}: setCssVariable key ${call.raw}`)
                } else if (call.kind === 'literal' && !call.key.startsWith('--')) {
                    dashlessCalls.push(`${rel}:${call.line}: setCssVariable key '${call.key}'`);

                    if (entries.has('--' + call.key)) {
                        remainingMatches.push({file: rel, line: call.line, token: '--' + call.key + ' (dashless setCssVariable key)'})
                    }
                }
            }
        }
    }

    return {
        dashlessCalls,
        dynamicTemplates,
        modifiedFiles,
        remainingMatches,
        remainingOldCount: remainingMatches.length,
        replacements
    }
}

if (isEntryModule(import.meta.url)) {
    try {
        const
            {check, dryRun, jsonMode, mapPath, root, verifyTargetsFree} = parseCliArgs(process.argv.slice(2)),
            summary                                                     = runThemeVariableRename({check, dryRun, mapPath, root, verifyTargetsFree});

        if (jsonMode) {
            process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
        } else {
            console.log(`Modified files: ${summary.modifiedFiles.length} (${summary.replacements} replacement(s))`);
            console.log(`Remaining old names (.css, .html, .mjs, docs): ${summary.remainingOldCount}`);
            console.log(`Dynamic custom-property templates (.mjs): ${summary.dynamicTemplates.length}`);
            console.log(`Dashless setCssVariable keys (.mjs): ${summary.dashlessCalls.length}`);

            for (const item of summary.dynamicTemplates) {
                console.log(`  [dynamic] ${item}`)
            }

            for (const item of summary.dashlessCalls) {
                console.log(`  [dashless] ${item}`)
            }

            for (const hit of summary.remainingMatches.slice(0, 20)) {
                console.error(`  [remaining] ${hit.file}:${hit.line} ${hit.token}`)
            }
        }

        if (check && summary.remainingOldCount > 0) {
            process.exit(1)
        }
    } catch (err) {
        console.error(err?.message || String(err));
        process.exit(1)
    }
}
