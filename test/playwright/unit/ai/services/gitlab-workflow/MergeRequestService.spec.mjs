import {setup} from '../../../../setup.mjs';

const appName = 'GitLabMergeRequestServiceTest';
setup({neoConfig: {unitTestMode: true}, appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Unit coverage for the GitLab MergeRequestService real behavior. Mocks `GitLabClient.query` (the
 * transport boundary) and asserts the GitLab GraphQL response -> MCP-contract parsing, the GitLab
 * id-resolution steps (MR iid -> gid, label name -> id), action routing, the username-native
 * assignee/reviewer set-mutations, and mutation error surfacing. Mirrors the IssueService test
 * pattern (the MR twin). Multi-call methods branch on the operation name embedded in the query
 * string; the `GetMergeRequestGid` check is ordered before `GetMergeRequest` because the former
 * is a substring of nothing else but the latter is a prefix of the former.
 */
let MergeRequestService, GitLabClient, originalQuery;

test.beforeAll(async () => {
    GitLabClient         = (await import('../../../../../../ai/services/gitlab-workflow/GitLabClient.mjs')).default;
    MergeRequestService  = (await import('../../../../../../ai/services/gitlab-workflow/MergeRequestService.mjs')).default;
    originalQuery        = GitLabClient.query.bind(GitLabClient);
});

test.afterEach(() => {
    GitLabClient.query = originalQuery;
});

test.describe('Neo.ai.services.gitlab-workflow.MergeRequestService', () => {
    // --- listMergeRequests -------------------------------------------------------------------

    test('listMergeRequests maps GitLab project.mergeRequests nodes to the MCP item shape (#12631)', async () => {
        GitLabClient.query = async () => ({
            project: {mergeRequests: {nodes: [
                {iid: '1', title: 'First', state: 'opened', webUrl: 'https://gitlab/1', sourceBranch: 'feat/a', targetBranch: 'main', createdAt: 't1', updatedAt: 't2', labels: {nodes: [{title: 'bug'}, {title: 'p1'}]}, assignees: {nodes: [{username: 'alice'}]}, reviewers: {nodes: [{username: 'bob'}]}},
                {iid: '2', title: 'Second', state: 'merged', webUrl: 'https://gitlab/2', sourceBranch: 'feat/b', targetBranch: 'main', createdAt: 't3', updatedAt: 't4', labels: {nodes: []}, assignees: {nodes: []}, reviewers: {nodes: []}}
            ]}}
        });

        const result = await MergeRequestService.listMergeRequests({limit: 10, state: 'all'});

        expect(result.count).toBe(2);
        expect(result.items[0]).toEqual({
            iid      : '1', title: 'First', state: 'opened', webUrl: 'https://gitlab/1',
            sourceBranch: 'feat/a', targetBranch: 'main', createdAt: 't1', updatedAt: 't2',
            labels: ['bug', 'p1'], assignees: ['alice'], reviewers: ['bob']
        });
        expect(result.items[1].labels).toEqual([]);
        expect(result.items[1].assignees).toEqual([]);
        expect(result.items[1].reviewers).toEqual([]);
    });

    test('listMergeRequests forwards filters as GitLab GraphQL variables (#12631)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {project: {mergeRequests: {nodes: []}}};
        };

        await MergeRequestService.listMergeRequests({limit: 5, state: 'merged', author: 'bob'});

        expect(captured.first).toBe(5);
        expect(captured.state).toBe('merged');
        expect(captured.authorUsername).toBe('bob');
    });

    test('listMergeRequests returns empty and is resilient to a null project (#12631)', async () => {
        GitLabClient.query = async () => ({project: null});

        const result = await MergeRequestService.listMergeRequests();

        expect(result).toEqual({items: [], count: 0});
    });

    test('listMergeRequests wraps a transport failure in a structured error (#12631)', async () => {
        GitLabClient.query = async () => { throw new Error('network down'); };

        const result = await MergeRequestService.listMergeRequests();

        expect(result.code).toBe('GITLAB_API_ERROR');
    });

    // --- getMergeRequest ---------------------------------------------------------------------

    test('getMergeRequest maps a single MR node (#12631)', async () => {
        GitLabClient.query = async () => ({
            project: {mergeRequest: {iid: '7', title: 'MR', state: 'opened', webUrl: 'https://gitlab/7', sourceBranch: 'feat/x', targetBranch: 'main', createdAt: 't1', updatedAt: 't2', labels: {nodes: [{title: 'bug'}]}, assignees: {nodes: []}, reviewers: {nodes: [{username: 'carol'}]}}}
        });

        const result = await MergeRequestService.getMergeRequest({merge_request_iid: 7});

        expect(result.iid).toBe('7');
        expect(result.sourceBranch).toBe('feat/x');
        expect(result.reviewers).toEqual(['carol']);
        expect(result.labels).toEqual(['bug']);
    });

    test('getMergeRequest returns MERGE_REQUEST_NOT_FOUND for a missing MR (#12631)', async () => {
        GitLabClient.query = async () => ({project: {mergeRequest: null}});

        const result = await MergeRequestService.getMergeRequest({merge_request_iid: 999});

        expect(result.code).toBe('MERGE_REQUEST_NOT_FOUND');
    });

    // --- manageMergeRequestComment -----------------------------------------------------------

    test('manageMergeRequestComment create resolves the MR gid then creates a note (#12631)', async () => {
        let noteVars;
        GitLabClient.query = async (query, variables) => {
            if (query.includes('GetMergeRequestGid')) return {project: {mergeRequest: {id: 'gid://gitlab/MergeRequest/99'}}};
            noteVars = variables;
            return {createNote: {note: {id: 'gid://gitlab/Note/500', body: 'hi'}, errors: []}};
        };

        const result = await MergeRequestService.manageMergeRequestComment({action: 'create', merge_request_iid: 3, body: 'hi'});

        expect(noteVars.noteableId).toBe('gid://gitlab/MergeRequest/99');
        expect(result.noteId).toBe('gid://gitlab/Note/500');
    });

    test('manageMergeRequestComment create returns MERGE_REQUEST_NOT_FOUND when the gid is null (#12631)', async () => {
        GitLabClient.query = async () => ({project: {mergeRequest: null}});

        const result = await MergeRequestService.manageMergeRequestComment({action: 'create', merge_request_iid: 404, body: 'hi'});

        expect(result.code).toBe('MERGE_REQUEST_NOT_FOUND');
    });

    test('manageMergeRequestComment update addresses the note by reconstructed global id (#12631)', async () => {
        let updateVars;
        GitLabClient.query = async (query, variables) => {
            updateVars = variables;
            return {updateNote: {note: {id: 'gid://gitlab/Note/500', body: 'edited'}, errors: []}};
        };

        const result = await MergeRequestService.manageMergeRequestComment({action: 'update', note_id: 500, body: 'edited'});

        expect(updateVars.id).toBe('gid://gitlab/Note/500');
        expect(result.noteId).toBe('gid://gitlab/Note/500');
    });

    test('manageMergeRequestComment rejects an invalid action (#12631)', async () => {
        const result = await MergeRequestService.manageMergeRequestComment({action: 'destroy', merge_request_iid: 1, body: 'x'});
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });

    // --- manageMergeRequestLabels ------------------------------------------------------------

    test('manageMergeRequestLabels add resolves label names to ids and forwards labelIds + APPEND (#12631)', async () => {
        let setVars;
        GitLabClient.query = async (query, variables) => {
            if (query.includes('GetProjectLabelIds')) {
                return {project: {labels: {nodes: [
                    {id: 'gid://gitlab/ProjectLabel/1', title: 'bug'},
                    {id: 'gid://gitlab/ProjectLabel/2', title: 'p1'}
                ]}}};
            }
            setVars = variables;
            return {mergeRequestSetLabels: {mergeRequest: {iid: '4', labels: {nodes: [{title: 'bug'}, {title: 'p1'}]}}, errors: []}};
        };

        const result = await MergeRequestService.manageMergeRequestLabels({merge_request_iid: 4, action: 'add', labels: ['bug', 'p1']});

        expect(setVars.labelIds).toEqual(['gid://gitlab/ProjectLabel/1', 'gid://gitlab/ProjectLabel/2']);
        expect(setVars.operationMode).toBe('APPEND');
        expect(setVars.iid).toBe('4');
        expect(result.labels).toEqual(['bug', 'p1']);
    });

    test('manageMergeRequestLabels remove forwards REMOVE (#12631)', async () => {
        let setVars;
        GitLabClient.query = async (query, variables) => {
            if (query.includes('GetProjectLabelIds')) return {project: {labels: {nodes: [{id: 'gid://gitlab/ProjectLabel/1', title: 'bug'}]}}};
            setVars = variables;
            return {mergeRequestSetLabels: {mergeRequest: {iid: '4', labels: {nodes: []}}, errors: []}};
        };

        await MergeRequestService.manageMergeRequestLabels({merge_request_iid: 4, action: 'remove', labels: ['bug']});

        expect(setVars.operationMode).toBe('REMOVE');
    });

    test('manageMergeRequestLabels rejects unknown label names with LABEL_NOT_FOUND (#12631)', async () => {
        GitLabClient.query = async () => ({project: {labels: {nodes: [{id: 'gid://gitlab/ProjectLabel/1', title: 'bug'}]}}});

        const result = await MergeRequestService.manageMergeRequestLabels({merge_request_iid: 4, action: 'add', labels: ['bug', 'ghost']});

        expect(result.code).toBe('LABEL_NOT_FOUND');
    });

    // --- manageMergeRequestAssignees ---------------------------------------------------------

    test('manageMergeRequestAssignees add forwards APPEND + usernames (#12631)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {mergeRequestSetAssignees: {mergeRequest: {assignees: {nodes: [{username: 'alice'}]}}, errors: []}};
        };

        const result = await MergeRequestService.manageMergeRequestAssignees({merge_request_iid: 6, action: 'add', assignees: ['alice']});

        expect(captured.operationMode).toBe('APPEND');
        expect(captured.assigneeUsernames).toEqual(['alice']);
        expect(result.assignees).toEqual(['alice']);
    });

    test('manageMergeRequestAssignees surfaces a GitLab mutation error payload (#12631)', async () => {
        GitLabClient.query = async () => ({mergeRequestSetAssignees: {mergeRequest: null, errors: ['Cannot assign']}});

        const result = await MergeRequestService.manageMergeRequestAssignees({merge_request_iid: 6, action: 'add', assignees: ['ghost']});

        expect(result.code).toBe('GITLAB_MUTATION_ERROR');
        expect(result.message).toContain('Cannot assign');
    });

    // --- manageMergeRequestReviewers ---------------------------------------------------------

    test('manageMergeRequestReviewers add forwards APPEND + reviewerUsernames (#12631)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {mergeRequestSetReviewers: {mergeRequest: {reviewers: {nodes: [{username: 'carol'}]}}, errors: []}};
        };

        const result = await MergeRequestService.manageMergeRequestReviewers({merge_request_iid: 6, action: 'add', reviewers: ['carol']});

        expect(captured.operationMode).toBe('APPEND');
        expect(captured.reviewerUsernames).toEqual(['carol']);
        expect(result.reviewers).toEqual(['carol']);
    });

    test('manageMergeRequestReviewers remove forwards REMOVE (#12631)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {mergeRequestSetReviewers: {mergeRequest: {reviewers: {nodes: []}}, errors: []}};
        };

        await MergeRequestService.manageMergeRequestReviewers({merge_request_iid: 6, action: 'remove', reviewers: ['carol']});

        expect(captured.operationMode).toBe('REMOVE');
    });

    test('manageMergeRequestReviewers rejects an invalid action (#12631)', async () => {
        const result = await MergeRequestService.manageMergeRequestReviewers({merge_request_iid: 6, action: 'toggle', reviewers: ['carol']});
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });
});
