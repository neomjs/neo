import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/**
 * @summary Boots the Order Review Desk example in the theme requested via `?theme=`, else system dark/light preference,
 * else the first configured theme (`neo-theme-neo-dark`).
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.grid.orderReviewDesk'
});
