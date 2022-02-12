import Component from './Component.mjs';

/**
 * @class Neo.list.Circle
 * @extends Neo.list.Component
 */
class Circle extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Circle'
         * @protected
         */
        className: 'Neo.list.Circle',
        /**
         * @member {String} ntype='circle-list'
         * @protected
         */
        ntype: 'circle-list',
        /**
         * @member {String[]} cls=['neo-circle-list','neo-list']
         */
        cls: ['neo-circle-list', 'neo-list']
    }}
}

Neo.applyClassConfig(Circle);

export default Circle;
