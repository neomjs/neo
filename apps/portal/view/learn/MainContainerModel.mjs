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
             * @member {Number|null} data.countPages=null
             */
            countSections: null,
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
            previousPageRecord: null
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
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        let me = this;

        switch(key) {
            case 'countSections': {
                if (value < 1) {
                    me.component.getReference('page-sections-container')?.toggleCls('neo-expanded', false)
                }

                break
            }

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
                        break
                    }
                }

                me.setData({previousPageText, previousPageRecord});

                // the logic assumes that the tree store is sorted
                for (i=index+1; i < countPages; i++) {
                    record = store.getAt(i);

                    if (record.isLeaf && !me.recordIsHidden(record, store)) {
                        nextPageRecord = record;
                        break
                    }
                }

                me.setData({nextPageText, nextPageRecord});

                me.component.getReference('sidenav-container')?.toggleCls('neo-expanded', false)

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

export default Neo.setupClass(MainContainerModel);
