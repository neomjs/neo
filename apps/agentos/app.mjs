import Viewport             from './view/Viewport.mjs';
import {installFleetBridge} from '../../src/ai/fleet/installFleetBridge.mjs';

export const onStart = () => {
    // Wire the dev-server (Option B) app<->fleet HTTP transport so the Accounts pane's fail-closed
    // registry-bridge submit path goes live. The Electron shell (Option A) installs this in-process.
    installFleetBridge();

    Neo.app({
        appThemeFolder: 'agentos',
        mainView      : Viewport,
        name          : 'AgentOS'
    })
};
