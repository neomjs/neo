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

        const uniqueLogins = [...new Set(optedInLogins)];

        if (uniqueLogins.length > 0) {
            console.log(`[OptIn] Found ${uniqueLogins.length} new opt-in requests:`, uniqueLogins);
            
            // 1. Remove from blocklist if they are there
            const blocklist = await Storage.getBlocklist();
            const blockedUsersToReAdd = uniqueLogins.filter(login => blocklist.has(login.toLowerCase()));
            
            if (blockedUsersToReAdd.length > 0) {
                console.log(`[OptIn] Removing from blocklist:`, blockedUsersToReAdd);
                await Storage.removeFromBlocklist(blockedUsersToReAdd);
            }

            // 2. Add to tracker
            // We want to avoid adding users who are already indexed OR already in the tracker.
            const users = await Storage.getUsers();
            const existingUsers = new Set(users.map(u => u.l.toLowerCase()));
            const tracker = await Storage.getTracker();
            const existingTracker = new Set(tracker.map(t => t.login.toLowerCase()));

            const toAdd = uniqueLogins.filter(login => {
                const lLogin = login.toLowerCase();
                return !existingUsers.has(lLogin) && !existingTracker.has(lLogin);
            });

            if (toAdd.length > 0) {
                console.log(`[OptIn] Adding to tracker:`, toAdd);
                const trackerUpdates = toAdd.map(login => ({ login, lastUpdate: null }));
                await Storage.updateTracker(trackerUpdates);
            } else {
                console.log(`[OptIn] All opted-in users are already tracked or indexed.`);
            }

            await Storage.saveOptInSync({ lastCheck: newLastCheck });
            console.log(`[OptIn] Processed opt-ins and updated sync state to ${newLastCheck}.`);
        } else {
            console.log('[OptIn] No new opt-in requests found.');
        }
    }
}

export default Neo.setupClass(OptIn);