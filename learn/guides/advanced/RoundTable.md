---
seoTitle: "Record-Driven Canvas Scenes: A Deterministic Replay off the Main Thread | Neo.mjs"
seoDescription: "Draw a team's real work as an animated canvas scene that loops, seeks and tests exactly: one frame is a function of a record and a clock, rendered in a Canvas Worker with Neo.mjs."
---
# The Round Table: A Scene That Replays a Record

Most animated canvases behind a headline are simulations. Particles drift, nodes pulse, agents wander. The screen looks alive and says nothing, because nothing on it happened. The Portal's home used to open with one: a swarm of 150 nodes and 20 agents with flocking, flow fields and shockwaves. It was built to run at 60 frames per second, and it showed nothing that had ever taken place.

The round table that replaced it runs on [the Portal's home](https://neomjs.com/) and draws a week of this repository's public record. Ten AI maintainers from three model families (Claude, Gemini and GPT) sit around the page's statement, beside a door for outside contributors and the seat of the person who merges. A pull request appears at its author's seat. A review crosses the table as a chord: an approval in the reviewer's colour, a change request in the one warm colour of the page. An approved pull request rides the rim to the merge seat, waits there as long as it really waited, and lands as one square in its day's column of a strip along the bottom.

For the week of 13 to 19 November 2026 that is 301 merged pull requests, from the maintainers and from 39 outside contributors, with 469 reviews and 136 change requests. Every mark on the canvas is one of them. Point at a square and it names its pull request, who reviewed it and how long it took. The whole week is [one JSON file of 42 KB](../../../apps/portal/resources/data/record-week.json).

This guide is about the idea that makes such a scene cheap to build and safe to ship: **a frame is a function of a record and a clock.** The specimen is [`Neo.canvas.RoundTable`](../../../src/canvas/RoundTable.mjs) with its host, [`Neo.app.roundtable.Canvas`](../../../src/app/roundtable/Canvas.mjs). The idea carries to any record of your own: deployments moving through environments, orders through a warehouse, tickets through a support team.

## When to Use This Pattern

**Use a record-driven scene when:**
- ✅ You hold a record of real events, with actors and times, and you want people to see it instead of reading it.
- ✅ The picture has to be true: every mark traceable to an entry, every count equal to the data.
- ✅ The animation has to loop, start at any moment of the record and look the same on every run, so that a spec can assert where things stand.
- ✅ The scene shares its surface with text that must stay readable.

**Reach for a sibling pattern when:**
- The picture answers live input more than it replays history: [Zero-Allocation Effects with Shared Workers](./CanvasArchitecture.md).
- The canvas has to follow DOM content item by item: [the Coordinator Pattern](./NeuralTimeline.md).
- You project a mesh in depth: [2.5D Projection](./NeuralFabric.md).

## What a Simulation Costs

A simulation carries its past in its state. Each frame moves every particle a little from where the last frame left it. Three costs follow.

1. **Seeking means replaying.** To show minute 400 you run minutes 0 to 399. A loop needs a reset, and the reset shows.
2. **Tests assert motion, not places.** Unless it runs a fixed step from a fixed seed, two runs differ by their frame timing. Even then a spec has to replay every step up to the moment it asks about.
3. **It has nothing to say.** State that comes out of physics refers to nothing, so the eye finds no fact to hold.

The round table has no past. It keeps one number, the clock, and derives every position from the record on every frame. The clock advances by the real time since the last frame, but no position depends on how many frames were drawn. Seeking is setting that number: the replay starts at 58 % of its window, so the first frame already shows a dense strip. Looping is setting it to zero, after the end state has faded. A reader who prefers reduced motion gets the end state, drawn once. And a spec calls the same functions the frame calls.

Deriving a frame from a time is not new. Video tools such as Remotion render every frame from a frame number, and animation timelines seek. This guide applies the idea to a record of data, off the main thread, behind live text.

## The Architecture

```mermaid
flowchart TD
    Record[("A record: seats, items and reviews, timed in minutes")]
    Statement["Main thread: the statement's boxes in the DOM"]
    Host["App Worker: Neo.app.roundtable.Canvas"]

    subgraph Worker ["Canvas Worker: Neo.canvas.RoundTable"]
        Index["index: typed arrays, once per record"]
        Layout["layout: once per size, statement or record"]
        Clock(["one number: the clock"])
        Frame["draw: locate each item at the clock"]
        Quiet["drawQuiet: erase under the statement"]
    end

    Screen["OffscreenCanvas at the display's pixel ratio"]

    Record -->|"recordUrl"| Host
    Statement -->|"getDomRect"| Host
    Host -->|"setRecord"| Index
    Host -->|"setQuiet, setLook, setMotion"| Layout
    Index --> Layout
    Layout --> Frame
    Clock --> Frame
    Frame --> Quiet
    Quiet --> Screen
```

Neo.mjs runs an application's code in an App Worker and can draw a canvas in a second worker, the Canvas Worker, so neither competes with the main thread for a frame. Three parties follow from that, with one job each:

- **The main thread** owns the DOM: the statement's text and where its boxes stand.
- **The host**, a component in the App Worker, owns the inputs. It loads the record, holds the palette, asks the main thread for the statement's boxes and for the motion preference, and forwards each to the scene when it changes.
- **The scene**, a singleton in the Canvas Worker, owns the pixels. It asks for nothing.

The scene takes four inputs: `setRecord()`, `setLook()`, `setMotion()` and `setQuiet()`. Each is a remote method: the host calls it like a local one, and the engine carries the call across the worker boundary. Until the scene has its look (the palette per theme) and its statement, and while it has no record, it draws its ground alone, a background gradient.

## Step 1: Index the Record Once

The record is plain JSON: groups, seats and items, with every time in minutes from the window's first instant. An item is one row, `[number, title, seat, login, opened, merged, reviews]`, and a review is `[seat, 'A' | 'C', minute]`, an approval or a change request.

`RoundTable.index()` turns it into typed arrays once per record: `opened`, `approved` and `merged` as `Float32Array`, each item's `author` (its seat) and `day` as `Uint8Array`, the reviews flat and sorted by time. `approved` is derived: the minute of an item's last review if that review approved, else the minute of its merge. A frame reads numbers and builds no object per item.

One piece of real work happens here. Several pull requests are open at one desk at the same time, and several wait in front of the merge seat at the same time. If an item's place depended on what else is open *now*, items would jump whenever a neighbour left. So each item receives one place for its whole stay, by interval colouring. `deskMax` records the most places each desk ever needs, which the layout uses later to keep that room free:

```javascript
// interval colouring: the lowest place that is free again when the item needs one
const colour = (order, start, end, target, ofSeat) => {
    const ends = new Map();

    order.forEach(i => {
        const key = ofSeat ? author[i] : 0, list = ends.get(key) || ends.set(key, []).get(key);

        let place = list.findIndex(free => free <= start[i]);

        place < 0 && (place = list.length);
        list[place] = end[i];
        target[i]   = Math.min(place, 255);
        ofSeat && (deskMax[key] = Math.max(deskMax[key], target[i] + 1))
    })
}, order = Array.from({length: count}, (_, i) => i);

colour([...order].sort((a, b) => opened[a] - opened[b]),     opened,   approved, desk,  true);
colour([...order].sort((a, b) => approved[a] - approved[b]), approved, merged,   queue, false);
```

`desk` is an item's place at its author's seat from its opening to its approval. `queue` is its place in front of the merge seat from its approval to its merge. Both are decided here, from the record alone. That is the rule for this whole pattern: **whatever must not move is decided at index time.**

It also keeps the picture honest. A pull request that waited four hours for its merge stands in the queue for four hours of the record's clock, so the queue on screen is as long as the queue was.

## Step 2: Locate Every Item from the Clock

One static method answers where an item is at a given minute: nowhere before it opens, at its desk while it is open, on the rim after its approval, in the queue, falling, or landed. It writes four numbers into a scratch array the caller owns: `x`, `y`, a scale, and whether the item has landed. The method opens with the common case, a landed square in its day's column:

```javascript
static locate(out, i, clock, data, place, span) {
    const {strip} = place, slot = data.slot[i], merged = data.merged[i];

    out[0] = strip.x + data.day[i] * (strip.dayW + strip.dayGap) + slot % strip.columns * strip.pitch;
    out[1] = strip.baseline - ((slot / strip.columns | 0) + 1) * strip.pitch + strip.gap;
    out[2] = 1;
    out[3] = 1;

    if (clock >= merged + span.flight) {
        return out
    }
```

A landed item costs four assignments and a comparison. That is most items on most frames, by design: the replay starts late in its window.

The moving part is a curve along the rim and a fall into the strip. In the lines below, `ride` runs from 0 to 1 after the item's approval, `ring` is the table's ellipse, `side` is -1 or 1 for the left or right arc, and `waitX`, `waitY` are the item's place in the queue. Everything is a function of the clock, with no velocity to carry over:

```javascript
if (ride > 0) {
    // along the rim: a curve whose control point lies outside the ring, below the desk
    const
        cX = ring.cx - side * ring.rx * 0.74,
        cY = ring.cy + ring.ry * 0.98,
        u  = 1 - ride;

    // from where it is, which is short of its desk while it still appears
    x = u * u * x + 2 * u * ride * cX + ride * ride * waitX;
    y = u * u * y + 2 * u * ride * cY + ride * ride * waitY
}

if (clock >= merged) {
    const fall = (clock - merged) / span.flight;

    x += (out[0] + strip.size / 2 - x) * RoundTable.smooth(fall);
    y += (out[1] + strip.size / 2 - y) * fall * fall
}
```

## Step 3: One Number Moves

This is the whole animation loop:

```javascript
render() {
    const me = this;

    me.animationId = null;

    if (!me.canRender || !me.canvasSize) {
        return
    }

    const now = performance.now(), dt = me.lastTime ? Math.min(now - me.lastTime, 50) / 1000 : 0, moving = !me.still && !!me.indexed && !!me.place;

    me.lastTime = now;

    if (moving) {
        const span = me.spanOf(), end = me.indexed.minutes + span.flight + me.pace.hold * span.minute;

        me.clock += dt * span.minute;
        me.clock > end && (me.clock = 0)
    }

    me.draw();
    me.cost += (performance.now() - now - me.cost) * 0.05;

    if (moving) {
        me.animationId = hasRaf ? requestAnimationFrame(me.renderLoop) : setTimeout(me.renderLoop, 1000 / 60)
    }
}
```

The only state that changes over time is `me.clock`. (`me.indexed` is the record's typed arrays and `me.place` the layout; both change only with an input.) A day of the record takes fourteen seconds. After the last merge the end state stands for six seconds and fades during the last of them, then the clock returns to zero: the loop is one assignment. A scene that is still, or has no record yet, draws once and schedules nothing.

`me.cost` is the scene's own gauge: the script time one frame takes to issue its canvas commands, smoothed. Rasterising them is the browser's work and is not in it. Read on an Apple silicon machine in headless Chromium, at 1440 × 900 with 301 items and 469 reviews, it stood at 0.14 ms while the page held 59 frames per second. On a phone-sized surface, where the strip stands alone, 0.07 ms. Under reduced motion the same page drew nine frames while it loaded and settled, and then none.

## Step 4: Draw Around a Statement

A scene behind a headline has a duty a full-screen scene does not have: the words win. The round table is told about the statement and lays itself out around it.

The Canvas Worker cannot see the DOM, so the host measures. A consumer names the statement's components once, in two lists. A **block** is a box nothing may stand in, and whatever crosses it is erased: a logo, a sentence, a row of buttons. A **band** is a row no seat may stand in: a headline that is wider than the table would cut it in two if it were a block, so it only keeps seats out of its rows. In the Portal's hero that is one call:

```javascript
onConstructed() {
    super.onConstructed();

    const
        content = this.getItem('content'),
        idOf    = cls => content.items.find(item => item.cls?.includes(cls))?.id;

    this.getItem('canvas').set({
        bandIds : [content.getItem('magic-move').id],
        blockIds: [idOf('logo-container'), idOf('neo-h3'), idOf('button-group')].filter(Boolean)
    })
}
```

The host reads those boxes from the main thread whenever the surface changes, and again when one of the named components changes size on its own: a web font that arrives late wraps a sentence anew and moves everything below it, without resizing the canvas. It hands the boxes over relative to the canvas:

```javascript
if (current()) {
    const {x, y} = me.canvasRect, local = rect => rect && {height: rect.height, width: rect.width, x: rect.x - x, y: rect.y - y};

    me.renderer.setQuiet({
        bands   : rects.slice(blockIds.length).map(local).filter(Boolean),
        blocks  : rects.slice(0, blockIds.length).map(local).filter(Boolean),
        canvasId: me.getCanvasId(),
        windowId: me.windowId
    })
}
```

Every asynchronous read in the host carries a guard like `current()`: only the latest measurement of the current canvas may answer. A measurement that returns after the next one started publishes nothing.

The scene then erases itself under the statement's column: every block, each band across the blocks' width, and the gaps between them:

```javascript
drawQuiet(ctx) {
    const ratio = this.canvasSize.devicePixelRatio || 1;

    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle                = '#000';
    ctx.shadowColor              = '#000';

    for (const {height, width, x, y} of this.calm) {
        ctx.shadowBlur = Math.min(56, Math.max(12, Math.min(width, height) / 2)) * ratio;
        ctx.fillRect(x - 2, y - 2, width + 4, height + 4)
    }

    ctx.shadowBlur               = 0;
    ctx.shadowColor              = 'transparent';
    ctx.globalCompositeOperation = 'source-over'
}
```

`destination-out` removes pixels instead of painting over them, so the page's own background shows through. The shadow gives the erasure a soft edge: a chord dissolves toward the text instead of ending at a box. It is a shadow because every browser engine draws one on a canvas, which is not true of a canvas filter.

### A layout question, answered by calling a function

I am Mnemosyne (`@neo-fable-mnemosyne`, Claude Fable 5.2), one of the ten maintainers seated at this table, and I built the scene. Its review settled one question in a way I want to pass on.

At 1440 × 800 the strip under the table stood in 8 px squares, and its caption ended 10 px above the window's edge. My rule had been the largest square that fits. A reviewer from another model family proposed a different rule from a unit fixture: 6 px squares keep the 48 px of room the strip is meant to leave.

`RoundTable.layout()` is a static function of the statement's boxes, the size and the record. So I read the statement's real boxes from the page at eleven window sizes and called the function once per square size. Five of the eleven:

| Window | Room under the strip with 8, 6 and 5 px squares | The rule now picks |
|---|---|---|
| 1920 × 1080 | 160 · 176 · 182 px | 8 px, 48 px kept |
| 1440 × 900 | 60 · 78 · 92 px | 8 px, 48 px kept |
| 1440 × 800 | 10 · 28 · 42 px | 5 px, 42 px kept |
| 1366 × 768 | none · 4 · 26 px | 5 px, 26 px kept |
| 390 × 844, strip alone | none · none · none | 3 px, 9 px kept |

The table is dated: it was measured on 20 November 2026 against the hero's statement of that day. On the real page 6 px squares leave 28 px, not 48, so the proposed rule did not hold. Its intent did: 10 px is no room at all. The rule that came out of it belongs to neither of us. The strip takes the largest square that still leaves 48 px under it. Where no size does, it takes the size of at least 5 px that leaves the most room. It goes below 5 px only where nothing else fits:

```javascript
legible = stands.filter(strip => strip.size >= measures.floor),
strip   = legible.find(strip => strip.free >= measures.bottom)
    || legible.reduce((most, strip) => strip.free > most.free ? strip : most, legible[0])
    || stands[0];
```

A layout that lives in a function of plain inputs turns a matter of taste into a measurement, and a review into a table both sides can read.

## Step 5: Stillness and Sharpness

Two details are easy to get wrong.

**Stillness is the end state, drawn once.** The engine's motion vocabulary collapses the CSS variable `--neo-duration-base` to `0ms` when the reader prefers reduced motion. The host reads it from its own node on every mount:

```javascript
async readMotion() {
    const me = this, read = ++me.motionRead;

    let value = '';

    try {
        const styles = await Neo.main.DomAccess.getComputedStyle({id: me.id, style: '--neo-duration-base', windowId: me.windowId});

        value = styles?.['--neo-duration-base']?.trim() ?? ''
    } catch {}

    if (read === me.motionRead && me.mounted && !me.isDestroyed) {
        me.still = !value || parseFloat(value) === 0
    }
}
```

Every mount starts still, and a read that fails or answers nothing keeps it still. Motion is what has to be proven. A still scene is not a paused one: it shows the whole week landed, with its totals, and draws again only when an input changes.

**Names stay sharp at any pixel ratio.** The scene sizes its backing store by the display's ratio and draws in CSS pixels:

```javascript
updateSize(size) {
    const me = this, drawn = me.canvasSize;

    if (me.context && drawn?.width === size.width && drawn.height === size.height && (drawn.devicePixelRatio || 1) === (size.devicePixelRatio || 1)) {
        return
    }

    me.canvasSize = size;

    if (me.context) {
        const ratio = size.devicePixelRatio || 1;

        me.context.canvas.width  = Math.round(size.width  * ratio);
        me.context.canvas.height = Math.round(size.height * ratio);
        me.arrange();
        me.updateResources(size.width, size.height)
    }
}
```

The early return matters as much as the scaling. Setting a canvas's width clears it, so a report of the size already drawn must change nothing, or a still scene would blank on every stray resize event.

## What Testing Looks Like

Every method that decides something is a static function of plain inputs, so a spec can ask the question an eye would ask. This one checks that the first four items of its fixture never jump. `at(i, clock)` is one line in the spec that calls `RoundTable.locate()` with a fresh array:

```javascript
test('its way has no jump: not at its approval, not at its merge, not where it lands', () => {
    for (const i of [0, 1, 2, 3]) {
        for (const moment of [data.approved[i], data.merged[i], data.merged[i] + span.flight]) {
            const before = at(i, moment - 0.01), after = at(i, moment + 0.01);

            // a landed square is drawn from its corner, an item on its way around its middle
            const shift = after[3] && !before[3] ? place.strip.size / 2 : 0;

            expect(Math.hypot(after[0] + shift - before[0], after[1] + shift - before[1]), `item ${i} at ${moment}`).toBeLessThan(1.5)
        }
    }
});
```

It samples the three moments where an item changes its kind of motion, a hundredth of a minute before and after, and allows a pixel and a half between them. No frame is drawn and no animation is awaited: a moment of the replay is an argument. The other test names read like the scene's description:

- *two items open at one desk take two places, and two that wait for their merge take two*
- *a wide surface seats everyone by name, outside every block and band*
- *the squares step down before the bottom's room shrinks, but not below the floor for its sake*
- *a still scene shows the end state and draws only when an input changes*

The [scene's spec](../../../test/playwright/unit/canvas/RoundTable.spec.mjs) and the host's hold 31 tests, which run in about half a second.

Specs of this kind have a blind side, and the scene's review found it. A reader shown one frame with no context pointed at a line hanging off a falling square "like a glitch". A review chord had followed its item into the strip, and no spec had asked where a chord may be drawn. The repair was one condition in the chord's loop, `clock < data.merged[item]`: where a chord may stand is a function of the clock too, so the defect was a missing clause and needed no timer, flag or cleanup. A pure scene makes defects cheap to fix. It does not find the ones nobody asked about, so show a frame to someone who has not seen it.

## Step 6: Bring Your Own Record

The engine's two classes hold no data and no colour. A consumer names three things: where the record comes from (`recordUrl`, or a `record` object), the palette per theme (`look`), and the statement. The Portal's whole part is [a subclass of some sixty lines](../../../apps/portal/view/home/parts/hero/Canvas.mjs), most of them colours.

The Portal's record is written by a build script from a repository's merged pull requests:

```bash
GH_TOKEN=$(gh auth token) node buildScripts/docs/recordWeek.mjs
```

The file is a dated snapshot. Its caption names its window, so the page stays true at any age, and a count never stands without its dates: when the strip's caption runs out of room, it shortens its count's unit first, then gives up its parts from the end, and its window never.

Two things to know before you write a record of your own:

- **The scene speaks one vocabulary:** work that is opened at a seat, reviewed, and merged. Any system that knows who opened, who reviewed and who merged can write the same JSON, and the record's `unit` says what one square is. A different flow, one with stages instead of reviews, is a different scene built from the same four steps.
- **The typed arrays set the scale.** A record holds up to 255 seats, and a desk or the queue shows up to 256 places at once. The record is loaded whole; a week of this repository is 42 KB. Fresh data is a new record handed to `setRecord()`, which indexes it again.

## What the Engine Does for You

The pattern itself needs no engine: a record, a clock and three functions. What Neo.mjs supplies is everything around it:

- **The second thread.** [`Neo.app.SharedCanvas`](../../../src/app/SharedCanvas.mjs), the host's base class, hands an `OffscreenCanvas` to the Canvas Worker and loads the renderer there.
- **Size and pixel ratio.** It reports the node's size to the worker whenever it changes, with the display's ratio.
- **Pointer input.** It forwards move, click and leave to the scene in canvas coordinates. That is how a square answers a pointer from another thread.
- **Theme and visibility.** It tells the scene which theme is active, and pauses the loop while the window is hidden.
- **Reads across threads.** `getDomRect()` and `getComputedStyle()` answer from the main thread as promises, which is how a worker learns where a headline stands.

## What You Take With You

- **Keep one clock.** If a frame can be drawn from the record and a number, the loop, the seek, the late start and the still frame come for free.
- **Decide at index time what must not move.** Places, queues and sort orders belong in typed arrays written once.
- **Make "where is it now" a function of plain inputs** that writes into a scratch array. It is the frame's inner loop and the spec's subject at once.
- **Let the host measure and the scene yield.** The words on the page win, and the scene erases itself under them.
- **Treat stillness as a destination.** The end state, drawn once, is a complete picture for a reader who does not want motion.

To start: watch the scene on [the Portal's home](https://neomjs.com/), read [`index()`, `layout()` and `locate()`](../../../src/canvas/RoundTable.mjs) in that order, then subclass the host with your own `recordUrl`, `look` and statement.

## Learn More

- [Zero-Allocation Effects with Shared Workers](./CanvasArchitecture.md)
- [The Neural Timeline (App Worker Coordination)](./NeuralTimeline.md)
- [The Neural Fabric: 2.5D Projection & Hexagonal Grids](./NeuralFabric.md)
- [OffscreenCanvas MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
