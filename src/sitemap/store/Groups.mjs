import GroupModel from '../model/Group.mjs';
import Store      from '../../data/Store.mjs';

/**
 * @class Neo.sitemap.store.Groups
 * @extends Neo.data.Store
 */
class Groups extends Store {
    static getConfig() {return {
        /*
         * @member {String} className='Neo.sitemap.store.Groups'
         * @protected
         */
        className: 'Neo.sitemap.store.Groups',
        /*
         * @member {Neo.data.Model} model=GroupModel
         */
        model: GroupModel
    }}
}

Neo.applyClassConfig(Groups);

export default Groups;
