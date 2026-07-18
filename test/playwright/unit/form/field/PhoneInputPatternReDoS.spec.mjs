import {setup} from '../../../setup.mjs';

const appName = 'PhoneInputPatternReDoSTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Phone          from '../../../../../src/form/field/Phone.mjs';

/**
 * @summary The Phone field's default `inputPattern` must validate in LINEAR time — a ReDoS regression.
 *
 * The prior default nested an OPTIONAL separator inside a repeated group (`([\-\s\.]?[/0-9]+)*`), so a
 * long digit run had exponentially many partitions. A failing match — a maximal digit run followed by
 * one non-matching char — backtracked catastrophically (measured seconds at ~30 chars). `Text#maxLength`
 * defaults to `null`, so a Phone field imposes no input bound and the pathological value is reachable;
 * validation runs in the App Worker, so the regex freezes all UI logic. The replacement is a
 * language-preserving, linear rewrite. This spec pins BOTH properties on the field's real pattern.
 */
test.describe('Neo.form.field.Phone inputPattern — ReDoS-safe', () => {
    let cached;
    const inputPattern = () => (cached ??= Neo.create(Phone, {appName}).inputPattern);

    test('language preserved: accepts well-formed numbers, rejects malformed input', () => {
        const re = inputPattern();

        // Trailing `/` is a valid digit-class char (`030/12345678`); a mid-string `(` after the first
        // run is not (the open paren is only valid at the very start). The close-paren may only follow a
        // PURE-DIGIT run (`(123)456` accepts; `12/34)56` rejects) — the original language distinguishes
        // where `)` attaches, so a `/` before `)` must reject. An exhaustive ≤7-char audit over the
        // pattern alphabet (5,380,840 strings) pins this pattern to 0 divergences from the original.
        for (const value of ['1234567890', '+49 30 1234567', '030/12345678', '(123)456-789', '12-34-56', '123/456/789', '+1', '0', '12/']) {
            expect(re.test(value), `should accept ${JSON.stringify(value)}`).toBe(true);
        }

        // The final four are the `)`-after-slash divergence class an exhaustive audit surfaced (old rejects,
        // a merged-run rewrite would wrongly accept) — pinned so the boundary can never silently widen again.
        for (const value of ['', 'abc', '12--34', '12  34', '-12', '/12', '+1 (123) 456-789', '+12a', '()12', '12/34)56', '0/)', '(030/1234)567', '12/34)']) {
            expect(re.test(value), `should reject ${JSON.stringify(value)}`).toBe(false);
        }
    });

    test('linear on the pathological input: a long digit run + a failing char returns in bounded time', () => {
        // The exact catastrophic shape the old pattern re-partitioned: a maximal digit run, then a char
        // that fails the `$` anchor. The old pattern took ~4s at 30 chars; the fix must stay sub-100ms
        // at 50000 — a bound the exponential form could never meet.
        const re    = inputPattern(),
              evil  = '1'.repeat(50000) + '!',
              start = performance.now();

        expect(re.test(evil)).toBe(false);
        expect(performance.now() - start, 'inputPattern must not backtrack catastrophically').toBeLessThan(100);
    });
});
