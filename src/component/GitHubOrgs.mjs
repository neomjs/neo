import Component from './Base.mjs';

/**
 * @class Neo.component.GitHubOrgs
 * @extends Neo.component.Base
 */
class GitHubOrgs extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.GitHubOrgs'
         * @protected
         */
        className: 'Neo.component.GitHubOrgs',
        /**
         * Size in px for the avatar image request.
         * Recommended to use 2x the display size for high DPI screens.
         * @member {Number} avatarSize=40
         */
        avatarSize: 40,
        /**
         * @member {String[]} baseCls=['neo-github-orgs']
         */
        baseCls: ['neo-github-orgs'],
        /**
         * @member {Number} maxItems_=5
         */
        maxItems_: 5,
        /**
         * @member {Object[]|null} orgs_=null
         */
        orgs_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: []}
    }

    /**
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     */
    afterSetOrgs(value, oldValue) {
        let me    = this,
            items = [];

        if (Array.isArray(value)) {
            value.slice(0, me.maxItems).forEach(org => {
                let avatarUrl = org.avatar_url;

                if (avatarUrl) {
                    let url = new URL(avatarUrl);
                    url.searchParams.set('s', me.avatarSize);
                    avatarUrl = url.toString()
                }

                items.push({
                    tag   : 'a',
                    cls   : ['neo-org-link'],
                    href  : `https://github.com/${org.login}`,
                    target: '_blank',
                    title : org.name || org.login,
                    cn    : [{
                        tag: 'img',
                        cls: ['neo-org-avatar'],
                        src: avatarUrl
                    }]
                })
            })
        }

        me.vdom.cn = items;
        me.update()
    }
}

export default Neo.setupClass(GitHubOrgs);
