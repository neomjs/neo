import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * See: examples/layout.Cube for a demo.
 * Strongly inspired by https://www.mobzystems.com/code/3d-css-and-custom-properties/
 * @class Neo.layout.Cube
 * @extends Neo.layout.Base
 */
class Cube extends Base {
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
         * @member {String|null} containerCls='neo-layout-fit'
         * @protected
         */
        containerCls: 'neo-layout-cube',
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let {container} = this,
            {vdom}    = container,
            {cn}      = vdom;

        vdom.cn = [
            {cls: ['neo-plane'], cn: [
                {cls: ['neo-box'], cn}
            ]}
        ];

        // override
        container.getVdomItemsRoot = function() {
            return this.vdom.cn[0].cn[0]
        }
    }

    /**
     * Triggered after the activeFace config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActiveFace(value, oldValue) {
        if (value) {
            this.rotateTo(...Cube.faces[value])
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
     * Triggered after the rotateX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateY(value, oldValue) {
        this.rotateTo(null, value)
    }

    /**
     * Triggered after the rotateX config got changed
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
     * @param {Number|null} [x]
     * @param {Number|null} [y]
     * @param {Number|null} [z]
     */
    rotateTo(x, y, z) {
        let {container} = this,
            {style}     = container;

        if (Neo.isNumber(x)) {style['--rot-x'] = x + 'deg'}
        if (Neo.isNumber(y)) {style['--rot-y'] = y + 'deg'}
        if (Neo.isNumber(z)) {style['--rot-z'] = z + 'deg'}

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
}

Neo.setupClass(Cube);

export default Cube;
