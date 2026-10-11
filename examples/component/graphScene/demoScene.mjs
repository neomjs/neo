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

/**
 * @summary A deterministic clustered graph at the scale the level of detail exists for: `clusters` blobs on a
 * Fibonacci sphere, every node jittered around its cluster's centre and coloured by its cluster, nine in ten
 * edges inside a cluster and the rest across, and one path through ten clusters. A seeded generator makes the
 * same options give the same scene.
 * @param {Object} [options={}]
 * @param {Number} [options.clusters=64]
 * @param {Number} [options.edgesPerNode=10] Edge pairs per node, so 100k nodes carry a million edges
 * @param {Number} [options.nodes=100000]
 * @param {Number} [options.seed=1]
 * @returns {{clusters: Uint32Array, colors: Float32Array, edges: Uint32Array, paths: Uint32Array[], positions: Float32Array, sizes: Float32Array}}
 */
export function createClusteredScene({clusters = 64, edgesPerNode = 10, nodes = 100000, seed = 1} = {}) {
    let state = seed >>> 0;

    // mulberry32
    const random = () => {
        state = (state + 0x6D2B79F5) >>> 0;

        let t = Math.imul(state ^ (state >>> 15), state | 1);

        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    };

    const
        golden     = Math.PI * (3 - Math.sqrt(5)),
        perCluster = Math.ceil(nodes / clusters),
        positions  = new Float32Array(nodes * 3),
        colors     = new Float32Array(nodes * 3),
        sizes      = new Float32Array(nodes),
        clusterOf  = new Uint32Array(nodes),
        pairs      = nodes * edgesPerNode,
        edges      = new Uint32Array(pairs * 2),
        // three uniforms summed are close enough to a normal spread for a blob
        jitter     = () => (random() + random() + random() - 1.5) * 0.12,
        // a hue on the colour wheel at a fixed saturation and lightness (HSL), each channel within 0.32..0.92
        tone       = hue => [0, 8, 4].map(n => {const k = (n + hue * 12) % 12; return 0.62 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1))});

    for (let i = 0; i < nodes; i++) {
        const
            cluster = Math.min(clusters - 1, Math.floor(i / perCluster)),
            y       = 1 - (cluster + 0.5) / clusters * 2,
            radius  = Math.sqrt(1 - y * y),
            theta   = golden * cluster;

        clusterOf[i] = cluster;
        positions.set([Math.cos(theta) * radius + jitter(), y + jitter(), Math.sin(theta) * radius + jitter()], i * 3);
        colors.set(tone(cluster / clusters), i * 3);
        sizes[i] = 3 + 3 * random()
    }

    for (let pair = 0; pair < pairs; pair++) {
        const
            u       = Math.floor(random() * nodes),
            first   = clusterOf[u] * perCluster,
            members = Math.min(perCluster, nodes - first);

        edges[pair * 2]     = u;
        edges[pair * 2 + 1] = random() < 0.9 ? first + Math.floor(random() * members) : Math.floor(random() * nodes)
    }

    return {
        clusters: clusterOf,
        colors,
        edges,
        paths   : [Uint32Array.from({length: Math.min(10, clusters)}, (item, k) => Math.min(nodes - 1, (k * 7 % clusters) * perCluster))],
        positions,
        sizes
    }
}
