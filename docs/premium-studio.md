# Marsfield Studio workspace

The Studio route uses a compact navigation sidebar, project bar, central media canvas, recent asset strip, bottom prompt composer, and contextual Generation Settings inspector. At widths of 1180px and below, the inspector opens from the project bar; mobile navigation remains available at the bottom of the screen.

All ten workflows retain their existing model controls, upload and owned-asset selection, pricing, generation, polling, result actions, and storyboard handoff. Recent assets use the existing library endpoint and refresh after generation completes. Selecting a recent asset previews it without starting a paid generation.

Marsfield Creative Director reuses the existing local prompt enhancement and style suggestions. It does not call an additional AI service or consume extra credits.

The visual styles are scoped to the Studio route in `frontend/src/app/studio.css`. Existing route layouts are unchanged.

## Verification

Run `npm run prisma:generate --workspace=backend` after installing dependencies, then run `npm run build`, `node --test backend/test/*.test.js`, and `npm run test:e2e`.

`e2e/studio-workspace.spec.ts` covers project assignment and prompt direction in the generation payload, recent asset previews, a fully visible Generate button at 1280×720, and mobile inspector access. Set `STUDIO_SCREENSHOT_DIR` to an output directory when running that test to regenerate the screenshots.

The full frontend lint baseline contains pre-existing errors. The changed Studio page has the same lint findings as the base revision; the root layout has no findings. The repository's changed-file lint job still evaluates those existing page errors.

## Screenshots

These screenshots use mocked API responses and a synthetic landscape asset, not a live generation or customer data.

![Desktop workspace](screenshots/marsfield-studio-desktop.png)

![Mobile canvas](screenshots/marsfield-studio-mobile.png)

![Mobile composer](screenshots/marsfield-studio-mobile-composer.png)
