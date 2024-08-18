import Base from '../component/Base.mjs';

/**
 * @class Neo.component.Progress
 * @extends Neo.component.Base
 */
class Progress extends Base {
    static config = {
        /**
         * @member {String} className='Neo.component.Progress'
         * @protected
         */
        className: 'Neo.component.Progress',
        /**
         * @member {String} ntype='progress'
         * @protected
         */
        ntype: 'progress',
        /**
         * @member {String[]} baseCls=['neo-progress-label']
         * @protected
         */
        baseCls: ['neo-progress'],
        /**
         * @member {String|null} labelText_=null
         */
        labelText_: null,
        /**
         * @member {Number} max_=100
         */
        max_: 100,
        /**
         * @member {Number|null} value_=null
         */
        value_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'div', cls: ['neo-progress'], cn: [
            {tag: 'label'},
            {tag: 'progress'}
        ]}
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        this.vdom.cn[0].for = value;
        this.update()
    }

    /**
     * Triggered after the labelText config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabelText(value, oldValue) {
        this.vdom.cn[0].html = value;
        this.update()
    }

    /**
     * Triggered after the max config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMax(value, oldValue) {
        this.vdom.cn[1].max = value;
        this.update()
    }

    /**
     * Triggered after the value config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        this.vdom.cn[1].value = value;
        this.update()
    }

    /**
     * Specify a different vdom root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVnodeRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom.cn[1]
    }

    /**
     * Specify a different vnode root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVdomRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode.childNodes[1]
    }
}

export default Neo.setupClass(Progress);
