#!/usr/bin/env node

/**
 * @summary Verifies the front-door guide's integrity fingerprint against the file's actual dimensions.
 *
 * The guide self-declares its size (bytes / lines / sections) plus two structural checksums (the
 * claims-register heading and the terminal salute) so a truncated-paste or summarizing-fetch reader
 * can detect a partial copy without being told. A hand-maintained declaration rots on the next edit,
 * so this guard keeps it true BY CONSTRUCTION: check mode fails CI on any drift; `--fix` rewrites the
 * declared numbers to the current fixed point (replacing digits changes the byte count, so the fix
 * iterates until declared === actual — bounded, converges because the digit-width stabilizes).
 * @plane in-plane
 */

import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename      = fileURLToPath(import.meta.url),
    __dirname       = path.dirname(__filename),
    ROOT_DIR        = path.resolve(__dirname, '../../..'),
    FRONT_DOOR_PATH = path.join(ROOT_DIR, 'learn/benefits/Introduction.md'),
    FINGERPRINT_RE  = /\*\*([\d,]+) bytes \/ (\d+) lines \/ (\d+) sections\*\*/,
    SALUTE          = '🖖';

/**
 * @summary Parses the declared fingerprint from the guide's content.
 * @param {String} content Guide markdown.
 * @returns {{bytes: Number, lines: Number, sections: Number}|null} null when no fingerprint exists.
 */
export function parseFingerprint(content) {
    const match = FINGERPRINT_RE.exec(content);
    if (!match) return null;

    return {
        bytes   : Number(match[1].replace(/,/g, '')),
        lines   : Number(match[2]),
        sections: Number(match[3])
    }
}

/**
 * @summary Computes the guide's actual dimensions and structural checksums.
 * @param {String} content Guide markdown.
 * @returns {{bytes: Number, lines: Number, sections: Number, endsWithSalute: Boolean, hasClaimsRegister: Boolean}}
 */
export function computeActual(content) {
    return {
        bytes            : Buffer.byteLength(content, 'utf8'),
        lines            : content.split('\n').length - (content.endsWith('\n') ? 1 : 0),
        sections         : [...content.matchAll(/^## /gm)].length,
        endsWithSalute   : content.trimEnd().endsWith(SALUTE),
        hasClaimsRegister: /^## 10\..*claims register/im.test(content)
    }
}

/**
 * @summary Runs the fingerprint check: declared dimensions vs actual, plus structural checksums.
 * @param {String} [filePath=FRONT_DOOR_PATH] Guide file path.
 * @returns {{ok: Boolean, declared: Object|null, actual: Object, mismatches: String[]}}
 */
export function checkFingerprint(filePath = FRONT_DOOR_PATH) {
    const
        content    = fs.readFileSync(filePath, 'utf8'),
        declared   = parseFingerprint(content),
        actual     = computeActual(content),
        mismatches = [];

    if (!declared) {
        mismatches.push('no integrity-fingerprint declaration found (expected "**N bytes / M lines / K sections**")');
    } else {
        declared.bytes    !== actual.bytes    && mismatches.push(`declared ${declared.bytes} bytes, actual ${actual.bytes}`);
        declared.lines    !== actual.lines    && mismatches.push(`declared ${declared.lines} lines, actual ${actual.lines}`);
        declared.sections !== actual.sections && mismatches.push(`declared ${declared.sections} sections, actual ${actual.sections}`);
    }

    !actual.endsWithSalute    && mismatches.push('terminal salute checksum missing — the document must end with the salute the fingerprint names');
    !actual.hasClaimsRegister && mismatches.push('claims-register heading (§10) checksum missing');

    return {ok: mismatches.length === 0, declared, actual, mismatches}
}

/**
 * @summary Rewrites the declared numbers to the current fixed point (declared === actual).
 *
 * Replacing the digits changes the file's byte count, so one rewrite can invalidate itself;
 * the loop re-measures after each write and converges when the declaration matches reality.
 *
 * @param {String} [filePath=FRONT_DOOR_PATH] Guide file path.
 * @returns {{converged: Boolean, iterations: Number}}
 */
export function applyFix(filePath = FRONT_DOOR_PATH) {
    for (let iteration = 1; iteration <= 5; iteration++) {
        const
            content = fs.readFileSync(filePath, 'utf8'),
            actual  = computeActual(content),
            next    = content.replace(
                FINGERPRINT_RE,
                `**${actual.bytes.toLocaleString('en-US')} bytes / ${actual.lines} lines / ${actual.sections} sections**`
            );

        if (next === content && checkFingerprint(filePath).ok) {
            return {converged: true, iterations: iteration}
        }

        fs.writeFileSync(filePath, next, 'utf8');

        if (checkFingerprint(filePath).ok) {
            return {converged: true, iterations: iteration}
        }
    }

    return {converged: false, iterations: 5}
}

if (process.argv[1] === __filename) {
    const fix = process.argv.includes('--fix');

    if (fix) {
        const result = applyFix();

        if (!result.converged) {
            console.error('[check-front-door-fingerprint] --fix did not converge (structural checksum failing?)');
            const check = checkFingerprint();
            check.mismatches.forEach(m => console.error(`- ${m}`));
            process.exit(1)
        }

        console.log(`[check-front-door-fingerprint] fixed point reached in ${result.iterations} iteration(s)`)
    }

    const result = checkFingerprint();

    if (!result.ok) {
        console.error('[check-front-door-fingerprint] FAILED — the front door\'s self-declaration drifted from reality:');
        result.mismatches.forEach(m => console.error(`- ${m}`));
        console.error('Run `npm run ai:front-door-fingerprint -- --fix` after editing the guide.');
        process.exit(1)
    }

    console.log(`[check-front-door-fingerprint] OK (${result.actual.bytes.toLocaleString('en-US')} bytes / ${result.actual.lines} lines / ${result.actual.sections} sections, salute + register present)`)
}
