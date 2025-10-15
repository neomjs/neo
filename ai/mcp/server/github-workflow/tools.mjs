import * as issueService from './services/issueService.mjs';
import * as labelService from './services/labelService.mjs';
import * as pullRequestService from './services/pullRequestService.mjs';

export const tools = [
    {
        name: 'list_labels',
        title: 'List Repository Labels',
        description: 'Retrieves a list of all available labels in the repository.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        },
        handler: () => labelService.listLabels()
    },
    {
        name: 'list_pull_requests',
        title: 'List Pull Requests',
        description: 'Retrieves a list of open pull requests from the GitHub repository.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'integer',
                    description: 'Maximum number of pull requests to return.'
                },
                state: {
                    type: 'string',
                    description: 'Filter pull requests by state.'
                }
            },
            required: []
        },
        handler: (args) => pullRequestService.listPullRequests(args)
    },
    {
        name: 'checkout_pull_request',
        title: 'Checkout PR Branch',
        description: 'Checks out the branch for a given pull request locally using `gh pr checkout`.',
        inputSchema: {
            type: 'object',
            properties: {
                pr_number: {
                    type: 'integer',
                    description: 'The number of the pull request to check out.'
                }
            },
            required: ['pr_number']
        },
        handler: (args) => pullRequestService.checkoutPullRequest(args.pr_number)
    },
    {
        name: 'get_pull_request_diff',
        title: 'Get PR Diff',
        description: 'Retrieves the diff for a specific pull request using `gh pr diff`.',
        inputSchema: {
            type: 'object',
            properties: {
                pr_number: {
                    type: 'integer',
                    description: 'The number of the pull request.'
                }
            },
            required: ['pr_number']
        },
        handler: (args) => pullRequestService.getPullRequestDiff(args.pr_number)
    },
    {
        name: 'create_comment',
        title: 'Create a PR Comment',
        description: 'Adds a comment to a specific pull request.',
        inputSchema: {
            type: 'object',
            properties: {
                pr_number: {
                    type: 'integer',
                    description: 'The number of the pull request to comment on.'
                },
                body: {
                    type: 'string',
                    description: 'The content of the comment.'
                }
            },
            required: ['pr_number', 'body']
        },
        handler: (args) => pullRequestService.createComment(args.pr_number, args.body)
    },
    {
        name: 'get_conversation',
        title: 'Get PR Conversation',
        description: 'Retrieves the full conversation for a pull request, including the title, body, and all comments.',
        inputSchema: {
            type: 'object',
            properties: {
                pr_number: {
                    type: 'integer',
                    description: 'The number of the pull request.'
                }
            },
            required: ['pr_number']
        },
        handler: (args) => pullRequestService.getConversation(args.pr_number)
    },
    {
        name: 'add_labels',
        title: 'Add labels to an issue or PR',
        description: 'Adds one or more labels to a specific issue or pull request.',
        inputSchema: {
            type: 'object',
            properties: {
                issue_number: {
                    type: 'integer',
                    description: 'The number of the issue or pull request.'
                },
                labels: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                }
            },
            required: ['issue_number', 'labels']
        },
        handler: (args) => issueService.addLabels(args.issue_number, args.labels)
    },
    {
        name: 'remove_labels',
        title: 'Remove labels from an issue or PR',
        description: 'Removes one or more labels from a specific issue or pull request.',
        inputSchema: {
            type: 'object',
            properties: {
                issue_number: {
                    type: 'integer',
                    description: 'The number of the issue or pull request.'
                },
                labels: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                }
            },
            required: ['issue_number', 'labels']
        },
        handler: (args) => issueService.removeLabels(args.issue_number, args.labels)
    }
];
