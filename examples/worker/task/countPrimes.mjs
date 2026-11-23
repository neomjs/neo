/**
 * @module Neo.examples.worker.task.countPrimes
 * @summary Prime counting shared by the example's App Worker and Task Worker modes.
 */

/**
 * @summary Checks an odd integer of at least three by trial division.
 * @param {Number} candidate
 * @returns {Boolean}
 */
function isOddPrime(candidate) {
    for (let divisor = 3; divisor * divisor <= candidate; divisor += 2) {
        if (candidate % divisor === 0) {
            return false
        }
    }

    return true
}

/**
 * @summary Counts primes between two inclusive integer bounds.
 * @param {Number} first
 * @param {Number} last
 * @returns {Number}
 */
export default function countPrimes(first, last) {
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) {
        throw new TypeError('Prime-counting bounds must be safe integers')
    }

    let count = first <= 2 && last >= 2 ? 1 : 0,
        start = Math.max(first, 3);

    if (start % 2 === 0) {
        start++
    }

    for (let candidate = start; candidate <= last; candidate += 2) {
        if (isOddPrime(candidate)) {
            count++
        }
    }

    return count
}
