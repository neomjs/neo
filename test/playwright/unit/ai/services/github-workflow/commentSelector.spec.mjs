import {test, expect} from '@playwright/test';

import {
    ACCEPTED_COMMENT_ID_FORMS,
    commentMatches,
    malformedCommentIdError,
    omitScopedBody,
    parseCommentId
}                     from '../../../../../../ai/services/github-workflow/shared/commentSelector.mjs';

test.describe('commentSelector', () => {
    test.describe('parseCommentId — the four spellings that exist in the wild', () => {
        test('a GraphQL node ID resolves to a node selector', () => {
            expect(parseCommentId('IC_kwDODSospM8AAAABO_ziw')).toEqual({kind: 'node', nodeId: 'IC_kwDODSospM8AAAABO_ziw'});
            expect(parseCommentId('DC_kwDODSospM4BEwEj')).toEqual({kind: 'node', nodeId: 'DC_kwDODSospM4BEwEj'});
        });

        test('a bare number resolves to a numeric selector', () => {
            expect(parseCommentId('18022679')).toEqual({kind: 'numeric', databaseId: '18022679'});
        });

        test('a URL anchor resolves to the same numeric selector', () => {
            // The two spellings a peer actually holds. Both previously filtered every comment away
            // and returned an empty list with no error.
            expect(parseCommentId('discussioncomment-18022679')).toEqual({kind: 'numeric', databaseId: '18022679'});
            expect(parseCommentId('issuecomment-5301580683')).toEqual({kind: 'numeric', databaseId: '5301580683'});
            expect(parseCommentId('pullrequestreviewcomment-99')).toEqual({kind: 'numeric', databaseId: '99'});
        });

        test('a full comment URL reduces to its anchor', () => {
            expect(parseCommentId('https://github.com/neomjs/neo/issues/17151#issuecomment-5301580683'))
                .toEqual({kind: 'numeric', databaseId: '5301580683'});
            expect(parseCommentId('https://github.com/neomjs/neo/discussions/17136#discussioncomment-18022679'))
                .toEqual({kind: 'numeric', databaseId: '18022679'});
        });

        test('whitespace around a pasted id is tolerated', () => {
            expect(parseCommentId('  issuecomment-42  ')).toEqual({kind: 'numeric', databaseId: '42'});
        });

        test('a URL that is NOT a comment link is malformed, not an opaque node ID', () => {
            // The dangerous near-miss: admitting these as node IDs would turn a caller's wrong link
            // back into a silent empty result, which is the defect being removed.
            expect(parseCommentId('https://github.com/neomjs/neo/issues/17151')).toBeNull();
            expect(parseCommentId('https://github.com/neomjs/neo/pull/17161/files')).toBeNull();
        });

        test('unrecognised shapes are malformed', () => {
            for (const bad of ['', '   ', 'not an id', 'issuecomment-', 'comment-abc', '#', null, undefined, 42, {}, []]) {
                expect(parseCommentId(bad), `must reject ${JSON.stringify(bad)}`).toBeNull();
            }
        });
    });

    test.describe('commentMatches', () => {
        const comment = {id: 'IC_kwDOabc', databaseId: 5301580683, body: 'x'};

        test('matches on node ID', () => {
            expect(commentMatches(comment, parseCommentId('IC_kwDOabc'))).toBe(true);
            expect(commentMatches(comment, parseCommentId('IC_kwDOother'))).toBe(false);
        });

        test('matches on numeric id, whatever spelling produced it', () => {
            for (const spelling of [
                '5301580683',
                'issuecomment-5301580683',
                'https://github.com/neomjs/neo/issues/1#issuecomment-5301580683'
            ]) {
                expect(commentMatches(comment, parseCommentId(spelling)), spelling).toBe(true);
            }

            expect(commentMatches(comment, parseCommentId('issuecomment-999'))).toBe(false);
        });

        test('a node missing databaseId does not match a numeric selector, and does not throw', () => {
            // A query that forgot the field degrades to "no match" — visible via the absent-vs-
            // malformed distinction — rather than taking the request down.
            expect(commentMatches({id: 'IC_x'}, parseCommentId('123'))).toBe(false);
        });

        test('null inputs are false, never a throw', () => {
            expect(commentMatches(null, parseCommentId('123'))).toBe(false);
            expect(commentMatches(comment, null)).toBe(false);
        });
    });

    test.describe('malformedCommentIdError — reported, never silently filtered', () => {
        const err = malformedCommentIdError('comment_id', 'nonsense');

        test('names the parameter, the value, and every accepted form', () => {
            expect(err.code).toBe('MALFORMED_COMMENT_ID');
            expect(err.message).toContain('comment_id');
            expect(err.message).toContain('nonsense');
            expect(err.message).toContain('node ID');
            expect(err.message).toContain('numeric');
            expect(err.message).toContain('anchor');
        });

        test('the accepted-forms list is what the error actually quotes', () => {
            // Guards the drift where the constant is updated and the message keeps the old wording.
            expect(err.message).toContain(ACCEPTED_COMMENT_ID_FORMS);
        });
    });

    test.describe('omitScopedBody — the payload half', () => {
        const conversation = {title: 'T', body: 'x'.repeat(26_224), author: {login: 'a'}, comments: {nodes: [{id: '1'}]}};
        const scoped       = omitScopedBody(conversation);

        test('drops the body and says so', () => {
            expect(scoped.body).toBeUndefined();
            expect(scoped.bodyOmitted).toBe(true);
        });

        test('keeps everything else the caller scoped FOR', () => {
            expect(scoped.title).toBe('T');
            expect(scoped.author).toEqual({login: 'a'});
            expect(scoped.comments.nodes).toEqual([{id: '1'}]);
        });

        test('the scoped payload is bounded by what it returned, not by the thread head', () => {
            // The assertion that fails if the body ever reappears — the ticket's explicit ask.
            expect(JSON.stringify(scoped).length).toBeLessThan(conversation.body.length);
        });

        test('a consumer can tell "scoped away" from "empty body"', () => {
            // Both have no readable body; only the flag distinguishes them.
            expect(omitScopedBody({title: 'T', body: ''}).bodyOmitted).toBe(true);
        });

        test('null input degrades rather than throwing', () => {
            expect(omitScopedBody(null)).toEqual({bodyOmitted: true});
        });
    });
});
