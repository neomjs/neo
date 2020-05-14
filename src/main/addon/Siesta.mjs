import Base from '../../core/Base.mjs';

/**
 * Required when running Neo Apps inside the Siesta browser harness (iframe)
 * @class Neo.main.addon.Siesta
 * @extends Neo.core.Base
 * @singleton
 */
class Siesta extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.addon.Siesta'
             * @private
             */
            className: 'Neo.main.addon.Siesta',
            /**
             * @member {boolean} singleton=true
             * @private
             */
            singleton: true
        }
    }

    /**
     *
     * @private
     */
    adjustSiestaEnvironment() {
        let i   = 0,
            len = document.styleSheets.length,
            sheet;

        document.body.classList.add('neo-body', 'neo-body-viewport');

        for (; i < len; i++) {
            sheet = document.styleSheets[i];
            if (sheet.href && sheet.href.includes('highlightjs')) {
                sheet.ownerNode.id = 'hljs-theme';
            }
        }
    }
}

Neo.applyClassConfig(Siesta);

let instance = Neo.create(Siesta);

Neo.applyToGlobalNs(instance);

export default instance;