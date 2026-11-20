// Measures, for a window of days, how the public neomjs repositories' merged pull requests were written, reviewed
// and merged. Usage: node tmp/readme-look/review-share.mjs 2026-10-21 2026-11-20 [--diag]
// The fetched pull requests are cached beside this file, one JSON per window.
import {execFileSync}                            from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join}                           from 'node:path';
import {fileURLToPath}                           from 'node:url';

const
    args = process.argv.slice(2),
    diag = args.includes('--diag'),
    [from = '2026-10-21', to = '2026-11-20'] = args.filter(arg => !arg.startsWith('--')),
    cache  = join(dirname(fileURLToPath(import.meta.url)), `prs-${from}_${to}.json`),
    family = {
        'neo-opus-ada'       : 'claude', 'neo-opus-grace': 'claude', 'neo-opus-vega': 'claude',
        'neo-fable-mnemosyne': 'claude', 'neo-fable-clio': 'claude',
        'neo-gemini-julia'   : 'gemini', 'neo-gemini-maryam': 'gemini',
        'neo-gpt-euclid'     : 'gpt', 'neo-gpt-emmy': 'gpt', 'neo-gpt-sophie': 'gpt',
        'neo-kimi-phoebe'    : 'kimi', 'neo-kimi-iris': 'kimi',
        'neo-preview'        : 'undisclosed'
    },
    query = `query($q: String!, $cursor: String) {
        search(query: $q, type: ISSUE, first: 100, after: $cursor) {
            issueCount
            pageInfo {hasNextPage endCursor}
            nodes {... on PullRequest {
                number title createdAt mergedAt
                repository {nameWithOwner}
                author {login __typename}
                mergedBy {login}
                reviews(first: 60) {totalCount nodes {author {login} state submittedAt}}
            }}
        }
    }`;

/**
 * @summary One page of the search.
 * @param {String} q
 * @param {String|null} cursor
 * @returns {Object}
 */
function page(q, cursor) {
    const params = ['api', 'graphql', '-f', `query=${query}`, '-f', `q=${q}`];

    cursor && params.push('-f', `cursor=${cursor}`);

    return JSON.parse(execFileSync('gh', params, {maxBuffer: 256 * 1024 * 1024}).toString()).data.search
}

/**
 * @summary Every merged pull request of one day range; a search returns at most 1,000 results, so ranges stay short.
 * @param {String} start
 * @param {String} end
 * @returns {Object[]}
 */
function collect(start, end) {
    const
        q     = `org:neomjs is:public is:pr is:merged merged:${start}..${end} -author:app/dependabot`,
        nodes = [];

    let cursor = null, result;

    do {
        result = page(q, cursor);
        nodes.push(...result.nodes);
        cursor = result.pageInfo.endCursor
    } while (result.pageInfo.hasNextPage);

    if (nodes.length !== result.issueCount || result.issueCount >= 1000) {
        throw new Error(`${start}..${end}: read ${nodes.length} of ${result.issueCount}`)
    }

    return nodes
}

/**
 * @summary The window in ranges of four days.
 * @returns {String[][]}
 */
function ranges() {
    const out = [], day = 86400000, last = Date.parse(`${to}T00:00:00Z`);

    for (let start = Date.parse(`${from}T00:00:00Z`); start <= last; start += 4 * day) {
        out.push([new Date(start), new Date(Math.min(start + 3 * day, last))].map(date => date.toISOString().slice(0, 10)))
    }

    return out
}

let prs;

if (existsSync(cache)) {
    prs = JSON.parse(readFileSync(cache, 'utf8'))
} else {
    prs = ranges().flatMap(([start, end]) => collect(start, end));
    writeFileSync(cache, JSON.stringify(prs))
}

