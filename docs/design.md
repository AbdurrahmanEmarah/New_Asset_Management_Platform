# Design

- **Design canvas:** https://claude.ai/artifact/YX1kqgRvtMLYaUSuvnidDe. It has the brand directions, the unified theme and clickable mockups of all key screens, in light and dark.
- **Living system map:** https://claude.ai/artifact/2nRZJcGkZpsySf9NCuZpyV. A copy is in [system-map.html](system-map.html).

## Theme

One product, two modes. **Light = Field Kit, dark = Control Room.** Each user picks System, Light or Dark.

- **Shared by both modes:** Public Sans for the interface and DM Mono for tags, numbers and dates; a 6px radius; the same spacing and layout.
- **Tokens:** `web/shared/theme/tokens.css`. Components use only semantic tokens (`--surface`, `--text`, `--action`, `--ok`…).
- **Status colours:** each status has a colour *and* a shape (circle, triangle, square, ring, dash), so status never depends on colour alone.
- **No flash:** each app's `index.html` sets `data-theme` before the first paint, using the same storage key as `shared/theme/theme.ts`.

## UI rules

- A button never silently does nothing. Disabled buttons say why (`<Button disabledReason>`), and parts not built yet are marked "Soon" with an explanation.
- Every list has a loading state, an error with "Try again", and an empty state that says what to do next.
- Errors from the server are shown as written. The API returns plain-language `detail` and per-field errors.
