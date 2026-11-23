import ThemeSwitcher from '../../../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import Toolbar       from '../../../../../src/toolbar/Base.mjs';

/**
 * @summary Mounts a switcher beside another toolbar button, without loading an external icon font.
 */
export const onStart = () => {
    const {themes, url} = Neo.config,
          params        = new URLSearchParams(url.search),
          bootTheme     = params.get('theme'),
          twoThemes     = params.get('mode') === 'two';

    return Neo.app({
        mainView: {
            id    : 'theme-switcher-test-viewport',
            layout: {ntype: 'vbox', align: 'stretch'},
            module: Viewport,
            theme : themes.includes(bootTheme) ? bootTheme : null,
            items : [{
                flex  : 'none',
                id    : 'theme-switcher-test-toolbar',
                module: Toolbar,
                items : [{text: 'Run example'}, '->', {
                    module: ThemeSwitcher,
                    id    : 'theme-switcher-test-button',
                    ...(twoThemes ? {themes: themes.slice(0, 2)} : {})
                }]
            }]
        },
        name: 'Test.Playwright.ThemeSwitcher'
    })
};
