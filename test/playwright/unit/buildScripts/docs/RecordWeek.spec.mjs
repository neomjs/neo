/**
 * @file test/playwright/unit/buildScripts/docs/RecordWeek.spec.mjs
 * @summary Pins what the hero's record holds: who gets a seat, who enters through the door, which pull requests
 * and reviews are left out, what the totals count, and how the file is read from the API and written.
 */

import {test, expect}                                                 from '@playwright/test';
import {buildRecord, fetchPulls, run, seatOf, serialize, windowLabel} from '../../../../../buildScripts/docs/recordWeek.mjs';

const
    from = '2026-11-13T00:00:00Z',
    to   = '2026-11-15T00:00:00Z',
    pull = (number, login, association, createdAt, mergedAt, reviews = [], extra = {}) => ({
        author: {bot: false, login}, authorAssociation: association, createdAt, mergedAt, mergedBy: 'tobiu', number, reviews, title: `title ${number}`, ...extra
    }),
    review = (login, state, submittedAt, association = 'MEMBER', bot = false) => ({association, bot, login, state, submittedAt});

/** @summary One pull request per rule the record applies. */
function pulls() {
    return [
        // a maintainer's, knocked back and then approved by another group; a bot's review rides along
        pull(3, 'neo-opus-ada', 'MEMBER', '2026-11-13T10:00:00Z', '2026-11-13T12:00:00Z', [
            review('neo-gpt-euclid', 'CHANGES_REQUESTED', '2026-11-13T10:30:00Z'),
            review('copilot-pull-request-reviewer', 'COMMENTED', '2026-11-13T10:31:00Z', 'NONE', true),
            review('neo-gpt-euclid', 'APPROVED', '2026-11-13T11:30:00Z')
        ]),
        // an outside author's, opened before the window; a review after the merge is no part of its way
        pull(1, 'jane', 'CONTRIBUTOR', '2026-11-12T20:00:00Z', '2026-11-13T01:00:00Z', [
            review('neo-gemini-maryam', 'APPROVED', '2026-11-13T00:30:00Z'),
            review('neo-opus-ada', 'APPROVED', '2026-11-13T02:00:00Z')
        ]),
        // an account that reads like a seat and is no member enters through the door
        pull(4, 'neo-gpt-fake', 'CONTRIBUTOR', '2026-11-14T08:00:00Z', '2026-11-14T09:00:00Z', [review('neo-opus-ada', 'APPROVED', '2026-11-14T08:30:00Z')]),
        // a maintainer's own approval of their own work counts nowhere
        pull(5, 'neo-gemini-maryam', 'COLLABORATOR', '2026-11-14T10:00:00Z', '2026-11-14T10:40:00Z', [
            review('neo-gemini-maryam', 'APPROVED', '2026-11-14T10:10:00Z'),
            review('neo-opus-ada', 'APPROVED', '2026-11-14T10:20:00Z')
        ]),
        // left out: a bot's, one merged before the window, one merged at its end
        pull(6, 'dependabot', 'NONE', '2026-11-13T05:00:00Z', '2026-11-13T05:10:00Z', [], {author: {bot: true, login: 'dependabot'}}),
        pull(7, 'neo-opus-ada', 'MEMBER', '2026-11-12T10:00:00Z', '2026-11-12T23:59:59Z'),
        pull(8, 'neo-opus-ada', 'MEMBER', '2026-11-14T23:00:00Z', '2026-11-15T00:00:00Z')
    ]
}

test('a seat is a member whose login names a model and a name; the model line names the group', () => {
    expect(seatOf('neo-opus-ada', 'MEMBER')).toEqual({group: 'claude', groupName: 'Claude', name: 'Ada'});
    expect(seatOf('neo-fable-clio', 'COLLABORATOR')).toMatchObject({group: 'claude', name: 'Clio'});
    expect(seatOf('neo-gpt-euclid', 'OWNER')).toMatchObject({group: 'gpt', groupName: 'GPT'});
    expect(seatOf('neo-kimi-phoebe', 'MEMBER'), 'an unknown line is a group of its own').toMatchObject({group: 'kimi', groupName: 'Kimi', name: 'Phoebe'});
    expect(seatOf('neo-gpt-fake', 'CONTRIBUTOR'), 'the login alone seats nobody').toBeNull();
    expect(seatOf('tobiu', 'OWNER')).toBeNull()
});

test('the record seats maintainers by group, puts everyone else at the door and the merger at the merge seat', () => {
    const record = buildRecord({from, pulls: pulls(), repo: 'neomjs/neo', to});

    expect(record.seats).toEqual([
        {group: 'claude', id: 'neo-opus-ada', kind: 'seat', name: 'Ada'},
        {group: 'gemini', id: 'neo-gemini-maryam', kind: 'seat', name: 'Maryam'},
        {group: 'gpt', id: 'neo-gpt-euclid', kind: 'seat', name: 'Euclid'},
        {id: 'door', kind: 'door', name: 'Contributors'},
        {id: 'tobiu', kind: 'merge', name: '@tobiu'}
    ]);
    expect(record.groups).toEqual([{id: 'claude', name: 'Claude'}, {id: 'gemini', name: 'Gemini'}, {id: 'gpt', name: 'GPT'}])
});

test('rows are sorted by their merge, in minutes from the window\'s start, with the reviews that led to it', () => {
    const {items} = buildRecord({from, pulls: pulls(), repo: 'neomjs/neo', to});

    expect(items).toEqual([
        [1, 'title 1', 3, 'jane', -240, 60, [[1, 'A', 30]]],
        [3, 'title 3', 0, null, 600, 720, [[2, 'C', 630], [2, 'A', 690]]],
        [4, 'title 4', 3, 'neo-gpt-fake', 1920, 1980, [[0, 'A', 1950]]],
        [5, 'title 5', 1, null, 2040, 2080, [[0, 'A', 2060]]]
    ])
});

