import {test, expect} from '@playwright/test';
import MarkdownParser, {BLOCK_TYPES, SAFE_DESTINATION} from '../../../../../src/component/markdown/Parser.mjs';

/**
 * @summary Pins the streaming markdown parser's id-stability, security, and segmentation contracts.
 *
 * The load-bearing invariant under test: a settled block re-emits the SAME object with the SAME
 * ids on every subsequent parse, so the vdom differ no-ops the settled prefix and a streaming
 * append costs exactly one insert-only tail. Identity assertions therefore use reference
 * equality (`toBe`) on settled subtrees — deep equality would pass on shapes the differ still
 * has to walk.
 *
 * Note this spec imports the module directly WITHOUT the shared setup helper: the parser
 * inherits the plain-module discipline (no Neo globals, no DOM — the realm-purity is itself
 * one of the pinned contracts, keeping it consumable by the Node-side SSR/SSG pipeline).
 */

const collectIds = (nodes, bucket = []) => {
    nodes.forEach(node => {
        node.id && bucket.push(node.id);
        node.cn && collectIds(node.cn, bucket)
    });
    return bucket
};

const textOf = nodes => nodes.map(node =>
    node.vtype === 'text' ? node.text : textOf(node.cn ?? [])
).join('');

test.describe('MarkdownParser — stable-id streaming contract', () => {
    test('settled blocks re-emit the same object references and ids across appends', () => {
        const parser = new MarkdownParser({idPrefix: 'stable'});

        const first = parser.update('# Title\n\nFirst paragraph.\n\n');

        expect(first).toHaveLength(2);

        const [titleRef, paraRef] = first,
              settledIds          = collectIds(first);

        const second = parser.update('# Title\n\nFirst paragraph.\n\nSecond paragraph grows');

        expect(second).toHaveLength(3);
        // Reference equality: the differ must see IDENTICAL settled subtrees, not lookalikes.
        expect(second[0]).toBe(titleRef);
        expect(second[1]).toBe(paraRef);
        expect(collectIds(second.slice(0, 2))).toEqual(settledIds);
        // The new tail block is genuinely new — fresh id, no collision with settled ids.
        expect(settledIds).not.toContain(second[2].id)
    });

    test('the open tail paragraph grows in place: same block id, updated text', () => {
        const parser = new MarkdownParser({idPrefix: 'tail'});

        const first  = parser.update('Streaming wor');
        const tailId = first[0].id;

        expect(textOf(first[0].cn)).toBe('Streaming wor');

        const second = parser.update('Streaming words keep coming');

        expect(second).toHaveLength(1);
        expect(second[0].id).toBe(tailId);
        expect(textOf(second[0].cn)).toBe('Streaming words keep coming')
    });

    test('a fence opening in one chunk and closing in a later one stays a single growing block', () => {
        const parser = new MarkdownParser({idPrefix: 'fence'});

        const first = parser.update('Intro\n\n```js\nconst a = 1;');

        expect(first).toHaveLength(2);

        const codeId = first[1].id;

        expect(first[1].tag).toBe('pre');

        // The fence is still open — more code arrives, then the closing marker.
        const second = parser.update('Intro\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\nAfter');

        expect(second[1].id).toBe(codeId);
        expect(textOf(second[1].cn)).toBe('const a = 1;\nconst b = 2;');
        expect(second[2].tag).toBe('p');
        expect(textOf(second[2].cn)).toBe('After')
    });

    test('fence-looking lines INSIDE a fence do not close it; only a pure marker line does', () => {
        const parser = new MarkdownParser({idPrefix: 'nested'});

        const blocks = parser.update('```\ntext with ```js inside\n```\n');

        expect(blocks).toHaveLength(1);
        expect(textOf(blocks[0].cn)).toBe('text with ```js inside')
    });

    test('a non-append change resets fully with fresh ids — no id recycling across resets', () => {
        const parser = new MarkdownParser({idPrefix: 'reset'});

        const first    = parser.update('# One\n\nBody one\n\n');
        const firstIds = collectIds(first);

        // Prefix changed — not an append: everything re-births under fresh ids.
        const second    = parser.update('# Changed\n\nBody one\n\n');
        const secondIds = collectIds(second);

        expect(secondIds.filter(id => firstIds.includes(id))).toEqual([]);
        expect(parser.blockCount).toBe(2)
    });

    test('idempotent re-parse of identical source returns the identical block array content', () => {
        const parser = new MarkdownParser({idPrefix: 'idem'});

        const first  = parser.update('# T\n\nBody\n\n');
        const second = parser.update('# T\n\nBody\n\n');

        expect(second[0]).toBe(first[0]);
        expect(second[1]).toBe(first[1])
    });
});

