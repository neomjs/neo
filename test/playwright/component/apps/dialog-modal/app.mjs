import Button   from '../../../../../src/button/Base.mjs';
import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Component-test fixture for a modal Dialog's mask: one button, which `driver.mjs` uses as the animate
 * target, so the dialog shows through its animated mount flight.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{
            module: Button,
            id    : 'dialog-modal-target',
            text  : 'Target'
        }]
    },
    name: 'DialogModalTestApp'
});
