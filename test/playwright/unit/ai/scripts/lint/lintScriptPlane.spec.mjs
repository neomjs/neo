import {expect, test} from '@playwright/test';

import {auditScript, lintScriptPlanes}                                 from '../../../../../../ai/scripts/lint/lint-script-plane.mjs';
import {classifyPlane, headerRegion, readDeclaredPlane, stripComments} from '../../../../../../ai/scripts/lint/scriptSource.mjs';

/**
 * A script's execution plane decides whether it is usable at all — a client topology has no host
 * shell and no Docker socket — and `ai/scripts` names its directories after the VERB, so the plane
 * was previously discoverable only by opening the file.
 *
 * The guard is a comparator, not a convention: the declaration is read from the COMMENTS and the
 * evidence from the CODE, and those two texts are disjoint by construction. These arms exist to
 * prove the comparison actually fires, that it fires for the right reason, and that it does NOT
 * fire on the two shapes that made the naive detector convict correct files.
 */

const file = 'ai/scripts/maintenance/probe.mjs';

const script = (header, body='export const x = 1;\n') => `/**\n * @summary probe.\n${header}\n */\n${body}`;

test.describe('lint-script-plane — declaration vs dependency comparator (#16929)', () => {
    test('a script with NO declaration fails, and the message prescribes the two legal values', () => {
        const finding = auditScript({file, content: '/**\n * @summary probe.\n */\nexport const x = 1;\n'});

        expect(finding.rule).toBe('MISSING_TAG');
        expect(finding.message).toContain('@plane host');
        expect(finding.message).toContain('@plane in-plane');
    });

    test('a declaration of in-plane contradicted by a host dependency FAILS, quoting the evidence', () => {
        const finding = auditScript({
            file,
            content: script(' * @plane in-plane', "import {execSync} from 'child_process';\n")
        });

        expect(finding.rule).toBe('CONTRADICTION');
        expect(finding.message).toContain("imports 'child_process'");
    });

    test('NON-VACUITY — a correct host script and a correct in-plane script both pass', () => {
        // Without this arm a lint that rejected every script would go green on both arms above.
        expect(auditScript({
            file,
            content: script(' * @plane host', "import {execSync} from 'child_process';\n")
        })).toBeNull();

        expect(auditScript({
            file,
            content: script(' * @plane in-plane', 'export const pure = 1;\n')
        })).toBeNull();
    });

    test('ASYMMETRY — a host declaration is NOT refuted by plane imports', () => {
        // Only one direction is checkable. An operator-run script may legitimately import plane
        // modules and reach services over the network, so `host` + plane evidence must pass.
        // Measured on the corpus: 15 scripts shell out to docker AND import a plane module —
        // `backup.mjs` imports a config module only to learn WHICH container to act on. Enforcing
        // the symmetric rule would fail every one of them.
        expect(auditScript({
            file,
            content: script(' * @plane host', "import cfg from '../../mcp/server/knowledge-base/config.mjs';\nimport {execSync} from 'child_process';\n")
        })).toBeNull();
    });

    test('PROSE IS NOT EVIDENCE — a comment mentioning compose cannot convict a file', () => {
        // `maintenance/restore.mjs` mentions `compose` twice, both times in a JSDoc paragraph about
        // bind-mount paths. The pre-comment-strip detector classified it host on that basis alone.
        const content = `/**\n * @summary probe.\n * Paths are relative to the compose project directory, so a docker run elsewhere differs.\n * @plane in-plane\n */\nexport const x = 1;\n`;

        expect(auditScript({file, content})).toBeNull();
    });

    test('A SIBLING SCRIPT IS NOT A PLANE MODULE — imports are resolved, never substring-matched', () => {
        // `./mcpHealthcheck.mjs` is a sibling SCRIPT; a naive `mcp` substring test read it as an
        // in-plane service import and manufactured a dual-plane category that does not exist.
        const {plane} = classifyPlane({
            file: 'ai/scripts/diagnostics/probe.mjs',
            code: "import {readToolJson} from './mcpHealthcheck.mjs';",
            cwd : process.cwd()
        });

        expect(plane).toBeNull();
    });

    test('the declaration must live in the file header, not on the first function', () => {
        // The run of comments before the first code line includes the first FUNCTION's JSDoc. A
        // reader bounded only by "before any code" accepts a file-level declaration parked on
        // median() — and cannot report what it is willing to accept.
        const content = '/**\n * @summary probe.\n */\n\n/**\n * Median.\n * @plane in-plane\n */\nexport function median() {}\n';

        expect(auditScript({file, content}).rule).toBe('MISSING_TAG');
    });

    test('two conflicting declarations fail as CONFLICTING_TAG, never silently pick one', () => {
        const content = '/**\n * @plane host\n * @plane in-plane\n */\nexport const x = 1;\n';

        expect(auditScript({file, content}).rule).toBe('CONFLICTING_TAG');
    });

    test('an unrecognised value is INVALID_TAG — there is no third plane to fall back on', () => {
        // `either` is deliberately illegal: it would become the default nobody argues with and the
        // comparator would lose its teeth.
        const finding = auditScript({file, content: script(' * @plane either')});

        expect(finding.rule).toBe('INVALID_TAG');
        expect(finding.message).toContain('either');
    });

    test('a script that DOCUMENTS the tag does not thereby declare it', () => {
        // lint-script-plane.mjs prints both legal values in its own help text and flagged itself as
        // self-contradictory until the search was bounded to the header block.
        const content = `/**\n * @summary probe.\n * @plane in-plane\n */\nconsole.log('use @plane host or @plane in-plane');\n`;

        expect(auditScript({file, content})).toBeNull();
        expect(readDeclaredPlane(content, file).plane).toBe('in-plane');
    });

    test('the shebang does not end the header region', () => {
        const content = '#!/usr/bin/env node\n/**\n * @plane host\n */\nexport const x = 1;\n';

        expect(headerRegion(content, file)).toContain('@plane host');
        expect(auditScript({file, content})).toBeNull();
    });

    test('COVERAGE — every script in the live tree declares a plane and none is contradicted', () => {
        // The population is read from the filesystem, not a registry, so a newly added script is in
        // scope the moment it exists and cannot pass by being missing from a list.
        const {findings, scanned, declared} = lintScriptPlanes({cwd: process.cwd()});

        expect(findings).toEqual([]);
        expect(declared).toBe(scanned);
        expect(scanned).toBeGreaterThan(100);
    });

    test('stripComments removes comment text while preserving line structure', () => {
        // countCodeLoc in structureMap.mjs now counts non-blank lines of this output, so a stripper
        // that collapsed lines would silently change every LOC number in the map.
        const stripped = stripComments('const a = 1; // trailing\n/* block */\nconst b = 2;\n', 'x.mjs');

        expect(stripped.split('\n').length).toBe(4);
        expect(stripped).toContain('const a = 1;');
        expect(stripped).not.toContain('trailing');
    });
});
