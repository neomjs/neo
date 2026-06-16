import {setup} from '../../../../../../setup.mjs';

const appName = 'ParseEditRequestTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

/**
 * @summary Unit coverage for the fail-closed first-widget follow-up EDIT grammar.
 *
 * Verifies the safe boundary the H2 live-mutate surface relies on: a bounded deterministic grammar
 * (rename / show N rows / reset data) is accepted into a typed `edit`; everything else — non-string,
 * empty, overlong, markup, unknown command, out-of-bounds row count, empty / overlong title — fails
 * closed to a bounded `{accepted:false, reason}` state, so no unvalidated payload or arbitrary command
 * can reach the live-widget mutation path.
 *
 * @see apps/agentos/childapps/widget/util/parseEditRequest.mjs
 */
test.describe('AgentOSWidget.util.parseEditRequest', () => {
    let parseEditRequest;

    test.beforeAll(async () => {
        ({parseEditRequest} = await import('../../../../../../../../apps/agentos/childapps/widget/util/parseEditRequest.mjs'))
    });

    test('accepts the rename edit (label)', () => {
        expect(parseEditRequest('rename it to Q3 Metrics')).toEqual({accepted: true, edit: {type: 'rename', title: 'Q3 Metrics'}});
        expect(parseEditRequest('rename to Tasks')).toEqual({accepted: true, edit: {type: 'rename', title: 'Tasks'}})
    });

    test('accepts the row-count edit (grid shape)', () => {
        expect(parseEditRequest('show 8 rows')).toEqual({accepted: true, edit: {type: 'rowCount', count: 8}});
        expect(parseEditRequest('show 1 row')).toEqual({accepted: true, edit: {type: 'rowCount', count: 1}})
    });

    test('accepts the reset-data edit', () => {
        expect(parseEditRequest('reset data')).toEqual({accepted: true, edit: {type: 'reset'}});
        expect(parseEditRequest('reset sample data')).toEqual({accepted: true, edit: {type: 'reset'}})
    });

    test('is case-insensitive and whitespace-tolerant', () => {
        expect(parseEditRequest('  RENAME IT TO Foo  ')).toEqual({accepted: true, edit: {type: 'rename', title: 'Foo'}});
        expect(parseEditRequest('Show 5 Rows')).toEqual({accepted: true, edit: {type: 'rowCount', count: 5}})
    });

    test('fails closed on out-of-bounds row count', () => {
        for (const bad of ['show 0 rows', 'show 21 rows', 'show 999 rows']) {
            const result = parseEditRequest(bad);
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/between 1 and 20/i)
        }
    });

    test('fails closed on an empty or overlong rename title', () => {
        expect(parseEditRequest('rename it to    ').accepted).toBe(false);
        const overlong = parseEditRequest(`rename it to ${'x'.repeat(81)}`);
        expect(overlong.accepted).toBe(false);
        expect(overlong.reason).toMatch(/too long/i)
    });

    test('fails closed on an unknown command', () => {
        for (const bad of ['delete everything', 'make it blue', 'drop table', 'add 3 columns']) {
            const result = parseEditRequest(bad);
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/unknown edit/i)
        }
    });

    test('fails closed on non-string / empty / overlong / markup input', () => {
        for (const bad of [null, undefined, 42, {}, []]) {
            expect(parseEditRequest(bad).accepted).toBe(false)
        }
        expect(parseEditRequest('   ').accepted).toBe(false);
        expect(parseEditRequest('show ' + 'x'.repeat(201)).accepted).toBe(false);

        // markup must never reach the mutation path, even on an otherwise-valid-looking command
        const markup = parseEditRequest('rename it to <b>x</b>');
        expect(markup.accepted).toBe(false);
        expect(markup.reason).toMatch(/plain text|markup/i)
    })
});
