import {test, expect}                                                                      from '@playwright/test';
import {spawnSync}                                                                         from 'node:child_process';
import {existsSync, mkdirSync, rmSync, writeFileSync}                                      from 'node:fs';
import path                                                                                from 'node:path';
import process                                                                             from 'node:process';
import {fileURLToPath}                                                                     from 'node:url';
import {findDbPathMutations, findCloneCaptures, scanFileContent, ALLOWLIST, ESCAPE_MARKER} from '../../../../../../buildScripts/util/check-aiconfig-test-mutation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/**
 * Self-test for the Class-A DB-path AiConfig test-mutation guard: the mechanical enforcement of the
 * B4 safety-critical rule — a test must never mutate the shared AiConfig DB paths (the orphan-bleed
 * class). Verifies it flags true DB-path assignments, exempts comparisons / capture-reads /
 * config-varying (Class B) leaves / non-config roots / string + comment context, and honors the
 * inline escape marker.
 */
test.describe('check-aiconfig-test-mutation guard', () => {
    test('flags storagePaths / database / collections / logPath assignments', () => {
        expect(findDbPathMutations('aiConfig.storagePaths.graph = testPath;').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations("aiConfig.engines.chroma.database = `graph-${process.pid}`;").map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('aiConfig.collections.memory = name;').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('aiConfig.data.logPath = tmpLogDir;').map(h => h.line)).toEqual([1])
    });

    test('flags the Memory_Config root and an SDK-prefixed root', () => {
        expect(findDbPathMutations('Memory_Config.data.collections = {};').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('SDK.Memory_Config.data.storagePaths.graph = p;').map(h => h.line)).toEqual([1])
    });

    test('flags a restore-write (restore is itself a B4 mutation)', () => {
        expect(findDbPathMutations('aiConfig.storagePaths.graph = originalGraphPath;').map(h => h.line)).toEqual([1])
    });

    test('flags string-literal bracket access to a dangerous leaf (closes the bypass)', () => {
        expect(findDbPathMutations('aiConfig["storagePaths"].graph = testPath;').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations("aiConfig['engines']['chroma']['database'] = name;").map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('Memory_Config.data["collections"] = {};').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('aiConfig.storagePaths["graph"] = testPath;').map(h => h.line)).toEqual([1])
    });

    // ───────── the root is matched by SHAPE, not by two literal names ─────────

    test('flags the PascalCase root — the approved rename must not silently retire this gate', () => {
        // The reason this exists: the anchor was `(?:aiConfig|Memory_Config)`, case-sensitive, while an
        // approved sweep normalizes 1,526 occurrences across 198 files to `AiConfig`. After that sweep the
        // old pattern matched NOTHING, and the sweep's own AC read "this lint must stay green" — green
        // because inert. A fail-build B4 guard retired by a refactor that certified it as success.
        expect(findDbPathMutations('AiConfig.storagePaths.graph = dbPath;').map(hit => hit.line)).toEqual([1]);
        expect(findDbPathMutations("AiConfig['storagePaths'].graph = dbPath;").map(hit => hit.line)).toEqual([1]);
        expect(findDbPathMutations("AiConfig.collections.memory = 'x';").map(hit => hit.line)).toEqual([1])
    });

    test('flags an ALIASED config root — a rename of the binding is not an escape hatch', () => {
        // Measured before the fix: three spec files (14 occurrences) mutated Class-A leaves through
        // aliases like these and were invisible to a fail-build guard.
        expect(findDbPathMutations('mailboxAiConfig.storagePaths.graph = dbPath;').map(hit => hit.line)).toEqual([1]);
        expect(findDbPathMutations("mirrorAiConfig.collections.memory = 'x';").map(hit => hit.line)).toEqual([1]);
        expect(findDbPathMutations("MC_Config.data.collections.memory = 'test-x';").map(hit => hit.line)).toEqual([1])
    });

    test('does NOT flag `aiConfigDefaults` — the trailing boundary preserves prior behaviour', () => {
        // The separate TIER1 defaults module is a distinct identifier: `Config` does not END the name, so
        // the root boundary refuses it exactly as the narrower pattern did.
        expect(findDbPathMutations('aiConfigDefaults.storagePaths.graph = x;')).toEqual([]);
        expect(findDbPathMutations('aiConfigDefaults.collections.memory = x;')).toEqual([])
    });

    test('a `$`-leading config root is flagged — the grammar advertises `$` and the boundary must honour it', () => {
        // @neo-gpt-emmy's exact-head finding: the root grammar allows a leading `$`, but a `\\b` boundary
        // cannot sit before `$` (a non-word char), so `$Config.storagePaths.graph = x` evaded a pattern that
        // claimed to match it. The lookbehind/lookahead boundary closes that divergence — these are all VALID
        // JavaScript, unlike the reverted optional-chaining specimen.
        expect(findDbPathMutations('$Config.storagePaths.graph = x;').map(hit => hit.line)).toEqual([1]);
        expect(findDbPathMutations('$aiConfig.storagePaths.graph = x;').map(hit => hit.line)).toEqual([1]);
        // The boundary still refuses a `...ConfigX` identifier (Config not at the end) and the defaults module.
        expect(findDbPathMutations('mailboxAiConfigX.storagePaths.graph = x;')).toEqual([]);
        expect(findDbPathMutations('aiConfigDefaults.storagePaths.graph = x;')).toEqual([])
    });

    test('a bare `Config` identifier is not a config root', () => {
        // The shape requires at least one character before `Config`, so the word alone cannot anchor a match
        // and a stray `Config.database = x` in unrelated code stays out of the gate.
        expect(findDbPathMutations('Config.database = x;')).toEqual([])
    });

    test('does NOT flag a computed (non-literal) key — out of a static lint reach, by design', () => {
        expect(findDbPathMutations('aiConfig[dbKey] = fakeDb;')).toEqual([]);
        expect(findDbPathMutations('aiConfig[leafName].graph = p;')).toEqual([]);
        // a Class-B leaf via bracket stays out of scope too (transport is not a DB-path leaf)
        expect(findDbPathMutations('aiConfig["transport"] = "streamable-http";')).toEqual([])
    });

    test('does NOT flag a comparison (=== / ==)', () => {
        expect(findDbPathMutations('if (aiConfig.storagePaths.graph === testPath) doThing();')).toEqual([]);
        expect(findDbPathMutations('expect(aiConfig.collections.memory == name).toBe(true);')).toEqual([])
    });

    test('does NOT flag a capture-read (DB path on the RHS)', () => {
        expect(findDbPathMutations('const originalGraphPath = aiConfig.storagePaths.graph;')).toEqual([]);
        expect(findDbPathMutations('const db = aiConfig.engines.chroma.database;')).toEqual([])
    });

    test('does NOT flag a config-VARYING (Class B) leaf — out of scope', () => {
        expect(findDbPathMutations('aiConfig.openAiCompatible.unloadRetryCount = 3;')).toEqual([]);
        expect(findDbPathMutations('aiConfig.transport = "streamable-http";')).toEqual([]);
        expect(findDbPathMutations('SDK.Memory_Config.data.embeddingProvider = "openAiCompatible";')).toEqual([])
    });

    test('does NOT flag a non-config root with a same-named leaf', () => {
        expect(findDbPathMutations('myService.database = fakeDb;')).toEqual([]);
        expect(findDbPathMutations('record.collections = [];')).toEqual([])
    });

    test('does NOT flag a leaf whose name merely starts with a dangerous token', () => {
        expect(findDbPathMutations('aiConfig.collectionsCount = 5;')).toEqual([]);
        expect(findDbPathMutations('aiConfig.databaseUrl = url;')).toEqual([])
    });

    test('does NOT flag a mutation that lives inside a string literal', () => {
        expect(findDbPathMutations("const sample = 'aiConfig.storagePaths.graph = x';")).toEqual([]);
        expect(findDbPathMutations('log(`set aiConfig.collections.memory = ${name}`);')).toEqual([])
    });

    test('does NOT flag a mutation inside a // line or /* block */ comment', () => {
        expect(findDbPathMutations('// aiConfig.storagePaths.graph = x (legacy note)')).toEqual([]);
        expect(findDbPathMutations([
            '/**',
            ' * aiConfig.engines.chroma.database = foo — described, not executed.',
            ' */',
            'const x = 1;'
        ].join('\n'))).toEqual([])
    });

    test('honors the inline escape marker on a genuinely unavoidable line', () => {
        expect(findDbPathMutations(`aiConfig.storagePaths.graph = p; // ${ESCAPE_MARKER}: legacy shim, migrates in #12435`)).toEqual([])
    });

    /*
     * The RESTORE-CAPTURE rule. Orthogonal to Class-A: Class-A asks which LEAF a test writes, this
     * asks whether the UNDO can work at all.
     *
     * The target was chosen by measurement, not by shape-reasoning. One direct leaf write on a live
     * `AiConfig` node, restored four ways:
     *
     *   spread `{...node}` + `Object.assign`       -> restored
     *   spread `{...node}` + `restoreConfigObject` -> restored
     *   `Neo.clone(node)`  + `Object.assign`       -> NOT restored
     *   `Neo.clone(node)`  + `restoreConfigObject` -> NOT restored
     *
     * The restore idiom is innocent in both columns, so the pattern anchors on the CAPTURE and stays
     * indifferent to whatever restores from it. Two earlier readings of this defect — "a zero-key
     * clone" and "`Object.assign` cannot undo a leaf write" — are both retracted; the clone carries
     * the key and carries the WRONG VALUE (the unresolved default).
     */
    test('RESTORE-CAPTURE: flags a Neo.clone of a config node, at any path depth', () => {
        expect(findCloneCaptures('const saved = Neo.clone(AiConfig.orchestrator.deploymentStateBridge, true, true);').map(h => h.line)).toEqual([1]);
        expect(findCloneCaptures('const saved = Neo.clone(aiConfig);').map(h => h.line)).toEqual([1]);
        expect(findCloneCaptures('const saved = Neo.clone( AiConfig.data );').map(h => h.line)).toEqual([1])
    });

    test('RESTORE-CAPTURE: flags an ALIASED config root — renaming the binding is not an escape hatch', () => {
        expect(findCloneCaptures('const saved = Neo.clone(mailboxAiConfig.storagePaths);').map(h => h.line)).toEqual([1]);
        expect(findCloneCaptures('const saved = Neo.clone(Memory_Config.data);').map(h => h.line)).toEqual([1])
    });

    test('RESTORE-CAPTURE: does NOT flag a clone of a non-config value', () => {
        expect(findCloneCaptures('const copy = Neo.clone(plainThing);')).toEqual([]);
        expect(findCloneCaptures('const copy = Neo.clone(record, true, true);')).toEqual([])
    });

    test('RESTORE-CAPTURE: does NOT flag `aiConfigDefaults` — the trailing boundary matches Class-A', () => {
        expect(findCloneCaptures('const copy = Neo.clone(aiConfigDefaults);')).toEqual([])
    });

    test('RESTORE-CAPTURE: does NOT flag the sanctioned resolved-value primitive', () => {
        expect(findCloneCaptures('const saved = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);')).toEqual([])
    });

    test('RESTORE-CAPTURE: string + comment context is not code', () => {
        expect(findCloneCaptures("const doc = 'Neo.clone(AiConfig.orchestrator.mlx)';")).toEqual([]);
        expect(findCloneCaptures('// Neo.clone(AiConfig.orchestrator.lms) was the old idiom')).toEqual([]);
        expect(findCloneCaptures('/* Neo.clone(AiConfig.data) */')).toEqual([])
    });

    test('RESTORE-CAPTURE: honors the inline escape marker', () => {
        expect(findCloneCaptures(`const saved = Neo.clone(AiConfig.data); // ${ESCAPE_MARKER}: asserting the clone's own behaviour`)).toEqual([])
    });

    /*
     * CLI-level, because both properties below live in `main()` and neither is observable from the
     * exported predicates. Fixtures are written under `test/` — the checker only scans paths that
     * start with it — with a non-`.spec.mjs` name so the runner never collects them.
     */
    test('the allowlist exempts Class-A ONLY — a listed file is still scanned for restore-captures', () => {
        const file    = 'test/playwright/unit/whatever.spec.mjs',
              content = [
                  'const saved = Neo.clone(AiConfig.orchestrator.deploymentStateBridge, true, true);',
                  'aiConfig.storagePaths.graph = testPath;'
              ].join('\n');

        // Not listed: both rules fire.
        const unlisted = scanFileContent(file, content, {allowlist: new Set()});
        expect(unlisted.dbPathHits.map(h => h.line)).toEqual([2]);
        expect(unlisted.cloneHits.map(h => h.line)).toEqual([1]);

        // Listed: the stated Class-A exemption applies and NOTHING else does. An allowlist entry buys
        // the exemption it argued for, not a blanket bypass on a rule its rationale never mentions.
        const listed = scanFileContent(file, content, {allowlist: new Set([file])});
        expect(listed.dbPathHits).toEqual([]);
        expect(listed.cloneHits.map(h => h.line)).toEqual([1])
    });

    test('CLI: a restore-capture alone fails the build (a gate must fail, not merely describe)', () => {
        const checkerPath = path.join(repoRoot, 'buildScripts/util/check-aiconfig-test-mutation.mjs'),
              fixtureDir  = path.join(repoRoot, `test/.tmp-restore-capture-${process.pid}`);

        mkdirSync(fixtureDir, {recursive: true});

        const fixture    = path.join(fixtureDir, 'fixture.mjs'),
              relFixture = path.relative(repoRoot, fixture).split(path.sep).join('/');

        try {
            // Clone-capture ONLY — no Class-A DB-path leaf anywhere in this fixture, so the exit code
            // can only come from the new rule.
            writeFileSync(fixture, 'const saved = Neo.clone(AiConfig.orchestrator.deploymentStateBridge, true, true);\n');

            const result = spawnSync(process.execPath, [checkerPath, relFixture], {cwd: repoRoot, encoding: 'utf-8'});

            expect(result.status, 'a restore-capture-only violation must fail the build').toBe(1);
            expect(result.stderr).toContain('restore capture');
            expect(result.stdout).not.toContain('0 new violations')
        } finally {
            rmSync(fixtureDir, {recursive: true, force: true});
        }
    });

    test('every allowlist entry names a file that still exists (a stale entry is a silent licence)', () => {
        /*
         * This deliberately does NOT pin a member path. The predecessor did — it named one specific
         * grandfathered spec — so the burndown that retired that entry turned the guard's own self-test
         * red for the one reason that is not a defect: the burndown working. A pinned member is the
         * same point-in-time figure the B4 row itself stopped carrying, and it re-breaks on every
         * future burndown step.
         *
         * What the checker's own header asserts is the contract worth testing: this is a
         * justified-exception set, and "the gate stops counting a file the moment it is listed". So an
         * entry that outlives its file is a silent exemption on a path nothing can reach again — the
         * exact residue a burndown leaves if it deletes the file and forgets the entry.
         *
         * Sunset: when the set reaches empty, the exemption branch in the checker has no consumer left
         * — retire the mechanism and this test together rather than relaxing the bound below.
         */
        expect(ALLOWLIST.size).toBeGreaterThan(0);

        expect([...ALLOWLIST].filter(entry => !existsSync(path.join(repoRoot, entry)))).toEqual([])
    });

    /*
     * These pin the classes the predecessor character scanner provably misread — each measured
     * against an acorn oracle over 1911 files before the swap, not imagined. The swap itself was
     * proven behaviour-preserving (0 verdict deltas at all 156 real pattern sites; both checkers
     * byte-identical on the live 844 + 548 file scan), so what follows is the delta that was WORTH
     * having: the classes that were latent, not live.
     */
    test('MASK: a mutation inside a MULTI-LINE template literal is string text, not code', () => {
        // The scanner's `inString` was function-local, so it reset at every newline: line 2 of a
        // template read as executable code and this FLAGGED — a false positive on a documented
        // GraphQL/SQL block. `ai/services/github-workflow/queries/issueQueries.mjs` alone carries
        // ~19,884 characters the scanner misclassified this way.
        expect(findDbPathMutations([
            'const doc = `',
            '  aiConfig.storagePaths.graph = "/tmp/x"',
            '`;'
        ].join('\n'))).toEqual([])
    });

    test('MASK: the executable interior of a ${...} interpolation IS code', () => {
        // The complement of the pin above, and the reason "treat templates as opaque strings" is not
        // a fix: `${...}` executes. The quasi text around it stays string text.
        expect(findDbPathMutations('const x = `${aiConfig.storagePaths.graph = p}`;').map(h => h.line)).toEqual([1])
    });

    test('MASK: a regex literal containing a quote no longer desyncs the rest of its line', () => {
        // THE SAFETY-CRITICAL DIRECTION. The scanner saw the `'` inside `/["']/` as a string opener
        // and never closed it, so everything after on that line masked as string — a real Class-A
        // mutation went SILENTLY UNFLAGGED. A missed B4 is the orphan-bleed mechanism, which is the
        // whole reason this guard exists. (Same-line only: the scanner's per-line reset contained
        // the desync to its own line — which is why a two-line specimen does NOT reproduce it.)
        expect(findDbPathMutations('const re = /["\']/; aiConfig.database = 1;').map(h => h.line)).toEqual([1]);
        // division after a literal must not be mistaken for a regex opening and swallow the suffix
        expect(findDbPathMutations('const half = total / 2; aiConfig.collections.memory = name;').map(h => h.line)).toEqual([1])
    });

    test('MASK: the escape marker cannot corrupt classification of the lines after it', () => {
        // `findDbPathMutations` returns BEFORE calling the mask on an escape-marker line. With the
        // scanner's hand-carried `inBlock`, that skip meant an escape marker on a line that OPENS a
        // block comment left the state stale — and the commented-out mutation below FLAGGED. Using
        // the escape valve corrupted the guard. The whole-file parse deletes the class: comment
        // continuity is a property of the parse now, so no consumer can break it by skipping.
        expect(findDbPathMutations([
            `const a = 1; /* ${ESCAPE_MARKER}: legacy block below`,
            'aiConfig.database = 1;',
            '*/'
        ].join('\n'))).toEqual([])
    });

    test('MASK: a regex in a for-await statement position is a REGEX, not two divisions', () => {
        // @neo-gpt-emmy's falsifier, and it killed my headline claim. I shipped this mask on
        // `acorn.tokenizer`, which is NOT parser-informed: with no grammar context it cannot resolve
        // the slash ambiguity and reads `/re/` here as two division operators — so the regex's
        // CONTENT masks as code. That is corpus class 7 (`throw` / `for await` regex-preceding
        // contexts), one of the eight I claimed vanish "by construction". A tokenizer eliminates the
        // classes that need lexing; only the PARSER eliminates the ones that need grammar.
        //
        // Verified: standalone tokenizer emits `/` `/` at 45-46, 48-49; `parse({onToken})` emits one
        // `regexp` at 45-49. The fix is `acorn.parse`, not a bigger table.
        expect(findDbPathMutations('async function f(){ for await (const x of y) /aiConfig.database = 1/.test(x); }')).toEqual([]);
        // the complement: a REAL mutation after such a regex must still flag — the fix must not go blind
        expect(findDbPathMutations('async function f(){ for await (const x of y) /re/.test(x); aiConfig.database = 1; }').map(h => h.line)).toEqual([1])
    });

    test('MASK: an unparseable file fails CLOSED — it over-reports, never silently greens', () => {
        // The branch that matters most and is easiest to get backwards. A file that cannot be
        // tokenized (mid-edit, or a syntax this acorn cannot read) must not mask to all-string: a
        // guard reporting clean because it could not READ the code is the worst failure available to
        // a safety-critical backstop. All-code is the conservative direction.
        //
        // The specimen must be LEXICALLY broken, not grammatically: `acorn.tokenizer` only lexes, so
        // `const x = {{{ ;` tokenizes happily as punctuators and would exercise nothing. An
        // unterminated string is the realistic mid-edit case that actually throws.
        expect(findDbPathMutations([
            'const s = "unterminated',
            'aiConfig.database = 1;'
        ].join('\n')).map(h => h.line)).toEqual([2])
    })
});
