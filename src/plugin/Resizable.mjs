import Base from '../core/Base.mjs';

/**
 * @class Neo.plugin.Resizable
 * @extends Neo.core.Base
 */
class Resizable extends Base {
    static getStaticConfig() {return {
        /**
         * Directions into which you want to drag => resize
         * @member {String[]} validDirections=['b','bl','br','l','r','t','tl','tr']
         * @static
         */
        validDirections: ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.plugin.Resizable'
         * @protected
         */
        className: 'Neo.plugin.Resizable',
        /**
         * @member {String} ntype='resizable'
         * @protected
         */
        ntype: 'resizable',
        /**
         * Directions into which you want to drag => resize
         * @member {String[]} directions_=['b','bl','br','l','r','t','tl','tr']
         * @static
         */
        directions_: ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr']
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);
    }
}

Neo.applyClassConfig(Resizable);

export {Resizable as default};