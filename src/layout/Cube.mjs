import Card     from './Card.mjs';
import NeoArray from '../util/Array.mjs';

const configSymbol = Symbol.for('configSymbol');

/**
 * See: examples/layout.Cube for a demo.
 * Strongly inspired by https://www.mobzystems.com/code/3d-css-and-custom-properties/
 * @class Neo.layout.Cube
 * @extends Neo.layout.Card
 */
class Cube extends Card {
    /**
     * @member {Object} faces
     * @static
     */
    static faces = {
        front : [  0,   0, 0],
        back  : [  0, 180, 0],
        left  : [  0,  90, 0],
        right : [  0, 270, 0],
        top   : [270,   0, 0],
        bottom: [ 90,   0, 0]
    }

    static config = {
        /**
         * @member {String} className='Neo.layout.Cube'
         * @protected
         */
        className: 'Neo.layout.Cube',
        /**
         * @member {String} ntype='layout-cube'
         * @protected
         */
        ntype: 'layout-cube',
        /**
         * @member {String|null} activeFace_=null
         */
        activeFace_: null,
        /**
         * @member {Number|null} activeIndex=null
         */
        activeIndex: null,
        /**
         * @member {String|null} containerCls='neo-layout-fit'
         * @protected
         */
        containerCls: 'neo-layout-cube',
        /**
         * Updates the cube size to fit the owner container dimensions
         * @member {Boolean} fitContainer_=false
         */
        fitContainer_: false,
        /**
         * Important for dynamically switching from a cube to a card layout
         * @member {Boolean} hideInactiveCardsOnDestroy=false
         */
        hideInactiveCardsOnDestroy: false,
        /**
         * @member {Number} perspective_=600
         */
        perspective_: 600,
        /**
         * @member {Number} rotateX_=0
         */
        rotateX_: 0,
        /**
         * @member {Number} rotateY_=0
         */
        rotateY_: 0,
        /**
         * @member {Number} rotateZ_=0
         */
        rotateZ_: 0,
        /**
         * @member {Number} sideX_=300
         */
        sideX_: 300,
        /**
         * @member {Number} sideY_=300
         */
        sideY_: 300,
        /**
         * @member {Number} sideZ_=300
         */
        sideZ_: 300
    }

    /**
     * @member {Function|null} #cachedVdomItemsRoot=null
     * @private
     */
    #cachedVdomItemsRoot = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me          = this,
            {container} = me;

        me.nestVdom();

        container.mounted && container.update();

