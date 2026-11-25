# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Flowers for You is for someone who wants to give flowers to a person they love: a friend, a family member, a partner, or anyone on their mind. The sender discovers a bouquet worth giving; the recipient opens the arrangement the sender picked, not a fresh random draw.

## Product Purpose

Make it easy to give someone a one-of-a-kind botanical postcard. The gift works both as a PNG keepsake and as a shareable URL that opens the same bouquet and lets the recipient watch it bloom.

## Positioning

Flowers for You grows a full-color 3D arrangement from the timestamp rather than asking the sender to compose one or pick a stock image. New bouquets use 7–10 stems from 3–4 flower types, drawn from 15 procedural varieties. Five arrangements and seven color stories give bouquets different silhouettes and moods, with a bow, twine, or paper wrap to finish. Species-aware shapes and colors should make the flowers recognizable, and the recipient can explore the live bouquet from any angle.

## Operating Context

The postcard runs in desktop and mobile browsers and requires WebGL for the 3D scene. A standard visit generates a new arrangement; a bouquet link restores the sender’s arrangement. The visitor can share a link, grow another surprise bouquet, replay the current bloom, rotate the bouquet, reset the view, or download the finished arrangement at its current angle as a PNG.

## Capabilities and Constraints

- Fresh bouquets are always a surprise. Keep flower-type and color selectors out of the experience.
- Replay and sharing preserve the current arrangement. The recipient sees that bouquet bloom from the front, regardless of the sender’s viewing angle. The PNG preserves the viewing angle.
- Flower geometry is generated in code rather than loaded from model files or photographs.
- The app is a [static site](https://mesterm12.github.io/moment-garden/) with no build step or backend. The public source repository is [mesterM12/moment-garden](https://github.com/mesterM12/moment-garden).

## Brand Commitments

The product is named **Flowers for You**. Speak directly to the sender and recipient without assuming a romantic relationship or a special occasion. Use **bouquet** for the gift, **postcard** for the experience or the saved keepsake, and **Send flowers** for the primary action.

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
