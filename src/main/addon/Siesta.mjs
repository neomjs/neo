import Base from './Base.mjs';

/**
 * Required when running Neo Apps inside the Siesta browser harness (iframe)
 * @class Neo.main.addon.Siesta
 * @extends Neo.main.addon.Base
 */
class Siesta extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Siesta'
         * @protected
         */
        className: 'Neo.main.addon.Siesta'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.adjustSiestaEnvironment();
    }

    /**
     * @protected
     */
    adjustSiestaEnvironment() {
        let i   = 0,
            len = document.styleSheets.length,
            sheet;

        document.body.classList.add('neo-body', 'neo-body-viewport');

        for (; i < len; i++) {
            sheet = document.styleSheets[i];
            if (sheet?.href.includes('highlightjs')) {
                sheet.ownerNode.id = 'hljs-theme';
            }
        }
    }
}

Neo.setupClass(Siesta);

export default Siesta;
