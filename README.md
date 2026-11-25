# Mattermost Theme Generator

A static web page that rolls random Mattermost themes, shows each one in a mock Mattermost window, and checks the contrast of every text and background pair.

**Live page: https://wayto0blivion.github.io/Mattermost-Theme-Generator/**

A palette of colors that look good together is not enough for a usable theme: each color has a job, and message text, badges and buttons have to stay readable on the surface they sit on. So the generator picks a hue harmony first, then assigns colors by role and shifts lightness until each pair clears its contrast target.

## Using it

- **Generate** (or Space) rolls a new theme. Left and right arrows step through recent rolls.
- **Options** narrow the roll: light or dark channel, sidebar style, harmony, intensity, how much color the text carries, and an optional pinned base hue.
- **Colors by key** lets you change any single color. Lock a key to carry its color into the next roll.
- **Theme JSON** is the block Mattermost takes. Copy it, then in Mattermost go to Settings, Display, Theme, Custom Theme and paste it into the box under the color pickers. You can also paste an existing theme in and load it to see how it scores.
- **Keep this one** saves a theme in the browser's local storage. Kept themes do not sync between browsers.

## Running it

The page is three static files in `site/` with no build step. Plain scripts, no modules, so any of these work:

- Open `site/index.html` straight from disk.
- Serve it from a container:

  ```sh
  docker compose up -d        # http://<host>:8480
  PORT=9000 docker compose up -d
  ```

- Put `site/` behind any static host.

The live page is GitHub Pages. `.github/workflows/pages.yml` runs the contrast check and redeploys `site/` on every push to `main` that touches it.

Fonts load from Google Fonts. Without network access the page falls back to system fonts and still works.

## How a theme is built

`site/generator.js` works in OKLCH so that lightness steps look even across hues.

1. Roll a base hue and a harmony. The base hue colors the sidebar and tints the channel. A second hue drives actions (buttons, links, the active-channel marker) and a third drives attention (mention highlight, New Messages line, unread badge).
2. Place each color at a starting lightness for its role, then walk lightness until it clears its contrast target against the surface it sits on.
3. Status dots and error text keep their usual green, amber and red. Only their lightness moves.

Every roll is seeded, so the same seed and options always give the same theme.

### Mattermost details worth knowing

- `mentionBj` is not a typo to fix. Mattermost's built-in themes carry it next to `mentionBg`, so the generator writes both with the same value.
- `codeTheme` is a name, not a color: `github`, `monokai`, `solarized-dark` or `solarized-light`.
- The top bar across the app takes its background from `sidebarTeamBarBg`, not `sidebarHeaderBg`.
- The preview is an approximation of the web app. Dimmed sidebar text, the active-row tint and the mention-row tint are estimates.

## Checking changes

`tools/check.js` rolls about 14,000 themes across every option combination and exits non-zero if any theme has a low contrast pair or a malformed value. It only reads files.

```sh
docker run --rm --network none -v "$PWD":/w:ro node:22-alpine node /w/tools/check.js
```

## Publishing as a Claude artifact

The page also runs as a Claude artifact. Artifacts want a single file without its own `<html>` wrapper, so this folds `site/` into `dist/artifact.html`:

```sh
docker run --rm --network none --user "$(id -u):$(id -g)" -v "$PWD":/w node:22-alpine node /w/tools/build-artifact.js
```
