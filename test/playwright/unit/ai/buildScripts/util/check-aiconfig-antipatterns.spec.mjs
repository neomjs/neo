import {test, expect}                                                      from '@playwright/test';
import {findAntipatterns, filterAllowlistedHits, ALLOWLIST, ESCAPE_MARKER} from '../../../../../../buildScripts/util/check-aiconfig-antipatterns.mjs';
import {A1_IMPORT_GATE}                                                    from '../../../../../../buildScripts/util/check-aiconfig-antipatterns.mjs';
import {findDbPathMutations}                                               from '../../../../../../buildScripts/util/check-aiconfig-test-mutation.mjs';
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

    test('A1: an EXECUTABLE template interpolation flags — `${process.env.X}` runs; literal template text does not', () => {
        expect(findAntipatterns(importHeader + 'const url = `http://${process.env.NEO_HOST}/api`;\n').map(h => h.rule)).toEqual(['A1']);
        // mixed: literal env text stays masked while the interpolated read is code
        expect(findAntipatterns(importHeader + 'const s = `process.env.LITERAL and ${process.env.NEO_REAL}`;\n').map(h => h.rule)).toEqual(['A1'])
    });

    test('B3: a defensive hop inside a template interpolation flags (interpolations are code for every rule)', () => {
        expect(findAntipatterns('const t = `state: ${aiConfig?.load}`;\n').map(h => h.rule)).toEqual(['B3'])
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
    })
});

/**
 * Cross-consumer lexer matrix: the shared `codeMask` stacked state machine classifies for EVERY
 * rule reading it — B3/A5/A1 here plus B4 in the sibling checker — so each lexer fix is pinned
 * against both consumers (a fix proven on one can silently regress the other). Fixtures are the
 * verified cycle-4 falsifier classes: comment text inside a template interpolation (false-positive
 * class), nested executable interpolations (false-negative class), and a `}` inside comment or
 * regex text closing the expression frame early (false-negative class), plus the regex-literal and
 * multi-line-template semantics the state machine introduces.
 */
