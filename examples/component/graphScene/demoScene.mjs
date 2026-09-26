/**
 * @summary A deterministic demo graph for `Neo.canvas.GraphScene`: nodes on a Fibonacci sphere, coloured from
 * pole to pole and sized by a slow wave; edges along the spiral plus a chord to the node `chord` steps
 * ahead; one path through every twelfth node, drawn as a beaded ribbon. The same count always gives the
 * same scene, so a spec can name its counts.
 * @param {Number} [count=240] The number of nodes
 * @param {Number} [chord=21] How far ahead each chord reaches
 * @returns {{colors: Float32Array, edges: Uint32Array, paths: Uint32Array[], positions: Float32Array, sizes: Float32Array}}
 */
export function createDemoScene(count = 240, chord = 21) {
    const
        golden    = Math.PI * (3 - Math.sqrt(5)),
        positions = new Float32Array(count * 3),
        colors    = new Float32Array(count * 3),
        sizes     = new Float32Array(count),
        edges     = [],
        path      = [];

    for (let i = 0; i < count; i++) {
        const
            y      = 1 - (i + 0.5) / count * 2,
            radius = Math.sqrt(1 - y * y),
            theta  = golden * i,
            t      = i / Math.max(1, count - 1);

        positions.set([Math.cos(theta) * radius, y, Math.sin(theta) * radius], i * 3);
        // from a teal pole to a warm one
        colors.set([0.2 + 0.7 * t, 0.85 - 0.45 * t, 0.8 - 0.5 * t], i * 3);
        sizes[i] = 18 + 14 * Math.sin(i * 0.3) ** 2;

        if (i > 0) {
            edges.push(i - 1, i)
        }

        if (i + chord < count) {
            edges.push(i, i + chord)
        }

        if (i % 12 === 0) {
            path.push(i)
        }
    }

    return {colors, edges: Uint32Array.from(edges), paths: [Uint32Array.from(path)], positions, sizes}
}
