import {test, expect}  from '@playwright/test';
import fs              from 'node:fs/promises';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const ENTRY           = path.join(REPO_ROOT, 'ai/daemons/wake/receiver.mjs');
const FORBIDDEN_PATHS = [
    '/ai/graph/',
    '/ai/daemons/wake/queries.mjs',
    '/ai/services/memory-core/GraphService.mjs',
    '/ai/mcp/server/memory-core/config.mjs',
    '/ai/mcp/server/memory-core/config.template.mjs'
];

/**
 * @summary Resolves the receiver's transitive repo-local ESM import closure.
 * @param {String} filePath
 * @param {Set<String>} [seen]
 * @returns {Promise<Set<String>>}
 */
async function resolveClosure(filePath, seen = new Set()) {
    if (seen.has(filePath)) return seen;
    seen.add(filePath);

    const source  = await fs.readFile(filePath, 'utf8');
    const imports = [
        ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
    ].map(match => match[1]);

    for (const specifier of imports) {
        if (specifier === 'better-sqlite3') {
            seen.add(specifier);
        } else if (specifier.startsWith('.')) {
            const resolved = path.resolve(path.dirname(filePath), specifier);
            if (resolved.startsWith(REPO_ROOT + path.sep)) await resolveClosure(resolved, seen);
        }
    }

    return seen;
}

test('signed host receiver dependency closure is graphless and SQLite-free', async () => {
    const closure    = await resolveClosure(ENTRY);
    const normalized = [...closure].map(value => value.replaceAll(path.sep, '/'));

    expect(normalized).not.toContain('better-sqlite3');
    for (const forbidden of FORBIDDEN_PATHS) {
        expect(normalized.some(value => value.includes(forbidden))).toBe(false);
    }
});
