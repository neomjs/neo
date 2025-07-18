import Container from '../../../../src/container/Base.mjs';
import Toolbar   from '../../../../src/toolbar/Base.mjs';

/**
 * @class Portal.view.about.MemberContainer
 * @extends Neo.container.Base
 */
class MemberContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.about.MemberContainer'
         * @protected
         */
        className: 'Portal.view.about.MemberContainer',
        /**
         * @member {String[]} cls=['portal-about-member-container']
         * @reactive
         */
        cls: ['portal-about-member-container'],
        /**
         * @member {String|null} location_=null
         * @reactive
         */
        location_: null,
        /**
         * @member {String|null} name_=null
         * @reactive
         */
        name_: null,
        /**
         * @member {String|null} picture_=null
         * @reactive
         */
        picture_: null,
        /**
         * @member {String|null} profileGitHub_=null
         * @reactive
         */
        profileGitHub_: null,
        /**
         * @member {String|null} profileLinkedIn_=null
         * @reactive
         */
        profileLinkedIn_: null,
        /**
         * @member {String|null} teamRole_=null
         * @reactive
         */
        teamRole_: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            module      : Toolbar,
            cls         : ['portal-profiles'],
            itemDefaults: {ntype: 'button', ui: 'ghost'},

            items: [{
                iconCls: 'portal-profile fa-brands fa-github'
            }, {
                iconCls: 'portal-profile fa-brands fa-linkedin'
            }]
        }, {
            cls : ['portal-profile-component'],
            vdom:
            {cn: [
                {tag: 'img', cls: ['portal-profile-picture']},
                {cls: ['portal-profile-content'], cn: [
                    {tag: 'h2', cls: ['portal-profile-name']},
                    {cls: ['portal-profile-role']},
                    {cn: [
                        {tag: 'i', cls: ['portal-profile-location']},
                        {vtype: 'text'}
                    ]}
                ]}
            ]}
        }]
    }

    /**
     * Triggered after the location config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLocation(value, oldValue) {
        if (value) {
            let item = this.items[1];

            item.vdom.cn[1].cn[2].cn[1].text = value;
            item.update?.()
        }
    }

    /**
     * Triggered after the name config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetName(value, oldValue) {
        if (value) {
            let item = this.items[1];

            item.vdom.cn[1].cn[0].text = value;
            item.update?.()
        }
    }

    /**
     * Triggered after the picture config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPicture(value, oldValue) {
        if (value) {
            let item = this.items[1];

            item.vdom.cn[0].src = './resources/images/team/' + value;
            item.update?.()
        }
    }

    /**
     * Triggered after the profileGitHub config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetProfileGitHub(value, oldValue) {
        this.updateProfileButton(this.items[0].items[0], value)
    }

    /**
     * Triggered after the profileLinkedIn config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetProfileLinkedIn(value, oldValue) {
        this.updateProfileButton(this.items[0].items[1], value)
    }

    /**
     * Triggered after the teamRole config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTeamRole(value, oldValue) {
        if (value) {
            let item = this.items[1];

            item.vdom.cn[1].cn[1].text = value;
            item.update?.()
        }
    }

    /**
     * Depending on the lifecycle, we will either pass a button instance or a config object
     * @param {Neo.button.Base|Object} button
     * @param {String|null} url
     * @protected
     */
    updateProfileButton(button, url) {
        if (button.set) {
            button.set({hidden: !url, url})
        } else {
            // initial values
            button.hidden = !url;
            button.url    = url;
        }
    }
}

export default Neo.setupClass(MemberContainer);
