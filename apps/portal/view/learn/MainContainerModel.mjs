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
             * @member {Object} data.currentRecord=null
             */
            nextPageRecord: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.currentRecord=null
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
            case 'currentPageRecord': {
                let data       = me.data,
                    countPages = data.countPages,
                    store      = me.getStore('contentTree'),
                    index      = store.indexOf(value),
                    i, record;

                // the logic assumes that the tree store is sorted
                for (i=index-1; i >= 0; i--) {
                    record = store.getAt(i);

                    if (record.isLeaf) {
                        me.data.previousPageRecord = record;
                        break
                    }
                }

                // the logic assumes that the tree store is sorted
                for (i=index+1; i < countPages; i++) {
                    record = store.getAt(i);

                    if (record.isLeaf) {
                        me.data.nextPageRecord = record;
                        break
                    }
                }

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
}

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
