import Component from './Base.mjs';

/**
 * Splitters can get placed between containers to make them resizable via drag & drop
 * @class Neo.component.Splitter
 * @extends Neo.component.Base
 */
class Splitter extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Splitter'
         * @protected
         */
        className: 'Neo.component.Splitter',
        /**
         * @member {String} ntype='splitter'
         * @protected
         */
        ntype: 'splitter',
        /**
         * @member {String[]} cls=['neo-splitter']
         */
        cls: ['neo-splitter']
    }}
}

Neo.applyClassConfig(Splitter);

export {Splitter as default};
