import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import PersonList    from './PersonList.mjs';
import PersonStore   from './PersonStore.mjs';
import StepList      from './StepList.mjs';
import StepStore     from './StepStore.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary Reorders a checklist and a wall of portraits by drag: two lists, each on its own store, sorted through
 * `Neo.draggable.list.SortZone`.
 *
 * A drop writes the new order into the store with one `updateRows()` batch, and each list renders its store's sort.
 * @class Neo.examples.list.reorder.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.MainContainer'
         * @protected
         */
        className: 'Neo.examples.list.reorder.MainContainer',
        /**
         * @member {String[]} cls=['neo-reorder']
         */
        cls: ['neo-reorder'],
        /**
         * @member {Object} layout={ntype:'base'}
         */
        layout: {ntype: 'base'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-reorder-intro'],
            layout: {ntype: 'hbox', align: 'start', pack: 'justify', wrap: 'wrap'},
            items : [{
                module: Component,
                flex  : 1,
                vdom  : {cn: [
                    {tag: 'h1', text: 'Reorder by drag'},
                    {tag: 'p',  text: 'Drag a step or a portrait. Each number is its place in the store.'}
                ]}
            }, {
                module: ThemeSwitcher,
                flex  : 'none'
            }]
        }, {
            module: Container,
            cls   : ['neo-reorder-panels'],
            layout: {ntype: 'base'},
            items : [{
                module: Container,
                cls   : ['neo-reorder-panel'],
                layout: {ntype: 'base'},
                items : [{
                    tag : 'h2',
                    text: 'Release checklist'
                }, {
                    module   : StepList,
                    reference: 'steps',
                    store    : StepStore
                }]
            }, {
                module: Container,
                cls   : ['neo-reorder-panel'],
                layout: {ntype: 'base'},
                items : [{
                    tag : 'h2',
                    text: 'Team wall'
                }, {
                    module   : PersonList,
                    reference: 'wall',
                    store    : PersonStore
                }]
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
