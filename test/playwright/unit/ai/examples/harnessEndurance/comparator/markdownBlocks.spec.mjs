import {test, expect}                       from '@playwright/test';
import parseMarkdownBlocks, {parseMarkdownBlocks as named, createIncrementalBlocks} from '../../../../../../../ai/examples/harnessEndurance/comparator/markdownBlocks.mjs';

/**
 * @summary Coverage for ai/examples/harnessEndurance/comparator/markdownBlocks.mjs — the pure
 * single-main-thread markdown→block-HTML renderer that powers the Harness Endurance Benchmark's
 * comparator (Subject B).
 *
 * Pinned here without a browser: block segmentation (so the app can apply tail-incrementally rather
 * than O(n²) innerHTML-rewrite), inline marks, and — critically for parity with Subject A's Neo
 * parser — HTML escaping that renders hostile input inert (escaped tags, no `javascript:` links).
 *
 * Test axes: segmentation · inline marks + safe links · security (inert hostile input) · ordered
 * lists · empty/nullish · export shape.
 */
test.describe('ai/examples/harnessEndurance/comparator/markdownBlocks', () => {
    test('segments headings, paragraphs, lists, and blockquotes into separate blocks', () => {
        const blocks = parseMarkdownBlocks('# Title\n\npara one\n\n- a\n- b\n\n> quote');

        expect(blocks.length).toBe(4);
        expect(blocks[0]).toBe('<h1>Title</h1>');
        expect(blocks[1]).toBe('<p>para one</p>');
        expect(blocks[2]).toBe('<ul><li>a</li><li>b</li></ul>');
        expect(blocks[3]).toBe('<blockquote>quote</blockquote>');
    });

    test('renders inline code + bold + http(s) links', () => {
        const [p] = parseMarkdownBlocks('use `code` and **bold** and [neo](https://neomjs.com)');

        expect(p).toContain('<code>code</code>');
        expect(p).toContain('<strong>bold</strong>');
        expect(p).toContain('<a href="https://neomjs.com">neo</a>');
    });

    test('renders hostile input inert — escaped tags, no javascript: links (parity with Neo parser)', () => {
        const [p] = parseMarkdownBlocks('x <script>alert(1)</script> [bad](javascript:alert(1))');

        expect(p).not.toContain('<script>');
        expect(p).toContain('&lt;script&gt;');
        expect(p).not.toContain('href="javascript:');
    });

    test('ordered lists render as <ol>', () => {
        expect(parseMarkdownBlocks('1. first\n2. second')).toEqual(['<ol><li>first</li><li>second</li></ol>']);
    });

    test('empty / nullish source → empty block list', () => {
        expect(parseMarkdownBlocks('')).toEqual([]);
        expect(parseMarkdownBlocks(null)).toEqual([]);
        expect(parseMarkdownBlocks(undefined)).toEqual([]);
    });

    test('default export equals the named export', () => {
        expect(parseMarkdownBlocks).toBe(named);
    });

    test('createIncrementalBlocks streams to the SAME result as a full parse at every prefix', () => {
        // The list (`- a\n- b`) is the regression guard: a forward-only stream transiently parses
        // `- a\n-` as list+paragraph, so block-granularity settling would split it — blank-line
        // settling must keep it ONE list once `- b` arrives.
        const source = '# Title\n\npara one grows\n\n- a\n- b\n\n> quote here';
        const parser = createIncrementalBlocks();
        let acc = '', last = [];

        for (let i = 0; i < source.length; i += 3) {
            const chunk = source.slice(i, i + 3);
            acc += chunk;
            last  = parser.push(chunk);
            // The memoized incremental output must equal a full re-parse of the same prefix — always.
            expect(last).toEqual(parseMarkdownBlocks(acc));
        }

        expect(last).toEqual(parseMarkdownBlocks(source));
        expect(last).toEqual(['<h1>Title</h1>', '<p>para one grows</p>', '<ul><li>a</li><li>b</li></ul>', '<blockquote>quote here</blockquote>']);
    });

    test('createIncrementalBlocks settles blocks at blank-line boundaries; the open region re-parses', () => {
        const parser = createIncrementalBlocks();

        expect(parser.push('a para'))     .toEqual(['<p>a para</p>']);                            // open region
        expect(parser.push(' continues')) .toEqual(['<p>a para continues</p>']);                  // same open block grows
        expect(parser.push('\n\n# Head')) .toEqual(['<p>a para continues</p>', '<h1>Head</h1>']); // blank line settles the paragraph
        expect(parser.push('er'))         .toEqual(['<p>a para continues</p>', '<h1>Header</h1>']); // settled stays byte-stable
    });

    test('createIncrementalBlocks tolerates empty deltas', () => {
        expect(createIncrementalBlocks().push('')).toEqual([]);
    });
});
