import Component          from '../../../../../src/component/Base.mjs';
import Container          from '../../../../../src/container/Base.mjs';
import DragProxyContainer from '../../../../../src/draggable/DragProxyContainer.mjs';
import SortZone           from '../../../../../src/draggable/container/SortZone.mjs';

/**
 * @summary A test-only ordinary container exercising the generic live-proxy sorting contract.
 * @description The first sibling has no sort handle. All four siblings retain their layout slots through the
 * documented getPinnedItems extension. Nested native scrollers have enough content for a 1200px offset.
 * @class Neo.test.e2e.SortZoneTerminalContainer
 * @extends Neo.container.Base
 */
class SortZoneTerminalContainer extends Container {
    static config = {
        className     : 'Neo.test.e2e.SortZoneTerminalContainer',
        dragResortable: true,
        height        : 180,
        width         : 740,
        layout        : {ntype: 'hbox', align: 'start'},
        style         : {margin: '36px', padding: '0', gap: '18px', position: 'relative', backgroundColor: '#d5dce4'},
        sortZoneConfig: {
            module                 : SortZone,
            dragHandleSelector     : '.terminal-sortable',
            adjustItemRectsToParent: true,
            positionOwnerRelative  : true,
            sortDirection          : 'horizontal',
            getPinnedItems         : ownerItems => ownerItems,
            dragProxyConfig        : {module: DragProxyContainer,
                style: {margin: '0', padding: '0', backgroundColor: '#ffffff', boxShadow: '0 6px 20px rgba(0,0,0,.35)'}}
        }
    }

    /** @summary Supplies only ordinary component content and public container configuration. @param {Object} config */
    construct(config) {
        const prefix = config.id;
        super.construct({...config, items: ['alpha', 'beta', 'gamma', 'delta'].map((name, index) => ({
            module: Container, id: `${prefix}-${name}`, flex: 'none', width: 160, height: 180,
            cls   : index ? ['terminal-panel', 'terminal-sortable'] : ['terminal-panel'],
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {backgroundColor: '#ffffff', border: '1px solid #64748b', boxSizing: 'border-box'},
            items : [{module: Component, id: `${prefix}-${name}-label`, height: 28, flex: 'none',
                text: `${name}${index ? '' : ' (not sortable)'}`, style: {padding: '4px', boxSizing: 'border-box'}},
            {module: Component, id: `${prefix}-${name}-scroll`, height: 140, flex: 'none',
                style: {overflowY: 'auto', overflowAnchor: 'none'},
                vdom : {cn: Array.from({length: 50}, (_, row) => ({
                    id   : `${prefix}-${name}-line-${row}`, tag: 'div', text: `${name}: detail ${row + 1}`,
                    style: {height: '48px', lineHeight: '48px', paddingLeft: '4px', boxSizing: 'border-box'}
                }))}}]
        }))})
    }
}

export default Neo.setupClass(SortZoneTerminalContainer);
