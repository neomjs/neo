import Container      from '../../../src/container/Base.mjs';
import PermissionList from './PermissionList.mjs';

/**
 * @summary A side panel that simulates the backend granting and revoking permissions on a live session.
 * @class WebDesktop.view.PermissionPanel
 * @extends Neo.container.Base
 */
class PermissionPanel extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.PermissionPanel'
         * @protected
         */
        className: 'WebDesktop.view.PermissionPanel',
        /**
         * @member {String[]} baseCls=['webdesktop-permission-panel','neo-container']
         * @protected
         */
        baseCls: ['webdesktop-permission-panel', 'neo-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'component',
            cls  : ['webdesktop-panel-header'],
            flex : 'none',
            vdom : {cn: [
                {tag: 'h2', text: 'Permissions'},
                {tag: 'p',  text: 'Simulates the backend changing what this account may use. Each switch updates one store filter, and the launcher and the start menu follow it.'}
            ]}
        }, {
            module   : PermissionList,
            flex     : 1,
            listeners: {itemClick: 'onPermissionItemClick'}
        }]
    }
}

export default Neo.setupClass(PermissionPanel);
