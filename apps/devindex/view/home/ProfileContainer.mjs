import Container from '../../../../src/container/Base.mjs';
import Image     from '../../../../src/component/Image.mjs';
import Label     from '../../../../src/component/Label.mjs';

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
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'component',
            cls   : ['profile-header'],
            height: 100,
            style : {marginBottom: '1em'},
            vdom  : {
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
            module   : Label,
            cls      : ['profile-bio'],
            reference: 'profile-bio',
            style    : {
                fontStyle : 'italic',
                lineHeight: '1.4',
                whiteSpace: 'normal'
            },
            text: ''
        }, {
            ntype : 'container',
            layout: 'vbox',
            style : {marginTop: '1em'},
            items : [{
                ntype: 'label',
                style: {fontWeight: 'bold'},
                text : 'Details'
            }, {
                ntype    : 'label',
                reference: 'profile-location',
                text     : ''
            }, {
                ntype    : 'label',
                reference: 'profile-company',
                text     : ''
            }]
        }, {
            ntype    : 'container',
            reference: 'profile-orgs',
            layout   : {ntype: 'hbox', wrap: true},
            style    : {gap: '5px', marginTop: '1em'},
            items    : []
        }]
    }

    /**
     * @param {Object} record
     */
    updateRecord(record) {
        let me   = this,
            vdom = me.items[0].vdom,
            bio  = me.getReference('profile-bio'),
            loc  = me.getReference('profile-location'),
            comp = me.getReference('profile-company'),
            orgs = me.getReference('profile-orgs'),
            avatar, name, login;

        avatar = me.getVdomChild(vdom, 'avatar');
        name   = me.getVdomChild(vdom, 'name');
        login  = me.getVdomChild(vdom, 'login');

        avatar.src = record.avatar_url || '';
        name.html  = record.name || '';
        login.html = `@${record.login}`;

        me.items[0].vdom = vdom;
        me.items[0].update();

        bio.text = record.bio || 'No bio available.';
        loc.text = record.location ? `📍 ${record.location}` : '';
        comp.text = record.company ? `🏢 ${record.company}` : '';

        // Update Orgs
        if (record.organizations && Array.isArray(record.organizations)) {
            orgs.removeAll();
            if (record.organizations.length > 0) {
                orgs.add({ntype: 'label', text: 'Organizations:', width: '100%', style: {fontWeight: 'bold', marginBottom: '5px'}});
                
                record.organizations.forEach(org => {
                    orgs.add({
                        module: Image,
                        alt   : org.login,
                        height: 32,
                        src   : org.avatar_url,
                        title : org.login,
                        width : 32,
                        style : {borderRadius: '4px'}
                    })
                });
            }
        } else {
            orgs.removeAll();
        }
    }
}

export default Neo.setupClass(ProfileContainer);
