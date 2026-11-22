import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.grid.animatedRowSorting'
})
