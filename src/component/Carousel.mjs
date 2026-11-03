import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from './Base.mjs';
import Store           from '../data/Store.mjs';
import TaskManager     from '../manager/Task.mjs';

/**
 * @class Neo.component.Carousel
 * @extends Neo.component.Base
 */
class Carousel extends Component {
    /**
     * Defines the currently visible item in the middle
     * This gets updated everytime a button is clicked to reflect the current order
     * @member {Number} itemIndex=1
     */
    itemIndex = 1
    /**
     * Defines the order of the item in the carousel
     * This gets updated everytime a button is clicked to reflect the current order
     * @member {String[]} positionArray
     */
    positionArray = ['neo-carousel--translate-x-full', 'neo-carousel-translate-x-0', 'neo-carousel-translate-x-full']
    /**
     * keeps track of the data for the onClickEvent
     * @member {Object} itemData={}
     */
    itemData = {}

    static config = {
        /**
         * @member {String} className='Neo.component.Carousel'
         * @protected
         */
        className: 'Neo.component.Carousel',
        /**
         * @member {String} ntype='carousel'
         * @protected
         */
        ntype: 'carousel',
        /**
         * autoRun allows to run through the all items timebased
         * 0 means it is turned off. Other values are the timer in ms,
         * which will hide the arrows.
         *
         * @member {int} autoRun=0
         */
        autoRun_: 0,
        /**
         * @member {String[]} baseCls=['neo-carousel']
         */
        baseCls: ['neo-carousel'],
        /**
         * Custom cls added to each item
         * This is only a single string
         *
         * @member {String|null} itemCls=null
         */
        itemCls: null,
        /**
         * Template for each item
         * The format is the same as for literals,
         * but it is a string instead of surrounding "`"
         * @member {String|null} tpl=null
         * @example
         *      record = {foo: ... , bar: ...}
         *      data => [{
         *          cls: 'css-foo-class',
         *          text: data.foo
         *      },
         *      {
         *          text: data.bar
         *      }]"
         */
        itemTpl_: null,
        /**
         * Store to be used.
         *
         * @member {Neo.data.Store|null} store=null
         */
        store_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-carousel'], cn: [
                {cls: ['neo-carousel-btn-bar'], cn: [
                    {tag: 'a', 'data-carouselaction': 'back',    cls: ['neo-carousel-btn', 'fa', 'fa-chevron-left']},
                    {tag: 'a', 'data-carouselaction': 'forward', cls: ['neo-carousel-btn', 'fa', 'fa-chevron-right']}
                ]},
                {cls: ['neo-carousel-inner'], cn: []}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onCarouselBtnClick, delegate: '.neo-carousel-btn',  scope: me},
            {click: me.onClick,            delegate: '.neo-carousel-item', scope: me}
        ])
    }

    /**
     * Triggered after autoRun config got changed
     * @param {Boolean|Number} value
     * @param {Boolean|Number} oldValue
     * @protected
     */
    afterSetAutoRun(value, oldValue) {
        if (value) {
            let me = this;

            TaskManager.start({
                id      : me.id,
                interval: value,

                run() {
                    me.onCarouselBtnClick('forward');
                }
            });

            me.vdom.cn[0].cn[0].removeDom = true;
            me.update()
        }
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        value?.on({
            load : me.onStoreLoad,
            scope: me
        });

        value?.getCount() > 0 && me.onStoreLoad()
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Store)
    }

    /**
     * @summary Builds the carousel track items for 0, 1, 2, or 3+ store records and toggles navigation buttons.
     */
    createBaseItems() {
        let me       = this,
            count    = me.store?.getCount() || 0,
            itemRoot = me.#getItemRoot(),
            items    = [],
            len      = Math.min(count, 3),
            i        = 0;

        me.itemData      = {};
        me.itemIndex     = count === 1 ? 0 : 1;
        me.positionArray = ['neo-carousel--translate-x-full', 'neo-carousel-translate-x-0', 'neo-carousel-translate-x-full'];

        if (me.autoRun || count < 2) {
            me.vdom.cn[0].cn[0].removeDom = true
        } else {
            delete me.vdom.cn[0].cn[0].removeDom
        }

        if (count === 1) {
            items.push(me.createItem(0, 1))
        } else {
            for (; i < len; i++) {
                items.push(me.createItem(i, i))
            }
        }

        itemRoot.cn = items;
        me.update()
    }

    /**
     * Everytime we rotate we create items
     * @param {Number} recordIndex   - index inside store
     * @param {Number} positionIndex - based on positionArray
     * @returns {Object}
     */
    createItem(recordIndex, positionIndex) {
        let me                              = this,
            {itemCls, positionArray, store} = me,
            data                            = store.getAt(recordIndex),
            cn                              = me.itemTpl(data),

        newItem = {
            cls: [positionArray[positionIndex], 'neo-carousel-item'],
            cn,
            recordIndex
        };

        itemCls && newItem.cls.push(itemCls);

        me.itemData[recordIndex] = data;

        return newItem
    }

    /**
     * @summary Rotates the active carousel item for 2 or 3+ store records and ignores clicks when fewer than 2 items exist.
     * @param {Object|String} event
     * @param {Object} [event.target] - clicked button
     */
    onCarouselBtnClick(event) {
        let me                     = this,
            action                 = Neo.isString(event) ? event : event.target.data.carouselaction,
            {positionArray, store} = me,
            countItems             = store?.getCount() || 0,
            index                  = me.itemIndex,
            root                   = me.#getItemRoot(),
            newRecordIndex, positionCls, vdomCls;

        if (countItems < 2) {
            return
        }

        if (countItems === 2) {
            me.itemIndex = (index + 1) % 2;
            vdomCls      = action === 'forward' ? 'neo-carousel--translate-x-full' : 'neo-carousel-translate-x-full';

            root.cn.forEach(cn => {
                cn.cls[0] = cn.recordIndex === me.itemIndex ? 'neo-carousel-translate-x-0' : vdomCls
            });

            me.update();
            return
        }

        if (action === 'forward') {
            vdomCls        = 'neo-carousel-translate-x-full';
            me.itemIndex   = (index + 1) % countItems;
            newRecordIndex = (index + 2) % countItems;
            positionArray  = me.#arrayRotate(positionArray, -1)
        } else {
            vdomCls        = 'neo-carousel--translate-x-full';
            me.itemIndex   = (index - 1 + countItems) % countItems;
            newRecordIndex = (index - 2 + countItems) % countItems;
            positionArray  = me.#arrayRotate(positionArray, 1)
        }

        me.positionArray = positionArray;

        root.cn = root.cn.map(function(cn, mappingIndex) {
            positionCls = positionArray[mappingIndex];

            cn.cls[0] = positionCls;

            // Update new Record
            if (positionCls === vdomCls) {
                cn = me.createItem(newRecordIndex, mappingIndex)
            }

            return cn
        })

        me.update()
    }

    /**
     * Check if the user clicked an item or the container
     * @param data
     */
    onClick(data) {
        let me = this,
            item;

        if (data.path[0].id === me.id) {
            me.onContainerClick(data)
        } else {
            for (item of data.path) {
                if (item.cls.includes(me.itemCls)) {
                    me.onItemClick(item, data);
                    break
                }
            }
        }
    }

    /**
     * If the user wants to listen for the container click
     * @param {Object} data
     */
    onContainerClick(data){}

    /**
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        let me = this;

        /**
         * The itemClick event fires when a click occurs on a list item
         * @event itemClick
         * @param {String} id the record matching the list item
         * @returns {Object}
         */
        me.fire('itemClick', me.itemData[me.itemIndex])
    }

    /**
     * As soon as the store is loaded we want to
     * - create the three items
     * - fill the first three records
     */
    onStoreLoad() {
        this.createBaseItems()
    }

    /**
     * HELPERS
     */
    #getItemRoot() {
        return this.vdom.cn[0].cn[1]
    }

    #arrayRotate(arr, n) {
        return n ? [...arr.slice(n, arr.length), ...arr.slice(0, n)] : arr
    }
}

export default Neo.setupClass(Carousel);
