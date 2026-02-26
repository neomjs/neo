import Component from './Base.mjs';

/**
 * @class Neo.component.GitHubUser
 * @extends Neo.component.Base
 */
class GitHubUser extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.GitHubUser'
         * @protected
         */
        className: 'Neo.component.GitHubUser',
        /**
         * Size in px for the avatar image request.
         * Recommended to use 2x the display size for high DPI screens.
         * @member {Number} avatarSize=64
         */
        avatarSize: 64,
        /**
         * @member {String|null} avatarUrl_=null
         */
        avatarUrl_: null,
        /**
         * @member {String[]} baseCls=['neo-github-user']
         */
        baseCls: ['neo-github-user'],
        /**
         * @member {String|null} fullName_=null
         */
        fullName_: null,
        /**
         * @member {String|null} username_=null
         */
        username_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'img', cls: ['neo-avatar']},
            {cls: ['neo-user-info'], cn: [
                {tag: 'a',    cls: ['neo-username'], target: '_blank'},
                {tag: 'span', cls: ['neo-name']}
            ]}
        ]}
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetAvatarUrl(value, oldValue) {
        let me = this;

        if (value) {
            let urlStr = String(value);

            if (!urlStr.startsWith('http')) {
                urlStr = `https://avatars.githubusercontent.com/u/${value}?v=4&s=${me.avatarSize}`;
            } else {
                let url = new URL(value);
                url.searchParams.set('s', me.avatarSize);
                urlStr = url.toString();
            }

            me.vdom.cn[0].src = urlStr;
            me.update()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetFullName(value, oldValue) {
        let me = this;

        if (value) {
            me.vdom.cn[1].cn[1].text = value;
            me.update()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetUsername(value, oldValue) {
        let me = this;

        if (value) {
            let link = me.vdom.cn[1].cn[0];

            link.href = `https://github.com/${value}`;
            link.text = value;
            me.update()
        }
    }
}

export default Neo.setupClass(GitHubUser);