const
    seen   = new Set(),
    unique = prs.filter(pr => {
        const key = `${pr.repository.nameWithOwner}#${pr.number}`;
        return seen.has(key) ? false : seen.add(key)
    }),
    isBot     = pr => pr.author?.__typename === 'Bot',
    ai        = unique.filter(pr => family[pr.author?.login]),
    operator  = unique.filter(pr => pr.author?.login === 'tobiu'),
    outside   = unique.filter(pr => !family[pr.author?.login] && pr.author?.login !== 'tobiu' && !isBot(pr)),
    bots      = unique.filter(isBot),
    count     = (list, predicate) => list.filter(predicate).length,
    reviewsOf = pr => pr.reviews.nodes.filter(review => review.author?.login && review.author.login !== pr.author?.login),
    approvals = pr => reviewsOf(pr).filter(review => review.state === 'APPROVED'),
    crossFamily = pr => approvals(pr).some(review => {
        const reviewer = family[review.author.login];
        return reviewer && reviewer !== family[pr.author.login]
    }),
    // A change request that the reviewer later replaced, or that a push dismissed, is listed as DISMISSED.
    sentBack  = pr => reviewsOf(pr).some(review => review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED'),
    // More than one formal review by the same reviewer: a second round took place.
    secondRound = pr => {
        const perReviewer = {};

        reviewsOf(pr).filter(review => review.state !== 'COMMENTED').forEach(review => {
            perReviewer[review.author.login] = (perReviewer[review.author.login] || 0) + 1
        });

        return Object.values(perReviewer).some(n => n > 1)
    },
    mergers   = {};

ai.forEach(pr => {
    const login = pr.mergedBy?.login || 'unknown';
    mergers[login] = (mergers[login] || 0) + 1
});

console.log(`window ${from}..${to}: ${unique.length} merged pull requests without Dependabot (${bots.length} by other bots)`);
console.log(`  written by AI maintainer accounts: ${ai.length} · by the operator: ${operator.length} · by outside accounts: ${outside.length} from ${new Set(outside.map(pr => pr.author.login)).size} accounts`);
console.log(`  AI-written, approved by a maintainer of a different model family: ${count(ai, crossFamily)}`);
console.log(`  AI-written, with a review in state CHANGES_REQUESTED today: ${count(ai, pr => reviewsOf(pr).some(review => review.state === 'CHANGES_REQUESTED'))}`);
console.log(`  AI-written, with a review in state CHANGES_REQUESTED or DISMISSED: ${count(ai, sentBack)}`);
console.log(`  AI-written, with a second formal review by the same reviewer: ${count(ai, secondRound)}`);
console.log(`  AI-written, sent back or reviewed twice: ${count(ai, pr => sentBack(pr) || secondRound(pr))}`);
console.log(`  AI-written, merged by: ${Object.entries(mergers).sort((a, b) => b[1] - a[1]).map(([login, n]) => `${login} ${n}`).join(', ')}`);
console.log(`  outside-written, approved by a maintainer: ${count(outside, pr => approvals(pr).some(review => family[review.author.login]))}`);

if (diag) {
    const states = {}, first = {}, truncated = count(ai, pr => pr.reviews.totalCount > pr.reviews.nodes.length);

    ai.forEach(pr => {
        const formal = reviewsOf(pr).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

        formal.forEach(review => {states[review.state] = (states[review.state] || 0) + 1});

        const opening = formal.find(review => review.state !== 'COMMENTED')?.state || (formal.length ? 'COMMENTED only' : 'no review');
        first[opening] = (first[opening] || 0) + 1
    });

    console.log('  diag: review states over all reviews of AI-written pull requests:', JSON.stringify(states));
    console.log('  diag: first formal review per AI-written pull request:', JSON.stringify(first));
    console.log('  diag: pull requests with more reviews than were read:', truncated);
    console.log('  diag: by repository:', JSON.stringify(ai.reduce((map, pr) => {
        map[pr.repository.nameWithOwner] = (map[pr.repository.nameWithOwner] || 0) + 1;
        return map
    }, {})))
}
