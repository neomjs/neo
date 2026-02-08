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
        let me       = this,
            maxItems = me.maxItems,
            vdom     = me.vdom;

        // Initialize pool if empty
        if (vdom.cn.length < maxItems) {
            for (let i = vdom.cn.length; i < maxItems; i++) {
                vdom.cn.push({
                    tag   : 'a',
                    cls   : ['neo-org-link'],
                    target: '_blank',
                    cn    : [{
                        tag: 'img',
                        cls: ['neo-org-avatar']
                    }]
                })
            }
        }

        let items = Array.isArray(value) ? value : [];

        // Recycle nodes
        vdom.cn.forEach((node, index) => {
            let org = items[index],
                img = node.cn[0];

            if (org) {
                let avatarUrl = org.avatar_url;

                if (avatarUrl) {
                    let url = new URL(avatarUrl);
                    url.searchParams.set('s', me.avatarSize);
                    avatarUrl = url.toString()
                }

                node.href  = `https://github.com/${org.login}`;
                node.title = org.name || org.login;
                node.style = null; // Remove visibility: hidden

                img.src = avatarUrl;
            } else {
                delete node.href;
                delete node.title;
                node.style = {visibility: 'hidden'};

                delete img.src;
            }
        });

        me.update()
    }
}

export default Neo.setupClass(GitHubOrgs);
