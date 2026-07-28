import {test, expect} from '@playwright/test';
import {
    classifyMailboxReadState,
    normalizeMailboxIdentityForComparison,
    validateMailboxReadStateRequest
} from '../../../../../../../ai/services/memory-core/helpers/mailboxReadStateClassifier.mjs';

const MESSAGE_ID = 'MESSAGE:classifier';
const RECIPIENT  = '@neo-gpt';

/**
 * @summary Encodes one graph node as the raw row shape consumed by the classifier.
 * @param {Object} record Graph node record.
 * @returns {Object}
 */
function nodeRow(record) {
    return {id: record.id, data: JSON.stringify(record)}
}

/**
 * @summary Encodes one graph edge as the raw row shape consumed by the classifier.
 * @param {Object} record Graph edge record.
 * @returns {Object}
 */
function edgeRow(record) {
    return {
        id    : record.id,
        source: record.source,
        target: record.target,
        type  : record.type,
        data  : JSON.stringify(record)
    }
}

/**
 * @summary Creates the canonical MESSAGE row with an explicit direct-carrier readAt value.
 * @param {*} readAt Persisted receipt value.
 * @param {Object} [properties] Full properties override.
 * @returns {Object}
 */
function messageRow(readAt=null, properties={subject: 'classifier', readAt}) {
    return nodeRow({
        id   : MESSAGE_ID,
        label: 'MESSAGE',
        properties
    })
}

/**
 * @summary Creates one raw mailbox route row for the classifier matrix.
 * @param {Object} options
 * @returns {Object}
 */
function routeRow({id, target, type, properties={}}) {
    return edgeRow({
        id,
        source: MESSAGE_ID,
        target,
        type,
        properties
    })
}

/**
 * @summary Runs the pure classifier with canonical request identifiers.
 * @param {Object[]} messageRows Raw node rows.
 * @param {Object[]} edgeRows Raw edge rows.
 * @returns {Object}
 */
function classify(messageRows, edgeRows) {
    return classifyMailboxReadState({
        messageId: MESSAGE_ID,
        recipient: RECIPIENT,
        messageRows,
        edgeRows
    })
}

