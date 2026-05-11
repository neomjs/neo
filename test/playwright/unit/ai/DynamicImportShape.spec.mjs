import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DynamicImportShapeTest'
    }
});

import {test, expect}     from '@playwright/test';
import {parse}            from 'acorn';
import fs                 from 'node:fs/promises';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../..');

async function listMjsFiles(dir) {
    const out = [];

    for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            out.push(...await listMjsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
            out.push(fullPath);
        }
    }

    return out;
}

function hasDefaultBinding(pattern) {
    return pattern?.type === 'ObjectPattern' && pattern.properties.some(property => {
        const key = property.key;
        return (key?.type === 'Identifier' && key.name === 'default') ||
            (key?.type === 'Literal' && key.value === 'default');
    });
}

function isDefaultBoundaryImport(ancestors) {
    const
        parent      = ancestors.at(-1),
        grandparent = ancestors.at(-2);

    if (parent?.type !== 'AwaitExpression') {
        return false;
    }

    if (grandparent?.type === 'MemberExpression') {
        return grandparent.property?.type === 'Identifier' && grandparent.property.name === 'default';
    }

    if (grandparent?.type === 'VariableDeclarator') {
        return hasDefaultBinding(grandparent.id);
    }

    return false;
}

function walk(node, visitor, ancestors = []) {
    if (!node || typeof node.type !== 'string') {
        return;
    }

    visitor(node, ancestors);

    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'range') {
            continue;
        }

        if (Array.isArray(value)) {
            value.forEach(child => walk(child, visitor, [...ancestors, node]));
        } else if (value && typeof value.type === 'string') {
            walk(value, visitor, [...ancestors, node]);
        }
    }
}

function findFsExtraDynamicImportViolations(source, filePath) {
    const ast = parse(source, {
        allowHashBang: true,
        ecmaVersion  : 'latest',
        locations    : true,
        sourceType   : 'module'
    });

    const violations = [];

    walk(ast, (node, ancestors) => {
        if (node.type === 'ImportExpression' && node.source?.value === 'fs-extra' && !isDefaultBoundaryImport(ancestors)) {
            violations.push(`${path.relative(repoRoot, filePath)}:${node.loc.start.line}`);
        }
    });

    return violations;
}

/**
 * @summary Regression coverage for #11204 dynamic ESM import shape boundaries.
 *
 * Node's `await import('fs-extra')` returns a module namespace wrapper. Some helpers are mirrored
 * as named exports while inherited/native fs methods, e.g. `createWriteStream`, only live on
 * `default`. This pins the runtime shape and statically guards AI-side dynamic call sites from
 * consuming the wrapper directly.
 */
test.describe('AI dynamic ESM import shape (#11204)', () => {
    test('fs-extra dynamic import returns a wrapper; default is the runtime API', async () => {
        const fsExtraModule = await import('fs-extra');

        expect(fsExtraModule.default).toBeTruthy();
        expect(typeof fsExtraModule.pathExists).toBe('function');
        expect(fsExtraModule.pathExists).toBe(fsExtraModule.default.pathExists);
        expect(fsExtraModule.createWriteStream).toBeUndefined();
        expect(typeof fsExtraModule.default.createWriteStream).toBe('function');
    });

    test('AI-side fs-extra dynamic imports unwrap the default boundary', async () => {
        const files = await listMjsFiles(path.join(repoRoot, 'ai'));
        const violations = [];

        for (const filePath of files) {
            const source = await fs.readFile(filePath, 'utf8');
            violations.push(...findFsExtraDynamicImportViolations(source, filePath));
        }

        expect(violations).toEqual([]);
    });
});
