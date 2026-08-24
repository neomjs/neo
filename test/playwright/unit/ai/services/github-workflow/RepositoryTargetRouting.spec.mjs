import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'RepositoryTargetRoutingTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('github-workflow 18-operation repository-target boundary (#17420)', () => {
    let DiscussionService,
        GraphqlService,
        IssueService,
        LabelService,
        PullRequestService,
        RepositoryService,
        originalQuery,
        originalRest,
        originalGetViewerPermission;

    test.beforeAll(async () => {
        ({default: DiscussionService}  = await import('../../../../../../ai/services/github-workflow/DiscussionService.mjs'));
        ({default: GraphqlService}     = await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs'));
        ({default: IssueService}       = await import('../../../../../../ai/services/github-workflow/IssueService.mjs'));
        ({default: LabelService}       = await import('../../../../../../ai/services/github-workflow/LabelService.mjs'));
        ({default: PullRequestService} = await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs'));
        ({default: RepositoryService}  = await import('../../../../../../ai/services/github-workflow/RepositoryService.mjs'));

        originalQuery = GraphqlService.query.bind(GraphqlService);
        originalRest  = GraphqlService.rest .bind(GraphqlService);
        originalGetViewerPermission = RepositoryService.getViewerPermission.bind(RepositoryService);
    });

    test.afterEach(() => {
        GraphqlService.query = originalQuery;
        GraphqlService.rest  = originalRest;
        RepositoryService.getViewerPermission = originalGetViewerPermission;
    });

    test('every remote operation rejects an empty target before GitHub I/O', async () => {
        let githubCalls = 0,
            execCalls   = 0;

        GraphqlService.query = async () => { githubCalls++; throw new Error('unexpected GraphQL I/O') };
        GraphqlService.rest  = async () => { githubCalls++; throw new Error('unexpected REST I/O') };

        const invalid    = {repo: ''};
        const operations = [
            ['list_labels',                 () => LabelService.listLabels(invalid)],
            ['list_pull_requests',          () => PullRequestService.listPullRequests(invalid)],
            ['get_pull_request_diff',       () => PullRequestService.getPullRequestDiff({...invalid, pr_number: 1})],
            ['get_conversation',            () => PullRequestService.getConversation({...invalid, pr_number: 1})],
            ['manage_issue_comment',        () => IssueService.manageIssueComment({...invalid, issue_number: 1, body: 'x', action: 'create'})],
            ['manage_issue_labels',         () => IssueService.manageIssueLabels({...invalid, issue_number: 1, labels: ['bug'], action: 'add'})],
            ['manage_issue_assignees',      () => IssueService.manageIssueAssignees({...invalid, issue_number: 1, assignees: ['neo-gpt'], action: 'add'})],
            ['manage_pr_review',            () => PullRequestService.managePrReview({...invalid, action: 'create', pr_number: 1, state: 'COMMENT', body: 'x'})],
            ['manage_pr_reviewers',          () => PullRequestService.managePrReviewers({...invalid, pr_number: 1, reviewers: ['neo-gpt'], action: 'add'}, {execFn: async () => { execCalls++ }})],
            ['list_issues',                 () => IssueService.listIssues(invalid)],
            ['create_issue',                () => IssueService.createIssue({...invalid, title: 'x'})],
            ['manage_issue_projects',       () => IssueService.manageIssueProjects({...invalid, issue_number: 1, action: 'add', projectNumbers: [1]})],
            ['create_discussion',           () => DiscussionService.createDiscussion({...invalid, title: 'x', body: 'x'})],
            ['manage_discussion',           () => DiscussionService.manageDiscussion({...invalid, action: 'update_body', discussion_number: 1, body: 'x'})],
            ['get_discussion_conversation', () => DiscussionService.getConversation({...invalid, discussion_number: 1})],
            ['manage_discussion_comment',   () => DiscussionService.manageDiscussionComment({...invalid, action: 'create', discussion_number: 1, body: 'x'})],
            ['update_issue_relationship',   () => IssueService.updateIssueRelationship({...invalid, child_issue: 1})],
            ['get_viewer_permission',       () => RepositoryService.getViewerPermission(invalid)]
        ];

        for (const [operation, invoke] of operations) {
            const result = await invoke();

            expect(result, operation).toMatchObject({
                error       : 'Invalid Repository Target',
                code        : 'REPOSITORY_TARGET_INVALID',
                rejectedRepo: ''
            });
        }

        expect(operations).toHaveLength(18);
        expect(githubCalls).toBe(0);
        expect(execCalls).toBe(0);
    });

    test('the assignee conflict guard reads and refuses inside the selected non-default repo', async () => {
        let permissionTarget,
            queryVariables,
            restCalls = 0;

        RepositoryService.getViewerPermission = async ({repo}) => {
            permissionTarget = repo;
            return {permission: 'WRITE'}
        };
        GraphqlService.query = async (query, variables) => {
            queryVariables = variables;
            return {
                repository: {
                    issue: {assignees: {nodes: [{login: 'neo-opus-ada'}]}}
                }
            }
        };
        GraphqlService.rest = async () => { restCalls++ };

        const result = await IssueService.manageIssueAssignees({
            repo             : 'devindex',
            issue_number     : 2,
            assignees        : ['neo-gpt'],
            action           : 'add',
            requireUnassigned: true
        });

        expect(permissionTarget).toBe('neomjs/devindex');
        expect(queryVariables).toMatchObject({
            owner : 'neomjs',
            repo  : 'devindex',
            number: 2
        });
        expect(result).toMatchObject({
            code              : 'ASSIGNEE_CONFLICT',
            currentAssignees  : ['neo-opus-ada'],
            attemptedAssignees: ['neo-gpt']
        });
        expect(restCalls).toBe(0);
    });

    test('an acknowledged non-default reassignment keeps mutation, post-verify, and audit comment on target', async () => {
        let assigneeReads = 0,
            auditBody,
            restPath;

        RepositoryService.getViewerPermission = async ({repo}) => {
            expect(repo).toBe('neomjs/devindex');
            return {permission: 'WRITE'}
        };
        GraphqlService.query = async (query, variables) => {
            if (query.includes('GetIssueAssignees')) {
                assigneeReads++;
                expect(variables).toMatchObject({owner: 'neomjs', repo: 'devindex', number: 2});
                return {
                    repository: {
                        issue: {
                            assignees: {
                                nodes: assigneeReads === 1
                                    ? [{login: 'neo-opus-grace'}]
                                    : [{login: 'neo-gpt'}]
                            }
                        }
                    }
                }
            }

            if (query.includes('GetIssueId')) {
                expect(variables).toMatchObject({owner: 'neomjs', repo: 'devindex', number: 2});
                return {repository: {issue: {id: 'I_devindex_2'}}}
            }

            if (query.includes('AddComment')) {
                expect(variables.subjectId).toBe('I_devindex_2');
                auditBody = variables.body;
                return {addComment: {commentEdge: {node: {id: 'IC_audit'}}}}
            }

            throw new Error('unexpected assignee-audit query')
        };
        GraphqlService.rest = async (method, path, payload) => {
            expect(method).toBe('PATCH');
            expect(payload).toEqual({assignees: ['neo-gpt']});
            restPath = path;
            return {}
        };

        const result = await IssueService.manageIssueAssignees({
            repo                : 'devindex',
            issue_number        : 2,
            assignees           : ['neo-gpt'],
            action              : 'add',
            requireUnassigned   : true,
            acknowledgedReassign: 'explicit handoff acceptance witness'
        });

        expect(restPath).toBe('/repos/neomjs/devindex/issues/2');
        expect(assigneeReads).toBe(2);
        expect(auditBody).toContain('explicit handoff acceptance witness');
        expect(auditBody).toContain('neo-opus-grace');
        expect(result).toMatchObject({
            verifiedAssignees: ['neo-gpt'],
            previousAssignees: ['neo-opus-grace']
        });
    });

    test('viewer permissions cache by owner/repo rather than sharing the home answer', async () => {
        const priorPermission  = RepositoryService.viewerPermission,
              priorPermissions = new Map(RepositoryService.viewerPermissions),
              priorLogin       = RepositoryService.viewerLogin,
              calls            = [];

        try {
            RepositoryService.viewerPermission = null;
            RepositoryService.viewerPermissions.clear();
            RepositoryService.viewerLogin = null;

            GraphqlService.query = async (query, variables) => {
                calls.push(`${variables.owner}/${variables.repo}`);
                return {
                    repository: {viewerPermission: variables.repo === 'devindex' ? 'WRITE' : 'READ'},
                    viewer    : {login: 'neo-gpt'}
                }
            };

            expect(await RepositoryService.getViewerPermission()).toEqual({permission: 'READ'});
            expect(await RepositoryService.getViewerPermission({repo: 'devindex'})).toEqual({permission: 'WRITE'});
            expect(await RepositoryService.getViewerPermission()).toEqual({permission: 'READ'});

            expect(calls).toEqual(['neomjs/neo', 'neomjs/devindex']);
            expect(RepositoryService.viewerPermissions.get('neomjs/neo')).toBe('READ');
            expect(RepositoryService.viewerPermissions.get('neomjs/devindex')).toBe('WRITE');
        } finally {
            RepositoryService.viewerPermission = priorPermission;
            RepositoryService.viewerPermissions.clear();
            priorPermissions.forEach((value, key) => RepositoryService.viewerPermissions.set(key, value));
            RepositoryService.viewerLogin = priorLogin;
        }
    });

    test('relationship input cannot smuggle a second repository through an issue coordinate', async () => {
        let githubCalls = 0;

        GraphqlService.query = async () => { githubCalls++ };

        const result = await IssueService.updateIssueRelationship({
            repo        : 'neo',
            child_issue : 'neomjs/devindex#2',
            parent_issue: 17420
        });

        expect(result).toMatchObject({
            error: 'Cross-Repository Relationship Unsupported',
            code : 'CROSS_REPOSITORY_RELATIONSHIP_UNSUPPORTED'
        });
        expect(result.message).toContain('neomjs/neo');
        expect(githubCalls).toBe(0);
    });

    test('ProjectV2 metadata and issue identity both use the selected repository owner', async () => {
        const observations = [];

        GraphqlService.query = async (query, variables) => {
            observations.push(variables);

            if (Object.hasOwn(variables, 'number') && Object.hasOwn(variables, 'repo')) {
                return {repository: {issue: {id: 'I_target'}}}
            }

            if (Object.hasOwn(variables, 'number') && Object.hasOwn(variables, 'owner')) {
                return {
                    organization: {
                        projectV2: {id: 'PVT_target', title: 'Target board', fields: {nodes: []}}
                    }
                }
            }

            return {addProjectV2ItemById: {item: {id: 'PVTI_target'}}}
        };

        const result = await IssueService.manageIssueProjects({
            repo          : 'octocat/hello-world',
            issue_number  : 7,
            action        : 'add',
            projectNumbers: [12]
        });

        expect(result.attachments).toEqual([{
            projectNumber: 12,
            projectId    : 'PVT_target',
            itemId       : 'PVTI_target'
        }]);
        expect(observations[0]).toMatchObject({owner: 'octocat', repo: 'hello-world', number: 7});
        expect(observations[1]).toMatchObject({owner: 'octocat', number: 12});
        expect(observations.some(variables => variables.owner === 'neomjs')).toBe(false);
    });

    test('Discussion read, category lookup, body mutation, and comment creation stay on one selected repo', async () => {
        const repositoryLookups = [];

        GraphqlService.query = async (query, variables) => {
            if (variables?.owner && variables?.repo) {
                repositoryLookups.push(`${variables.owner}/${variables.repo}`)
            }

            if (query.includes('GetDiscussionConversation')) {
                return {
                    repository: {
                        discussion: {id: 'D_3', number: 3, title: 'Target', body: '', comments: {nodes: []}}
                    }
                }
            }

            if (query.includes('GetCategories')) {
                return {
                    repository: {
                        id                  : 'R_devindex',
                        discussionCategories: {nodes: [{id: 'DC_ideas', name: 'Ideas'}]}
                    }
                }
            }

            if (query.includes('CreateDiscussion')) {
                return {
                    createDiscussion: {
                        discussion: {id: 'D_new', number: 4, url: 'https://github.com/neomjs/devindex/discussions/4'}
                    }
                }
            }

            if (query.includes('GetDiscussionId')) {
                return {repository: {discussion: {id: 'D_3'}}}
            }

            if (query.includes('UpdateDiscussion(')) {
                return {
                    updateDiscussion: {
                        discussion: {id: 'D_3', url: 'https://github.com/neomjs/devindex/discussions/3', updatedAt: '2026-08-24T00:00:00Z'}
                    }
                }
            }

            if (query.includes('AddDiscussionComment')) {
                return {
                    addDiscussionComment: {
                        comment: {id: 'DC_new', url: 'https://github.com/neomjs/devindex/discussions/3#discussioncomment-1', createdAt: '2026-08-24T00:00:00Z'}
                    }
                }
            }

            throw new Error('unexpected Discussion query')
        };

        const read      = await DiscussionService.getConversation({repo: 'devindex', discussion_number: 3});
        const created   = await DiscussionService.createDiscussion({repo: 'devindex', title: 'Target', body: 'Body'});
        const updated   = await DiscussionService.manageDiscussion({repo: 'devindex', action: 'update_body', discussion_number: 3, body: 'Updated'});
        const commented = await DiscussionService.manageDiscussionComment({repo: 'devindex', action: 'create', discussion_number: 3, body: 'Comment'});

        expect(read.id).toBe('D_3');
        expect(created.discussionNumber).toBe(4);
        expect(updated.discussionId).toBe('D_3');
        expect(commented.commentId).toBe('DC_new');
        expect(repositoryLookups).toEqual([
            'neomjs/devindex',
            'neomjs/devindex',
            'neomjs/devindex',
            'neomjs/devindex'
        ]);
    });
});
