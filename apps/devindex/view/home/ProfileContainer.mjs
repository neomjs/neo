import Container from '../../../../src/container/Base.mjs';
import Image     from '../../../../src/component/Image.mjs';
import VDomUtil  from '../../../../src/util/VDom.mjs';

/**
 * @class DevIndex.view.home.ProfileContainer
 * @extends Neo.container.Base
 */
class ProfileContainer extends Container {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.ProfileContainer'
         * @protected
         */
        className: 'DevIndex.view.home.ProfileContainer',
        /**
         * @member {String[]} cls=['devindex-profile-container']
         */
        cls: ['devindex-profile-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} itemDefaults={flex:'none'}
         */
        itemDefaults: {flex: 'none'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'component',
            tag      : 'div',
            reference: 'placeholder',
            text     : 'Select a user to view details',
            cls      : ['profile-placeholder']
        }, {
            ntype    : 'container',
            reference: 'details-wrapper',
            cls      : ['profile-details-wrapper'],
            hidden   : true,
            layout   : {ntype: 'vbox', align: 'stretch'},
            itemDefaults: {flex: 'none'},
            items    : [{
                ntype    : 'component',
                reference: 'profile-header',
                cls      : ['profile-header'],
                vdom     : {
                    cn: [{
                        tag: 'div', cls: ['profile-avatar-wrapper'], cn: [
                            {tag: 'img', cls: ['profile-avatar'], flag: 'avatar'}
                        ]
                    }, {
                        tag: 'div', cls: ['profile-names'], cn: [
                            {tag: 'div', cls: ['profile-name'],  flag: 'name'},
                            {tag: 'div', cls: ['profile-login'], flag: 'login'}
                        ]
                    }]
                }
            }, {
                ntype    : 'component',
                tag      : 'div',
                cls      : ['profile-bio'],
                reference: 'profile-bio',
                text     : ''
            }, {
                ntype: 'component',
                tag  : 'div',
                cls  : ['profile-details-label'],
                text : 'Details'
            }, {
                ntype    : 'component',
                tag      : 'div',
                cls      : ['profile-detail'],
                reference: 'profile-location',
                text     : ''
            }, {
                ntype    : 'component',
                tag      : 'div',
                cls      : ['profile-detail'],
                reference: 'profile-company',
                text     : ''
            }, {
                ntype    : 'container',
                reference: 'profile-orgs',
                layout   : {ntype: 'hbox', wrap: 'wrap'},
                cls      : ['profile-orgs'],
                items    : []
            }]
        }]
    }

    /**
     * @param {String} src
     * @param {Number} size
     * @returns {String}
     */
    getAvatarUrl(src, size) {
        if (src) {
            try {
                let urlStr = String(src);
                if (!urlStr.startsWith('http')) {
                    return `https://avatars.githubusercontent.com/u/${src}?v=4&s=${size}`;
                }
                let url = new URL(src);
                url.searchParams.set('s', size);
                return url.toString()
            } catch (e) {
                console.error('Invalid Avatar URL', src)
            }
        }

        return src || ''
    }

    /**
     * @param {Object} record
     */
    updateRecord(record) {
        let me      = this,
            wrapper = me.getReference('details-wrapper'),
            holder  = me.getReference('placeholder'),
            header  = me.getReference('profile-header'),
            bio     = me.getReference('profile-bio'),
            loc     = me.getReference('profile-location'),
            comp    = me.getReference('profile-company'),
            orgs    = me.getReference('profile-orgs'),
            vdom    = header.vdom,
            avatar, name, login;

        if (!record) {
            wrapper.hidden = true;
            holder.hidden  = false;
            return
        }

        wrapper.hidden = false;
        holder.hidden  = true;

        avatar = VDomUtil.getByFlag(vdom, 'avatar');
        name   = VDomUtil.getByFlag(vdom, 'name');
        login  = VDomUtil.getByFlag(vdom, 'login');

        if (avatar) {
            avatar.src = me.getAvatarUrl(record.avatarUrl, 128)
        }
        if (name) {
            name.text  = record.name || '';
        }
        if (login) {
            login.text = `@${record.login}`;
        }

        header.update();

        bio.text = record.bio || 'No bio available.';
        loc.text = record.location ? `📍 ${record.location}` : '';
        comp.text = record.company ? `🏢 ${record.company}` : '';

        // Update Orgs
        orgs.removeAll();

        if (record.organizations && Array.isArray(record.organizations) && record.organizations.length > 0) {
            orgs.add({ntype: 'component', tag: 'div', cls: ['org-label'], text: 'Organizations:'});
            
            record.organizations.forEach(org => {
                orgs.add({
                    module: Image,
                    alt   : org.login,
                    height: 32,
                    src   : me.getAvatarUrl(org.avatarUrl, 64),
                    title : org.login,
                    width : 32
                })
            });
        }
    }
}

export default Neo.setupClass(ProfileContainer);
