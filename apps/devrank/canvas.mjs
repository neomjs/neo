import Sparkline from './canvas/Sparkline.mjs';

export const onStart = async () => {
    // Ensure the remote methods are registered
    await Sparkline.remotesReady();
};
