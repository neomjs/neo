import {test, expect}                                                      from '@playwright/test';
import {findAntipatterns, filterAllowlistedHits, ALLOWLIST, ESCAPE_MARKER} from '../../../../../../buildScripts/util/check-aiconfig-antipatterns.mjs';
import {spawnSync}                                                         from 'node:child_process';
import fs                                                                  from 'node:fs';
import path                                                                from 'node:path';
import process                                                             from 'node:process';
import {fileURLToPath}                                                     from 'node:url';

const
    __dirname   = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot    = path.resolve(__dirname, '../../../../../..'),
    checkerPath = path.join(repoRoot, 'buildScripts/util/check-aiconfig-antipatterns.mjs');

/**
 * Self-test for the AiConfig antipattern guard: the mechanical enforcement of B3 (defensive
 * optional-chaining on an AiConfig read — the SSOT guarantees the tree, so a `?.` converts a broken
 * tree into a silently-travelling `undefined`) and A5 (a `hasEnvValue` helper re-implementing the
 * env-resolution `leaf(default, env, type)` owns). Verifies it flags defensive hops at any path
 * depth on the config roots, exempts clean reads / non-config roots / string + comment context, and
 * honors the inline escape marker plus the census-seeded grandfather allowlist.
 */
test.describe('check-aiconfig-antipatterns guard', () => {
    test('B3: flags a defensive hop directly on a config root', () => {
        expect(findAntipatterns('if (!this.configFile || !this.aiConfig?.load) return;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns('const mode = AiConfig?.auth;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns("const host = Memory_Config?.data?.openAiCompatible?.host || 'x';").map(h => h.rule)).toEqual(['B3'])
    });

    test('B3: flags a defensive hop deeper in the access path (the rubber-stamped review-miss shape)', () => {
        expect(findAntipatterns('await aiConfig?.validateRequiredEnv();').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns('const mode = aiConfig.auth?.mode;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns('const dir = AiConfig.engines.chroma?.dataDir;').map(h => h.rule)).toEqual(['B3'])
    });

    test('B3: does NOT flag a clean fail-loud read (the sanctioned form)', () => {
        expect(findAntipatterns('const dir = AiConfig.engines.chroma.dataDir;')).toEqual([]);
        expect(findAntipatterns('deploymentMode: AiConfig.orchestrator.deploymentMode,')).toEqual([]);
        expect(findAntipatterns('return aiConfig.data;')).toEqual([])
    });

    test('B3: does NOT flag non-config roots or boundary-adjacent identifiers', () => {
        expect(findAntipatterns('const x = myConfig?.value;')).toEqual([]);
        expect(findAntipatterns('const y = aiConfigStub?.data;')).toEqual([]);
        expect(findAntipatterns('const z = snapshotAiConfigState?.graph;')).toEqual([]);
        expect(findAntipatterns('options.retry?.count && run();')).toEqual([])
    });

    test('B3: does NOT flag undefined-checks that fail loud by construction', () => {
        expect(findAntipatterns('const v = AiConfig.engines.port === undefined ? fallback : AiConfig.engines.port;')).toEqual([]);
        expect(findAntipatterns('if (aiConfig.auth.mode === null) throw new Error("unconfigured");')).toEqual([])
    });

    test('A5: flags a hasEnvValue helper call or declaration site', () => {
        expect(findAntipatterns("if (hasEnvValue('NEO_CHROMA_PORT')) { port = env(); }").map(h => h.rule)).toEqual(['A5']);
        expect(findAntipatterns('function hasEnvValue(name) { return name in process.env; }').map(h => h.rule)).toEqual(['A5'])
    });

    test('A5: does NOT flag a same-prefix identifier', () => {
        expect(findAntipatterns('const ok = hasEnvValues(names);')).toEqual([]);
        expect(findAntipatterns('const flag = env.hasEnvValueCache;')).toEqual([])
    });

    test('does NOT flag an occurrence inside a string literal', () => {
        expect(findAntipatterns("const sample = 'aiConfig?.load is the antipattern';")).toEqual([]);
        expect(findAntipatterns('log(`never write Memory_Config?.data — read the leaf`);')).toEqual([])
    });

    test('does NOT flag an occurrence inside a // line or /* block */ comment', () => {
        expect(findAntipatterns('// aiConfig?.load (legacy note, migrated)')).toEqual([]);
        expect(findAntipatterns([
            '/**',
            ' * A `?.` on an AiConfig read — e.g. aiConfig.auth?.mode — is the B3 antipattern.',
            ' */',
            'const x = 1;'
        ].join('\n'))).toEqual([])
    });

    test('reports the 1-based line number and one hit per line/rule', () => {
        const hits = findAntipatterns([
            "const clean = AiConfig.engines.chroma.dataDir;",
            "const bad   = aiConfig?.auth;",
            "if (hasEnvValue('NEO_X')) { aiConfig?.load(); }"
        ].join('\n'));

        expect(hits).toEqual([
            {line: 2, rule: 'B3', text: 'const bad   = aiConfig?.auth;'},
            {line: 3, rule: 'B3', text: "if (hasEnvValue('NEO_X')) { aiConfig?.load(); }"},
            {line: 3, rule: 'A5', text: "if (hasEnvValue('NEO_X')) { aiConfig?.load(); }"}
        ])
    });

    test('honors the inline escape marker on a genuinely unavoidable line', () => {
        expect(findAntipatterns(`const soft = aiConfig?.load; // ${ESCAPE_MARKER}: boot-order probe, migrates with the loader rework`)).toEqual([])
    });

    test('the grandfather allowlist is rule-scoped: B3 carries the census, A5 stays zero-baseline', () => {
        expect(ALLOWLIST.B3.size).toBeGreaterThan(0);
        expect(ALLOWLIST.B3.has('ai/mcp/server/BaseServer.mjs')).toBe(true);
        expect(ALLOWLIST.B3.has('ai/scripts/runners/roadmapPlanner.mjs')).toBe(true);
        // A5 has zero live occurrences — an entry ever appearing here is a regression, not a grandfather
        expect(ALLOWLIST.A5.size).toBe(0)
    })
});

/**
 * Coverage for the rule/allowlist composition — the seam a whole-file skip silently breaks: a file
 * grandfathered for B3 must still fail the build on an A5 occurrence (the reviewer's live CLI
 * falsifier on the first head). Pure-helper cases pin the per-HIT semantics; the spawned CLI case
 * pins the end-to-end exit code through the spec-only `--extra-b3-allowlist` seam.
 */
test.describe('check-aiconfig-antipatterns guard — rule-scoped allowlist composition', () => {
    const mixedContent = "const soft = aiConfig?.load;\nif (hasEnvValue('NEO_X')) { run(); }\n";

    test('a B3-grandfathered file still surfaces its A5 hit (per-HIT filtering, never per-FILE)', () => {
        const surviving = filterAllowlistedHits(findAntipatterns(mixedContent), 'ai/mcp/server/BaseServer.mjs');

        expect(surviving.map(hit => hit.rule)).toEqual(['A5'])
    });

    test('an unlisted file keeps every hit; a grandfathered file drops only its own rule', () => {
        const hits = findAntipatterns(mixedContent);

        expect(filterAllowlistedHits(hits, 'ai/services/fresh/NewService.mjs').map(hit => hit.rule)).toEqual(['B3', 'A5']);
        expect(filterAllowlistedHits(hits, 'ai/mcp/server/shared/logger.mjs').map(hit => hit.rule)).toEqual(['A5'])
    });

    test('CLI regression: an A5 occurrence in a B3-allowlisted path exits non-zero', () => {
        const tmpFile = path.join(repoRoot, `ai/.a5-composition-regression-${process.pid}.mjs`);

        try {
            fs.writeFileSync(tmpFile, mixedContent, 'utf-8');

            const result = spawnSync(process.execPath, [checkerPath, tmpFile, '--extra-b3-allowlist', tmpFile], {
                cwd     : repoRoot,
                encoding: 'utf-8'
            });

            expect(result.status).toBe(1);
            expect(result.stderr).toContain('[A5]');
            expect(result.stderr).not.toContain('[B3]')
        } finally {
            fs.rmSync(tmpFile, {force: true})
        }
    });

    test('CLI counter-case: the same grandfathered file with ONLY its B3 line exits zero', () => {
        const tmpFile = path.join(repoRoot, `ai/.b3-grandfather-regression-${process.pid}.mjs`);

        try {
            fs.writeFileSync(tmpFile, 'const soft = aiConfig?.load;\n', 'utf-8');

            const result = spawnSync(process.execPath, [checkerPath, tmpFile, '--extra-b3-allowlist', tmpFile], {
                cwd     : repoRoot,
                encoding: 'utf-8'
            });

            expect(result.status).toBe(0);
            expect(result.stdout).toContain('0 new violations')
        } finally {
            fs.rmSync(tmpFile, {force: true})
        }
    })
});
