import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts the release-gates milestone example in the theme `?theme=` names, else in Neo Dark when the system
 * prefers dark, else in the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'GanttMilestones'
});
