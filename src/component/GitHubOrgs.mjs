import Component from './Base.mjs';

/**
 * @summary Displays a list of GitHub Organization avatars with links.
 *
 * This component supports two rendering modes:
 * 1. **Standard Mode (Default):** Renders only the organizations present in the data. The component size adapts to the content.
 * 2. **Stable Mode (`renderFullPool: true`):** Pre-allocates a fixed number of nodes (`maxItems`) and toggles their visibility.
 *    This ensures the component's dimensions remain constant (reserving space), which is critical for preventing
 *    layout thrashing in high-frequency update scenarios like Grids.
 *
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
         * If true, the component will always render `maxItems` nodes.
         * Unused nodes will be hidden via `visibility: hidden` but will still occupy layout space.
         * Use this setting for Grids to prevent layout thrashing during scrolling.
         * @member {Boolean} renderFullPool_=false
         */
        renderFullPool_: false,
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
            vdom     = me.vdom,
            items    = Array.isArray(value) ? value : [];

        if (me.renderFullPool) {
            // Optimization: Maintain a fixed pool of nodes to prevent layout shifts.
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

            vdom.cn.forEach((node, index) => {
                let org = items[index],
                    img = node.cn[0];

                if (org) {
                    let avatarUrl = org.avatarUrl;

                    if (avatarUrl) {
                        let urlStr = String(avatarUrl);
                        if (!urlStr.startsWith('http')) {
                            avatarUrl = `https://avatars.githubusercontent.com/u/${avatarUrl}?v=4&s=${me.avatarSize}`;
                        } else {
                            let url = new URL(avatarUrl);
                            url.searchParams.set('s', me.avatarSize);
                            avatarUrl = url.toString()
                        }
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
        } else {
            // Standard behavior: Render only what exists
            let newItems = [];

            items.slice(0, maxItems).forEach(org => {
                let avatarUrl = org.avatarUrl;

                if (avatarUrl) {
                    let urlStr = String(avatarUrl);
                    if (!urlStr.startsWith('http')) {
                        avatarUrl = `https://avatars.githubusercontent.com/u/${avatarUrl}?v=4&s=${me.avatarSize}`;
                    } else {
                        let url = new URL(avatarUrl);
                        url.searchParams.set('s', me.avatarSize);
                        avatarUrl = url.toString()
                    }
                }

                newItems.push({
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
            });

            vdom.cn = newItems;
        }

        me.update()
    }
}

export default Neo.setupClass(GitHubOrgs);
