import {setup} from '../../../../../../setup.mjs';

const appName = 'ValidateRequestTest';

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
 * @summary Unit coverage for the fail-closed first-widget chat-request validation.
 *
 * Verifies the safe boundary the H2 chat-intake surface relies on: a bounded plain-text request is
 * accepted (trimmed); empty / whitespace-only, non-string, overlong, and markup-bearing input all
 * fail closed to a bounded `{accepted:false, reason}` state, so no unvalidated payload ever reaches
 * the request/evidence projection.
 *
 * @see apps/agentos/childapps/widget/util/validateRequest.mjs
 */
test.describe('AgentOSWidget.util.validateRequest', () => {
    let validateRequest;

    test.beforeAll(async () => {
        ({validateRequest} = await import('../../../../../../../../apps/agentos/childapps/widget/util/validateRequest.mjs'))
    });

    test('accepts a bounded plain-text request, trimmed', () => {
        expect(validateRequest('  build me a neo grid  ')).toEqual({accepted: true, value: 'build me a neo grid'})
    });

    test('fails closed on empty / whitespace-only input', () => {
        for (const bad of ['', '   ', '\t\n']) {
            const result = validateRequest(bad);
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/empty/i)
        }
    });

    test('fails closed on non-string input', () => {
        for (const bad of [null, undefined, 42, {}, []]) {
            expect(validateRequest(bad).accepted).toBe(false)
        }
    });

    test('fails closed on overlong input', () => {
        const result = validateRequest('x'.repeat(201));
        expect(result.accepted).toBe(false);
        expect(result.reason).toMatch(/too long/i)
    });

    test('fails closed on markup / HTML-like input — no unsafe payload through', () => {
        for (const bad of ['<script>alert(1)</script>', 'build <b>grid</b>', 'a > b']) {
            const result = validateRequest(bad);
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/plain text|markup/i)
        }
    })
});
