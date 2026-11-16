import {catalog}  from './Apps.mjs';
import Permission from '../model/Permission.mjs';
import Store      from '../../../src/data/Store.mjs';

/**
 * @summary Every permission key the backend can grant, one per app, for the panel that simulates the backend.
 * @class WebDesktop.store.Permissions
 * @extends Neo.data.Store
 */
class Permissions extends Store {
    static config = {
        /**
         * @member {String} className='WebDesktop.store.Permissions'
         * @protected
         */
        className: 'WebDesktop.store.Permissions',
        /**
         * @member {Neo.data.Model} model=Permission
         */
        model: Permission
    }

    /**
     * @param {Object} config
     */
    construct(config={}) {
        super.construct({
            data: catalog.filter(app => app.permission).map(({color, iconCls, permission, text}) => ({color, iconCls, id: permission, text})),
            ...config
        })
    }
}

export default Neo.setupClass(Permissions);