test.describe('mailboxReadStateClassifier — pure carrier matrix (#16086)', () => {
    test('pins the shared diagnostic and authorization normalization contract (#16098)', () => {
        for (const [label, input, expected] of [
            ['canonical direct id',                 '@neo-gpt',                 '@neo-gpt'],
            ['bare direct id',                      'neo-gpt',                  '@neo-gpt'],
            ['leading-space direct id',             ' @neo-gpt',                '@neo-gpt'],
            ['trailing-space direct id',            '@neo-gpt ',                '@neo-gpt'],
            ['two-sided-space direct id',           '  @neo-gpt  ',             '@neo-gpt'],
            ['tab-padded direct id',                '\t@neo-gpt',               '@neo-gpt'],
            ['double-at direct id',                 '@@neo-gpt',                '@neo-gpt'],
            ['triple-at direct id',                 '@@@neo-gpt',               '@neo-gpt'],
            ['four-at direct id',                   '@@@@neo-gpt',              '@neo-gpt'],
            ['bare AGENT wrapper',                  'AGENT:neo-gpt',            '@neo-gpt'],
            ['canonical AGENT wrapper',             'AGENT:@neo-gpt',           '@neo-gpt'],
            ['padded multi-at AGENT wrapper',       'AGENT:  @@neo-gpt  ',      '@neo-gpt'],
            ['family/model alias',                  'AGENT:openai/gpt',         'AGENT:openai/gpt'],
            ['broadcast sentinel',                  'AGENT:*',                  'AGENT:*'],
            ['role address',                        'role:librarian',            'role:librarian'],
            ['human address',                       'human:tobiu',               'human:tobiu'],
            ['future-self alias',                   '@me',                      '@me'],
            ['empty string',                        '',                         ''],
            ['null',                                null,                       null],
            ['undefined',                           undefined,                  undefined],
            ['boolean',                             false,                      false],
            ['number',                              0,                          0]
        ]) {
            expect(normalizeMailboxIdentityForComparison(input), label).toBe(expected);
        }

        expect(validateMailboxReadStateRequest({
            messageId: MESSAGE_ID,
            recipient: '@@@neo-gpt'
        })).toEqual({
            messageId: MESSAGE_ID,
            recipient: RECIPIENT
        });
        expect(() => validateMailboxReadStateRequest({
            messageId: MESSAGE_ID,
            recipient: 'role:librarian'
        })).toThrow(/direct agent identity/);
    });

    for (const [label, readAt, expectedState] of [
        ['unread', null, 'unread'],
        ['read', '2026-07-28T08:00:00.000Z', 'read']
    ]) {
        test(`classifies a direct MESSAGE carrier as ${label}`, () => {
            const result = classify(
                [messageRow(readAt)],
                [routeRow({id: 'EDGE:direct', target: '  @@neo-gpt  ', type: 'SENT_TO'})]
            );

            expect(result).toMatchObject({
                ok       : true,
                state    : expectedState,
                messageId: MESSAGE_ID,
                recipient: RECIPIENT,
                route    : 'direct',
                carrier  : {
                    kind : 'MESSAGE',
                    rowId: MESSAGE_ID,
                    readAt
                }
            });
        });
    }

    for (const [label, readAt, expectedState] of [
        ['unread', null, 'unread'],
        ['read', '2026-07-28T08:01:00.000Z', 'read']
    ]) {
        test(`classifies a receipt-backed broadcast carrier as ${label}`, () => {
            const result = classify(
                [messageRow(null)],
                [
                    routeRow({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'}),
                    routeRow({
                        id        : 'EDGE:delivery',
                        target    : 'AGENT:neo-gpt',
                        type      : 'DELIVERED_TO',
                        properties: {readAt}
                    })
                ]
            );

            expect(result).toMatchObject({
                ok       : true,
                state    : expectedState,
                messageId: MESSAGE_ID,
                recipient: RECIPIENT,
                route    : 'broadcast',
                carrier  : {
                    kind     : 'DELIVERED_TO',
                    rowId    : 'EDGE:delivery',
                    recipient: RECIPIENT,
                    readAt
                }
            });
        });
    }

    test('distinguishes missing message from missing broadcast recipient carrier', () => {
        expect(classify([], [])).toMatchObject({
            ok     : true,
            state  : 'message-missing',
            route  : null,
            carrier: null
        });

        expect(classify(
            [messageRow(null)],
            [routeRow({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'})]
        )).toMatchObject({
            ok     : true,
            state  : 'recipient-carrier-missing',
            route  : 'broadcast',
            carrier: {
                kind     : 'DELIVERED_TO',
                rowId    : null,
                recipient: RECIPIENT
            }
        });
    });

    test('keeps malformed and conflicting graph state as completed observations', () => {
        const malformed = classify(
            [{id: MESSAGE_ID, data: `{"id":"${MESSAGE_ID}",`}],
            []
        );
        const conflicting = classify(
            [messageRow(null)],
            [
                routeRow({id: 'EDGE:direct', target: RECIPIENT, type: 'SENT_TO'}),
                routeRow({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'})
            ]
        );
        const absentReadAt = classify(
            [messageRow(undefined, {subject: 'missing readAt'})],
            [routeRow({id: 'EDGE:direct', target: RECIPIENT, type: 'SENT_TO'})]
        );

        expect(malformed).toMatchObject({ok: true, state: 'malformed-storage', route: null});
        expect(conflicting).toMatchObject({ok: true, state: 'conflicting-storage', route: null});
        expect(absentReadAt).toMatchObject({ok: true, state: 'malformed-storage', route: 'direct'});
    });
});
