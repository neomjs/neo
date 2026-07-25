import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    collectConfigPathKindsFromSource,
    collectDeclaredConfigPaths,
    collectConfigPathKindsFromTemplate,
    collectDeclaredConfigPathsFromTemplate
} from '../../../../../../ai/scripts/lint/lint-config-template-ssot.mjs';

const repoRoot = process.cwd();

/**
 * @summary The template + sibling-base union, old text-scan form (mirrors the lint's own
 * `getConfigPathKindsForTemplate` composition, which is not exported).
 * @param {String} templatePath Absolute template path.
 * @returns {{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}}
 */
function oldUnionKinds(templatePath) {
    const kinds    = collectConfigPathKindsFromSource(fs.readFileSync(templatePath, 'utf8')),
          basePath = path.join(path.dirname(templatePath), 'configBase.mjs');

    if (path.basename(templatePath) !== 'configBase.mjs' && fs.existsSync(basePath)) {
        const baseKinds  = collectConfigPathKindsFromSource(fs.readFileSync(basePath, 'utf8')),
              classified = p => kinds.primitiveLeafPaths.has(p) || kinds.liveProxyPaths.has(p);

        baseKinds.primitiveLeafPaths.forEach(p => {classified(p) || kinds.primitiveLeafPaths.add(p)});
        baseKinds.liveProxyPaths.forEach(p => {classified(p) || kinds.liveProxyPaths.add(p)});
    }

    return kinds
}

/**
 * @summary The template + sibling-base union, new resolved-tree form.
 * @param {String} templatePath Absolute template path.
 * @returns {Promise<{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>}
 */
async function newUnionKinds(templatePath) {
    const kinds    = await collectConfigPathKindsFromTemplate(templatePath),
          basePath = path.join(path.dirname(templatePath), 'configBase.mjs');

    if (path.basename(templatePath) !== 'configBase.mjs' && fs.existsSync(basePath)) {
        const baseKinds  = await collectConfigPathKindsFromTemplate(basePath),
              classified = p => kinds.primitiveLeafPaths.has(p) || kinds.liveProxyPaths.has(p);

        baseKinds.primitiveLeafPaths.forEach(p => {classified(p) || kinds.primitiveLeafPaths.add(p)});
        baseKinds.liveProxyPaths.forEach(p => {classified(p) || kinds.liveProxyPaths.add(p)});
    }

    return kinds
}

function templatesUnderTest() {
    const servers = fs.readdirSync(path.join(repoRoot, 'ai/mcp/server'), {withFileTypes: true})
        .filter(entry => entry.isDirectory() &&
            fs.existsSync(path.join(repoRoot, 'ai/mcp/server', entry.name, 'config.template.mjs')))
        .map(entry => path.join(repoRoot, 'ai/mcp/server', entry.name, 'config.template.mjs'));

    return [path.join(repoRoot, 'ai/config.template.mjs'), ...servers]
}

/**
 * @summary Zero-delta proof for the config-parity collector swap.
 *
 * The old collector is a line scan whose entire path grammar is `name: leaf(` / `name: {` — any
 * other declaration form (a descriptor factory) silently leaves the declared set while the
 * resolved tree stays correct: green specs, blinded gate. The new collector walks the config
 * class's own static `config.data` tree, so declaration *form* is irrelevant. Before any caller
 * migrates, this suite proves the two collectors agree on the live tree: per template, per kind
 * set, zero deltas — and pins the three-variant fixture (inline / inlined-literals / factory)
 * where only the factory form divides them.
 */
test.describe('config-parity collector: resolved-tree proof', () => {
    test('zero path-set deltas between the text scan and the tree walk, per template', async () => {
        const deltas = [];

        for (const templatePath of templatesUnderTest()) {
            const oldPaths = collectDeclaredConfigPaths(templatePath),
                  newPaths = await collectDeclaredConfigPathsFromTemplate(templatePath),
                  rel      = path.relative(repoRoot, templatePath),
                  onlyOld  = oldPaths.filter(p => !newPaths.includes(p)),
                  onlyNew  = newPaths.filter(p => !oldPaths.includes(p));

            if (onlyOld.length || onlyNew.length) {
                deltas.push(`${rel}: old-only=[${onlyOld}] new-only=[${onlyNew}]`)
            }
        }

        expect(deltas, `collector disagreement:\n${deltas.join('\n')}`).toEqual([])
    });

    test('zero KIND deltas between the text scan and the tree walk, per template', async () => {
        const deltas = [];

        for (const templatePath of templatesUnderTest()) {
            const oldKinds = oldUnionKinds(templatePath),
                  newKinds = await newUnionKinds(templatePath),
                  rel      = path.relative(repoRoot, templatePath);

            for (const [kind, oldSet, newSet] of [
                ['primitiveLeafPaths', oldKinds.primitiveLeafPaths, newKinds.primitiveLeafPaths],
                ['liveProxyPaths',     oldKinds.liveProxyPaths,     newKinds.liveProxyPaths]
            ]) {
                const onlyOld = [...oldSet].filter(p => !newSet.has(p)),
                      onlyNew = [...newSet].filter(p => !oldSet.has(p));

                if (onlyOld.length || onlyNew.length) {
                    deltas.push(`${rel} ${kind}: old-only=[${onlyOld}] new-only=[${onlyNew}]`)
                }
            }
        }

        expect(deltas, `kind disagreement:\n${deltas.join('\n')}`).toEqual([])
    });

    test('three-variant fixture: inline and inlined-literals read identically in both collectors; only the factory form divides them', async () => {
        const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-proof-')),
              variants = {
                  // Variant A: imported literals, inline subtree (today's shape).
                  a: `export default {config: {
                      data: {
                          plane: {
                              id      : {default: 'neo-local-canonical', env: 'NEO_PLANE_ID', type: 'string', parse: null},
                              dataRoot: {default: '/x/.neo-ai-data', env: 'NEO_PLANE_DATA_ROOT', type: 'string', parse: null}
                          }
                      }
                  }}`,
                  // Variant C: the SAME subtree built by a call — the form the line scan cannot see.
                  c: `const descriptors = () => ({
                          id      : {default: 'neo-local-canonical', env: 'NEO_PLANE_ID', type: 'string', parse: null},
                          dataRoot: {default: '/x/.neo-ai-data', env: 'NEO_PLANE_DATA_ROOT', type: 'string', parse: null}
                      });
                      export default {config: {
                      data: {
                          plane: descriptors()
                      }
                  }}`
              },
              expectedPaths = ['plane', 'plane.dataRoot', 'plane.id'];

        try {
            const results = {};

            for (const [name, source] of Object.entries(variants)) {
                const file = path.join(tmpDir, `variant-${name}.mjs`);

                fs.writeFileSync(file, source);
                results[name] = {
                    old: collectConfigPathKindsFromSource(source),
                    new: await collectConfigPathKindsFromTemplate(file)
                };
            }

            // Variant A: both collectors see the full subtree.
            for (const kinds of [results.a.old, results.a.new]) {
                expect([...kinds.primitiveLeafPaths, ...kinds.liveProxyPaths].sort()).toEqual(expectedPaths)
            }

            // Variant C: the text scan sees NOTHING (the historical blind spot)…
            expect(results.c.old.primitiveLeafPaths.size + results.c.old.liveProxyPaths.size).toBe(0);
            // …and the tree walk sees the full subtree (the fix).
            expect([...results.c.new.primitiveLeafPaths, ...results.c.new.liveProxyPaths].sort()).toEqual(expectedPaths)
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true})
        }
    });
});
