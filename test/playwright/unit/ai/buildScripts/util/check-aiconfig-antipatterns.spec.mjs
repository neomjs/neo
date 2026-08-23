import {test, expect}                                                      from '@playwright/test';
import {findAntipatterns, filterAllowlistedHits, ALLOWLIST, ESCAPE_MARKER} from '../../../../../../buildScripts/util/check-aiconfig-antipatterns.mjs';
import {A1_IMPORT_GATE}                                                    from '../../../../../../buildScripts/util/check-aiconfig-antipatterns.mjs';
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
        // A5 has zero live occurrences — an entry ever appearing here is a regression, not a grandfather
        expect(ALLOWLIST.A5.size).toBe(0)
    });

    test('a repaired file is REMOVED from the grandfather, so the exception cannot outlive its hit', () => {
        // `roadmapPlanner.mjs` was grandfathered for a `Memory_Config?.data?.…` cascade that no longer
        // exists — the file now reads the resolved leaves directly. A grandfather entry whose hit is
        // gone is not inert: it silently re-admits the exact regression it was recording, with CI green.
        expect(ALLOWLIST.B3.has('ai/scripts/runners/roadmapPlanner.mjs')).toBe(false);

        // Census assertion rather than a name list, so a future repair that forgets to shrink the set
        // fails here instead of quietly widening the exemption surface.
        expect([...ALLOWLIST.B3].sort()).toEqual([
            'ai/mcp/server/BaseServer.mjs',
            'ai/mcp/server/shared/logger.mjs'
        ])
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

/**
 * Coverage for the A1 two-signal rule — module-level env re-derivation flags ONLY in files that
 * import the config SSOT. The negatives are the load-bearing half: the C1-sanctioned pure-defaults
 * module (env literals, NO config import) and function-local env reads must stay green, or the
 * lint would fight the very shape the design prescribes for non-entrypoint helpers.
 */
test.describe('check-aiconfig-antipatterns guard — A1 module-level env re-derivation (two-signal)', () => {
    const importHeader = "import AiConfig from '../ConfigProvider.mjs';\n";

    test('A1: flags a module-level re-derivation when the file imports the config SSOT', () => {
        const content = importHeader + "const DB_PATH = process.env.NEO_DB_PATH || path.join(root, 'db');\n";

        expect(findAntipatterns(content).map(h => h.rule)).toEqual(['A1'])
    });

    test('A1: the Neo.ai.Config runtime root also opens the gate', () => {
        const content = "const cfg = Neo.ai.Config;\nlet cacheDir = process.env.NEO_CACHE_DIR ?? cfg.cacheDir;\n";

        expect(findAntipatterns(content).map(h => h.rule)).toEqual(['A1'])
    });

    test('A1: a comment-only config-root mention never opens the gate (config templates document their realm)', () => {
        const content = "// Loads the Tier-1 realm root (Neo.ai.Config) so getParent() inheritance resolves.\nconst dataDir = process.env.NEO_AI_DAEMON_DIR || './data';\n";

        expect(findAntipatterns(content)).toEqual([])
    });

    test('A1: a multi-line import block carrying the config token opens the gate (the line-grep blind spot)', () => {
        const content = "import {\n    AiConfig,\n    other\n} from '../services.mjs';\nconst port = Number(process.env.NEO_FLEET_PORT) || 8083;\n";

        expect(findAntipatterns(content).map(h => h.rule)).toEqual(['A1'])
    });

    test('A1: the C1-sanctioned pure-defaults module (NO config import) never flags', () => {
        const content = "const DEFAULT_DB_PATH = process.env.NEO_DB_PATH || './data/db';\nexport {DEFAULT_DB_PATH};\n";

        expect(A1_IMPORT_GATE.test(content)).toBe(false);
        expect(findAntipatterns(content)).toEqual([])
    });

    test('A1: function-local env reads never flag (module-level anchoring)', () => {
        const content = importHeader + "function resolve() {\n    const port = process.env.NEO_PORT || 3000;\n    return port\n}\n";

        expect(findAntipatterns(content)).toEqual([])
    });

    test('A1: an env token inside a STRING on a real declaration line never flags (classify the token, not the declaration)', () => {
        expect(findAntipatterns(importHeader + "const msg = 'reads process.env.PATH at boot';\n")).toEqual([]);
        expect(findAntipatterns(importHeader + 'const doc = "set process.env.NEO_PORT before running";\n')).toEqual([]);
        expect(findAntipatterns(importHeader + 'const note = `about process.env.NEO_X`;\n')).toEqual([]);
        expect(findAntipatterns(importHeader + 'const x = compute(); /* process.env.NEO_Y */\n')).toEqual([])
    });

    test('A1: an escape marker on the IMPORT/gate line exempts only that line — other declarations still flag', () => {
        const content = importHeader.trimEnd() + ` // ${ESCAPE_MARKER}: gate-line note\n` +
            "const P = process.env.NEO_P || 'x';\n";

        expect(findAntipatterns(content).map(h => h.rule)).toEqual(['A1'])
    });

    test('A1: comment and string occurrences never flag; the escape marker is honored', () => {
        const commented = importHeader + "// const DB_PATH = process.env.NEO_DB_PATH || fallback;\n";
        const escaped   = importHeader + `const BOOT_FLAG = process.env.NEO_BOOT_FLAG; // ${ESCAPE_MARKER}: bootstrap boundary, reads before the provider exists\n`;

        expect(findAntipatterns(commented)).toEqual([]);
        expect(findAntipatterns(escaped)).toEqual([])
    });

    test('A1: an env read inside a template interpolation FLAGS — the documented boundary, flipped', () => {
        // This pin was authored as a negative with an explicit flip condition: it would flip to a
        // positive once the shared mask became parser-grade. That landed, so the boundary is gone
        // rather than documented.
        //
        // Why it was ever invisible: A1 matches the code-only PROJECTION, and the scanner treated a
        // whole template literal as opaque string text — so `process.env.` was replaced by spaces
        // before the regex ever ran. It could not match what the mask had erased. The tokenizer
        // reports `tt.template` for the QUASI text only, so the interior of `${...}` stays code by
        // construction and the read is exactly as visible as an unwrapped one — which is the truth:
        // `${process.env.X}` executes.
        expect(findAntipatterns(importHeader + 'const url = `${process.env.NEO_HOST}`;\n').map(h => h.rule)).toEqual(['A1'])
    });

    test('A1: the flip does NOT come at the cost of the string/comment exemption', () => {
        // The flip is only honest if it moved the boundary rather than the floor. A parser that
        // called everything code would "flip" this pin too — and silently start flagging every spec
        // title and log message that quotes the pattern. These are the same two exemptions the
        // scanner earned, re-proven against the tokenizer: a mention is not a read.
        expect(findAntipatterns(importHeader + 'const msg = "const x = process.env.NEO_HOST";\n')).toEqual([]);
        expect(findAntipatterns(importHeader + '// const x = process.env.NEO_HOST\n')).toEqual([]);
        // and the quasi TEXT of a template is still string text — only the interpolation is code
        expect(findAntipatterns(importHeader + 'const msg = `const x = process.env.NEO_HOST`;\n')).toEqual([])
    });

    test('A1: rule-scoped grandfathering — the wake daemon is exempt for A1 only, and A1 stays independent of B3/A5 sets', () => {
        const content = importHeader + "const DB_PATH = process.env.NEO_DB_PATH || './db';\nif (hasEnvValue('NEO_X')) { run(); }\n";
        const hits    = findAntipatterns(content);

        expect(hits.map(h => h.rule).sort()).toEqual(['A1', 'A5']);
        expect(filterAllowlistedHits(hits, 'ai/daemons/wake/daemon.mjs').map(h => h.rule)).toEqual(['A5']);
        expect(filterAllowlistedHits(hits, 'ai/services/fresh/NewService.mjs').map(h => h.rule).sort()).toEqual(['A1', 'A5']);
        expect(ALLOWLIST.A1.has('ai/daemons/wake/daemon.mjs')).toBe(true)
    });

    test('A1 CLI regression: an import-gated module-level re-derivation in a fresh ai/ file exits non-zero', () => {
        const tmpFile = path.join(repoRoot, `ai/.a1-rederivation-regression-${process.pid}.mjs`);

        try {
            fs.writeFileSync(tmpFile, "import AiConfig from './ConfigProvider.mjs';\nconst DB_PATH = process.env.NEO_DB_PATH || './db';\n", 'utf-8');

            const result = spawnSync(process.execPath, [checkerPath, tmpFile], {
                cwd     : repoRoot,
                encoding: 'utf-8'
            });

            expect(result.status).toBe(1);
            expect(result.stderr).toContain('[A1]')
        } finally {
            fs.rmSync(tmpFile, {force: true})
        }
    });

    /*
     * A1 classifies against the code-only PROJECTION, which is built by walking the line and asking
     * the mask about each position. The mask and acorn's token offsets both count UTF-16 code UNITS;
     * `Array.from(line, (ch, i) => mask[i])` walks code POINTS. An astral character (emoji, rare CJK)
     * is ONE code point but TWO code units, so every lookup after it read the mask one slot early and
     * the projection silently desynced from the truth it was projecting.
     *
     * These are @neo-gpt-emmy's specimens, not mine, and that distinction is the point: my own astral
     * specimen used a STRING, where the shift landed code-on-code and the pattern survived it — it
     * passed against the BROKEN mask too, so it discriminated nothing. Hers puts the astral char in a
     * COMMENT immediately before real code, which is where the shift actually crosses a mask
     * boundary. I asked for it rather than pin a witness that proves the fix exists instead of that
     * it works.
     */
    const astralHeader = 'import AiConfig from "../ConfigProvider.mjs";\n';

    test('A1 astral FN direction: an emoji COMMENT never hides the real env read behind it', () => {
        expect(findAntipatterns(astralHeader + 'const DB_PATH = /*😀*/process.env.NEO_DB_PATH || fallback;\n').map(hit => hit.rule)).toEqual(['A1'])
    });

    test('A1 astral FP direction: an emoji never drags a quoted pattern into code', () => {
        // in a string …
        expect(findAntipatterns(astralHeader + 'const note = "😀 process.env.NEO_DB_PATH";\n')).toEqual([]);
        // … and in a comment
        expect(findAntipatterns(astralHeader + '/*😀 process.env.NEO_DB_PATH*/ const ok = true;\n')).toEqual([])
    })
});

/**
 * @summary Red-proofs rule PLANE-ROOT — a plane path re-derived from the module's own `__dirname`.
 *
 * The template-literal arm is the load-bearing one. The census that produced this rule reported
 * seven sites and its own stated ceiling was *"a string-target test will not catch a plane path
 * assembled from a variable"* — the eighth site, `inflightLock.mjs`, is exactly that shape, so the
 * caveat had a live inhabitant. A predicate that only handles quoted literals ships with a
 * documented blind spot that is already occupied.
 */
test.describe('PLANE-ROOT — __dirname-derived plane roots', () => {
    const a6 = source => findAntipatterns(source).filter(hit => hit.rule === 'PLANE-ROOT');

    test('the rule id does not collide with ADR-0019 §3 Group A, which already spends A1-A9', () => {
        // `A6` is `leaf+formula duplication` in the catalog. A lint rule reusing that letter-number
        // for a different pattern gives the shared vocabulary two meanings.
        const ids = findAntipatterns("const p = path.resolve(__dirname, '../.neo-ai-data/x');").map(hit => hit.rule);

        expect(ids).toContain('PLANE-ROOT');
        expect(ids.some(id => /^A[0-9]+$/.test(id))).toBe(false)
    });

    test('a STRING-literal plane target fires', () => {
        expect(a6("const dir = path.resolve(__dirname, '../../../.neo-ai-data/harness-state');")).toHaveLength(1)
    });

    test('a TEMPLATE-literal plane target fires — the shape a string-only predicate misses', () => {
        const source = 'return path.resolve(__dirname, `../../../.neo-ai-data/wake-daemon/inflight-${mode}-${id}.txt`);';

        expect(a6(source)).toHaveLength(1)
    });

    test('interpolation containing a CALL still fires — the target scan must not stop at a paren', () => {
        const source = 'const p = path.resolve(__dirname, `../../.neo-ai-data/x-${slug(name)}.json`);';

        expect(a6(source)).toHaveLength(1)
    });

    test('`path.join` fires as well as `path.resolve`', () => {
        expect(a6("const p = path.join(__dirname, '../.neo-ai-data/concepts');")).toHaveLength(1)
    });

    test('the nullable-override shape fires — an UNSET override forks exactly like no override', () => {
        const source = "const dir = Service.defaultDir || path.resolve(__dirname, '../../../.neo-ai-data/concepts');";

        expect(a6(source)).toHaveLength(1)
    });

    test('a JSDoc/comment mention never fires — the target token is masked, the call token is not', () => {
        expect(a6(" * resolves a `__dirname`-relative `<repoRoot>/.neo-ai-data/fleet/repos` default")).toEqual([]);
        expect(a6("// path.resolve(__dirname, '../../.neo-ai-data/concepts') is the shape we are removing")).toEqual([])
    });

    test('a `.neo-ai-data` path NOT anchored on __dirname never fires — an injected root is the sanctioned shape', () => {
        expect(a6("const p = path.resolve(injectedRoot, '.neo-ai-data/sqlite/graph.sqlite');")).toEqual([])
    });

    test('a __dirname path that is NOT a plane target never fires — content roots fork a corpus, not the plane', () => {
        expect(a6("const p = path.resolve(__dirname, '../../../resources/content/issues');")).toEqual([])
    });

    test('the escape marker exempts a line, as it does for every other rule', () => {
        const source = `const p = path.resolve(__dirname, '../.neo-ai-data/x'); // ${ESCAPE_MARKER}`;

        expect(a6(source)).toEqual([])
    });

    test('POSITIVE CONTROL: the allowlist is a migration ledger that currently silences all eight live sites, and nothing else', () => {
        const sites = [...ALLOWLIST['PLANE-ROOT']];

        expect(sites).toHaveLength(8);

        // Every ledger entry must still be a REAL hit at head. An entry whose site was already
        // fixed silences a slot nobody is watching — the ledger has to shrink by deletion, not rot.
        for (const site of sites) {
            const hits = a6(fs.readFileSync(path.join(repoRoot, site), 'utf8'));

            expect(hits.length, `${site} is on the PLANE-ROOT ledger but no longer matches — delete the entry`).toBeGreaterThan(0);
            expect(filterAllowlistedHits(hits, site)).toEqual([])
        }
    });

    test('an unlisted file with the same shape is NOT silenced — the ledger is per-file, not a global mute', () => {
        const hits = a6("const p = path.resolve(__dirname, '../.neo-ai-data/concepts');");

        expect(filterAllowlistedHits(hits, 'ai/services/SomeNewService.mjs')).toHaveLength(1)
    })
});
