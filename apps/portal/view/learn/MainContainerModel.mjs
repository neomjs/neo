import Component           from '../../../../src/model/Component.mjs';
import ContentSectionStore from '../../store/ContentSections.mjs';
import ContentStore        from '../../store/Content.mjs';

/**
 * @class Portal.view.learn.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainerModel'
         * @protected
         */
        className: 'Portal.view.learn.MainContainerModel',
        /**
         * @member {String} contentBasePath='../../resources/data/deck/'
         */
        contentBasePath: '../../resources/data/deck/',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {String|null} data.contentPath=null
             */
            contentPath: null,
            /**
             * @member {Number|null} data.countPages=null
             */
            countPages: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.currentRecord=null
             */
            currentPageRecord: null,
            /**
             * @member {String|null} data.deck=null
             */
            deck: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.nextPageRecord=null
             */
            nextPageRecord: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.previousPageRecord=null
             */
            previousPageRecord: null,
            /**
             * Merging the direct parent text
             * @member {String|null} data.previousPageText=null
             */
            previousPageText: null
        },
        /**
         * @member {Object} stores
         */
        stores: {
            contentSections: {
                module: ContentSectionStore
            },
            contentTree: {
                module: ContentStore
            }
        }
    }

    /**
     * Combines the record parent node name (if available) with the record name
     * @param {Object} record
     * @param {Neo.data.Store} store
     * @returns {String|null}
     */
    getRecordTreeName(record, store) {
        let parentText = record.name;

        if (record.parentId !== null) {
            parentText = store.get(record.parentId).name + ': ' + parentText
        }

        return parentText
    }

    /**
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        let me = this;

        switch(key) {
            case 'currentPageRecord': {
                let data               = me.data,
                    countPages         = data.countPages,
                    store              = me.getStore('contentTree'),
                    index              = store.indexOf(value),
                    nextPageRecord     = null,
                    nextPageText       = null,
                    previousPageRecord = null,
                    previousPageText   = null,
                    i, record;

                // the logic assumes that the tree store is sorted
                for (i=index-1; i >= 0; i--) {
                    record = store.getAt(i);

                    if (record.isLeaf && !me.recordIsHidden(record, store)) {
                        previousPageRecord = record;
                        previousPageText   = me.getRecordTreeName(record, store);
                        break
                    }
                }

                me.setData({previousPageText, previousPageRecord});

                // the logic assumes that the tree store is sorted
                for (i=index+1; i < countPages; i++) {
                    record = store.getAt(i);

                    if (record.isLeaf && !me.recordIsHidden(record, store)) {
                        nextPageRecord = record;
                        nextPageText   = me.getRecordTreeName(record, store);
                        break
                    }
                }

                me.setData({nextPageText, nextPageRecord});

                break
            }

            case 'deck': {
                if (value) {
                    me.data.contentPath = me.contentBasePath + value;
                }

                break
            }
        }
    }

    /**
     * We need to check the parent-node chain inside the tree.
     * => Any hidden parent-node results in a hidden record.
     * @param {Object} record
     * @param {Neo.data.Store} store
     * @returns {Boolean}
     */
    recordIsHidden(record, store) {
        if (record.hidden) {
            return true
        }

        if (record.parentId !== null) {
            return this.recordIsHidden(store.get(record.parentId), store)
        }

        return false
    }
}

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
