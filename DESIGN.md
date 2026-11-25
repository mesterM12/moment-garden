---
name: Flowers for You
description: "A warm botanical postcard with a bouquet to open."
colors:
  rose: "#9a4d5c"
  rose-hover: "#803d4b"
  page: "#f5e9e2"
  paper: "#fff9f2"
  ink: "#573b3d"
  muted: "#765b5d"
  line: "#e7d3ce"
  wash: "#f3e2df"
  selection: "#eac9ce"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(2.75rem, 2rem + 4.2vw, 4.875rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.3rem + 1.7vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-.02em"
  title:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.5rem + .8vw, 2.125rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-.01em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".8125rem"
    fontWeight: 400
  action:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".875rem"
    fontWeight: 500
  action-primary:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".9375rem"
    fontWeight: 600
rounded:
  field: "6px"
  inset: "8px"
  postcard: "14px"
  pill: "999px"
  mark: "50%"
spacing:
  tight: ".5rem"
  inset: ".625rem"
  control: ".75rem"
  compact-gutter: "1rem"
  gutter: "1.5rem"
components:
  postcard:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.postcard}"
    padding: ".625rem clamp(1rem, 4vw, 2.25rem) 0"
  sealed-cover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.postcard}"
    padding: "{spacing.gutter}"
  button-open:
    backgroundColor: "{colors.rose}"
    textColor: "{colors.paper}"
    typography: "{typography.action-primary}"
    rounded: "{rounded.pill}"
    padding: ".625rem 1.125rem"
  button-send:
    backgroundColor: "{colors.rose}"
    textColor: "{colors.paper}"
    typography: "{typography.action-primary}"
    rounded: "{rounded.pill}"
    padding: ".625rem 1.25rem"
    width: "min(100%, 14rem)"
  button-send-hover:
    backgroundColor: "{colors.rose-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: ".5rem .75rem"
  button-save:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: ".5rem .75rem"
  button-reset:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: ".375rem .625rem"
  manual-share-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: ".5rem .75rem"
    width: "100%"
  home-mark:
    textColor: "{colors.rose}"
    rounded: "{rounded.mark}"
    size: "44px"
---

# Design System: Flowers for You

## Overview

**Creative North Star: "like something you'd send to your partner"**

The postcard feels like personal stationery rather than a botanical specimen sheet. A blush page frames a single cream card, and the envelope mark and short note make the closed card feel addressed to someone.

Before opening, leave space around the invitation. After opening, the hand-tied bouquet supplies the color and detail; the stationery and controls stay quiet.

**Key Characteristics:**
- Blush surroundings, cream paper, and rose accents.
- Expressive serif lettering and plain sans-serif controls.
- A deliberate opening and a bloom that settles to stillness.

## Colors

### Primary

- **Rose** carries “for You,” the envelope seal, the home mark, and filled actions. The darker **Rose Hover** is reserved for the Send flowers button on hover and press.

### Neutral

- **Blush Page** is the backdrop; **Cream Paper** is the postcard, cover, and field surface, and the text color on filled rose buttons.
- **Warm Ink** is the principal text color; **Muted Ink** recedes for notes, dates, and the drag hint.
- **Paper Line** draws the cover inset, the postcard's footer rule, and the Save outline. **Blush Wash** is the hover and press fill on quiet controls and the home mark. **Rose Selection** sits behind Warm Ink in selected text.

**The Rose Accent Rule.** Use rose on the invitation, the primary action, and focus, not as a tint over the whole card or the bouquet.

## Typography

Instrument Serif (Georgia, serif fallback) gives the invitation and bouquet name their stationery character. DM Sans (sans-serif fallback) keeps notes and controls legible.

- **Display:** The balanced page title uses the fluid display size; only “for You” is italic and rose.
- **Headline and title:** The cover's balanced note stays within 18ch; the bouquet name uses the smaller title scale and can wrap to fit the footer.
- **Body and labels:** The intro note uses the body role. Dates and drag hints use the small label size (line heights 1.4 and 1.35 respectively). Save, Grow another, and Replay bloom use medium weight; Reset view stays regular. Open your flowers and Send flowers use semibold. The stem note is muted italic Instrument Serif (1.125rem/1.4).

