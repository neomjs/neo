import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'HighlightJsLineNumbersTest'}});

import {expect, test}   from '@playwright/test';
import {parseFragment}  from 'parse5';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import HighlightJsLines from '../../../../src/util/HighlightJsLineNumbers.mjs';
import hljs             from '../../../../dist/highlight/highlight.custom.min.js';

const textContent = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textContent).join('');

test('real LF, CRLF and CR split; literal backslash sequences do not', () => {
    expect(HighlightJsLines.getLines('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
    expect(HighlightJsLines.getLines('a\\nb\\r\\nc')).toEqual(['a\\nb\\r\\nc']);
    expect(HighlightJsLines.getLines('')).toEqual([]);
    expect(HighlightJsLines.addLineNumbers('')).toBe('')
});

test('nested spans reopen in order and close independently in each row', () => {
    expect(HighlightJsLines.getLines('<span class="hljs-string">one\n<span class="hljs-subst">two\nthree</span>four\nfive</span>')).toEqual([
        '<span class="hljs-string">one</span>',
        '<span class="hljs-string"><span class="hljs-subst">two</span></span>',
        '<span class="hljs-string"><span class="hljs-subst">three</span>four</span>',
        '<span class="hljs-string">five</span>'
    ])
});

for (const source of [
    '/* first\n\nlast */\nconst template = `one\n${true ?\n"two" : "three"}\nend`;\n',
    '/** @returns {Promise<Boolean>} */\r\nconst html = `<div class="probe">&amp;</div>`;\r\n\r\n',
    '\n\n', '\r\r\n', 'one\n \t\n\n', 'a\\nb', 'no trailing newline'
]) {
    test(`numbered HTML preserves source text ${JSON.stringify(source)}`, () => {
        const html = HighlightJsLines.addLineNumbers(hljs.highlight(source, {language: 'javascript'}).value),
              tree = parseFragment(html),
              rows = tree.childNodes[0].childNodes[0].childNodes;

        expect(textContent(tree)).toBe(source);
        expect(rows).toHaveLength(source.split(/\r\n|\r|\n/).length);
        rows.forEach((row, index) => {
            expect(row.nodeName).toBe('tr');
            expect(row.childNodes.map(cell => cell.attrs.find(attr => attr.name === 'data-line-number').value))
                .toEqual([String(index + 1), String(index + 1)]);
            expect(row.childNodes[1].attrs).toContainEqual({name: 'class', value: 'hljs-ln-line hljs-ln-code'})
        })
    })
}

test('workers request the line-number theme; Main can render without a worker', () => {
    const original = Neo.currentWorker, calls = [];

    try {
        Neo.currentWorker = {insertThemeFiles: (...args) => calls.push(args)};
        HighlightJsLines.addLineNumbers('one\ntwo', 'window-a');
        expect(calls).toEqual([['window-a', HighlightJsLines.__proto__]]);
        Neo.currentWorker = undefined;
        expect(HighlightJsLines.addLineNumbers('one\ntwo', 'window-a')).toContain('data-line-number="2"')
    } finally {
        Neo.currentWorker = original
    }
});