test.describe('shared codeMask lexer matrix (cross-consumer: B3/A5/A1 + B4)', () => {
    test('comment-only text inside an interpolation never flags — block and line comments, both consumers', () => {
        expect(findAntipatterns('const m = `${/* aiConfig?.x */ ok}`;')).toEqual([]);
        expect(findAntipatterns('const m = `${ ok // aiConfig?.x\n}`;')).toEqual([]);
        expect(findAntipatterns('const m = `${/* hasEnvValue("X") */ 1}`;')).toEqual([]);
        expect(findDbPathMutations('const m = `${/* aiConfig.storagePaths = p */ ok}`;')).toEqual([])
    });

    test('nested executable interpolations flag at any depth — both consumers', () => {
        expect(findAntipatterns('const m = `${`inner ${aiConfig?.load}`}`;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns('const m = `${`no config here`}`;')).toEqual([]);
        expect(findDbPathMutations('const m = `${`x ${aiConfig.storagePaths = p}`}`;').length).toBe(1)
    });

    test('a `}` inside comment or regex text cannot close the expression frame early — both consumers', () => {
        expect(findAntipatterns('const m = `${ x /* } */ + aiConfig?.load }`;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns("const m = `${ s.replace(/}/g, '') + aiConfig?.load }`;").map(h => h.rule)).toEqual(['B3']);
        expect(findDbPathMutations("const m = `${ s.replace(/}/g,'') + (aiConfig.storagePaths = p) }`;").length).toBe(1)
    });

    test('a regex-literal BODY is pattern text, not code; division stays code', () => {
        expect(findAntipatterns('const re = /aiConfig\\?\\./;')).toEqual([]);
        expect(findAntipatterns('const x = a / b; const y = aiConfig?.load;').map(h => h.rule)).toEqual(['B3'])
    });

    test('multi-line template TEXT masks as string across lines (carried frames)', () => {
        expect(findAntipatterns('const t = `\n  aiConfig?.load as prose\n`;\nconst z = 1;')).toEqual([]);
        expect(findDbPathMutations('const t = `\n  aiConfig.storagePaths = fake\n`;')).toEqual([])
    });

    test('A1 and A5 still see executable interpolated reads (cycle-3 pins preserved)', () => {
        const gated = "import {AiConfig} from './x.mjs';\nconst url = `${process.env.NEO_HOST}`;";

        expect(findAntipatterns(gated).map(h => h.rule)).toEqual(['A1']);
        expect(findAntipatterns('const m = `${hasEnvValue("X")}`;').map(h => h.rule)).toEqual(['A5'])
    });

    test('an escape marker on a template line skips hits without corrupting carried frames (B4 escape-order fix)', () => {
        const content = 'const t = `${a} aiconfig-mutation-ok ${b}`;\naiConfig.storagePaths = p;';

        expect(findDbPathMutations(content).map(h => h.line)).toEqual([2])
    })
});

/**
 * Transition-pair matrix (cycle-5): a shared lexer needs coverage where CARRIED context changes the
 * meaning of the next character — open-state × next-line-first-token, and grammar-context × slash —
 * not only isolated token classes. Fixtures are the verified cycle-5 falsifier pairs: a line-final
 * backslash escapes the LINE TERMINATOR (consumes no next-line char, so a column-zero closing
 * delimiter must be processed), and slash classification must be correct on BOTH sides of the
 * expression boundary (a control-header `)` admits a regex; an expression-ending quote/backtick
 * demands division). Every fixture is valid JavaScript with a REAL violation in the suffix — the
 * false-negative direction, which is the dangerous one for an enforcement mask.
 */
test.describe('shared codeMask lexer matrix — transition pairs (continuation + slash grammar)', () => {
    test('line-final backslash continues the literal and consumes NO next-line character — all consumers', () => {
        expect(findAntipatterns('const t = `foo\\\n`; const x = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns("const s = 'foo\\\n'; hasEnvValue('X');").map(h => h.rule)).toEqual(['A5']);
        expect(findDbPathMutations('const t = `foo\\\n`; aiConfig.storagePaths = p;').length).toBe(1)
    });

    test('a continuation line closing mid-line keeps text as string and suffix as code', () => {
        const hits = findAntipatterns("const s = 'aiConfig?.load\\\nstill text'; const bad = aiConfig?.load;");

        expect(hits.map(h => ({rule: h.rule, line: h.line}))).toEqual([{rule: 'B3', line: 2}])
    });

    test('a regex after a control-statement header keeps its body masked and its suffix executable', () => {
        expect(findAntipatterns('if (ok) /text/.test(s); const x = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        // Pattern text is never code — even when the pattern tail is a non-identifier char (the
        // shape whose closing slash previously opened a fake regex and swallowed the suffix).
        expect(findAntipatterns('if (ok) /aiConfig\\?\\./.test(s); const y = aiConfig?.load;').length).toBe(1);
        expect(findDbPathMutations("while (x) /}/.exec(s); aiConfig.storagePaths = p;").length).toBe(1)
    });

    test('a slash after an expression-ending quoted or template literal is division, not a regex opener', () => {
        expect(findAntipatterns('const q = "x" / 2; const bad = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        expect(findDbPathMutations('const q = `x` / 2; aiConfig.storagePaths = p;').length).toBe(1);
        expect(findAntipatterns('import {AiConfig} from "./x.mjs";\nconst q = "x" / 2, DB = process.env.NEO_X;').map(h => h.rule)).toEqual(['A1'])
    });

    test('a call/grouping paren still yields division; nested control headers resolve via the paren stack', () => {
        expect(findAntipatterns('foo(a) / b; const x = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns('if (a(b)) /re/.test(s); const y = aiConfig?.load;').map(h => h.rule)).toEqual(['B3'])
    });

    test('grammar-set completeness: throw, for-await and else-if admit a regex; plain await-paren stays division', () => {
        expect(findAntipatterns('function f() { throw /x\\./ ; } const y = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        expect(findDbPathMutations('function f() { throw /x\\./ ; } aiConfig.storagePaths = p;').length).toBe(1);
        expect(findAntipatterns('async function g(s) { for await (const c of s) /x\\./.test(c); } const y = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        // Whitespace never resets the word buffer, so multi-word headers arrive concatenated —
        // the self-found sibling of the reviewer's for-await case.
        expect(findAntipatterns('if (a) {} else if (b) /x\\./.test(s); const y = aiConfig?.load;').map(h => h.rule)).toEqual(['B3']);
        expect(findAntipatterns('async function h(x) { const q = await (x) / 2; } const y = aiConfig?.load;').map(h => h.rule)).toEqual(['B3'])
    })
});
