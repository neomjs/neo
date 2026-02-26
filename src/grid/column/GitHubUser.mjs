import ComponentColumn     from './Component.mjs';
import GitHubUserComponent from '../../component/GitHubUser.mjs';

/**
 * @class Neo.grid.column.GitHubUser
 * @extends Neo.grid.column.Component
 */
class GitHubUser extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.GitHubUser'
         * @protected
         */
        className: 'Neo.grid.column.GitHubUser',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: GitHubUserComponent
        },
        /**
         * @member {String} type='githubUser'
         * @protected
         */
        type: 'githubUser'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            avatarUrl: record.avatarUrl,
            fullName : record.name && record.name !== record.login ? record.name : '',
            username : record.login,
            ...config
        }
    }
}

export default Neo.setupClass(GitHubUser);
