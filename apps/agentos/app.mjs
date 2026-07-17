import Viewport             from './view/Viewport.mjs';
import {installFleetBridge} from '../../src/ai/fleet/installFleetBridge.mjs';

export const onStart = () => {
    const params   = new URLSearchParams(Neo.config.url.search),
          fleetUrl = params.has('fleetUrl')
              ? params.get('fleetUrl')
              : 'http://127.0.0.1:8083/fleet';

    // Wire the dev-server (Option B) app<->fleet HTTP transport so the Accounts pane's fail-closed
    // registry-bridge submit path goes live. The Electron shell (Option A) installs this in-process.
    installFleetBridge({url: fleetUrl});

    Neo.app({
        appThemeFolder: 'agentos',
        mainView      : Viewport,
        name          : 'AgentOS'
    })
};
