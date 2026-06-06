import {setup} from '../../../../setup.mjs';

const appName = 'GitLabIssueServiceTest';
setup({neoConfig: {unitTestMode: true}, appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Unit coverage for the GitLab IssueService real behavior. Mocks `GitLabClient.query` (the transport
 * boundary) and asserts the GitLab GraphQL response -> MCP-contract parsing, the GitLab id-resolution
 * steps (issue iid -> gid, label name -> id), action routing, and mutation error surfacing. Mirrors
 * the github-workflow IssueService test pattern. Multi-call methods are mocked by branching on the
 * operation name embedded in the query string.
 */
let IssueService, GitLabClient, originalQuery;

test.beforeAll(async () => {
    GitLabClient = (await import('../../../../../../ai/services/gitlab-workflow/GitLabClient.mjs')).default;
    IssueService = (await import('../../../../../../ai/services/gitlab-workflow/IssueService.mjs')).default;
    originalQuery = GitLabClient.query.bind(GitLabClient);
});

test.afterEach(() => {
    GitLabClient.query = originalQuery;
});

test.describe('Neo.ai.services.gitlab-workflow.IssueService', () => {
    // --- listIssues --------------------------------------------------------------------------

    test('listIssues maps GitLab project.issues nodes to the MCP item shape (#12624)', async () => {
        GitLabClient.query = async () => ({
            project: {issues: {nodes: [
                {iid: '1', title: 'First', state: 'opened', webUrl: 'https://gitlab/1', createdAt: 't1', updatedAt: 't2', labels: {nodes: [{title: 'bug'}, {title: 'p1'}]}, assignees: {nodes: [{username: 'alice'}]}},
                {iid: '2', title: 'Second', state: 'opened', webUrl: 'https://gitlab/2', createdAt: 't3', updatedAt: 't4', labels: {nodes: []}, assignees: {nodes: []}}
            ]}}
        });

        const result = await IssueService.listIssues({limit: 10, state: 'opened'});

        expect(result.count).toBe(2);
        expect(result.items[0]).toEqual({
            iid      : '1', title: 'First', state: 'opened', webUrl: 'https://gitlab/1',
            createdAt: 't1', updatedAt: 't2', labels: ['bug', 'p1'], assignees: ['alice']
        });
        expect(result.items[1].labels).toEqual([]);
        expect(result.items[1].assignees).toEqual([]);
    });

    test('listIssues forwards filters as GitLab GraphQL variables (#12624)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {project: {issues: {nodes: []}}};
        };

        await IssueService.listIssues({limit: 5, state: 'closed', labels: 'bug, p1', assignee: 'bob'});

        expect(captured.first).toBe(5);
        expect(captured.state).toBe('closed');
        expect(captured.labelName).toEqual(['bug', 'p1']);
        expect(captured.assigneeUsernames).toEqual(['bob']);
    });

    test('listIssues returns empty and is resilient to a null project (#12624)', async () => {
        GitLabClient.query = async () => ({project: null});

        const result = await IssueService.listIssues();

        expect(result).toEqual({items: [], count: 0});
    });

    // --- createIssue -------------------------------------------------------------------------

    test('createIssue returns the created issue and forwards labels by name (#12624)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {createIssue: {issue: {iid: '7', title: 'New', webUrl: 'https://gitlab/7'}, errors: []}};
        };

        const result = await IssueService.createIssue({title: 'New', body: 'desc', labels: ['bug']});

        expect(captured.title).toBe('New');
        expect(captured.description).toBe('desc');
        expect(captured.labels).toEqual(['bug']);
        expect(result).toEqual({iid: '7', title: 'New', webUrl: 'https://gitlab/7'});
    });

    test('createIssue applies assignees via a follow-up APPEND issueSetAssignees (#12624)', async () => {
        let assignVars;
        GitLabClient.query = async (query, variables) => {
            if (query.includes('CreateIssue')) {
                return {createIssue: {issue: {iid: '8', title: 'X', webUrl: 'https://gitlab/8'}, errors: []}};
            }
            assignVars = variables;
            return {issueSetAssignees: {issue: {assignees: {nodes: [{username: 'alice'}]}}, errors: []}};
        };

        const result = await IssueService.createIssue({title: 'X', assignees: ['alice']});

        expect(assignVars.iid).toBe('8');
        expect(assignVars.assigneeUsernames).toEqual(['alice']);
        expect(assignVars.operationMode).toBe('APPEND');
        expect(result.assignees).toEqual(['alice']);
    });

    test('createIssue surfaces an assigneeWarning when the follow-up assign fails (graceful degradation) (#12624)', async () => {
        GitLabClient.query = async (query) => {
            if (query.includes('CreateIssue')) return {createIssue: {issue: {iid: '9', title: 'Y', webUrl: 'https://gitlab/9'}, errors: []}};
            throw new Error('assign failed');
        };

        const result = await IssueService.createIssue({title: 'Y', assignees: ['ghost']});

        expect(result.iid).toBe('9');
        expect(result.assigneeWarning).toBeTruthy();
        expect(result.assignees).toBeUndefined();
    });

    test('createIssue surfaces a GitLab mutation error payload (#12624)', async () => {
        GitLabClient.query = async () => ({createIssue: {issue: null, errors: ['Title can\'t be blank']}});

        const result = await IssueService.createIssue({title: ''});

        expect(result.code).toBe('GITLAB_MUTATION_ERROR');
        expect(result.message).toContain('Title can\'t be blank');
    });

    // --- manageIssueComment ------------------------------------------------------------------

    test('manageIssueComment create resolves the issue gid then creates a note (#12624)', async () => {
        let noteVars;
        GitLabClient.query = async (query, variables) => {
            if (query.includes('GetIssueGid')) return {project: {issue: {id: 'gid://gitlab/Issue/99'}}};
            noteVars = variables;
            return {createNote: {note: {id: 'gid://gitlab/Note/500', body: 'hi'}, errors: []}};
        };

        const result = await IssueService.manageIssueComment({action: 'create', issue_number: 3, body: 'hi'});

        expect(noteVars.noteableId).toBe('gid://gitlab/Issue/99');
        expect(result.noteId).toBe('gid://gitlab/Note/500');
    });

    test('manageIssueComment update addresses the note by reconstructed global id (#12624)', async () => {
        let updateVars;
        GitLabClient.query = async (query, variables) => {
            updateVars = variables;
            return {updateNote: {note: {id: 'gid://gitlab/Note/500', body: 'edited'}, errors: []}};
        };

        const result = await IssueService.manageIssueComment({action: 'update', note_id: 500, body: 'edited'});

        expect(updateVars.id).toBe('gid://gitlab/Note/500');
        expect(result.noteId).toBe('gid://gitlab/Note/500');
    });

    test('manageIssueComment rejects an invalid action (#12624)', async () => {
        const result = await IssueService.manageIssueComment({action: 'destroy', issue_number: 1, body: 'x'});
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });

    // --- manageIssueLabels -------------------------------------------------------------------

    test('manageIssueLabels add resolves label names to ids and forwards addLabelIds (#12624)', async () => {
        let updateVars;
        GitLabClient.query = async (query, variables) => {
            if (query.includes('GetProjectLabelIds')) {
                return {project: {labels: {nodes: [
                    {id: 'gid://gitlab/ProjectLabel/1', title: 'bug'},
                    {id: 'gid://gitlab/ProjectLabel/2', title: 'p1'}
                ]}}};
            }
            updateVars = variables;
            return {updateIssue: {issue: {iid: '4', labels: {nodes: [{title: 'bug'}, {title: 'p1'}]}}, errors: []}};
        };

        const result = await IssueService.manageIssueLabels({issue_number: 4, action: 'add', labels: ['bug', 'p1']});

        expect(updateVars.addLabelIds).toEqual(['gid://gitlab/ProjectLabel/1', 'gid://gitlab/ProjectLabel/2']);
        expect(updateVars.removeLabelIds).toBe(null);
        expect(updateVars.iid).toBe('4');
        expect(result.labels).toEqual(['bug', 'p1']);
    });

    test('manageIssueLabels rejects unknown label names with LABEL_NOT_FOUND (#12624)', async () => {
        GitLabClient.query = async () => ({project: {labels: {nodes: [{id: 'gid://gitlab/ProjectLabel/1', title: 'bug'}]}}});

        const result = await IssueService.manageIssueLabels({issue_number: 4, action: 'add', labels: ['bug', 'ghost']});

        expect(result.code).toBe('LABEL_NOT_FOUND');
    });

    // --- manageIssueAssignees ----------------------------------------------------------------

    test('manageIssueAssignees add forwards APPEND + usernames (#12624)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {issueSetAssignees: {issue: {assignees: {nodes: [{username: 'alice'}]}}, errors: []}};
        };

        const result = await IssueService.manageIssueAssignees({issue_number: 6, action: 'add', assignees: ['alice']});

        expect(captured.operationMode).toBe('APPEND');
        expect(captured.assigneeUsernames).toEqual(['alice']);
        expect(result.assignees).toEqual(['alice']);
    });

    test('manageIssueAssignees remove forwards REMOVE (#12624)', async () => {
        let captured;
        GitLabClient.query = async (query, variables) => {
            captured = variables;
            return {issueSetAssignees: {issue: {assignees: {nodes: []}}, errors: []}};
        };

        await IssueService.manageIssueAssignees({issue_number: 6, action: 'remove', assignees: ['alice']});

        expect(captured.operationMode).toBe('REMOVE');
    });
});