        me.timeout(100).then(() => {
            container.addCls('neo-animate')
        })
    }

    /**
     * Triggered after the activeFace config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActiveFace(value, oldValue) {
        if (value) {
            this.activeIndex = Object.keys(Cube.faces).indexOf(value)
        }
    }

    /**
     * Triggered after the activeIndex config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    async afterSetActiveIndex(value, oldValue) {
        if (Neo.isNumber(value)) {
            let me          = this,
                {container} = me,
                item        = container.items[value];

            // Since activeFace & activeIndex are optional, we need to clear out default values
            if (!Neo.isNumber(oldValue)) {
                delete me[configSymbol].rotateX;
                delete me[configSymbol].rotateY;
                delete me[configSymbol].rotateZ;
            }

            if (Neo.typeOf(item.module) === 'Function') {
                await me.loadModule(item, value);
                container.update();

                await me.timeout(100) // wait for the view to get painted first
            }

            this.rotateTo(...Object.values(Cube.faces)[value])
        }
    }

    /**
     * Triggered after the fitContainer config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetFitContainer(value, oldValue) {
        if (value) {
            let me          = this,
                {container} = me;

            if (container.mounted) {
                me.updateContainerSize()
            } else {
                container.on('mounted', () => {
                    me.timeout(50).then(() => {
                        me.updateContainerSize()
                    })
                })
            }
        }
    }

    /**
     * Triggered after the perspective config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetPerspective(value, oldValue) {
        this.updateContainerCssVar('--perspective', value + 'px')
    }

    /**
     * Triggered after the rotateX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateX(value, oldValue) {
        this.rotateTo(value)
    }

    /**
     * Triggered after the rotateY config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateY(value, oldValue) {
        this.rotateTo(null, value)
    }

    /**
     * Triggered after the rotateZ config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateZ(value, oldValue) {
        this.rotateTo(null, null, value)
    }

    /**
     * Triggered after the sideX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSideX(value, oldValue) {
        this.updateContainerCssVar('--side-x', value + 'px')
    }

    /**
     * Triggered after the sideX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSideY(value, oldValue) {
        this.updateContainerCssVar('--side-y', value + 'px')
    }

    /**
     * Triggered after the sideX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSideZ(value, oldValue) {
        this.updateContainerCssVar('--side-z', value + 'px')
    }

    /**
     * Initially sets the CSS classes of the container items this layout is bound to.
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        let {wrapperCls} = item;

        wrapperCls = NeoArray.union(wrapperCls, 'neo-face', Object.keys(Cube.faces)[index]);

        switch(index) {
            case 0:
            case 1:
                wrapperCls = NeoArray.union(wrapperCls, 'neo-face-z');
                break;
            case 2:
            case 3:
                wrapperCls = NeoArray.union(wrapperCls, 'neo-face-x');
                break;
            case 4:
            case 5:
                wrapperCls = NeoArray.union(wrapperCls, 'neo-face-y');
                break;
        }

        item.wrapperCls = wrapperCls
    }

    /**
     *
     */
    destroy(...args) {
        let me            = this,
            {container}   = me,
            {style, vdom} = container;

        Object.assign(style, {
            '--perspective': null,
            '--rot-x'      : null,
            '--rot-y'      : null,
            '--rot-z'      : null,
            '--side-x'     : null,
            '--side-y'     : null,
            '--side-z'     : null
        });

        container.style = style;

        vdom.cn = container.getVdomItemsRoot().cn;

        if (me.hideInactiveCardsOnDestroy) {
            vdom.cn.forEach((item, index) => {
                if (index !== me.activeIndex) {
                    item.removeDom = true
                }
            })
        }

        // override
        container.getVdomItemsRoot = me.#cachedVdomItemsRoot;

        container.update();

        super.destroy(...args)
    }

    nestVdom() {
        let me          = this,
            {container} = me,
            {vdom}      = container,
            {cn}        = vdom;

        vdom.cn = [
            {cls: ['neo-plane'], cn: [
                {cls: ['neo-box'], cn}
            ]}
        ];

        // Cache the original method for run-time container layout changes
        me.#cachedVdomItemsRoot = container.getVdomItemsRoot;

        // Override
        container.getVdomItemsRoot = function() {
            return this.vdom.cn[0].cn[0]
        }

        me.timeout(50).then(() => {
            // Important when switching from a card layout to this one
            container.vdom.cn[0].cn[0].cn.forEach(node => {
                delete node.removeDom
            });

            container.update()
        })
    }

    /**
     * Removes all CSS rules from a container item this layout is bound to.
     * Gets called when switching to a different layout.
     * @param {Neo.component.Base} item
     * @param {Number} index
     * @protected
     */
    removeChildAttributes(item, index) {
        let {wrapperCls} = item;

        NeoArray.remove(wrapperCls, ['neo-face', Object.keys(Cube.faces)[index]]);

        switch(index) {
            case 0:
            case 1:
                NeoArray.remove(wrapperCls, 'neo-face-z');
                break;
            case 2:
            case 3:
                NeoArray.remove(wrapperCls, 'neo-face-x');
                break;
            case 4:
            case 5:
                NeoArray.remove(wrapperCls, 'neo-face-y');
                break;
        }

        item.wrapperCls = wrapperCls
    }

    /**
     * @protected
     */
    removeRenderAttributes() {
        super.removeRenderAttributes();
        this.container.removeCls('neo-animate')
    }

    /**
     * @param {Number|null} [x]
     * @param {Number|null} [y]
     * @param {Number|null} [z]
     */
    rotateTo(x, y, z) {
        let me          = this,
            {container} = me,
            {style}     = container;

        if (Neo.isNumber(x)) {me._rotateX = x; style['--rot-x'] = x + 'deg'}
        if (Neo.isNumber(y)) {me._rotateY = y; style['--rot-y'] = y + 'deg'}
        if (Neo.isNumber(z)) {me._rotateZ = z; style['--rot-z'] = z + 'deg'}

        container.style = style
    }

    /**
     * @param {String} name
     * @param {String} value
     */
    updateContainerCssVar(name, value) {
        let {container} = this,
            {style}     = container;

        style[name] = value;

        container.style = style
    }

    /**
     *
     */
    async updateContainerSize() {
        let {container}     = this,
            {height, width} = await container.getDomRect(container.id);

        console.log({height, width});

        this.set({
            sideX: width,
            sideY: height,
            sideZ: Math.min(height, width)
        })
    }
}

Neo.setupClass(Cube);

export default Cube;