test.describe('MarkdownParser — segmentation and inline pass', () => {
    test('segments headings, paragraphs and fenced code with language classes', () => {
        const parser = new MarkdownParser({idPrefix: 'seg'});

        const blocks = parser.update('## Sub *title*\n\nPlain text\n\n```python\nx = 1\n```\n');

        expect(blocks).toHaveLength(3);
        expect(blocks[0].tag).toBe('h2');
        expect(blocks[0].cls).toEqual(['neo-h2']);
        expect(blocks[1].tag).toBe('p');
        expect(blocks[2].tag).toBe('pre');
        expect(blocks[2].cn[0].cls).toEqual(['language-python']);
        expect(blocks[2].cn[0].cn[0].vtype).toBe('text')
    });

    test('inline pass: code spans, strong, em, and allowlisted links — all text via vtype text nodes', () => {
        const parser = new MarkdownParser({idPrefix: 'inline'});

        const [block] = parser.update('Mix `code` with **bold**, *em* and [docs](https://neomjs.com).');
        const tags    = block.cn.filter(node => node.tag).map(node => node.tag);

        expect(tags).toEqual(['code', 'strong', 'em', 'a']);

        const link = block.cn.find(node => node.tag === 'a');

        expect(link.href).toBe('https://neomjs.com');
        expect(textOf([link])).toBe('docs');

        // Every leaf is a text vnode — the no-innerHTML contract at the structural level.
        const walk = nodes => nodes.forEach(node => {
            expect(node.html).toBeUndefined();
            expect(node.innerHTML).toBeUndefined();
            node.cn && walk(node.cn)
        });
        walk(block.cn)
    });

    test('soft-wrapped paragraph lines join with a space', () => {
        const parser = new MarkdownParser({idPrefix: 'wrap'});

        const [block] = parser.update('line one\nline two\n\n');

        expect(textOf(block.cn)).toBe('line one line two')
    });
});

test.describe('MarkdownParser — transcript-grade security defaults', () => {
    test('non-allowlisted schemes render as plain text, never as anchors (allowlist, not denylist)', () => {
        const parser = new MarkdownParser({idPrefix: 'sec1'});

        const [block] = parser.update('[click](javascript:alert(1)) and [img](data:text/html;base64,x)');

        expect(block.cn.filter(node => node.tag === 'a')).toEqual([]);
        expect(textOf(block.cn)).toContain('[click](javascript:alert(1))');

        // The contract is accept-known, so EVERY unknown scheme fails by construction —
        // including the ones incomplete denylists historically miss.
        ['javascript:alert(1)', 'data:text/html;base64,x', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'intent://x']
            .forEach(destination => expect(SAFE_DESTINATION.test(destination)).toBe(false));

        expect(SAFE_DESTINATION.test('https://neomjs.com')).toBe(true);
        expect(SAFE_DESTINATION.test('mailto:team@neomjs.com')).toBe(true);
        expect(SAFE_DESTINATION.test('#fragment')).toBe(true);
        expect(SAFE_DESTINATION.test('./relative/path')).toBe(true)
    });

    test('raw HTML lines land in text nodes — inert by the engine textContent contract', () => {
        const parser = new MarkdownParser({idPrefix: 'sec2'});

        const [block] = parser.update('<script>alert(1)</script>\n\n');

        expect(block.tag).toBe('p');
        expect(block.cn[0].vtype).toBe('text');
        expect(block.cn[0].text).toBe('<script>alert(1)</script>')
    });

    test('hostile content inside code fences stays fence-contained text', () => {
        const parser = new MarkdownParser({idPrefix: 'sec3'});

        const [block] = parser.update('```\n</pre><script>alert(1)</script>\n```\n');

        expect(block.tag).toBe('pre');
        expect(textOf(block.cn)).toBe('</pre><script>alert(1)</script>')
    });

    test('images are inert v1: rendered as their source text, never as img nodes', () => {
        const parser = new MarkdownParser({idPrefix: 'sec4'});

        const [block] = parser.update('![alt](https://example.com/x.png)');

        expect(block.cn.filter(node => node.tag === 'img')).toEqual([]);
        expect(textOf(block.cn)).toBe('![alt](https://example.com/x.png)')
    });
});

