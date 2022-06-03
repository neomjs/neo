import Component       from './Base.mjs';
import ClassSystemUtil from "../util/ClassSystem.mjs";
import Store           from "../data/Store.mjs";

/**
 * @class Neo.component.Carousel
 * @extends Neo.component.Base
 */
class Carousel extends Component {
    /**
     * Defines the order of the item in the carousel
     * This gets updated everytime a button is clicked to reflect the current order
     *
     * @field {string[]} positionArray
     */
    positionArray = ['neo-carousel--translate-x-full', 'neo-carousel-translate-x-0', 'neo-carousel-translate-x-full']
    /**
     * Defines the currently visible item in the middle
     * This gets updated everytime a button is clicked to reflect the current order
     *
     * @field {int} itemIndex=1
     */
    itemIndex = 1

    static getConfig() {
        return {
            className: 'TakeAway.view.src.Carousel',
            ntype: 'carousel',

            /**
             * Store to be used.
             *
             * @member {string} store=null
             */
            store_: null,

            /**
             * Custom cls added to each item
             * This is only a single string
             *
             * @member {string} itemCls=null
             */
            itemCls: null,

            /**
             * handler that manages both buttons
             * The '_' allows to build the DomListener to be build initially
             *
             * @member {string} handler='onCarouselBtnClick'
             */
            handler_: 'onCarouselBtnClick',

            /**
             * Template for each item
             * The format is the same as for literals,
             * but it is a string instead of surrounding "`"
             *
             * @member {string} tpl=null
             *
             * @example
             *     record = {foo: ... , baa: ...}
             *     "[{cls: 'css-foo-class', html: '${foo}'}, {html: '${baa}'}]"
             */
            itemTpl_: null,

            cls : ['neo-carousel'],
            _vdom: {
                cn: [{
                    cls: ['neo-carousel'],
                    cn: [{
                        cls: ['neo-carousel-btn-bar'],
                        cn: [{
                            tag: 'a',
                            'data-carouselaction': 'back',
                            cls: ['neo-carousel-btn', 'fa', 'fa-chevron-left'],
                        }, {
                            tag: 'a',
                            'data-carouselaction': 'forward',
                            cls: ['neo-carousel-btn', 'fa', 'fa-chevron-right'],
                        }]
                    }, {
                        cls: ['neo-carousel-inner'],
                        cn: [] // ==> items
                    }]
                }]
            }
        }
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store} value
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        value?.on({
            load: 'onStoreLoad',
            scope: me
        });

        value?.getCount() > 0 && me.onStoreLoad();
    }

    /**
     * Triggered after the handler config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHandler(value, oldValue) {
        if(value) {
            let me = this,
                domListeners = me.domListeners || [];

            domListeners.push({
                click: {
                    fn: me[value],
                    delegate: '.neo-carousel-btn',
                    scope: me
                }
            });

            me.domListeners = domListeners;
        }
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Store);
    }

    /**
     * Ensure the itemTpl is setup correctly to match a valid JSON
     * @param {string} value
     * @returns {string}
     * @protected
     */
    beforeSetItemTpl(value){
        let itemTpl = value.replaceAll('\'', '"');

        itemTpl = itemTpl.replace(/(\w+:)|(\w+ :)/g, function(matchedStr) {
            return '"' + matchedStr.substring(0, matchedStr.length - 1) + '":';
        });

        return itemTpl;
    }

    /**
     * Create the initial three items and add to vdom
     */
    createBaseItems() {
        const me = this;
        let vdom = me._vdom,
            itemRoot = me.#getItemRoot(),
            items = [], i = 0;

        for (i; i < 3; i++) {
            let newItem = this.createItem(i, i);

            items.push(newItem);
        }

        itemRoot.cn = items;
        me.vdom = vdom;
    }

    /**
     * Everytime we rotate we create items
     * @param {int} recordIndex   - index inside store
     * @param {int} positionIndex - based on positionArray
     * @returns {{cls: (string|string)[], cn: any, recordIndex}}
     */
    createItem(recordIndex, positionIndex) {
        const me = this,
            store = me.store,
            itemCls = me.itemCls,
            positionArray = me.positionArray,
            data = store.getAt(recordIndex),
            itemTpl = me.#formatTpl(me.itemTpl, data);

        let newItem = {
            recordIndex: recordIndex,
            cls: [positionArray[positionIndex], 'neo-carousel-item'],
            cn: itemTpl
        };

        if(itemCls) newItem.cls.push(itemCls);

        return newItem;
    }

    updateItem(positionIndex) {

    }

    /**
     * Rotate the three items and fill in a new record
     * @param {Neo.events.Event} event
     * @parem {DomElement} e.target - clicked button
     */
    onCarouselBtnClick(e) {
        const me = this,
            action = e.target.data.carouselaction,
            store = me.store,
            storeLn = store.getCount();
        let vdom = this.vdom,
            index = me.itemIndex,
            newRecordIndex, vdomCls,
            positionArray = this.positionArray,
            root = this.#getItemRoot();

        if(action === 'forward') {
            vdomCls = 'neo-carousel-translate-x-full';
            index = index + 2
            newRecordIndex = index % storeLn;
            me.itemIndex = newRecordIndex - 1;
            positionArray = this.#arrayRotate(positionArray, -1);
        } else {
            vdomCls = 'neo-carousel--translate-x-full';
            index = index - 2;
            newRecordIndex = (index < 0) ? (storeLn + index) : index;
            me.itemIndex = newRecordIndex + 1;
            positionArray = this.#arrayRotate(positionArray, 1);
        }

        this.positionArray = positionArray;

        root.cn = root.cn.map(function (cn, mappingIndex) {
            const positionCls = positionArray[mappingIndex];
            let recordIndex = cn.recordIndex;

            cn.cls.shift();
            cn.cls.unshift(positionCls);

            // Update new Record
            if(positionCls === vdomCls) {
                recordIndex = newRecordIndex;
                cn = me.createItem(recordIndex, mappingIndex);
                // await Neo.timeout(500);
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
        return this.vdom.cn[0].cn[1]
    }

    #arrayRotate(arr, n) {
        return n ? [...arr.slice(n, arr.length), ...arr.slice(0, n)] : arr;
    }

    // private class field
    #formatTpl(tpl, record) {
        let resultStr = tpl.replace(/\$\{[^\}]+\}/g, (m) => record[m.slice(2, -1).trim()]);

        return JSON.parse(resultStr);
    }
}

Neo.applyClassConfig(Carousel);

export default Carousel;
