import AccountList from './AccountList.mjs';
import Container   from '../../../src/container/Base.mjs';

/**
 * @summary The lock screen: pick a demo account. Each one signs in with the permission keys its backend answer grants.
 * @class WebDesktop.view.SignIn
 * @extends Neo.container.Base
 */
class SignIn extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.SignIn'
         * @protected
         */
        className: 'WebDesktop.view.SignIn',
        /**
         * @member {String[]} baseCls=['webdesktop-sign-in','neo-container']
         * @protected
         */
        baseCls: ['webdesktop-sign-in', 'neo-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['webdesktop-sign-in-card'],
            layout: {ntype: 'vbox', align: 'stretch'},

            items: [{
                ntype: 'component',
                cls  : ['webdesktop-sign-in-header'],
                flex : 'none',
                vdom : {cn: [
                    {cls: ['webdesktop-sign-in-logo'], cn: [{tag: 'i', cls: ['fas', 'fa-layer-group']}]},
                    {tag: 'h1', text: 'Web Desktop'},
                    {tag: 'p',  text: 'Choose an account. Each one signs in with different permissions, and the desktop offers exactly the apps they grant.'}
                ]}
            }, {
                module   : AccountList,
                flex     : 'none',
                listeners: {itemClick: 'onAccountItemClick'}
            }]
        }]
    }
}

export default Neo.setupClass(SignIn);
