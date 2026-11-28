# Compare a theme pair

To create a comparison pair from the shared Neo theme, run this from the Engine checkout.

```sh
npm run create-theme -- --base theme-neo --name theme-my-pair --noquestions
```

Build your themes and start the development server.

```sh
npm run build-themes -- -n -e dev -t all
npm run server-start -- --no-open
```

Open [the specimen](./index.html) for the stock Neo Light and Dark controls. To add a local pair, take its two registered class names from the generated `resources/theme-map.json` and open a URL such as `index.html?light=neo-theme-my-pair-light&dark=neo-theme-my-pair-dark`. Use the four theme buttons to compare the same mounted scene. For a direct capture link, add `&theme=<class>`. Add `&blind=1` to label the pair controls A and B for a cold comparison.

## Repeat the scene

At a fixed viewport size, reload the same URL for each fresh capture. Use the buttons to compare schemes while keeping live edits and selection.

1. Click Beacon’s Name cell to select it and its row. Move the pointer over Cedar’s row for a separate hover state.
2. Press F2 in Beacon’s Name cell, enter `Beacon edit`, and press Enter. Move focus to Note. The edited cell keeps its modified corner after blur.
3. Tab to the Status input for a keyboard focus frame. Open its picker and capture the selected Draft option. Escape closes the picker and retains that selection. The disabled Locked field is visible in the same form.
4. Click Show toast to capture a transient floating notification. Toast still has theme-specific paint values. A new pair needs its own Toast declarations for that frame.

To compare a selected-row override independently of the picker, set the pair’s `--neo-grid-cellrowmodel-row-cell-background-color-selected` per scheme, rebuild the themes, and repeat the scene. The picker selection reads `--neo-list-item-background-color-selected`. Compare Draft’s painted option in both open-picker frames.
