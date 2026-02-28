import ComponentColumn      from './Component.mjs';
import GitHubOrgsComponent  from '../../component/GitHubOrgs.mjs';

/**
 * @class Neo.grid.column.GitHubOrgs
 * @extends Neo.grid.column.Component
 */
class GitHubOrgs extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.GitHubOrgs'
         * @protected
         */
        className: 'Neo.grid.column.GitHubOrgs',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module        : GitHubOrgsComponent,
            renderFullPool: true
        },
        /**
         * @member {String} type='githubOrgs'
         * @protected
         */
        type: 'githubOrgs'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            orgs: record.organizations,
            ...config
        }
    }
}

export default Neo.setupClass(GitHubOrgs);
