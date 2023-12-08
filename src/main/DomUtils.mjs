import Base from '../core/Base.mjs';

const focusableTags = {
    BODY     : 1,
    BUTTON   : 1,
    EMBED    : 1,
    IFRAME   : 1,
    INPUT    : 1,
    OBJECT   : 1,
    SELECT   : 1,
    TEXTAREA : 1
};

/**
 * @class Neo.main.DomUtils 
 * @extends Neo.core.Base
 * @singleton
 */
export default class DomUtils extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.DomUtils '
         * @protected
         */
        className: 'Neo.main.DomUtils '
    }

    static isFocusable(e) {
        return this.isTabbable(e) || e.getAttribute('tabIndex') == -1;
    }

    static isTabbable(e) {
        const
            { nodeName } = e,
            style        = getComputedStyle(e),
            tabIndex     = e.getAttribute('tabIndex');

        // Hidden elements not tabbable
        if (style.getPropertyValue('display') === 'none' || style.getPropertyValue('visibility') === 'hidden') {
            return false
        }

        return focusableTags[nodeName] ||
            ((nodeName === 'A' || nodeName === 'LINK') && !!e.href) ||
            (tabIndex != null && Number(tabIndex) >= 0) ||
            e.contentEditable === 'true'
    }
}
