const linearToSrgb = x => {
    x = Math.min(1, Math.max(0, x));
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255)
};

/**
 * @summary Rewrites every `oklch()` colour in a computed-style string as the `rgb()` or `rgba()` sRGB value it paints
 * (CSS Color 4 OKLab matrices, 8-bit rounding). Theme Neo's palette is written in oklch, and Chromium keeps that space
 * in computed values, so a spec normalizes before it compares a role-bound colour with an `rgb()` literal.
 * @param {String} value A computed value, e.g. `oklch(0.544 0.191 267)` or `1px solid oklch(0.61 0.04 270)`.
 * @returns {String}
 */
export function toRgb(value) {
    return value.replace(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/g, (match, L, C, H, alpha) => {
        const h   = H * Math.PI / 180,
              a   = C * Math.cos(h),
              b   = C * Math.sin(h),
              l   = (+L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
              m   = (+L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
              s   = (+L - 0.0894841775 * a - 1.2914855480 * b) ** 3,
              rgb = [
                  linearToSrgb( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
                  linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
                  linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
              ].join(', ');

        return alpha === undefined || +alpha === 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${+alpha})`
    })
}
