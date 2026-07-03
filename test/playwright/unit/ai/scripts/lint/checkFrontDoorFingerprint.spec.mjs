import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'CheckFrontDoorFingerprintTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

import {
    applyFix,
    checkFingerprint,
    computeActual,
    parseFingerprint
} from '../../../../../../ai/scripts/lint/check-front-door-fingerprint.mjs';

const DOC = (fingerprintLine) => [
    '# Fixture Front Door',
    '',
    fingerprintLine,
    '',
    '## 1. First',
    'prose',
    '',
    '## 10. The claims register',
    'receipts',
    '',
    '## 13. Last',
    'closing 🖖'
].join('\n');

function fixtureFile(content) {
    const dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fingerprint-'));
    const file = path.join(dir, 'Introduction.md');

    fs.writeFileSync(file, content, 'utf8');
    return {dir, file}
}

test.describe('ai.scripts.lint.check-front-door-fingerprint', () => {

    test('parseFingerprint extracts comma-formatted numbers', () => {
        const parsed = parseFingerprint('x **50,109 bytes / 278 lines / 13 sections** y');

        expect(parsed).toEqual({bytes: 50109, lines: 278, sections: 13});
        expect(parseFingerprint('no declaration here')).toBeNull();
    });

    test('computeActual counts dimensions and structural checksums', () => {
        const actual = computeActual(DOC('**1 bytes / 1 lines / 1 sections**'));

        expect(actual.sections).toBe(3);
        expect(actual.endsWithSalute).toBe(true);
        expect(actual.hasClaimsRegister).toBe(true);
        expect(actual.bytes).toBeGreaterThan(0);
    });

    test('applyFix converges to the fixed point and checkFingerprint passes', () => {
        const {dir, file} = fixtureFile(DOC('**1 bytes / 1 lines / 1 sections**'));

        const fix = applyFix(file);

        expect(fix.converged).toBe(true);

        const result = checkFingerprint(file);

        expect(result.ok).toBe(true);
        expect(result.declared.bytes).toBe(result.actual.bytes);
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkFingerprint fails on byte/line drift after an edit', () => {
        const {dir, file} = fixtureFile(DOC('**1 bytes / 1 lines / 1 sections**'));

        applyFix(file);
        fs.appendFileSync(file, '\ndrifted content 🖖', 'utf8');

        const result = checkFingerprint(file);

        expect(result.ok).toBe(false);
        expect(result.mismatches.join(' ')).toContain('bytes');
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkFingerprint fails when the terminal salute checksum is missing', () => {
        const content     = DOC('**1 bytes / 1 lines / 1 sections**').replace('closing 🖖', 'closing without salute');
        const {dir, file} = fixtureFile(content);

        applyFix(file);

        const result = checkFingerprint(file);

        expect(result.ok).toBe(false);
        expect(result.mismatches.join(' ')).toContain('salute');
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkFingerprint fails when the claims-register heading is missing', () => {
        const content     = DOC('**1 bytes / 1 lines / 1 sections**').replace('## 10. The claims register', '## 10. Renamed');
        const {dir, file} = fixtureFile(content);

        applyFix(file);

        const result = checkFingerprint(file);

        expect(result.ok).toBe(false);
        expect(result.mismatches.join(' ')).toContain('claims-register');
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkFingerprint fails when no fingerprint declaration exists', () => {
        const {dir, file} = fixtureFile(DOC('no declaration line'));

        const result = checkFingerprint(file);

        expect(result.ok).toBe(false);
        expect(result.declared).toBeNull();
        expect(result.mismatches.join(' ')).toContain('no integrity-fingerprint declaration');
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('the LIVE front door passes its own fingerprint check', () => {
        const result = checkFingerprint();

        expect(result.ok, result.mismatches.join('; ')).toBe(true);
    });
});
