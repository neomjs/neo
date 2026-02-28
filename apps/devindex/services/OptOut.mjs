import Base    from '../../../src/core/Base.mjs';
import config  from './config.mjs';
import GitHub  from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary Opt-Out Service for DevIndex.
 *
 * Checks the stargazers and issues of the `neomjs/devindex-opt-out` repository
 * to automatically blocklist users and remove them from the index.
 *
 * @class DevIndex.services.OptOut
 * @extends Neo.core.Base
 * @singleton
 */
class OptOut extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.OptOut'
         * @protected
         */
        className: 'DevIndex.services.OptOut',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} optOutRepoOwner='neomjs'
         */
        optOutRepoOwner: 'neomjs',
        /**
         * @member {String} optOutRepoName='devindex-opt-out'
         */
        optOutRepoName: 'devindex-opt-out'
    }

    async run() {
        console.log('[OptOut] Checking for new opt-out requests...');
        const syncState = await Storage.getOptOutSync();
        const lastCheck = syncState.lastCheck;
        let newLastCheck = lastCheck;

        let hasNextPage = true;
        let cursor = null;
        let optedOutLogins = [];
        let issuesToClose = [];

        // 1. Check Stargazers
        while (hasNextPage) {
            const query = `
                query($owner: String!, $name: String!, $cursor: String) {
                    repository(owner: $owner, name: $name) {
                        stargazers(first: 100, orderBy: {field: STARRED_AT, direction: DESC}, after: $cursor) {
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                            edges {
                                starredAt
                                node {
                                    login
                                }
                            }
                        }
                    }
                }`;

            const variables = {
                owner: this.optOutRepoOwner,
                name:  this.optOutRepoName,
                cursor: cursor
            };

            let data;
            try {
                data = await GitHub.query(query, variables, 3, 'OptOut Stars');
            } catch (err) {
                // If repo doesn't exist yet, just warn and exit gracefully
                if (err.message.includes('NOT_FOUND') || err.message.includes('Could not resolve')) {
                    console.warn(`[OptOut] Opt-out repository ${this.optOutRepoOwner}/${this.optOutRepoName} not found. Skipping.`);
                    return;
                }
                throw err;
            }

            const stargazers = data?.repository?.stargazers;
            if (!stargazers) break;

            const edges = stargazers.edges || [];
            let stopFetching = false;

            for (const edge of edges) {
                const starredAt = edge.starredAt;
                const login = edge.node.login;

                // Stop if we reached stars we've already processed
                if (lastCheck && starredAt <= lastCheck) {
                    stopFetching = true;
                    break;
                }

                // Keep track of the newest timestamp to save later
                if (!newLastCheck || starredAt > newLastCheck) {
                    newLastCheck = starredAt;
                }

                optedOutLogins.push(login);
            }

            if (stopFetching) {
                break;
            }

            hasNextPage = stargazers.pageInfo.hasNextPage;
            cursor = stargazers.pageInfo.endCursor;
        }

        // 2. Check Issues
        const issueResults = await this.processIssues();
        if (issueResults) {
            optedOutLogins.push(...issueResults.optedOutLogins);
            issuesToClose.push(...issueResults.issuesToClose);
        }

        // 3. Process the combined results
        const uniqueLogins = [...new Set(optedOutLogins)];

        // Even if uniqueLogins is empty (maybe they are already blocklisted but opened an issue anyway),
        // we still want to close the issues to keep the queue clean.
        
        if (uniqueLogins.length > 0) {
            console.log(`[OptOut] Found ${uniqueLogins.length} new opt-out requests.`);
            
            // 1. Add to blocklist
            await Storage.addToBlocklist(uniqueLogins);
            
            // 2. Remove from rich data (users.jsonl)
            await Storage.deleteUsers(uniqueLogins);
            
            // 3. Remove from tracker
            const trackerUpdates = uniqueLogins.map(login => ({ login, delete: true }));
            await Storage.updateTracker(trackerUpdates);
            
            // 4. Remove from failed list (Penalty Box)
            await Storage.updateFailed(uniqueLogins, false);

            // Update sync state
            await Storage.saveOptOutSync({ lastCheck: newLastCheck });
            console.log(`[OptOut] Processed opt-outs and updated sync state to ${newLastCheck}.`);
        } else if (optedOutLogins.length === 0) {
            console.log('[OptOut] No new opt-out requests found.');
        }

        // 5. Close Issues and Leave Comment
        if (issuesToClose.length > 0) {
            await this.closeIssues(issuesToClose);
        }
    }

    async processIssues() {
        console.log('[OptOut] Checking for new opt-out issue requests...');
        let hasNextPage = true;
        let cursor = null;
        let optedOutLogins = [];
        let issuesToClose = [];

        while (hasNextPage) {
            const query = `
                query($owner: String!, $name: String!, $cursor: String) {
                    repository(owner: $owner, name: $name) {
                        issues(first: 100, states: OPEN, labels: ["devindex-opt-out"], after: $cursor) {
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                            nodes {
                                id
                                number
                                author {
                                    login
                                }
                            }
                        }
                    }
                }`;

            const variables = {
                owner: this.optOutRepoOwner,
                name:  this.optOutRepoName,
                cursor: cursor
            };

            let data;
            try {
                data = await GitHub.query(query, variables, 3, 'OptOut Issues');
            } catch (err) {
                if (err.message.includes('NOT_FOUND') || err.message.includes('Could not resolve')) {
                    return null;
                }
                throw err;
            }

            const issues = data?.repository?.issues;
            if (!issues) break;

            const nodes = issues.nodes || [];

            for (const issue of nodes) {
                if (issue.author && issue.author.login) {
                    optedOutLogins.push(issue.author.login);
                    issuesToClose.push(issue.id);
                }
            }

            hasNextPage = issues.pageInfo.hasNextPage;
            cursor = issues.pageInfo.endCursor;
        }

        return { optedOutLogins, issuesToClose };
    }

    async closeIssues(issueIds) {
        for (const issueId of issueIds) {
            try {
                // Add Comment
                const commentQuery = `
                    mutation($subjectId: ID!, $body: String!) {
                        addComment(input: {subjectId: $subjectId, body: $body}) {
                            clientMutationId
                        }
                    }`;
                await GitHub.query(commentQuery, {
                    subjectId: issueId,
                    body: "Your opt-out request has been processed. You have been removed from the active DevIndex databases and added to the blocklist.\n\nIf you wish to be re-indexed in the future, you may submit an Opt-In request.\n\n*This issue has been automatically closed.*"
                }, 3, `OptOut Comment ${issueId}`);

                // Close Issue
                const closeQuery = `
                    mutation($issueId: ID!) {
                        closeIssue(input: {issueId: $issueId}) {
                            clientMutationId
                        }
                    }`;
                await GitHub.query(closeQuery, { issueId: issueId }, 3, `OptOut Close ${issueId}`);
                console.log(`[OptOut] Closed issue ${issueId}`);
            } catch (err) {
                console.error(`[OptOut] Failed to close issue ${issueId}:`, err.message);
            }
        }
    }
}

export default Neo.setupClass(OptOut);