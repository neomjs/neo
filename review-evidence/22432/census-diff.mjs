// #22432 AC-6: the painted changes dev → head of the Workstation probe's census, filtered to a visible distance.
// Usage: node census-diff.mjs <dev census.json> <head census.json> [minDeltaE=2]  (OKLab ΔE × 100)
import fs from 'node:fs';

const [devFile, headFile, min = '2'] = process.argv.slice(2),
      dev  = JSON.parse(fs.readFileSync(devFile, 'utf8')),
      head = JSON.parse(fs.readFileSync(headFile, 'utf8'));

function toOklab(text) {
    let m = text.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m) {
        const [L, C, h] = m.slice(1).map(Number), r = h * Math.PI / 180;
        return [L, C * Math.cos(r), C * Math.sin(r)]
    }
    m = text.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return 'transparent';
    const lin = v => {v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4},
          [r, g, b] = m.slice(1, 4).map(Number).map(lin),
          l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
          mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
          s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * mm + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s]
}

const firstColor = text => text.match(/(oklch\([^)]*\)|rgba?\([^)]*\))/)?.[1] ?? null;

for (const win of Object.keys(dev)) {
    const d = dev[win].census, h = head[win].census, groups = new Map();

    for (const key of Object.keys(d).filter(k => k in h)) {
        for (const prop of Object.keys(d[key])) {
            const a = d[key][prop], b = h[key][prop];
            if (a === b) continue;
            const ca = firstColor(a), cb = firstColor(b), la = ca && toOklab(ca), lb = cb && toOklab(cb);
            if (!la || !lb || la === 'transparent' || lb === 'transparent') continue;
            const dE = Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]) * 100;
            if (dE < Number(min)) continue;
            const last = key.split('>').pop().replace(/\[\d+\]/g, ''),
                  id   = `${last} | ${prop} | ${ca} -> ${cb} | ΔE ${dE.toFixed(1)}`;
            groups.set(id, (groups.get(id) || 0) + 1)
        }
    }

    console.log(`=== ${win}: ${groups.size} visible change groups (ΔE ≥ ${min})`);
    [...groups.entries()].sort((x, y) => y[1] - x[1]).forEach(([id, n]) => console.log(String(n).padStart(4), ' ', id.slice(0, 220)))
}
