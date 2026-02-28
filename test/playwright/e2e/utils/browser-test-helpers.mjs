export const measurePerformanceInBrowser = (testName, action, condition, passThrough, { timeout = 30000, resolveOnTimeout = false } = {}) => {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
            try {
                if (condition(passThrough)) {
                    const endTime = performance.now();
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(endTime - startTime);
                }
            } catch (e) {
                observer.disconnect();
                clearTimeout(timeoutId);
                console.error(`Condition error in ${testName}:`, e);
                reject(e);
            }
        });

        observer.observe(document.body, {attributes: true, childList: true, subtree: true});

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            if (resolveOnTimeout) {
                resolve(Infinity);
            } else {
                reject(new Error(`Benchmark timed out for "${testName}".`));
            }
        }, timeout);

        const startTime = performance.now();
        try {
            action(passThrough);
        } catch (e) {
            console.error(`Action error in ${testName}:`, e);
            observer.disconnect();
            clearTimeout(timeoutId);
            reject(e);
            return;
        }

        try {
            if (condition(passThrough)) {
                const endTime = performance.now();
                observer.disconnect();
                clearTimeout(timeoutId);
                resolve(endTime - startTime);
            }
        } catch (e) {
            observer.disconnect();
            clearTimeout(timeoutId);
            console.error(`Initial condition check error in ${testName}:`, e);
            reject(e);
        }
    });
};

export const measureUiUpdatePerformanceInBrowser = (testName, condition) => {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
            try {
                if (condition()) {
                    const endTime = performance.now();
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(endTime - startTime);
                }
            } catch (e) {
                observer.disconnect();
                clearTimeout(timeoutId);
                console.error(`Condition error in ${testName}:`, e);
                reject(e);
            }
        });

        observer.observe(document.body, {attributes: true, childList: true, subtree: true});

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`UI update benchmark timed out for "${testName}".`));
        }, 30000);

        const startTime = performance.now(); // Measurement starts here
        // The action (store.add) is assumed to have just happened
    });
};

/**
 * Measures UI jank by collecting frame timings over a given duration.
 * This function will be injected into the browser context.
 * @param {number} duration - The duration in milliseconds to measure jank.
 * @returns {Promise<{averageFps: number, frameCount: number, longFrameCount: number, totalTime: number}>}
 */
export const measureJankInBrowser = (duration) => {
    return new Promise(resolve => {
        const frameTimes = [];
        let longFrameCount = 0;
        let startTime;

        function frame(time) {
            if (startTime === undefined) {
                startTime = time;
            }

            const elapsed = time - startTime;
            frameTimes.push(time);

            if (elapsed < duration) {
                requestAnimationFrame(frame);
            } else {
                // Start from the second frame to calculate deltas
                for (let i = 1; i < frameTimes.length; i++) {
                    const delta = frameTimes[i] - frameTimes[i - 1];
                    // A long frame is arbitrarily defined as > 50ms (~20 FPS threshold)
                    // This indicates significant main-thread blocking.
                    if (delta > 50) {
                        longFrameCount++;
                    }
                }

                const totalTime = frameTimes[frameTimes.length - 1] - frameTimes[0];
                // We have frameTimes.length - 1 frame intervals
                const averageFps = totalTime > 0 ? (frameTimes.length - 1) / (totalTime / 1000) : 0;

                resolve({
                    averageFps: Math.round(averageFps),
                    frameCount: frameTimes.length,
                    longFrameCount,
                    totalTime: Math.round(totalTime)
                });
            }
        }

        requestAnimationFrame(frame);
    });
};
