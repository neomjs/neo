import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.lockedColumns.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.grid.lockedColumns.MainStore',
        keyProperty: 'id',
        model      : Model,

        data: [
            {id: 1, rank: 1, login: 'octocat',   totalContributions: 9100, commitRatio: 0.82, privateContributionsRatio: 0.10, lastUpdated: '2026-06-01'},
            {id: 2, rank: 2, login: 'hubot',     totalContributions: 7400, commitRatio: 0.71, privateContributionsRatio: 0.22, lastUpdated: '2026-05-28'},
            {id: 3, rank: 3, login: 'monalisa',  totalContributions: 6800, commitRatio: 0.66, privateContributionsRatio: 0.31, lastUpdated: '2026-05-30'},
            {id: 4, rank: 4, login: 'devbot',    totalContributions: 6100, commitRatio: 0.59, privateContributionsRatio: 0.18, lastUpdated: '2026-05-21'},
            {id: 5, rank: 5, login: 'codecat',   totalContributions: 5400, commitRatio: 0.74, privateContributionsRatio: 0.27, lastUpdated: '2026-06-02'},
            {id: 6, rank: 6, login: 'mergecat',  totalContributions: 4900, commitRatio: 0.63, privateContributionsRatio: 0.12, lastUpdated: '2026-05-19'},
            {id: 7, rank: 7, login: 'pullbot',   totalContributions: 4200, commitRatio: 0.55, privateContributionsRatio: 0.40, lastUpdated: '2026-05-25'},
            {id: 8, rank: 8, login: 'forkcat',   totalContributions: 3700, commitRatio: 0.68, privateContributionsRatio: 0.09, lastUpdated: '2026-05-14'}
        ]
    }
}

export default Neo.setupClass(MainStore);
