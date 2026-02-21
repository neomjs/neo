import Base    from '../../../src/core/Base.mjs';
import config  from './config.mjs';
import GitHub  from './GitHub.mjs';
import Storage from './Storage.mjs';

/**
 * @summary Opt-Out Service for DevIndex.
 *
 * Checks the stargazers of the `neomjs/devindex-opt-out` repository
 * to automatically blacklist users and remove them from the index.
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
                data = await GitHub.query(query, variables, 3, 'OptOut');
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

        if (optedOutLogins.length > 0) {
            console.log(`[OptOut] Found ${optedOutLogins.length} new opt-out requests.`);
            
            // 1. Add to blocklist
            await Storage.addToBlocklist(optedOutLogins);
            
            // 2. Remove from rich data (users.jsonl)
            await Storage.deleteUsers(optedOutLogins);
            
            // 3. Remove from tracker
            const trackerUpdates = optedOutLogins.map(login => ({ login, delete: true }));
            await Storage.updateTracker(trackerUpdates);
            
            // 4. Remove from failed list (Penalty Box)
            await Storage.updateFailed(optedOutLogins, false);

            // Update sync state
            await Storage.saveOptOutSync({ lastCheck: newLastCheck });
            console.log(`[OptOut] Processed opt-outs and updated sync state to ${newLastCheck}.`);
        } else {
            console.log('[OptOut] No new opt-out requests found.');
        }
    }
}

export default Neo.setupClass(OptOut);
