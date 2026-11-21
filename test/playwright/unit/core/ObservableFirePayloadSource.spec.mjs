import {setup} from '../../setup.mjs';

setup();

import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Neo             from '../../../../src/Neo.mjs';
import Base            from '../../../../src/core/Base.mjs';
import Observable      from '../../../../src/core/Observable.mjs'; // registers Neo.core.Observable so `static observable = true` resolves the mixin

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(__dirname, '../../../..'),
    srcRoot   = path.join(repoRoot, 'src');

/**
 * @summary Collects every `.mjs` file under a directory, recursively.
 * @param {String} dir
 * @param {String[]} [out]
 * @returns {String[]}
 */
function collectMjsFiles(dir, out=[]) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectMjsFiles(fullPath, out)
        } else if (entry.name.endsWith('.mjs')) {
            out.push(fullPath)
        }
    }
    return out
}

/**
 * @summary Scans the balanced object literal that starts at `openBraceIndex` and returns its top-level
 * property keys. Strings, template literals, and line/block comments are skipped, so braces inside them
 * never skew the depth count. A quoted key (`'source': …`) is recognized as well.
 * @param {String} source
 * @param {Number} openBraceIndex Index of the opening `{`.
 * @returns {{keys: String[], end: Number}} `end` is the index of the closing `}`, or -1 when unbalanced.
 */
function scanObjectLiteralKeys(source, openBraceIndex) {
    const
        keys        = [],
        isIdentChar = c => /[A-Za-z0-9_$]/.test(c);

    let
        depth        = 0,
        i            = openBraceIndex,
        keyStart     = -1,
        mode         = 'key', // 'key' | 'value' at depth 1
        str          = null,
        lineComment  = false,
        blockComment = false;

    for (; i < source.length; i++) {
        const c = source[i], n = source[i + 1];

        if (lineComment)  { if (c === '\n') lineComment = false; continue }
        if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++ } continue }
        if (str) {
            if (c === '\\') { i++; continue }
            if (c === str) str = null;
            continue
        }
        if (c === '/' && n === '/') { lineComment = true; i++; continue }
        if (c === '/' && n === '*') { blockComment = true; i++; continue }
        if (c === '"' || c === "'" || c === '`') {
            // A quoted token in key position is a key only when a `:` follows it
            if (depth === 1 && mode === 'key' && keyStart < 0 && c !== '`') {
                let j = i + 1;
                while (j < source.length && source[j] !== c) { if (source[j] === '\\') j++; j++ }
                let k = j + 1;
                while (k < source.length && /\s/.test(source[k])) k++;
                if (source[k] === ':') {
                    keys.push(source.slice(i + 1, j));
                    mode = 'value';
                    i = k;
                    continue
                }
                i = j;
                continue
            }
            str = c;
            continue
        }
        if (c === '{' || c === '[' || c === '(') {
            depth++;
            continue
        }
        if (c === '}' || c === ']' || c === ')') {
            depth--;
            if (depth === 0) return {keys, end: i};
            continue
        }
        if (depth === 1) {
            if (mode === 'key') {
                if (keyStart < 0) {
                    if (isIdentChar(c) && !/[0-9]/.test(c)) keyStart = i
                } else if (isIdentChar(c)) {
                    // still reading the key token
                } else if (c === ':' || c === ',' || c === '(') {
                    keys.push(source.slice(keyStart, i).trim());
                    keyStart = -1;
                    if (c === ':') mode = 'value'
                } else {
                    keyStart = -1 // unexpected token (e.g. `[` computed key or `...` spread): drop it
                }
            } else if (c === ',') {
                mode = 'key'
            }
        }
    }
    return {keys, end: -1}
}

/**
 * @summary Finds every `fire('name', {…})` call whose payload is an object literal and returns
 * `{file, line, event, keys}` entries for each of them.
 * @param {String} file
 * @returns {Array<{line: Number, event: String, keys: String[]}>}
 */
function findObjectLiteralFirePayloads(file) {
    const
        source = fs.readFileSync(file, 'utf8'),
        fireRe = /\.fire\(\s*(['"])([^'"]*)\1\s*,\s*\{/g,
        found  = [];

    let match;
    while ((match = fireRe.exec(source))) {
        const braceIndex  = fireRe.lastIndex - 1;
        const {keys, end} = scanObjectLiteralKeys(source, braceIndex);
        if (end > 0) {
            found.push({
                event: match[2],
                keys,
                line : source.slice(0, match.index).split('\n').length
            })
        }
        fireRe.lastIndex = Math.max(fireRe.lastIndex, braceIndex + 1)
    }
    return found
}

/**
 * @summary `Neo.core.Observable#fire` reserves `source` of an object payload for the sender's id
 * (`args[0].source = me.id`), so no emitter may declare its own `source` key — `fire` would overwrite it
 * and the listener would read the sender id instead of the emitter's value. These tests pin both halves of
 * that contract: the injection itself, and a scan of `src` that fails when an object-literal `fire` payload
 * declares `source` (#21649).
 */
test.describe('core.Observable fire() payload source contract (#21649)', () => {
    test('fire() injects the sender id as source of an object payload', () => {
        class TestObservable extends Base {
            static observable = true;
            static config     = {className: 'Neo.test.ObservableFireSourceContract'};
        }
        const inst = Neo.create(Neo.setupClass(TestObservable), {});

        let payload;
        inst.on('customEvent', data => { payload = data });
        inst.fire('customEvent', {foo: 'bar'});

        expect(payload.foo).toBe('bar');
        expect(payload.source).toBe(inst.id);
        inst.destroy()
    });

    test('no object-literal fire() payload under src declares its own source key', () => {
        const
            files         = collectMjsFiles(srcRoot),
            payloads      = [],
            sourceKeyHits = [];

        expect(files.length).toBeGreaterThan(500); // the scan really covers the engine

        for (const file of files) {
            for (const payload of findObjectLiteralFirePayloads(file)) {
                payloads.push(payload);
                if (payload.keys.includes('source')) {
                    sourceKeyHits.push(`${path.relative(srcRoot, file)}:${payload.line} fire('${payload.event}', {…}) declares source`)
                }
            }
        }

        expect(payloads.length).toBeGreaterThan(150); // sanity: the scan sees the engine's fire() calls
        expect(sourceKeyHits).toEqual([])
    });
});
