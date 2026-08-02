import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    census,
    censusServer,
    isDefectRow
} from '../../../../../../ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs';

/**
 * @summary The lint gate for the silent-degradation bug class: any MCP operation whose handler
 * signature mismatches its dispatch mode (class 2 destructure-under-positional, class 2M
 * annotation-mismatch, class 3 truncation) fails this suite. The classifier, the taxonomy, and
 * the resolver shapes are pinned in `test/playwright/unit/ai/scripts/diagnostics/`; this spec is
 * the GATE — it runs the census over the live tree and asserts the verdict, so a future operation
 * that re-introduces the class fails at PR time instead of being found by hand weeks later.
 *
 * Suspects do not fail the gate: ambiguity stays human-judged by design, and a gate that cries on
 * "I cannot tell" trains contributors to dismiss it. Unresolvable bindings DO fail: a census that
 * cannot see a handler is not a green census.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../..');

const formatRow = r => `${r.server}/${r.operationId} [class ${r.klass} · ${r.form}] ${r.detail} (${r.via})`;

/**
 * Builds a minimal MCP-server fixture (openapi.yaml + toolService.mjs + service module) in a tmp
 * dir. The two bad shapes are the proven pair: a destructure-under-positional handler and a
 * truncation handler — the gate that cannot trip on these has not been validated.
 * @returns {{root: String, server: Object}}
 */
function buildDefectFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handler-gate-'));

    fs.writeFileSync(path.join(root, 'openapi.yaml'), [
        'openapi: 3.0.0',
        'paths:',
        '  /progress:',
        '    get:',
        '      operationId: get_progress',
        '      parameters:',
        '        - name: staleAfterMs',
        '          schema: {type: integer}',
        '  /diff:',
        '    get:',
        '      operationId: get_diff',
        '      parameters:',
        '        - {name: pr_number, schema: {type: integer}}',
        '        - {name: file, schema: {type: string}}'
    ].join('\n'));

    fs.writeFileSync(path.join(root, 'toolService.mjs'), [
        `import Svc from './Svc.mjs';`,
        `const serviceMapping = {`,
        `    get_progress: Svc.progress.bind(Svc),`,
        `    get_diff    : Svc.diff.bind(Svc)`,
        `};`
    ].join('\n'));

    fs.writeFileSync(path.join(root, 'Svc.mjs'), [
        `class Svc {`,
        `    progress({staleAfterMs = 60000} = {}) {}`,
        `    diff(options) {}`,
        `}`,
        `export default Svc;`
    ].join('\n'));

    return {root, server: {id: 'fixture', openApi: 'openapi.yaml', toolService: 'toolService.mjs'}};
}

test.describe('MCP handler-signature gate', () => {
    const report = census(repoRoot);

    test('no operation silently degrades under its dispatch mode (defect set empty)', () => {
        const failures = report.rows.filter(isDefectRow);

        expect(
            failures.map(formatRow).join('\n'),
            'every listed operation binds garbage or drops arguments silently — annotate it (x-pass-as-object) or fix the handler signature, each in its own ticket'
        ).toBe('');
    });

    test('every binding resolves — a census that cannot see is not green', () => {
        const unseen = report.rows.filter(r => r.klass === 'unresolved');

        expect(
            unseen.map(formatRow).join('\n'),
            'every listed operation resolved to no handler signature — extend the resolver, never waive the row'
        ).toBe('');
    });

    test('the gate trips on both known-positive shapes (negative receipt)', () => {
        const {root, server} = buildDefectFixture();
        const defects        = censusServer(root, server).filter(isDefectRow);
        const byOp           = Object.fromEntries(defects.map(r => [r.operationId, r.klass]));

        expect(byOp).toEqual({get_progress: 2, get_diff: 3});
    });

    test('suspects never fail the gate — ambiguity stays human-judged', () => {
        // The predicate contract: suspect rows are visible in the report, never in the defect set.
        const {root, server} = (() => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handler-gate-suspect-'));

            fs.writeFileSync(path.join(dir, 'openapi.yaml'), [
                'openapi: 3.0.0',
                'paths:',
                '  /x:',
                '    get:',
                '      operationId: get_x',
                '      parameters:',
                '        - {name: staleAfterMs, schema: {type: integer}}'
            ].join('\n'));
            fs.writeFileSync(path.join(dir, 'toolService.mjs'), [
                `const serviceMapping = {`,
                `    get_x: args => args.staleAfterMs`,  // generic bag name under positional dispatch → suspect
                `};`
            ].join('\n'));

            return {root: dir, server: {id: 'fixture', openApi: 'openapi.yaml', toolService: 'toolService.mjs'}};
        })();

        const rows = censusServer(root, server);

        expect(rows[0].klass).toBe('suspect');
        expect(rows.filter(isDefectRow)).toEqual([]);
    });
});
