#!/usr/bin/env node
/**
 * @module buildScripts/util/rename-theme-variables
 * @summary Applies the canonical custom-property rename map (`theme-variable-renames.json`)
 * across stylesheets, `.html` fixtures, `.mjs` modules/specs, and `learn`/`apps`/`examples` Markdown docs,
 * reports dynamic `--...${...}` templates and dashless `setCssVariable` calls, and verifies zero old names remain.
 *
 * Designed to run idempotently on both `neomjs/neo` and sibling repositories:
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
    DOC_ROOT_DIRS  = new Set(['apps', 'examples', 'learn']),
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
    TARGET_EXTS          = new Set(['.css', '.html', '.mjs', '.scss']),
    CUSTOM_PROP_RE       = /(?<![<!A-Za-z0-9_-])(--[A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g,
    DYNAMIC_PROP_RE      = /`[^`]*?(?<![A-Za-z0-9_$}])(--[A-Za-z0-9_-]*\$\{[^`\n]+)`/g,
    SET_CSS_VAR_CALL_RE  = /\bsetCssVariable\s*\(\s*\{([^}]*)\}/gs,
    SET_CSS_VAR_KEY_RE   = /\bkey\s*:\s*(?:(['"`])([^'"`]+)\1|([^,\n}]+))/,
    DASHLESS_REWRITE_RE  = /(\bsetCssVariable\s*\(\s*\{[^}]*?\bkey\s*:\s*)(['"`])([A-Za-z][A-Za-z0-9_-]*)\2/gs;

/**
 * @summary Collects target files under `root`: all `.css`, `.html`, `.mjs`, and `.scss` files plus
 * `.md` files under `learn/`, `apps/`, and `examples/`, skipping generated/ignored directories and the map itself.
 * @param {String} root
 * @param {String} resolvedMapPath
 * @returns {String[]}
 */
export function collectTargetFiles(root, resolvedMapPath) {
    const results = [];

    function walk(currentDir, inDocTree) {
        if (!fs.existsSync(currentDir)) return;

        const dirEntries = fs.readdirSync(currentDir, {withFileTypes: true})
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of dirEntries) {
            if (entry.isSymbolicLink()) continue;

            const
                full = path.join(currentDir, entry.name),
                rel  = path.relative(root, full).replaceAll('\\', '/');

            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name)) continue;
                if (rel === 'docs/output') continue;

                walk(full, inDocTree || DOC_ROOT_DIRS.has(rel));
                continue
            }

            if (path.resolve(full) === resolvedMapPath) continue;

            const ext = path.extname(entry.name);

            if (TARGET_EXTS.has(ext) || (inDocTree && ext === '.md')) {
                results.push(full)
            }
        }
    }

    walk(root, false);

    return results
}

/**
 * @summary Loads and validates a rename-map JSON file (`{rules, entries}`). When `options.root` is supplied,
 * also verifies that every target custom property in the map is free across target files under `options.root`.
 * @param {String} [mapPath=defaultMapPath]
 * @param {Object} [options={}]
 * @param {String} [options.root] Optional repository root to check for pre-existing target collisions.
 * @returns {{entries: Map<String, {to: String, rule: String, reason?: String}>, rules: Object<String, String>}}
 */
export function loadRenameMap(mapPath = defaultMapPath, {root} = {}) {
    const
        resolvedMapPath = path.resolve(mapPath),
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

    if (root) {
        const
            resolvedRoot = path.resolve(root),
            files        = collectTargetFiles(resolvedRoot, resolvedMapPath);

        for (const file of files) {
            const
                rel   = path.relative(resolvedRoot, file).replaceAll('\\', '/'),
                lines = fs.readFileSync(file, 'utf8').split('\n');

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
        }
    }

    return {entries, rules}
}

/**
 * @summary Replaces exact `--old-name` custom-property tokens (and dashless `setCssVariable({key: 'old-name'})`
 * calls in `.mjs` files) in `content` using `entries`.
 * @param {String} content
 * @param {Map<String, {to: String}>} entries
 * @param {Boolean} [isMjs=false]
 * @returns {{changed: Boolean, count: Number, nextContent: String}}
 */
export function rewriteContent(content, entries, isMjs = false) {
    let count = 0;

    let nextContent = content.replace(CUSTOM_PROP_RE, (full, token) => {
        const mapped = entries.get(token);

        if (!mapped) {
            return full
        }

        count++;
        return mapped.to
    });

    if (isMjs) {
        nextContent = nextContent.replace(DASHLESS_REWRITE_RE, (full, prefix, quote, bareKey) => {
            const mapped = entries.get(`--${bareKey}`);

            if (!mapped) {
                return full
            }

            count++;
            return `${prefix}${quote}${mapped.to.slice(2)}${quote}`
        })
    }

    return {
        changed: nextContent !== content,
        count,
        nextContent
    }
}

/**
 * @summary Runs the theme-variable rename (or check/dry-run) over `root`.
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
        resolvedRoot     = path.resolve(root),
        resolvedMapPath  = path.resolve(mapPath),
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

            for (const callMatch of stripped.matchAll(SET_CSS_VAR_CALL_RE)) {
                const
                    keyMatch = callMatch[1].match(SET_CSS_VAR_KEY_RE),
                    line     = stripped.slice(0, callMatch.index).split('\n').length;

                if (!keyMatch) continue;

                const
                    literalKey = keyMatch[2],
                    exprKey    = keyMatch[3]?.trim();

                if (literalKey !== undefined) {
                    if (literalKey.includes('${')) {
                        dynamicTemplates.push(`${rel}:${line}: setCssVariable key \`${literalKey}\``)
                    } else if (!literalKey.startsWith('--')) {
                        dashlessCalls.push(`${rel}:${line}: setCssVariable key '${literalKey}'`);

                        if (entries.has(`--${literalKey}`)) {
                            remainingMatches.push({file: rel, line, token: `--${literalKey} (dashless setCssVariable key)`})
                        }
                    }
                } else if (exprKey) {
                    dynamicTemplates.push(`${rel}:${line}: setCssVariable key ${exprKey}`)
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
    const
        args              = process.argv.slice(2),
        rootIdx           = args.indexOf('--root'),
        mapIdx            = args.indexOf('--map'),
        check             = args.includes('--check'),
        dryRun            = args.includes('--dry-run'),
        verifyTargetsFree = args.includes('--verify-targets-free'),
        jsonMode          = args.includes('--json');

    if ((rootIdx !== -1 && !args[rootIdx + 1]) || (mapIdx !== -1 && !args[mapIdx + 1])) {
        console.error('Usage: rename-theme-variables.mjs [--root <dir>] [--map <file>] [--dry-run] [--check] [--verify-targets-free] [--json]');
        process.exit(1)
    }

    const
        root    = rootIdx === -1 ? defaultRoot    : path.resolve(args[rootIdx + 1]),
        mapPath = mapIdx  === -1 ? defaultMapPath : path.resolve(args[mapIdx + 1]),
        summary = runThemeVariableRename({check, dryRun, mapPath, root, verifyTargetsFree});

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
}