test('the totals count what the rows hold, and the caption names the window', () => {
    const record = buildRecord({from, pulls: pulls(), repo: 'neomjs/neo', to});

    expect(record.totals).toEqual({
        approvals: 4, changeRequests: 1, contributors: 2, crossGroup: 2, maintainers: 3, medianMinutesToMerge: 120, merged: 4, reviews: 5, seatAuthored: 2
    });
    expect(record.caption, 'the change requests are the scene\'s to count, beside their colour').toBe('13–14 Nov 2026 · 5 reviews · 2 outside contributors · neomjs/neo');
    expect(record.unit, '"merged" leads, so a count of them cannot read as a share').toBe('merged pull requests, one square each');
    expect(record).toMatchObject({from: '2026-11-13T00:00:00.000Z', repo: 'neomjs/neo', to: '2026-11-15T00:00:00.000Z', version: 1})
});

test('a window is named by its first and last day, with both months where they differ', () => {
    expect(windowLabel(Date.parse('2026-11-13T00:00:00Z'), Date.parse('2026-11-20T00:00:00Z'))).toBe('13–19 Nov 2026');
    expect(windowLabel(Date.parse('2026-11-28T00:00:00Z'), Date.parse('2026-12-05T00:00:00Z'))).toBe('28 Nov – 4 Dec 2026');
    expect(windowLabel(Date.parse('2026-11-13T00:00:00Z'), Date.parse('2026-11-14T00:00:00Z'))).toBe('13 Nov 2026')
});

test('a long title is cut, and the file holds one pull request per line and reads back as the record', () => {
    const
        long   = 'x'.repeat(200),
        record = buildRecord({from, pulls: [pull(9, 'jane', 'NONE', '2026-11-13T01:00:00Z', '2026-11-13T02:00:00Z', [], {title: long})], repo: 'neomjs/neo', to}),
        text   = serialize(buildRecord({from, pulls: pulls(), repo: 'neomjs/neo', to}));

    expect(record.items[0][1]).toHaveLength(96);
    expect(record.items[0][1].endsWith('…')).toBe(true);
    expect(JSON.parse(text)).toEqual(buildRecord({from, pulls: pulls(), repo: 'neomjs/neo', to}));
    expect(text.split('\n').filter(line => line.startsWith('    [')).length, 'one row per line').toBe(4)
});

test('the API is read a day at a time and page by page, and its rows become pulls', async () => {
    const
        asked = [],
        node  = {
            author : {__typename: 'Bot', login: 'dependabot'}, authorAssociation: 'NONE', createdAt: 'c', mergedAt: 'm', mergedBy: null, number: 11, title: 't',
            reviews: {nodes: [{author: {__typename: 'User', login: 'neo-opus-ada'}, authorAssociation: 'MEMBER', state: 'APPROVED', submittedAt: 's'}, {author: null, state: 'COMMENTED'}]}
        },
        answers  = [
            {nodes: [node], pageInfo: {endCursor: 'next', hasNextPage: true}},
            {nodes: [{...node, number: 12}, {}], pageInfo: {hasNextPage: false}},
            {nodes: [], pageInfo: {hasNextPage: false}}
        ],
        fetchImpl = async (url, options) => {
            asked.push(JSON.parse(options.body).variables);
            return {json: async () => ({data: {search: answers.shift()}}), ok: true, status: 200}
        },
        result   = await fetchPulls({fetchImpl, from: Date.parse(from), repo: 'neomjs/neo', to: Date.parse(to), token: 'x'});

    expect(asked).toEqual([
        {after: null, q: 'repo:neomjs/neo is:pr is:merged merged:2026-11-13T00:00:00Z..2026-11-13T23:59:59Z'},
        {after: 'next', q: 'repo:neomjs/neo is:pr is:merged merged:2026-11-13T00:00:00Z..2026-11-13T23:59:59Z'},
        {after: null, q: 'repo:neomjs/neo is:pr is:merged merged:2026-11-14T00:00:00Z..2026-11-14T23:59:59Z'}
    ]);
    expect(result.map(row => row.number)).toEqual([11, 12]);
    expect(result[0]).toMatchObject({
        author : {bot: true, login: 'dependabot'}, mergedBy: null,
        reviews: [{association: 'MEMBER', bot: false, login: 'neo-opus-ada', state: 'APPROVED', submittedAt: 's'}]
    })
});

test('an API error stops the read with the status it came with', async () => {
    const fetchImpl = async () => ({json: async () => ({message: 'Bad credentials'}), ok: false, status: 401});

    await expect(fetchPulls({fetchImpl, from: Date.parse(from), repo: 'neomjs/neo', to: Date.parse(to), token: 'x'})).rejects.toThrow(/401.*Bad credentials/)
});

test('the CLI refuses a run without a token and names the variables, and refuses a window it cannot read', async () => {
    const lines = [], original = console.error;

    console.error = line => lines.push(line);

    try {
        expect(await run([], {})).toBe(1);
        expect(await run(['--days', '0'], {GH_TOKEN: 'x'})).toBe(1);
        expect(await run(['--to', 'yesterday'], {GITHUB_TOKEN: 'x'})).toBe(1)
    } finally {
        console.error = original
    }

    expect(lines[0]).toMatch(/GH_TOKEN or GITHUB_TOKEN/);
    expect(lines).toHaveLength(3)
});
