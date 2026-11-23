import List         from '../../../src/list/Base.mjs';
import {initialsOf} from './memberDefaults.mjs';

/**
 * @summary Team roster list bound to the root StateProvider's `members` store.
 * @class Neo.examples.stateProvider.advanced.MemberList
 * @extends Neo.list.Base
 */
class MemberList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.MemberList'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.MemberList',
        /**
         * @member {String[]} baseCls=['sp-member-list','neo-list']
         * @protected
         */
        baseCls: ['sp-member-list', 'neo-list'],
        /**
         * @member {Number} activeIndex=0
         */
        activeIndex: 0
    }

    /**
     * @summary Renders initials, full name, and role/location for each member record.
     * @param {Neo.data.Record} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        return [
            {tag: 'span', cls: ['sp-avatar', 'sp-avatar-sm'], 'aria-hidden': 'true', text: initialsOf(record.name)},
            {tag: 'span', cls: ['sp-member-meta'], cn: [
                {tag: 'strong', cls: ['sp-member-name'], text: record.name},
                {tag: 'small',  cls: ['sp-member-role'], text: `${record.role} · ${record.location}`}
            ]}
        ]
    }
}

export default Neo.setupClass(MemberList);
