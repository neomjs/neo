import List      from '../../../../src/list/Base.mjs';
import ListModel from '../../../../src/selection/ListModel.mjs';

/**
 * @summary The Messages app's conversations: who each one is with, and its last line.
 * @class WebDesktop.view.apps.MessagesThreadList
 * @extends Neo.list.Base
 */
class MessagesThreadList extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.MessagesThreadList'
         * @protected
         */
        className: 'WebDesktop.view.apps.MessagesThreadList',
        /**
         * @member {String[]} baseCls=['webdesktop-messages-threads','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-messages-threads', 'neo-list'],
        /**
         * @member {Object} selectionModel={module:ListModel}
         */
        selectionModel: {module: ListModel}
    }

    /**
     * @param {Neo.data.Record} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        return [{
            cls  : ['webdesktop-avatar'],
            style: {'--webdesktop-avatar-color': record.color},
            text : record.initials
        }, {
            cls: ['webdesktop-messages-thread-text'],
            cn : [
                {cls: ['webdesktop-messages-thread-name'], text: record.name},
                {cls: ['webdesktop-messages-thread-last'], text: record.last}
            ]
        }]
    }
}

export default Neo.setupClass(MessagesThreadList);