test.describe('MarkdownParser — extended block grammar', () => {
    test('segments unordered and ordered lists with soft-wrapped item continuations', () => {
        const parser = new MarkdownParser({idPrefix: 'list'});

        const blocks = parser.update('- alpha\n- beta\n  continues here\n\n1. one\n2. two\n\n');

        expect(blocks).toHaveLength(2);
        expect(blocks[0].tag).toBe('ul');
        expect(blocks[0].cn).toHaveLength(2);
        expect(textOf([blocks[0].cn[1]])).toBe('beta continues here');
        expect(blocks[1].tag).toBe('ol');
        expect(blocks[1].cn.map(item => item.tag)).toEqual(['li', 'li'])
    });

    test('a marker-type switch splits into two list blocks', () => {
        const parser = new MarkdownParser({idPrefix: 'split'});

        const blocks = parser.update('- bullet\n1. numbered\n\n');

        expect(blocks.map(block => block.tag)).toEqual(['ul', 'ol'])
    });

    test('an open list grows item-wise across appends under its original id', () => {
        const parser = new MarkdownParser({idPrefix: 'grow'});

        const first  = parser.update('- alpha\n- be');
        const listId = first[0].id;

        expect(first[0].cn).toHaveLength(2);

        const second = parser.update('- alpha\n- beta\n- gamma');

        expect(second).toHaveLength(1);
        expect(second[0].id).toBe(listId);
        expect(second[0].cn).toHaveLength(3);
        expect(textOf([second[0].cn[2]])).toBe('gamma')
    });

    test('segments blockquotes and thematic breaks; break wins over list for `- - -`', () => {
        const parser = new MarkdownParser({idPrefix: 'misc'});

        const blocks = parser.update('> quoted *wisdom*\n> second line\n\n- - -\n\ntail\n\n');

        expect(blocks).toHaveLength(3);
        expect(blocks[0].tag).toBe('blockquote');
        expect(textOf(blocks[0].cn)).toBe('quoted wisdom second line');
        expect(blocks[1].tag).toBe('hr');
        expect(blocks[2].tag).toBe('p')
    });

    test('segments GFM tables: header, delimiter, padded body rows', () => {
        const parser = new MarkdownParser({idPrefix: 'table'});

        const blocks = parser.update('| Name | Score |\n|---|---|\n| ada | 100 |\n| short |\n\n');

        expect(blocks).toHaveLength(1);

        const [table] = blocks;

        expect(table.tag).toBe('table');

        const
            thead = table.cn[0],
            tbody = table.cn[1];

        expect(thead.cn[0].cn.map(cell => cell.tag)).toEqual(['th', 'th']);
        expect(textOf([thead.cn[0].cn[0]])).toBe('Name');
        expect(tbody.cn).toHaveLength(2);
        // The short row pads to the header's column count.
        expect(tbody.cn[1].cn).toHaveLength(2);
        expect(textOf([tbody.cn[1].cn[1]])).toBe('')
    });

    test('a streamed table promotes from the open tail paragraph when its delimiter arrives', () => {
        const parser = new MarkdownParser({idPrefix: 'promote'});

        // Chunk 1: the header line alone is just an open paragraph.
        const first = parser.update('Intro\n\n| a | b |');

        expect(first).toHaveLength(2);
        expect(first[1].tag).toBe('p');

        const tailId = first[1].id;

        // Chunk 2: the delimiter + a body row arrive — same block id, now a table.
        const second = parser.update('Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |');

        expect(second).toHaveLength(2);
        expect(second[1].id).toBe(tailId);
        expect(second[1].tag).toBe('table');
        expect(textOf([second[1].cn[1].cn[0].cn[0]])).toBe('1')
    });

    test('a list interrupts an open paragraph (paragraph terminator discipline)', () => {
        const parser = new MarkdownParser({idPrefix: 'interrupt'});

        const blocks = parser.update('prose line\n- item one\n- item two\n\n');

        expect(blocks.map(block => block.tag)).toEqual(['p', 'ul']);
        expect(blocks[1].cn).toHaveLength(2)
    });
});

test.describe('MarkdownParser — vdom shape discipline', () => {
    test('every emitted node carries an explicit deterministic id', () => {
        const parser = new MarkdownParser({idPrefix: 'ids'});

        const blocks = parser.update('# H\n\nText with **bold** and `code`.\n\n```js\nx\n```\n');
        const ids    = collectIds(blocks);

        expect(ids.length).toBeGreaterThan(6);
        ids.forEach(id => expect(id).toMatch(/^ids__md-\d+(-c\d+)?$/));
        expect(new Set(ids).size).toBe(ids.length)
    });
});
