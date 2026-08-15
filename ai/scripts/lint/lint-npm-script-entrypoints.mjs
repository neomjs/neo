#!/usr/bin/env node
import * as acorn      from 'acorn';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * @summary Proves every `ai:*` npm script entry pointing into `ai/scripts` resolves its static
 * relative imports — the dead-published-entrypoint guard.
 *
 * A script nobody runs cannot fail: a broken import surfaces only at invocation, and nothing
 * invokes a rotted entrypoint, so a published capability can sit dead behind a green board for
 * months (the `ai:build-kb-faqs` specimen — its import target moved in a service migration and
 * no surface reported it). This guard makes the failure reportable: for every `ai:*` script
 * whose command names a file under `ai/scripts`, the entry file must exist and every relative
 * specifier in its transitive static-import graph must resolve. Bare specifiers (`node:*`,
 * node_modules) are the runtime's concern, not this guard's; dynamic `import()` is out of scope
 * by construction (the contract is static resolvability).
 *
 * Discovery runs on the acorn parse tree, never text matching: a JSDoc example carrying
 * `import X from './placeholder.mjs'` is documentation, not an edge — regex discovery reds on
 * exactly those (measured on `src/Neo.mjs` and the tenant-source `_export.mjs` examples).
 *
 * Usage:
 *   node ai/scripts/lint/lint-npm-script-entrypoints.mjs [--root <repoRoot>]
 */

/**
 * The verdict surface: every glob whose changes can change this guard's verdict. Imported by the
 * scan-root parity registry as the SSOT — a widened scan widens here in the same edit, and an
 * unwidened workflow filter fails there.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['package.json', 'ai/**/*.mjs', 'src/**/*.mjs', 'buildScripts/**/*.mjs']);

/**
 * Reads the static relative specifiers of one module from its parse tree: `ImportDeclaration`
 * plus re-export forms (`ExportNamedDeclaration` / `ExportAllDeclaration` with a source).
 * Dynamic `import()` is an expression, never a declaration — excluded by construction.
 * @param {String} source Module source text.
 * @param {String} absPath File path (for parse-error context).
 * @returns {String[]} Relative specifiers (bare specifiers filtered out).
 */
export function readRelativeSpecifiers(source, absPath) {
    const specifiers = [];

    let tree;
    try {
        tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
    } catch (error) {
        throw new Error(`lint-npm-script-entrypoints: cannot parse ${absPath} — ${error.message}`);
    }

    for (const node of tree.body) {
        if (
            (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration')
            && typeof node.source?.value === 'string'
            && node.source.value.startsWith('.')
        ) {
            specifiers.push(node.source.value);
        }
    }

    return specifiers;
}

/**
 * Extracts the `ai:*` script entries whose command executes a file under `ai/scripts`.
 * Handles node flags before the path (`node --expose-gc ./ai/scripts/…`) and trailing args.
 * @param {Object<String,String>} scripts package.json `scripts`.
 * @returns {Array<{name: String, entry: String}>}
 */
export function extractEntrypoints(scripts) {
    const entries = [];

    for (const [name, command] of Object.entries(scripts ?? {})) {
        if (!name.startsWith('ai:')) continue;

        const match = String(command).match(/(?:^|\s)(\.\/ai\/scripts\/[^\s;&|'"]+\.mjs)/);

        if (match) {
            entries.push({name, entry: match[1]});
        }
    }

    return entries;
}

/**
 * Walks one entrypoint's transitive static relative-import graph and returns the unresolvable
 * edges. A shared `okCache` lets one CLI run skip subtrees already proven clean for an earlier
 * entry; files inside a broken subtree are never cached, so every entry that reaches a break
 * reports it.
 *
 * @param {Object}   options
 * @param {String}   options.entryFile Entry path relative to `rootDir`.
 * @param {String}   options.rootDir   Repository root.
 * @param {Set}      [options.okCache] Files whose subtree is already proven resolvable.
 * @param {Function} [options.readFile=fs.readFileSync] Injectable for specs.
 * @param {Function} [options.exists=fs.existsSync]     Injectable for specs.
 * @returns {String[]} Unresolvable edges, formatted for the report. Empty when clean.
 */
export function collectUnresolved({entryFile, rootDir, okCache = new Set(), readFile = fs.readFileSync, exists = fs.existsSync}) {
    const unresolved = [];
    const visiting   = new Set();

    const walk = absPath => {
        if (okCache.has(absPath) || visiting.has(absPath)) return;
        visiting.add(absPath);

        let source;
        try {
            source = readFile(absPath, 'utf8');
        } catch {
            unresolved.push(`${entryFile}: cannot read ${absPath}`);
            return;
        }

        const before = unresolved.length;
        let   specifiers;

        try {
            specifiers = readRelativeSpecifiers(source, absPath);
        } catch (error) {
            unresolved.push(`${entryFile}: ${error.message}`);
            return;
        }

        for (const specifier of specifiers) {
            const resolved  = path.resolve(path.dirname(absPath), specifier),
                  candidate = exists(resolved) ? resolved : exists(`${resolved}.mjs`) ? `${resolved}.mjs` : null;

            if (!candidate) {
                unresolved.push(`${entryFile}: ${absPath} imports unresolvable '${specifier}'`);
                continue;
            }

            if (candidate.endsWith('.mjs')) {
                walk(candidate);
            }
        }

        if (unresolved.length === before) {
            okCache.add(absPath);
        }
    };

    walk(path.resolve(rootDir, entryFile));

    return unresolved;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const args       = process.argv.slice(2),
          rootArg    = args.indexOf('--root'),
          rootDir    = rootArg === -1 ? process.cwd() : path.resolve(args[rootArg + 1]),
          pkg        = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')),
          entries    = extractEntrypoints(pkg.scripts),
          okCache    = new Set(),
          violations = [];

    for (const {entry} of entries) {
        violations.push(...collectUnresolved({entryFile: entry, rootDir, okCache}));
    }

    if (violations.length > 0) {
        console.error(`[lint-npm-script-entrypoints] FAILED — ${violations.length} unresolvable edge(s) across ${entries.length} ai:* entr(ies):`);
        for (const violation of violations) console.error(`  - ${violation}`);
        console.error('A published entrypoint that cannot load is a trap: it reads as a supported capability. Repair the import or retire the entry and its script together.');
        process.exit(1);
    }

    console.log(`[lint-npm-script-entrypoints] OK — ${entries.length} ai:* entr(ies) into ai/scripts, every static relative import resolvable.`);
}
