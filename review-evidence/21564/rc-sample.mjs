// Sample check: do change requests on AI-written pull requests also arrive outside formal reviews?
// Usage: node tmp/readme-look/rc-sample.mjs 2026-11-16 2026-11-20
import {execFileSync} from 'node:child_process';

const
    [from, to] = process.argv.slice(2),
    seats      = /^neo-(opus|fable|gemini|gpt|kimi)-|^neo-preview$/,
    query      = `query($q: String!, $cursor: String) {
        search(query: $q, type: ISSUE, first: 50, after: $cursor) {
            issueCount
            pageInfo {hasNextPage endCursor}
            nodes {... on PullRequest {
                number
                author {login}
                reviews(first: 60) {nodes {author {login} state bodyText}}
                comments(first: 60) {nodes {author {login} bodyText}}
            }}
        }
    }`,
    marker = /request(ed|ing)? changes|changes requested|request_changes|required action|\bRA-\d/i;

let cursor = null, result, prs = [];

do {
    const params = ['api', 'graphql', '-f', `query=${query}`, '-f', `q=repo:neomjs/neo is:pr is:merged merged:${from}..${to} -author:app/dependabot`];

    cursor && params.push('-f', `cursor=${cursor}`);
    result = JSON.parse(execFileSync('gh', params, {maxBuffer: 512 * 1024 * 1024}).toString()).data.search;
    prs.push(...result.nodes);
    cursor = result.pageInfo.endCursor
} while (result.pageInfo.hasNextPage);

const
    ai       = prs.filter(pr => seats.test(pr.author?.login || '')),
    others   = (pr, list) => list.filter(item => item.author?.login && item.author.login !== pr.author.login && seats.test(item.author.login)),
    formalRc = pr => others(pr, pr.reviews.nodes).some(review => review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED'),
    softRc   = pr => others(pr, pr.reviews.nodes).some(review => review.state === 'COMMENTED' && marker.test(review.bodyText))
        || others(pr, pr.comments.nodes).some(comment => marker.test(comment.bodyText)),
    approvedWithActions = pr => others(pr, pr.reviews.nodes).some(review => review.state === 'APPROVED' && /required action|\bRA-\d/i.test(review.bodyText));

console.log(`neomjs/neo, merged ${from}..${to}: ${prs.length} pull requests, ${ai.length} written by AI maintainers`);
console.log(`  with a formal change request: ${ai.filter(formalRc).length}`);
console.log(`  without one, but with a peer's comment or comment-review that names a change request or a required action: ${ai.filter(pr => !formalRc(pr) && softRc(pr)).length}`);
console.log(`  without a formal change request, approved with required actions named in the approval: ${ai.filter(pr => !formalRc(pr) && approvedWithActions(pr)).length}`);
console.log(`  either: ${ai.filter(pr => formalRc(pr) || softRc(pr) || approvedWithActions(pr)).length}`);
console.log('  examples without a formal change request but with a marker:', ai.filter(pr => !formalRc(pr) && (softRc(pr) || approvedWithActions(pr))).slice(0, 8).map(pr => '#' + pr.number).join(' '));
