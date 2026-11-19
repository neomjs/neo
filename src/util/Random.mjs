/**
 * @summary Creates a seeded random number generator (mulberry32): the same seed draws the same sequence in every run
 * and every realm.
 *
 * Generated example data uses it where a first frame, a cover or a spec names values, so the rows a visitor sees on
 * load are the rows those show. It is not for anything that has to be unpredictable, such as ids or keys:
 * `crypto.getRandomValues()` serves those (see `generateUUID()`).
 * @param {Number} [seed=1] Read as an unsigned 32-bit integer
 * @returns {Function} Returns the next number in `[0, 1)` per call
 */
export function createSeededRandom(seed = 1) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;

        let t = Math.imul(state ^ (state >>> 15), state | 1);

        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
