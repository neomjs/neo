import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Style
 * @extends Neo.core.Base
 */
class Style extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Style'
         * @protected
         */
        className: 'Neo.util.Style'
    }

    /**
     * Creates an delta object, containing the styles of newStyle which are not included or different than in oldStyle
     * Styles included in oldStyle but missing in newStyle will get a value of null
     * see: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/style
     * @param {Object|String} newStyle
     * @param {Object|String} oldStyle
     * @returns {Object} style delta
     */
    static compareStyles(newStyle, oldStyle) {
        let styles = {};

        if (Neo.isString(newStyle)) {
            newStyle = Neo.createStyleObject(newStyle)
        }

        if (Neo.isString(oldStyle)) {
            oldStyle = Neo.createStyleObject(oldStyle)
        }

        if (!newStyle && !oldStyle) {
            return null
        } else if (!oldStyle) {
            return Neo.clone(newStyle)
        } else if (!newStyle) {
            Object.keys(oldStyle).forEach(function(style) {
                styles[style] = null
            });
        } else {
            Object.keys(newStyle).forEach(style => {
                if (!oldStyle.hasOwnProperty(style) || oldStyle[style] !== newStyle[style]) {
                    styles[style] = newStyle[style]
                }
            });

            Object.keys(oldStyle).forEach(style => {
                if (!newStyle.hasOwnProperty(style)) {
                    styles[style] = null
                }
            });

            if (Object.keys(styles).length > 0) {
                return styles
            }

            return null
        }
    }
}

export default Neo.setupClass(Style);
