# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Moment Garden is for someone who wants to send another person flowers as a small digital gesture. The sender discovers a bouquet worth giving; the recipient gets the arrangement the sender chose, not a fresh random draw.

## Product Purpose

Make it easy to give someone a one-of-a-kind botanical postcard. The gift works both as a PNG keepsake and as a shareable URL that opens the same bouquet and lets the recipient watch it bloom.

## Positioning

Moment Garden grows a full-color 3D arrangement from the timestamp rather than asking the sender to compose one or pick a stock image. Each arrangement has 7–9 stems from at least three flower types. Species-aware shapes and colors should make the flowers recognizable, and the recipient can explore the live bouquet from any angle.

## Operating Context

The postcard runs in desktop and mobile browsers and requires WebGL for the 3D scene. A standard visit generates a new arrangement; a bouquet link restores the sender’s arrangement. The visitor can share a link, grow another surprise bouquet, replay the current bloom, rotate the bouquet, reset the view, or download the finished arrangement at its current angle as a PNG.

## Capabilities and Constraints

- Fresh bouquets are always a surprise. Keep flower-type and color selectors out of the experience.
- Replay and sharing preserve the current arrangement. The recipient sees that bouquet bloom from the front, regardless of the sender’s viewing angle. The PNG preserves the viewing angle.
- Eight procedural flower recipes are available: rose, tulip, dahlia, sunflower, daisy, lily, poppy, and cosmos. The geometry is generated in code rather than loaded from model files or photographs.
- The current app is a static site with no build step or backend. The public source repository is [mesterM12/moment-garden](https://github.com/mesterM12/moment-garden).

## Brand Commitments

The product is named **Moment Garden**. Its existing line is “A moment, in bloom.” Use **bouquet** for the gift and **postcard** for the experience or the saved keepsake.

## Evidence on Hand

- [`index.html`](index.html): the working postcard.
- [`docs/images/`](docs/images/): the logo, desktop and mobile screenshots, bouquet gallery, and animated preview.
- [`DESIGN-REVIEW.md`](DESIGN-REVIEW.md): observations about species resemblance and remaining geometry refinements.

## Product Principles

- **Make the gift easy to give.** The sender discovers a bouquet rather than assembling one from settings.
- **Keep the surprise at generation.** Once a bouquet is chosen, replay and sharing should preserve it.
- **Make the flowers recognizable.** Petal forms, centers, leaves, and pigment should distinguish flower types, not just recolor one model.
- **Support both ways to give.** A still image is a keepsake; a link should carry the experience of watching that same bouquet bloom.

## Accessibility & Inclusion

The bouquet supports pointer, touch, and keyboard rotation. The reduced-motion setting shows the finished bouquet without requiring the growth animation or idle sway. Keep the gift view usable without dragging or waiting for motion.
