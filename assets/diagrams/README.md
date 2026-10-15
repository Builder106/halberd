# README policy figure

`policy-check.html` is the editable source for the README's lookup-versus-erase example. Its layout follows Diagram Design's [secure paved road](https://github.com/cathrynlavery/diagram-design/blob/0a8ea20ae69b33a5edce6018eedd3a9d26e90c1c/skills/diagram-design/references/semantic-patterns.md#5-secure-paved-road) pattern: an allowed request crosses the policy boundary, while a forbidden request ends before it. The examples come from the PostgreSQL bundle and existing policy-engine and proxy tests.

The figure uses Halberd's existing weapon mark as the policy barrier. One path continues to the database tool; the erase path stops before the barrier. Detailed rule checks belong in the README's expandable developer section. The compact phone layout bends the allowed path around the requests and through the boundary to the database. Each layout has light and dark PNG exports at twice its logical resolution.

Manrope carries the headings and labels; Cormorant Garamond appears only on the Halberd name. Both load from Google Fonts. SQL uses a system monospace face. Slate colors come from the existing banners and playground, with wax reserved for the intercepted request. PNG exports preserve the loaded typography without font requests from the README.

## Export

Render in a build environment with the project's existing Playwright dependency and Chromium available. From the repository root:

```sh
node assets/diagrams/export-policy-check.mjs /path/to/exports
```

The exporter checks font loading, text bounds, and text contrast before writing the four PNGs. Copy those files into this directory after inspecting them at desktop and phone widths.

For a separate Playwright installation, pass its package directory as the second argument. `HALBERD_DIAGRAM_BROWSER` can select an existing Chromium binary. No application dependency or build configuration changes are needed.

For an animation, use the same two requests and labels: first show the lookup passing, then highlight the forbidden erase command and stop it before the database tool. End on both outcomes so the closing frame carries the same explanation as the static figure.
