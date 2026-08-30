import {test, expect}                     from '@playwright/test';
import {findTicketRefs, stripValueColors} from '../../../../buildScripts/util/check-ticket-archaeology.mjs';

/**
 * The guard that gates every commit had no unit coverage, which is how its docblock came to claim a
 * protection it did not provide: it reasoned from `#1234ff`, where letters stop `\d{4,}` short of a
 * word boundary, and generalised that to hex colours. An all-numeric colour has no letters to stop it.
 *
 * The bound was doing two jobs — identifying a ticket ref, and dodging colours by LENGTH — and failed
 * at both ends. It flagged `#000000` on lines a change never touched, and it could not see a ticket
 * shorter than four digits, which is every sibling-repository ref. Position now decides, so the tests
 * below pin both directions: the colours that must stay silent, and the refs that must be found.
 */

const comment = text => `// ${text}`;

test.describe('check-ticket-archaeology: position decides, not digit width', () => {
    test.describe('value-position colours stay silent', () => {
        for (const [label, line] of [
            ['assigned in a JSDoc member', ` * @member {String} backgroundColor_='#000000'`],
            ['all-numeric six digit',      comment(`the default is '#111111' throughout`)],
            ['all-numeric, after a colon', comment('color: #123456 in the legacy sheet')],
            ['backticked',                 comment('the ground is `#332211` here')],
            ['CSS shorthand, three digit', comment('color: #123 is the shorthand form')],
            ['RGBA shorthand, four digit', comment('color: #1234 carries alpha')]
        ]) {
            test(label, () => {
                expect(findTicketRefs(line), line).toEqual([])
            })
        }
    });

    test.describe('prose refs are found', () => {
        for (const [label, text] of [
            ['5-digit Engine ref',      'see #12209 for the rationale'],
            ['5-digit in parentheses',  'the cut landed here (#16538)'],
            ['qualified Brain ref',     'held for brain#204 while the tool was blocked'],
            ['fully qualified ref',     'see neomjs/neo-agent-institution#63'],
            ['qualified skills ref',    'the guard shipped in neo-agent-skills#18'],
            ['prose Epic form',         'tracked under Epic #13158'],
            ['prose Discussion form',   'settled in Discussion #10137']
        ]) {
            test(label, () => {
                expect(findTicketRefs(comment(text))).toHaveLength(1)
            })
        }
    });

    /**
     * Widening the bound to `#\d+` so it could reach 2–3 digit sibling refs was written, measured and
     * reverted: across `src` + `test/playwright` it took the audit from 9 findings to 27, and the new
     * ones were almost entirely ordinals. Those are English. A guard that flags them teaches authors
     * to reach for the escape marker, which is how a guard stops being read.
     */
    test.describe('ordinals are English, not archaeology', () => {
        for (const text of [
            'Refresh #2 (the pin analogue): wholesale replacement again',
            'Product truth #1: the committed item projects as a real rail button',
            'To solve #3, this component acts as a physical proxy',
            'writer-1 (the fixture ConnectionService, identity #1) holds the lock'
        ]) {
            test(text.slice(0, 44), () => {
                expect(findTicketRefs(comment(text)), text).toEqual([])
            })
        }
    });

    test('a BARE short ref stays invisible — the documented limit, not an oversight', () => {
        // `#204` and `#2` are indistinguishable in prose, and a bare short ref cannot be resolved to a
        // repository by a reader either. Qualifying it is what makes it both checkable and readable.
        expect(findTicketRefs(comment('blocked Brain MCP tool (#204)'))).toEqual([]);
        expect(findTicketRefs(comment('blocked Brain MCP tool (brain#204)'))).toHaveLength(1)
    });

    test('the true positive the old bound DID catch still fires', () => {
        // Control: if this ever goes silent the fix has traded one blind spot for another.
        expect(findTicketRefs(comment('closes #16553'))).toHaveLength(1)
    });

    test('a 5-digit ref stays visible even quoted — only colour LENGTHS are stripped', () => {
        // A five-digit ref is not a colour LENGTH (3/4/6/8), so value position cannot launder it.
        expect(findTicketRefs(comment(`the marker was '#12209' back then`))).toHaveLength(1)
    });

    test('the escape marker still relieves a load-bearing ref', () => {
        expect(findTicketRefs(comment('kept deliberately #12209 ticket-ref-ok: pins the contract'))).toEqual([])
    });

    test('code outside comments is not scanned', () => {
        // The scan is comment-only; a ref in a string literal is not a durable comment.
        expect(findTicketRefs(`const url = 'https://github.com/neomjs/neo/issues/12209';`)).toEqual([])
    });

    test.describe('stripValueColors is positional, not a colour detector', () => {
        test('leaves a prose ref of colour length untouched', () => {
            // `#123` is a valid shorthand, but in prose it is a ticket — stripping by shape alone
            // would silently delete sibling-repository refs, which is the bug being fixed.
            expect(stripValueColors('see #123 for that')).toContain('#123')
        });

        test('removes the same token in value position', () => {
            expect(stripValueColors('color: #123')).not.toContain('#123')
        })
    })
});
