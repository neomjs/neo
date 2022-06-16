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

    static getConfig() {return {
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
         * @member {String[]} cls=['neo-carousel']
         */
        cls : ['neo-carousel'],
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
         *     record = {foo: ... , bar: ...}
         *     "[{cls: 'css-foo-class', html: '${foo}'}, {html: '${baa}'}]"
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
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me           = this,
            domListeners = me.domListeners;

        if(me.autoRun) return;

        domListeners.push({
            click: {
                fn      : me.onCarouselBtnClick,
                delegate: '.neo-carousel-btn',
                scope   : me
            }
        });

        me.domListeners = domListeners;
    }

    /**
     * Triggered after autoRun config got changed
     * @param {boolean|integer} value
     * @protected
     */
    afterSetAutoRun(value, oldValue) {
        let me = this;

        if(!value) return;

        TaskManager.start({
            id: this.id,
            interval: value,
            run: function() {
                me.onCarouselBtnClick('forward');
            }
        });

        let vdom = this._vdom;
        vdom.cn[0].cn[0].removeDom = true;

        this._vdom = vdom;
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
            load : 'onStoreLoad',
            scope: me
        });

        value?.getCount() > 0 && me.onStoreLoad();
    }

    /**
     * Ensure the itemTpl is setup correctly to match a valid JSON
     * @param {String} value
     * @returns {String}
     * @protected
     */
    beforeSetItemTpl(value) {
        let itemTpl = value.replaceAll('\'', '"');

        itemTpl = itemTpl.replace(/(\w+:)|(\w+ :)/g, function(matchedStr) {
            return `"${matchedStr.substring(0, matchedStr.length - 1)}":`;
        });

        return itemTpl;
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
        return ClassSystemUtil.beforeSetInstance(value, Store);
    }

    /**
     * Create the initial three items and add them to the vdom
     */
    createBaseItems() {
        let me       = this,
            vdom     = me._vdom,
            itemRoot = me.#getItemRoot(),
            items    = [],
            i        = 0;

        for (i; i < 3; i++) {
            items.push(me.createItem(i, i));
        }

        itemRoot.cn = items;
        me.vdom = vdom;
    }

    /**
     * Everytime we rotate we create items
     * @param {Number} recordIndex   - index inside store
     * @param {Number} positionIndex - based on positionArray
     * @returns {Object}
     */
    createItem(recordIndex, positionIndex) {
        let me            = this,
            itemCls       = me.itemCls,
            positionArray = me.positionArray,
            store         = me.store,
            data          = store.getAt(recordIndex),
            itemTpl       = me.#formatTpl(me.itemTpl, data),

        newItem = {
            cls: [positionArray[positionIndex], 'neo-carousel-item'],
            cn : itemTpl,
            recordIndex
        };

        itemCls && newItem.cls.push(itemCls);

        return newItem;
    }

    /**
     * Rotate the three items and fill in a new record
     * @param {Object} event
     * @param {Object} event.target - clicked button
     */
    onCarouselBtnClick(event) {
        let me            = this,
            action        = (typeof event === 'string') ? event : event.target.data.carouselaction,
            store         = me.store,
            countItems    = store.getCount(),
            vdom          = me.vdom,
            index         = me.itemIndex,
            positionArray = me.positionArray,
            root          = me.#getItemRoot(),
            newRecordIndex, positionCls, recordIndex, vdomCls;

        if (action === 'forward') {
            vdomCls        = 'neo-carousel-translate-x-full';
            index          = index + 2
            newRecordIndex = index % countItems;

            me.itemIndex = newRecordIndex - 1;
            positionArray = me.#arrayRotate(positionArray, -1);
        } else {
            vdomCls        = 'neo-carousel--translate-x-full';
            index          = index - 2;
            newRecordIndex = index < 0 ? (countItems + index) : index;

            me.itemIndex = newRecordIndex + 1;
            positionArray = me.#arrayRotate(positionArray, 1);
        }

        me.positionArray = positionArray;

        root.cn = root.cn.map(function(cn, mappingIndex) {
            positionCls = positionArray[mappingIndex];
            recordIndex = cn.recordIndex;

            cn.cls.shift();
            cn.cls.unshift(positionCls);

            // Update new Record
            if (positionCls === vdomCls) {
                recordIndex = newRecordIndex;
                cn          = me.createItem(recordIndex, mappingIndex);
            }

            return cn;
        })

        me.vdom = vdom;
    }

    /**
     * As soon as the store is loaded we want to
     * - create the three items
     * - fill the first three records
     */
    onStoreLoad() {
        this.createBaseItems();
    }

    /**
     * HELPERS
     */
    #getItemRoot() {
        return this.vdom.cn[0].cn[1];
    }

    #arrayRotate(arr, n) {
        return n ? [...arr.slice(n, arr.length), ...arr.slice(0, n)] : arr;
    }

    #formatTpl(tpl, record) {
        let resultStr = tpl.replace(/\$\{[^\}]+\}/g, (m) => record[m.slice(2, -1).trim()]);

        return JSON.parse(resultStr);
    }
}

Neo.applyClassConfig(Carousel);

export default Carousel;
