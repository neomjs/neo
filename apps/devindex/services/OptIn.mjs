import Base    from '../../../src/core/Base.mjs';
import config  from './config.mjs';
import GitHub  from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary Opt-In Service for DevIndex.
 *
 * Checks the stargazers of the `neomjs/devindex-opt-in` repository
 * to automatically un-blocklist users and add them to the tracker.
 *
 * @class DevIndex.services.OptIn
 * @extends Neo.core.Base
 * @singleton
 */
class OptIn extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.OptIn'
         * @protected
         */
        className: 'DevIndex.services.OptIn',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} optInRepoOwner='neomjs'
         */
        optInRepoOwner: 'neomjs',
        /**
         * @member {String} optInRepoName='devindex-opt-in'
         */
        optInRepoName: 'devindex-opt-in'
    }

    async run() {
        console.log('[OptIn] Checking for new opt-in requests...');
        const syncState = await Storage.getOptInSync();
        const lastCheck = syncState.lastCheck;
        let newLastCheck = lastCheck;

        let hasNextPage = true;
        let cursor = null;
        let optedInLogins = [];

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
                owner: this.optInRepoOwner,
                name:  this.optInRepoName,
                cursor: cursor
            };

            let data;
            try {
                data = await GitHub.query(query, variables, 3, 'OptIn Stars');
            } catch (err) {
                if (err.message.includes('NOT_FOUND') || err.message.includes('Could not resolve')) {
                    console.warn(`[OptIn] Opt-in repository ${this.optInRepoOwner}/${this.optInRepoName} not found. Skipping.`);
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

                if (lastCheck && starredAt <= lastCheck) {
                    stopFetching = true;
                    break;
                }

                if (!newLastCheck || starredAt > newLastCheck) {
                    newLastCheck = starredAt;
                }

                optedInLogins.push(login);
            }

            if (stopFetching) {
                break;
            }

            hasNextPage = stargazers.pageInfo.hasNextPage;
            cursor = stargazers.pageInfo.endCursor;
        }

        // 2. Check Issues
        const issueResults = await this.processIssues();
        
        let uniqueLogins = [...new Set(optedInLogins)];
        let loginsToReAdd = [...uniqueLogins]; // Stars can reverse blocklist
        let issuesToClose = [];

        if (issueResults) {
            uniqueLogins.push(...issueResults.selfLogins);
            uniqueLogins.push(...issueResults.othersLogins);
            loginsToReAdd.push(...issueResults.selfLogins); // ONLY self issues reverse blocklist
            issuesToClose.push(...issueResults.issuesToClose);
            
            uniqueLogins = [...new Set(uniqueLogins)];
            loginsToReAdd = [...new Set(loginsToReAdd)];
        }

        if (uniqueLogins.length > 0) {
            console.log(`[OptIn] Found ${uniqueLogins.length} new opt-in requests:`, uniqueLogins);
            
            // 1. Remove from blocklist if they are there (ONLY stargazers and self-issues)
            const blocklist = await Storage.getBlocklist();
            const blockedUsersToReAdd = loginsToReAdd.filter(login => blocklist.has(login.toLowerCase()));
            
            if (blockedUsersToReAdd.length > 0) {
                console.log(`[OptIn] Removing from blocklist:`, blockedUsersToReAdd);
                await Storage.removeFromBlocklist(blockedUsersToReAdd);
            }

            // 2. Add to tracker
            // We want to avoid adding users who are already in the tracker.
            const tracker = await Storage.getTracker();
            const existingTracker = new Set(tracker.map(t => t.login.toLowerCase()));

            // We must also ensure we don't add "othersLogins" that are on the blocklist, 
            // since we didn't remove them above.
            const currentBlocklist = await Storage.getBlocklist();

            const toAdd = uniqueLogins.filter(login => {
                const lLogin = login.toLowerCase();
                return !existingTracker.has(lLogin) && !currentBlocklist.has(lLogin);
            });

            if (toAdd.length > 0) {
                console.log(`[OptIn] Adding to tracker:`, toAdd);
                const trackerUpdates = toAdd.map(login => ({ login, lastUpdate: null }));
                await Storage.updateTracker(trackerUpdates);
            } else {
                console.log(`[OptIn] All opted-in users are already tracked or blocked.`);
            }

            await Storage.saveOptInSync({ lastCheck: newLastCheck });
            console.log(`[OptIn] Processed opt-ins and updated sync state to ${newLastCheck}.`);
        } else {
            console.log('[OptIn] No new opt-in requests found.');
        }

        // 3. Close Issues and Leave Comment
        if (issuesToClose.length > 0) {
            const tracker = await Storage.getTracker();
            const existingTracker = new Set(tracker.map(t => t.login.toLowerCase()));
            const currentBlocklist = await Storage.getBlocklist();

            await this.closeIssues(issuesToClose, existingTracker, currentBlocklist);
        }
    }

    async processIssues() {
        console.log('[OptIn] Checking for new opt-in issue requests...');
        let hasNextPage = true;
        let cursor = null;
        let selfLogins = [];
        let othersLogins = [];
        let issuesToClose = [];

        while (hasNextPage) {
            const query = `
                query($owner: String!, $name: String!, $cursor: String) {
                    repository(owner: $owner, name: $name) {
                        issues(first: 100, states: OPEN, labels: ["devindex-opt-in"], after: $cursor) {
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                            nodes {
                                id
                                number
                                body
                                author {
                                    login
                                }
                            }
                        }
                    }
                }`;

            const variables = {
                owner: this.optInRepoOwner,
                name:  this.optInRepoName,
                cursor: cursor
            };

            let data;
            try {
                data = await GitHub.query(query, variables, 3, 'OptIn Issues');
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
                const match = issue.body.match(/### GitHub Usernames\s*([\s\S]*?)(?:###|$)/);

                if (match) {
                    const text = match[1];
                    const usernames = text.split('\n')
                        .map(u => u.trim())
                        .filter(u => u && !u.startsWith('-') && !u.startsWith('['));
                    
                    const validUsernames = [];
                    const invalidUsernames = [];
                    
                    for (const uname of usernames) {
                        try {
                            await GitHub.rest(`users/${uname}`);
                            validUsernames.push(uname);
                            othersLogins.push(uname);
                        } catch (e) {
                            invalidUsernames.push(uname);
                        }
                    }
                    
                    issuesToClose.push({ 
                        id: issue.id, 
                        type: 'others', 
                        validLogins: validUsernames,
                        invalidLogins: invalidUsernames
                    });
                } else {
                    if (issue.author && issue.author.login) {
                        selfLogins.push(issue.author.login);
                        issuesToClose.push({ id: issue.id, type: 'self', logins: [issue.author.login] });
                    }
                }
            }

            hasNextPage = issues.pageInfo.hasNextPage;
            cursor = issues.pageInfo.endCursor;
        }

        return { selfLogins, othersLogins, issuesToClose };
    }

    async closeIssues(issues, existingTracker, currentBlocklist) {
        for (const issue of issues) {
            try {
                let commentBody = "";
                if (issue.type === 'self') {
                    const login = issue.logins[0];
                    if (existingTracker.has(login.toLowerCase())) {
                         commentBody = `Thank you for opting in! @${login} is already in our tracking queue and will be processed soon.\n\n*This issue has been automatically closed.*`;
                    } else {
                         commentBody = `Thank you for opting in! @${login} has been added to our tracking queue.\n\n*This issue has been automatically closed.*`;
                    }
                } else if (issue.type === 'others') {
                    if (issue.validLogins && issue.validLogins.length > 0) {
                        commentBody = `Thank you for your nominations!\n\n`;
                        
                        const newlyAdded = [];
                        const alreadyTracked = [];
                        const blocked = [];

                        issue.validLogins.forEach(u => {
                            const lLogin = u.toLowerCase();
                            if (currentBlocklist.has(lLogin)) {
                                blocked.push(u);
                            } else if (existingTracker.has(lLogin)) {
                                alreadyTracked.push(u);
                            } else {
                                newlyAdded.push(u);
                            }
                        });

                        if (newlyAdded.length > 0) {
                            commentBody += `**Successfully Added to Queue:**\n${newlyAdded.map(u => `- @${u}`).join('\n')}\n\n`;
                        }
                        if (alreadyTracked.length > 0) {
                            commentBody += `**Already in Queue (Skipped):**\n${alreadyTracked.map(u => `- @${u}`).join('\n')}\n\n`;
                        }
                        if (blocked.length > 0) {
                            commentBody += `**Opted Out (Skipped):**\n${blocked.map(u => `- @${u}`).join('\n')}\n*(Note: Users who have explicitly opted out can only opt back in themselves.)*\n\n`;
                        }

                        if (issue.invalidLogins && issue.invalidLogins.length > 0) {
                            commentBody += `**Failed Validation (Not Found):**\n${issue.invalidLogins.map(u => `- ${u}`).join('\n')}\n\n`;
                        }
                    } else if (issue.invalidLogins && issue.invalidLogins.length > 0) {
                        commentBody = `We could not validate any of the provided usernames. Please double-check them and submit a new request if needed.\n\n`;
                        commentBody += `**Failed Validation (Not Found):**\n${issue.invalidLogins.map(u => `- ${u}`).join('\n')}\n\n`;
                    } else {
                        commentBody = `We could not parse any usernames from this issue. Please ensure you follow the issue template format.\n\n`;
                    }
                    commentBody += `*This issue has been automatically closed.*`;
                } else {
                    commentBody = `We could not parse the usernames from this issue. Please ensure you follow the issue template format.\n\n*This issue has been automatically closed.*`;
                }

                // Add Comment
                const commentQuery = `
                    mutation($subjectId: ID!, $body: String!) {
                        addComment(input: {subjectId: $subjectId, body: $body}) {
                            clientMutationId
                        }
                    }`;
                await GitHub.query(commentQuery, {
                    subjectId: issue.id,
                    body: commentBody
                }, 3, `OptIn Comment ${issue.id}`);

                // Close Issue
                const closeQuery = `
                    mutation($issueId: ID!) {
                        closeIssue(input: {issueId: $issueId}) {
                            clientMutationId
                        }
                    }`;
                await GitHub.query(closeQuery, { issueId: issue.id }, 3, `OptIn Close ${issue.id}`);
                console.log(`[OptIn] Closed issue ${issue.id}`);
            } catch (err) {
                console.error(`[OptIn] Failed to close issue ${issue.id}:`, err.message);
            }
        }
    }
}

export default Neo.setupClass(OptIn);