## Layout

One centered column (40rem maximum, including gutters) holds the home mark, intro, postcard, and actions. Page gutters shrink at 600px and below; the gap below the intro is fluid (`clamp(1.25rem, 4vw, 1.875rem)`).

The artwork stage is `clamp(19rem, calc(100svh - 30.5rem), 33rem)` tall, switching at 600px and below to `clamp(16rem, min(92vw, calc(100svh - 27rem)), 28rem)`. The cover occupies that same postcard footprint, including the footer. The identity and Save row can wrap; at 430px and below “Save postcard” shortens visually to “Save.” Send flowers is centered on its own row, above the wrapping secondary actions.

## Elevation & Depth

The postcard has a soft paper lift (`0 2px 4px #573b3d0a, 0 12px 32px -12px #573b3d26`); the cover inherits that lift rather than adding another shadow. The stage uses a faint radial blush wash behind the 3D stems, not a separate raised surface.

**The Paper Depth Rule.** Give the postcard one outer lift; use hairlines for the inset and internal separation, not an outer border plus shadow.

## Shapes

The postcard and cover share gently rounded corners. The seal is a thin rose envelope outline with a filled circular stamp; a 1px hairline sits .5rem inside the cover edge. Compact controls are pills, the home mark has a circular hit area, and the link field and focused canvas have smaller radii. Supporting action icons are fine inline SVG linework.

## Components

### Sealed cover and bouquet

The cream cover centers the envelope, “A little something, just for you,” and a native **Open your flowers** button. While sealed, the bouquet and its controls keep their layout space but are hidden and inert. On load, if focus is still on the page body, the opener takes focus only when fully in view. Opening moves focus to the canvas, scrolling instantly only if the canvas is entirely offscreen.

Pointer opening lifts and fades the cover (280ms, `translateY(-2%)`) while the 4.6-second bloom starts without waiting for the transition. Keyboard or assistive activation, or a reduced-motion preference, skips both animations. **Grow another** likewise shows the finished bouquet immediately in these cases. **Replay bloom** explicitly plays the current bloom with any input method when motion is allowed; with reduced motion it is disabled and its title explains why.

The bouquet can be turned by drag or arrow keys and reset with Home or Reset view. There is no ambient sway; frame scheduling stops once the bloom and any turn settle.

### Actions and focus

- **Open your flowers** is a 44px-minimum filled pill, with a fine-pointer hover underline and an ink focus outline. **Send flowers** is a 48px-minimum filled pill that deepens on fine-pointer hover and press. Disabled buttons dim to .55 opacity; busy share and save controls use a wait cursor.
- **Save postcard** uses a hairline pill at the card footer. **Grow another**, **Replay bloom**, and **Reset view** are borderless ink controls with a wash on fine-pointer hover or press. Quiet controls and the home mark have a 44px minimum hit target. On coarse pointers the canvas hint switches to touch wording.
- Buttons compress to 97% on press, except with reduced motion. Interactive focus uses a 2px rose outline with a 3px offset; the canvas draws it inward by 2px, and the opener uses ink instead of rose.
- **Bouquet link** is a label and read-only cream URL field shown when manual sharing is offered. The field uses a 1px Muted Ink border, a rose caret, and a 44px minimum height.

### Saved postcard

The 1600 × 1700 PNG places the finished bouquet at its current angle on cream paper. Centered Georgia type prints the bouquet name, date, and an italic rose gift line; interactive controls do not appear in the keepsake.

## Do's and Don'ts

- Do let the bouquet carry the strongest colors and most of the detail.
- Do keep the opening explicit and make the finished bouquet available immediately for keyboard activation or reduced motion.
- Do keep an obvious focus outline, including when focus moves from the cover to the bouquet.
- Don't bring back visible specimen numbers or registration marks on the postcard.
- Don't animate the bouquet at rest or make turning it a prerequisite for enjoying it.
