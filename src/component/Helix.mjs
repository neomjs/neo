import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Collection}      from '../collection/Base.mjs'
import {default as Component}       from './Base.mjs';
import HelixModel                   from '../selection/HelixModel.mjs';
import Matrix                       from '../util/Matrix.mjs';
import NeoArray                     from '../util/Array.mjs';

/**
 * @class Neo.component.Helix
 * @extends Neo.component.Base
 */
class Helix extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Helix'
         * @private
         */
        className: 'Neo.component.Helix',
        /**
         * @member {String} ntype='helix'
         * @private
         */
        ntype: 'helix',
        /**
         * The background color of the helix container
         * @member {String} backgroundColor_='#000000'
         */
        backgroundColor_: '#000000',
        /**
         * The background image of the helix container
         * @member {String} backgroundImage_=''
         */
        backgroundImage_: '',
        /**
         * The ids of expanded items will get stored here
         * @member {Array} clonedItems=[]
         * @private
         */
        clonedItems: [],
        /**
         * @member {String[]} cls=['neo-helix']
         */
        cls: ['neo-helix'],
        /**
         * The vertical delta between each helix item (increasing this value will create a spiral)
         * @member {Number} deltaY_=1.5
         */
        deltaY_: 1.5,
        /**
         * Multiselections will reduce the opacity and set this flag to true
         * @member {Boolean} dimmed_=false
         */
        dimmed_: false,
        /**
         * Multiselections will reduce the opacity and set this flag to true
         * @member {Number} dimmedMaxOpacity_=0.3
         */
        dimmedMaxOpacity_: 0.3,
        /**
         * Multiselections will reduce the opacity and set this flag to true
         * @member {Number} dimmedMinOpacity_=0.2
         */
        dimmedMinOpacity_: 0.2,
        disableSelection : false,
        /**
         * Flip images by 180° for a not mirrored inner view
         * @member {Boolean} flipped_=false
         */
        flipped_: false,
        /**
         * True to rotate the helix when using keynav, so that the selected items stays in front
         * @member {Boolean} followSelection_=false
         */
        followSelection_: false,
        /**
         * The path to the images folder
         * Will get set inside the ctor to avoid issues inside the webpack builds
         * @member {String|null} imageSource=Neo.config.resourcesPath + 'examples/'
         */
        imageSource: null,
        /**
         * Amount of items per row (circle) -> 360° / 10 = 36
         * @member {Number} itemAngle_=8
         */
        itemAngle_: 8,
        /**
         * @member {Object} itemTpl_
         */
        itemTpl_: {
            cls     : ['surface', 'neo-helix-item'],
            style   : {},
            tabIndex: '-1',
            cn: [{
                tag: 'img',
                cls: ['contact-item']
            }]
        },
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            'Enter': 'onKeyDownEnter',
            'Space': 'onKeyDownSpace'
        },
        /**
         * We store one instance of the matrix here to avoid creating new ones on each refresh operation
         * @member {Neo.util.Matrix|null} matrix=null
         * @private
         */
        matrix: null,
        /**
         * The max amount of store items to show
         * @member {Number} maxItems_=300
         */
        maxItems_: 300,
        /**
         * The max opacity for items inside the foreground
         * @member {Number} maxOpacity_=0.8
         */
        maxOpacity_: 0.8,
        /**
         * The max opacity for items inside the background
         * @member {Number} minOpacity_=0.3
         */
        minOpacity_: 0.3,
        /**
         * The zooming factor which replaces the default wheelDelta.
         * @member {Number} mouseWheelDeltaX=5
         */
        mouseWheelDeltaX: 5,
        /**
         * The zooming factor which replaces the default wheelDelta.
         * @member {Number} mouseWheelDeltaY=50
         */
        mouseWheelDeltaY: 50,
        /**
         * Specifies whether the mouse wheel should change the translateZ value for zooming
         * @member {Boolean} mouseWheelEnabled_=true
         */
        mouseWheelEnabled_: true,
        /**
         * The DOM element offsetHeight of the top level div.
         * Gets fetched after the helix got mounted.
         * @member {Boolean} mouseWheelEnabled=true
         * @private
         */
        offsetHeight: null,
        /**
         * The DOM element offsetWidth of the top level div.
         * Gets fetched after the helix got mounted.
         * @member {Boolean} mouseWheelEnabled=true
         * @private
         */
        offsetWidth: null,
        /**
         * The perspective of the Helix view in px
         * @member {Number} perspective_=800
         */
        perspective_: 800,
        /**
         * The radius of the Helix in px
         * @member {Number} radius_=1500
         */
        radius_: 1500,
        /**
         * The rotationAngle of the Helix in degrees
         * @member {Number} rotationAngle_=780
         */
        rotationAngle_: 780,
        /**
         * We store one instance of the rotation matrix here to avoid creating new ones on each refresh operation
         * @member {Neo.util.Matrix|null} rotationMatrix=null
         * @private
         */
        rotationMatrix: null,
        /**
         * The name of the CSS rule for selected items
         * @member {String} selectedItemCls='neo-selected'
         */
        selectedItemCls: 'neo-selected',
        /**
         * uses the selection.HelixModel by default
         * @member {Neo.selection.HelixModel|null} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * The store instance or class containing the data for the gallery items
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null, // todo: use a store once collecitons are integrated
        /**
         * The setTimeout() ids for calls which can get cancelled
         * @member {Array} transitionTimeouts=[]
         * @private
         */
        transitionTimeouts: [],
        /**
         * The translateX gets included into each helix item
         * @member {Number} translateX_=400
         */
        translateX_: 400,
        /**
         * The translateX value gets included into each helix item
         * @member {Number} translateY_=-350
         */
        translateY_: -350,
        /**
         * The translateX value gets included into each helix item
         * @member {Number} translateZ_=-5000
         */
        translateZ_: -5000,
        /**
         * The url for the store to load the data
         * @member {String} url_='../resources/examples/data/ai_contacts.json'
         */
        url_: '../../resources/examples/data/ai_contacts.json',
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            style   : {},
            tabIndex: '-1',
            cn: [{
                cls  : ['container'],
                style: {},
                cn: [{
                    cls  : ['group'],
                    cn   : [],
                    style: {
                        opacity  : 1,
                        transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 461, 452.5, -100700, 1)'
                    }
                }]
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = Neo.clone(me.domListeners, true);

        if (!me.imageSource) {
            me.imageSource = Neo.config.resourcesPath + 'examples/';
        }

        domListeners.push({
            click: me.onClick,
            wheel: me.onMouseWheel,
            scope: me
        });

        me.domListeners = domListeners;

        me.store = Neo.create(Collection, {
            keyProperty: 'id',
            listeners  : {
                sort : me.onSort,
                scope: me
            }
        });
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.selectionModel) {
            me.selectionModel.register(me);
        }

        me.loadData();
    }

    /**
     * Triggered after the flipped config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetFlipped(value, oldValue) {
        this.applyItemTransitions(this.refresh, 1000);
    }

    /**
     * Triggered after the maxItem config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetMaxItems(value, oldValue) {
        let me = this;

        if (value && me.rendered) {
            if (oldValue > value) {
                me.destroyItems(value, oldValue - value);
            } else {
                me.createItems(oldValue);
            }
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            let me = this;

            setTimeout(() => {
                Neo.currentWorker.promiseMessage('main', {
                    action    : 'readDom',
                    vnodeId   : me.id,
                    attributes: [
                        'offsetHeight',
                        'offsetWidth'
                    ]
                }).then(data => {console.log(data.attributes);
                    me.offsetHeight = data.attributes.offsetHeight;
                    me.offsetWidth  = data.attributes.offsetWidth;
                });
            }, 100);
        }
    }

    /**
     * Triggered after the perspective config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetPerspective(value, oldValue) {
        let me = this;

        if (me.mounted) {
            Neo.currentWorker.promiseMessage('main', {
                action: 'updateDom',
                deltas: {
                    id   : me.vdom.id,
                    style: {
                        perspective: value + 'px'
                    }
                }
            });

            me.updateCloneTranslate();
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @private
     */
    afterSetSelectionModel(value, oldValue) {
        if (this.rendered) {
            value.register(this);
        }
    }

    /**
     * Triggered after the url config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetUrl(value, oldValue) {
        let me = this;

        if (me.rendered) {
            me.destroyItems();
            me.loadData();
        }
    }

    /**
     *
     * @param callback
     * @param animationTime
     * @param callbackParam
     * @private
     */
    applyItemTransitions(callback, animationTime, callbackParam) {
        let me  = this,
            cls = 'neo-transition-' + animationTime,
            timeoutId;

        me.transitionTimeouts.forEach(item => {
            clearTimeout(item);
        });

        me.transitionTimeouts.splice(0, me.transitionTimeouts.length);

        if (me.mounted) {
            Neo.currentWorker.promiseMessage('main', {
                action: 'updateDom',
                deltas: {
                    id : me.id,
                    cls: {
                        add   : [cls],
                        remove: []
                    }
                }
            }).then(() => {
                callback.apply(me, [callbackParam]);

                timeoutId = setTimeout(() => {
                    NeoArray.remove(me.transitionTimeouts, timeoutId);

                    Neo.currentWorker.promiseMessage('main', {
                        action: 'updateDom',
                        deltas: {
                            id : me.id,
                            cls: {
                                add   : [],
                                remove: [cls]
                            }
                        }
                    });
                }, animationTime + 200);

                me.transitionTimeouts.push(timeoutId);
            });
        }
    }

    /**
     *
     * @returns {Object}
     */
    beforeGetItemTpl() {
        return Neo.clone(this._itemTpl, true);
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @private
     */
    beforeSetSelectionModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, HelixModel, {
            listeners: {
                selectionChange: this.onSelectionChange,
                scope          : this
            }
        });
    }

    /**
     * Calculate an opacity gradient based on the item rotation angle
     * @param {Object} item
     * @returns {Number}
     */
    calculateOpacity(item) {
        let me           = this,
            maxOpacity   = me.maxOpacity,
            minOpacity   = me.minOpacity,
            deltaOpacity = maxOpacity - minOpacity,
            angle, opacity, opacityFactor;

        if (deltaOpacity === 0) {
            opacity = maxOpacity;
        } else {
            angle = item.rotationAngle % 360;

            while (angle < 0) {
                angle += 360;
            }

            while (angle > 180) {
                angle = 360 - angle;
            }

            // non linear distribution, since the angle does not match delta translateZ
            opacityFactor = 1 - Math.sin(angle * Math.PI / 360);

            opacity = minOpacity + deltaOpacity * opacityFactor;
        }

        return opacity;
    }

    /**
     * @param {Number} [startIndex] the start index for creating items,
     * e.g. increasing maxItems only needs to create the new ones
     * @private
     */
    createItems(startIndex) {
        let me            = this,
            deltaY        = me.deltaY,
            itemAngle     = me.itemAngle,
            matrix        = me.matrix,
            radius        = me.radius,
            rotationAngle = me.rotationAngle,
            translateX    = me.translateX,
            translateY    = me.translateY,
            translateZ    = me.translateZ,
            vdom          = me.vdom,
            i             = startIndex || 0,
            len           = Math.min(me.maxItems, me.store.items.length),
            angle, item, matrixItems, transformStyle, vdomItem, c, s, x, y, z;

        // console.log('createItems', me.id, me.store);

        for (; i < len; i++) {
            item = me.store.items[i];

            vdomItem = me.itemTpl; // get a fresh clone each time

            angle = -rotationAngle + i * itemAngle;

            s = Math.sin(angle * Math.PI / 180);
            c = Math.cos(angle * Math.PI / 180);

            x = radius * s - 300 + translateX;
            y = -400 + angle * deltaY + translateY;
            z = 99800 + radius * c + translateZ;

            matrixItems = [
                [c, 0, -s, 0],
                [0, 1,  0, 0],
                [s, 0,  c, 0],
                [x, y,  z, 1]
            ];

            if (!matrix) {
                me.matrix = matrix = Neo.create(Matrix, {
                    items: matrixItems
                });
            } else {
                matrix.items = matrixItems;
            }

            transformStyle = matrix.getTransformStyle();

            item.rotationAngle  = angle;
            item.transformStyle = transformStyle;

            vdomItem.id = me.getItemVnodeId(item.id);

            vdomItem.style.opacity   = me.calculateOpacity(item);
            vdomItem.style.transform = transformStyle;

            vdomItem.cn[0].id  = me.getItemVnodeId(item.id) + '_img';
            vdomItem.cn[0].src = me.imageSource + item.image;

            vdom.cn[0].cn[0].cn.push(vdomItem);
        }

        me.vdom = vdom;
    }

    /**
     * @private
     */
    destroyClones() {
        let me           = this,
            store        = me.store,
            deltas       = [],
            removeDeltas = [],
            id, record;

        if (me.clonedItems.length > 0) {
            me.clonedItems.forEach(item => {
                id     = parseInt(item.id.split('__')[1]);
                record = store.get(id);

                record.expanded = false;

                deltas.push({
                    id   : item.id,
                    style: {
                        opacity  : record.opacity,
                        transform: record.transformStyle
                    }
                });

                removeDeltas.push({
                    id    : item.id,
                    action: 'removeNode'
                })
            });

            me.clonedItems = [];

            Neo.currentWorker.promiseMessage('main', {
                action: 'updateDom',
                deltas: deltas
            }).then(data => {
                setTimeout(() => {
                    Neo.currentWorker.promiseMessage('main', {
                        action: 'updateDom',
                        deltas: removeDeltas
                    });
                }, 650);
            });
        }
    }

    /**
     *
     * @param {Number} [starIndex]
     * @param {Number} [amountItems]
     */
    destroyItems(starIndex, amountItems) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[0].cn[0].cn.splice(starIndex || 0, amountItems || me.store.getCount());
        me.vdom = vdom;
    }

    /**
     * Moves a clone of an item to the top left corner
     * @param {String} itemId
     */
    expandItem(itemId) {
        let me         = this,
            store      = me.store,
            record     = store.get(itemId),
            index      = store.indexOf(itemId),
            isExpanded = !!record.expanded,
            group      = me.vdom.cn[0].cn[0],
            itemVdom   = Neo.clone(group.cn[index], true);

        me.destroyClones();

        if (isExpanded !== true) {
            record.expanded = true;

            itemVdom.id = itemVdom.id + '__clone';
            itemVdom.style.transform = record.transformStyle;
            NeoArray.add(itemVdom.cls, 'neo-transition-600');
            delete itemVdom.tabIndex;

            itemVdom.cn[0].id = itemVdom.cn[0].id + '__clone';

            itemVdom.cn.push({
                cls      : ['contact-name'],
                innerHTML: record.firstname + ' ' + record.lastname + ' ' + record.id
            });

            Neo.vdom.Helper.create({
                autoMount  : true,
                parentId   : group.id,
                parentIndex: store.getCount(),
                ...itemVdom
            }).then(data => {
                me.clonedItems.push(itemVdom);

                setTimeout(() => {
                    Neo.currentWorker.promiseMessage('main', {
                        action: 'updateDom',
                        deltas: [{
                            id   : itemVdom.id,
                            style: {
                                opacity  : 1,
                                transform: me.getCloneTransform()
                            }
                        }]
                    });
                }, 50);
            });
        }
    }

    /**
     *
     * @returns {String}
     */
    getCloneTransform() {
        let me         = this,
            translateX = (me.offsetWidth  - 1350) / 3,
            translateY = (me.offsetHeight - 1320) / 3,
            translateZ = 100700 + me.perspective / 1.5;

        return 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,'+translateX+','+translateY+','+translateZ+',1)';
    }

    /**
     *
     * @param {String} vnodeId
     * @returns {Number}
     */
    getItemId(vnodeId) {
        return parseInt(vnodeId.split('__')[1]);
    }

    /**
     *
     * @param {Number|String} id
     * @returns {String}
     */
    getItemVnodeId(id) {
        return this.id + '__' + id;
    }

    /**
     *
     */
    loadData() {
        let me = this;

        Neo.Xhr.promiseJson({
            url: Neo.config.isExperimental ? me.url : me.url
        }).then(data => {
            me.store.items = data.json.data;
            setTimeout(() => { // todo: rendering check
                me.createItems();
            }, 100);
        }).catch(err => {
            console.log('Error for Neo.Xhr.request', err, me.id);
        });
    }

    /**
     *
     * @param {String} itemId
     */
    moveToSelectedItem(itemId) {
        let me = this;
        me.rotationAngle = me.store.get(itemId).rotationAngle + me.rotationAngle;
    }

    /**
     *
     * @param {Object} data
     */
    onClick(data) {
        this.fire(data.id === this.id ? 'containerClick' : 'itemClick', data);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        let item = this.selectionModel.items[0];

        if (item) {
            this.expandItem(item);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownSpace(data) {
        this.applyItemTransitions(this.moveToSelectedItem, 1000, this.selectionModel.items[0] || 0);
    }

    /**
     *
     * @param {Object} data
     */
    onMouseWheel(data) {
        let me            = this,
            deltaX        = data.deltaX,
            deltaY        = data.deltaY,
            rotationAngle = me.rotationAngle,
            translateZ    = me.translateZ;


        if (me.mouseWheelEnabled) {
            me._rotationAngle = rotationAngle + (deltaX * me.mouseWheelDeltaX); // silent update
            me._translateZ    = translateZ    + (deltaY * me.mouseWheelDeltaY); // silent update

            me.refresh();

            me.fire('changeRotation',   me._rotationAngle);
            me.fire('changeTranslateZ', me._translateZ);
        }
    }

    /**
     *
     * @param {String[]} value
     * @param {String[]} oldValue
     */
    onSelectionChange(value, oldValue) {
        let me = this;

        if (me.followSelection && value && value[0]) {
            me.applyItemTransitions(me.moveToSelectedItem, 100, value[0]);
        }
    }

    /**
     * @private
     */
    onSort() {
        this.applyItemTransitions(this.sortItems, 1000);
    }

    /**
     * @private
     */
    refresh() {
        let me             = this,
            deltas         = [],
            deltaY         = me.deltaY,
            flipped        = me.flipped,
            index          = 0,
            itemAngle      = me.itemAngle,
            len            = Math.min(me.maxItems, me.store.items.length),
            matrix         = me.matrix,
            radius         = me.radius,
            rotationAngle  = me.rotationAngle,
            rotationMatrix = me.rotationMatrix,
            translateX     = me.translateX,
            translateY     = me.translateY,
            translateZ     = me.translateZ,
            vdom           = me.vdom,
            angle, item, opacity, rotateY, transformStyle, vdomItem, c, s, x, y, z;

        if (flipped) {
            rotateY = Matrix.rotateY(180 * Math.PI / 180);

            if (!rotationMatrix) {
                me.rotationMatrix = rotationMatrix = Neo.create(Matrix, {
                    items: rotateY
                });
            } else {
                rotationMatrix.items = rotateY;
            }
        }

        for (; index < len; index++) {
            item     = me.store.items[index];
            vdomItem = vdom.cn[0].cn[0].cn[index];

            angle = -rotationAngle + index * itemAngle;

            s = Math.sin(angle * Math.PI / 180);
            c = Math.cos(angle * Math.PI / 180);

            x =  -300 + radius * s     + translateX;
            y =  -400 + angle * deltaY + translateY;
            z = 99800 + radius * c     + translateZ;

            matrix.items = [
                [c, 0, -s, 0],
                [0, 1,  0, 0],
                [s, 0,  c, 0],
                [x, y,  z, 1]
            ];

            if (flipped) {
                matrix = rotationMatrix.x(matrix);
            }

            opacity        = me.calculateOpacity(item);
            transformStyle = matrix.getTransformStyle();
            matrix.destroy();

            Object.assign(item, {
                opacity       : opacity,
                rotationAngle : angle,
                transformStyle: transformStyle
            });

            deltas.push({
                id   : me.getItemVnodeId(item.id),
                style: {
                    opacity  : opacity,
                    transform: transformStyle
                }
            });
        }

        Neo.currentWorker.promiseMessage('main', {
            action: 'updateDom',
            deltas: deltas
        });
    }

    /**
     * @private
     */
    refreshIfMounted() {
        if (this.mounted) {
            this.refresh();
        }
    }

    /**
     *
     */
    sortItems() {
        let me       = this,
            deltas   = [],
            parentId = me.vdom.cn[0].cn[0].id,
            i        = 0,
            len      = Math.min(me.maxItems, me.store.getCount());

        for (; i < len; i++) {
            deltas.push({
                action  : 'moveNode',
                id      : me.getItemVnodeId(me.store.items[i].id),
                index   : i,
                parentId: parentId
            });
        }

        Neo.currentWorker.promiseMessage('main', {
            action: 'updateDom',
            deltas: deltas
        }).then(() => {
            me.refresh();
        });
    }

    /**
     * @private
     */
    updateCloneTranslate() {
        let me           = this,
            afterDeltas  = [],
            deltas       = [],
            timeoutId, transform;

        if (me.clonedItems.length > 0) {
            transform = me.getCloneTransform(true);

            me.transitionTimeouts.forEach(item => {
                clearTimeout(item);
            });

            me.clonedItems.forEach(item => {
                deltas.push({
                    id : item.id,
                    cls: {
                        add   : [],
                        remove: ['neo-transition-600']
                    },
                    style: {
                        transform: transform
                    }
                });

                afterDeltas.push({
                    id : item.id,
                    cls: {
                        add   : ['neo-transition-600'],
                        remove: []
                    }
                });
            });

            Neo.currentWorker.promiseMessage('main', {
                action: 'updateDom',
                deltas: deltas
            }).then(() => {
                timeoutId = setTimeout(() => {
                    NeoArray.remove(me.transitionTimeouts, timeoutId);

                    Neo.currentWorker.promiseMessage('main', {
                        action: 'updateDom',
                        deltas: afterDeltas
                    });
                }, 200);

                me.transitionTimeouts.push(timeoutId);
            });
        }
    }
}

const cfg = {enumerable: false, value: Helix.prototype.refreshIfMounted};

Object.defineProperties(Helix.prototype, {
    afterSetDeltaY       : cfg,
    afterSetItemAngle    : cfg,
    afterSetMaxOpacity   : cfg,
    afterSetMinOpacity   : cfg,
    afterSetRadius       : cfg,
    afterSetRotationAngle: cfg,
    afterSetTranslateX   : cfg,
    afterSetTranslateY   : cfg,
    afterSetTranslateZ   : cfg
});

Neo.applyClassConfig(Helix);

export {Helix as default};