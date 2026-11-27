import Component     from '../../../src/component/Base.mjs';
import List          from '../../../src/list/Base.mjs';
import PlaceStore    from './PlaceStore.mjs';
import Sheet         from '../../../src/sheet/Base.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * A phone screen with a map and a sheet of the places nearby. Drag the handle between a peek, half the screen and
 * nearly all of it, or use the button and the arrow keys. The list scrolls inside the sheet at every height.
 * @class Neo.examples.sheet.base.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.sheet.base.MainContainer'
         * @protected
         */
        className: 'Neo.examples.sheet.base.MainContainer',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                ntype: 'label',
                cls  : ['neo-sheet-example-title'],
                text : 'Harbour walk'
            }, '->', {
                module: ThemeSwitcher,
                ui    : 'secondary'
            }]
        }, {
            module: Component,
            cls   : ['neo-sheet-example-map'],
            flex  : 1
        }, {
            module    : Sheet,
            ariaLabel : 'Places nearby',
            reference : 'sheet',
            snapIndex : 1,
            snapPoints: [120, '50dvh', '90dvh'],
            items     : [{
                ntype: 'label',
                cls  : ['neo-sheet-example-count'],
                text : '30 places nearby'
            }, {
                module      : List,
                cls         : ['neo-sheet-example-places'],
                displayField: 'label',
                store       : PlaceStore
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(MainContainer);
