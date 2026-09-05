#!/usr/bin/env node
import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Measures the static import closure of one or more entry modules — the modules a browser
 * would fetch before the entry runs — as a module count and a byte total.
 * @description Follows relative `import … from` and `export … from` specifiers only. A dynamic `import()`
 * is reported as a lazy boundary, never followed: that is what the walk exists to prove — a module that
 * must load on demand is absent from the closure, and a consumer's closure stays byte-identical when the
 * on-demand module is added. Bare specifiers (packages, node built-ins) are listed, not weighed.
 *
 * Usage: `node buildScripts/util/static-closure.mjs [--list] <entry.mjs> [...more entries]` from the
 * repository root. `--list` adds the closure's file list to the JSON output.
 */
const STATIC_RE  = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?)\s*from\s*['"]([^'"]+)['"]/g,
      SIDE_RE    = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
      DYNAMIC_RE = /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

/**
 * @param {String[]} entries Repo-relative entry paths
 * @param {String} root=process.cwd() The directory relative paths resolve against
 * @returns {{entries: String[], modules: Number, bytes: Number, kib: Number, bare: String[], dynamicTargets: String[], files: String[]}}
 */
export function measureClosure(entries, root=process.cwd()) {
    const seen    = new Map(),
          bare    = new Set(),
          dynamic = new Set();

    const walk = file => {
        const abs = path.resolve(root, file);

        if (seen.has(abs)) return;

        const source = fs.readFileSync(abs, 'utf8'),
              dir    = path.dirname(abs);

        seen.set(abs, Buffer.byteLength(source));

        for (const match of source.matchAll(DYNAMIC_RE)) {
            dynamic.add(path.relative(root, path.resolve(dir, match[1])))
        }

        for (const re of [STATIC_RE, SIDE_RE]) {
            for (const match of source.matchAll(re)) {
                const specifier = match[1];

                if (specifier.startsWith('.') || specifier.startsWith('/')) {
                    walk(path.resolve(dir, specifier))
                } else {
                    bare.add(specifier)
                }
            }
        }
    };

    entries.forEach(walk);

    const bytes = [...seen.values()].reduce((sum, size) => sum + size, 0);

    return {
        entries,
        modules       : seen.size,
        bytes,
        kib           : Math.round(bytes / 1024),
        bare          : [...bare].sort(),
        dynamicTargets: [...dynamic].sort(),
        files         : [...seen.keys()].map(file => path.relative(root, file)).sort()
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    const args    = process.argv.slice(2),
          list    = args.includes('--list'),
          entries = args.filter(arg => arg !== '--list');

    if (entries.length === 0) {
        console.error('Usage: node buildScripts/util/static-closure.mjs [--list] <entry.mjs> [...more]');
        process.exit(1)
    }

    const result = measureClosure(entries);

    if (!list) {
        delete result.files
    }

    console.log(JSON.stringify(result, null, 2))
}
