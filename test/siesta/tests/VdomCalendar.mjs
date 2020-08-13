import Neo                     from '../../../src/Neo.mjs';
import * as core               from '../../../src/core/_export.mjs';
import NeoArray                from '../../../src/util/Array.mjs';
import Style                   from '../../../src/util/Style.mjs';
import {default as VdomHelper} from '../../../src/vdom/Helper.mjs';
import {default as VDomUtil}   from '../../../src/util/VDom.mjs';

let deltas, output, tmp, vdom, vnode;

StartTest(t => {
    t.it('Calendar Week View Event Moving', t => {
        vdom = {
            cn: [{
                cls: ['neo-c-w-column'],
                id : 'neo-column-1',
                cn : [{
                    cls: ['neo-event'],
                    id : 'neo-event-1'
                }]
            }, {
                cls: ['neo-c-w-column'],
                id : 'neo-column-2',
                cn : [{
                    cls: ['neo-event'],
                    id : 'neo-event-2'
                }]
            }]
        };

        vnode = VdomHelper.create(vdom);
        VDomUtil.syncVdomIds(vnode, vdom);

        let node = vdom.cn[0].cn.pop();

        vdom.cn[1].cn.unshift(node);

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        console.log(deltas);

        console.log(vdom);

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-c-w-column'}
        ], 'deltas got created successfully');
    });
});