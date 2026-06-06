import {setup} from '../../../../setup.mjs';

const appName = 'GitLabIssueServiceTest';
setup({neoConfig: {unitTestMode: true}, appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';

/**
 * Unit coverage for the GitLab IssueService real behavior. Mocks `GitLabClient.query` (the transport
 * boundary) and asserts the GitLab GraphQL response -> MCP-contract parsing. Mirrors the
 * github-workflow IssueService test pattern.
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
});
