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
    fontSize: "clamp(2.75rem, 2rem + 3.6vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(2rem, 1.55rem + 1.7vw, 2.7rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-.02em"
  title:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.5rem + .8vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-.01em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".8125rem"
    fontWeight: 400
  action:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".875rem"
    fontWeight: 500
    lineHeight: 1.25
  action-reset:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".8125rem"
    fontWeight: 500
    lineHeight: 1.25
  action-primary:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".9375rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  field: "var(--corner-field)"
  inset: "var(--corner-inset)"
  postcard: "var(--corner-card)"
  control: "var(--corner-control)"
  mark: "var(--corner-control)"
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
    padding: ".75rem clamp(1rem, 4vw, 2rem) 0"
  sealed-cover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.postcard}"
    padding: "1.5rem"
  button-open:
    backgroundColor: "{colors.rose}"
    textColor: "{colors.paper}"
    typography: "{typography.action-primary}"
    rounded: "{rounded.control}"
    padding: ".625rem 1.5rem"
    height: "48px"
  button-open-hover:
    backgroundColor: "{colors.rose-hover}"
  button-send:
    backgroundColor: "{colors.rose}"
    textColor: "{colors.paper}"
    typography: "{typography.action-primary}"
    rounded: "{rounded.control}"
    padding: ".625rem 1.5rem"
    height: "50px"
    width: "min(100%, 15rem)"
  button-send-hover:
    backgroundColor: "{colors.rose-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: ".625rem .875rem"
    height: "44px"
  button-save:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: ".625rem .875rem"
    height: "44px"
  button-reset:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action-reset}"
    rounded: "{rounded.control}"
    padding: ".625rem .625rem"
    height: "44px"
  manual-share-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: ".75rem"
    height: "48px"
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
- Apple-inspired precision: continuous corners, clear hierarchy, generous touch targets, and restrained material depth—not decorative glass.

## Colors

### Primary

- **Rose** carries “for You,” the envelope seal, the home mark, and filled actions. The darker **Rose Hover** is used on filled actions on fine-pointer hover and press.

### Neutral

- **Blush Page** is the backdrop; **Cream Paper** is the postcard, cover, and field surface, and the text color on filled rose buttons.
- **Warm Ink** is the principal text color; **Muted Ink** recedes for notes, dates, and the drag hint.
- **Paper Line** draws the cover inset and the postcard's footer rule. **Blush Wash** gives Save its quiet filled surface and supplies hover and press feedback on secondary controls; the home mark rests on cream. **Rose Selection** sits behind Warm Ink in selected text.

**The Rose Accent Rule.** Use rose on the invitation, the primary action, and focus, not as a tint over the whole card or the bouquet.

## Typography

Instrument Serif (Georgia, serif fallback) gives the invitation and bouquet name their stationery character. DM Sans (sans-serif fallback) keeps notes and controls legible.

- **Display:** The balanced page title uses the fluid display size; only “for You” is italic and rose.
- **Headline and title:** The cover note breaks after the comma. The bouquet name uses the smaller title scale and can wrap to fit the footer.
- **Body and labels:** The intro note uses .9375rem/1.55, capped at 30ch. Dates use .75rem/1.5 with tabular numerals; drag hints use .8125rem/1.35. Quiet actions use medium weight, with Reset view at the smaller action size. Open your flowers and Send flowers use semibold. The stem note is muted italic Instrument Serif (1.0625rem/1.5), capped at 35ch. Optical sizing is enabled globally. Hierarchy comes from size, weight, leading, and grouping—not gratuitous decoration.

## Layout

One centered column (38rem maximum, excluding page padding) holds the home mark, intro, postcard, and actions. Each side has at least 1rem of page padding, or the device safe-area inset if larger; the top and bottom insets add to the vertical padding. The gap below the intro is fluid (`clamp(1.75rem, 4vw, 2.5rem)`).

The artwork stage has a minimum height of `clamp(19rem, calc(100svh - 33rem), 30rem)`, switching at 600px and below to `clamp(16rem, min(88vw, calc(100svh - 27rem)), 27rem)`. The cover occupies the whole postcard footprint, including the controls and footer. The stage controls and the identity/Save row can wrap separately. At 430px and below “Save postcard” shortens visually to “Save,” keeping its full accessible name. Send flowers is centered on its own row, above the wrapping secondary actions.

## Elevation & Depth

The postcard has one soft paper lift (`--paper-shadow`: `0 2px 3px #573b3d04, 0 12px 28px -12px #573b3d12, 0 32px 64px -28px #573b3d26`); the cover inherits that lift rather than adding another shadow. The stage uses a faint radial blush wash behind the 3D stems, not a separate raised surface.

**The Paper Depth Rule.** Give the postcard one outer lift; use hairlines for the inset and internal separation, not an outer border plus shadow.

## Shapes

The postcard, cover, cover inset, canvas, controls, home mark, notices, and link field use native CSS `corner-shape: squircle` where supported. Shape tokens use 3rem for the postcard, 2rem for insets, 1.5rem for controls, and 1.25rem for fields. These are superellipse corner extents, not circular radii. Browsers without continuous-corner support use carefully matched rounded fallbacks: 1.75rem, 1.25rem, 1rem, and .75rem respectively. No clipping masks or extra resize observers: borders, shadows, and focus outlines remain native and unobscured.

The cover's 1px inset sits .75rem inside the edge, with the same continuous shape. The seal remains a thin rose envelope outline with a circular flower stamp; the illustration's circle is not a control corner. Supporting action icons use Lucide linework. Increased contrast defines structural edges; forced colors retain visible boundaries.

## Components

### Sealed cover and bouquet

The cream cover centers the envelope, “A little something, just for you,” and a native **Open your flowers** button. While sealed, the bouquet and its controls keep their layout space but are hidden and inert. The cover reserves a line for “Getting your flowers ready…” while the bouquet loads. Once ready, the opener takes focus only if it's fully in view and focus is still on the body. Opening moves focus to the canvas, scrolling instantly if less than half of the canvas (or viewport height, if smaller) is visible.

Pointer opening lifts and fades the cover (280ms, `translateY(-2%)`) while the 4.6-second bloom starts without waiting for the transition. The actions below the postcard fade in alongside it (180ms opacity, `--ease-out`, no delay or movement), staying interactive throughout. Reduced-motion pointer opening uses an 80ms action fade; keyboard or assistive opening and error recovery reveal the actions instantly. Growing another bouquet and replaying do not repeat the action fade. Keyboard or assistive activation, or a reduced-motion preference, skips the cover and bloom animations. **Grow another** likewise shows the finished bouquet immediately in these cases. **Replay bloom** explicitly plays the current bloom with any input method when motion is allowed. With reduced motion, omit Replay bloom and show this note below the actions when the bouquet is ready: “Bloom animation is off with your reduced-motion setting.”

Drag tracks pointer and touch movement 1:1, without spring lag. On touch screens, `touch-action: pan-y pinch-zoom` lets the browser claim vertical scrolling and pinch zoom even over the artwork; sideways dragging turns the bouquet. The touch hint makes this direction explicit. On release, an Apple-style spring carries the flick toward its projected resting angle (0.4s response, 0.8 damping ratio). Grabbing again interrupts the spring at the current angle. Pointer **Reset view** springs back by the shortest route (0.4s response, 1.0 damping ratio). Arrow-key steps, `Home`, and keyboard activation of Reset view are instant. Reduced motion also makes pointer reset instant and skips release momentum without removing direct drag. There is no ambient sway; frame scheduling stops once the bloom and any turn settle. On coarse pointers the canvas hint switches to touch wording.

### Actions and focus

- **Open your flowers** (48px minimum height) and **Send flowers** (50px minimum) are filled continuous-corner controls that deepen on fine-pointer hover and press. **Save postcard** has a quiet Blush Wash fill; **Grow another**, **Replay bloom**, and **Reset view** have no visible border. Quiet controls and the home mark have a 44px minimum hit target and use a wash on fine-pointer hover and press. The button heights in the tokens are minimums, not fixed heights.
- Buttons compress to 97% on press (140ms transform transition), except with reduced motion. Disabled buttons dim to .55 opacity. Interactive focus uses a 2px rose outline with a 3px offset; the canvas draws it inward by 2px, and the opener uses ink instead of rose.
- **Send flowers** and **Save postcard** keep their labels while pending and use a wait cursor. The icon swaps in place: a spinner makes one turn every 800ms only while pending; a check replaces the original icon on success with a 160ms opacity transition. Reduced motion makes icon swaps instant and the pending icon still. Inline status text reports what actually happened (for example, that the link was copied or the download started). It never implies delivery.
- **Bouquet link** is a labeled, read-only cream URL field shown inline for manual sharing. It uses a 1px Muted Ink border, a rose caret, and a 48px minimum height, with a note that anyone with the link can open the same bouquet. Native sharing uses the browser or system share sheet; the postcard has no custom popovers, dialogs, or top-layer surfaces.

### React styling and behavior

Use the ui-sdk `Button` for behavior and pass the local [shadcn `Button`](src/components/ui/button.tsx) via `render` so both apply to one native button. Share and save return promises; ui-sdk supplies the pending state and announcements, and the postcard styles the icon from that state. The postcard styles override primitive sizing, colors, radii, and shadows to keep the stationery treatment.

Keep the start of [`src/styles/globals.css`](src/styles/globals.css) in this order:

```css
@layer ui-sdk;
@import "tailwindcss";
@import "@ui-sdk/core/web.css" layer(components);
@import "./app.css";
```

[`src/styles/app.css`](src/styles/app.css) owns the postcard layout and visual states. [`src/App.tsx`](src/App.tsx) and [`src/components/`](src/components/) wire the controls and focus; [`src/garden/engine.ts`](src/garden/engine.ts) and [`src/garden/rotation.ts`](src/garden/rotation.ts) own bloom and turn updates outside React state.

### Mobile app options

A quiet footer outside the sealed group keeps **Opening sound** available before opening. Opening sound is an accessible pressed-state toggle with a stable label; it starts enabled, remembers the visitor's choice locally when storage is available, and can be disabled before the gift opens. A short, low-volume synthesized chime plays only on explicit opening—not page load, Grow another, or Replay bloom. Audio is independent of reduced motion, fails silently when unavailable, stops when muted or backgrounded, and releases its context and nodes after playback or unmount.

The installed app uses the same light stationery palette and safe-area spacing, with a dynamic minimum viewport height in standalone mode. Vertical overscroll does not trigger pull-to-refresh. Buttons and the home mark suppress long-press callouts; content and the manual sharing field stay selectable. Installation stays in the browser's own menu; the page has no install button, help panel, or prompt interception.

### Saved postcard

The 1600 × 1700 PNG places the finished bouquet at its current angle on cream paper. Centered Georgia type prints the bouquet name, then the brand and date, then an italic rose gift line. Interactive controls do not appear in the keepsake.

## Do's and Don'ts

- Do let the bouquet carry the strongest colors and most of the detail.
- Do keep the opening explicit and make the finished bouquet available immediately for keyboard activation or reduced motion.
- Do keep an obvious focus outline, including when focus moves from the cover to the bouquet.
- Don't bring back visible specimen numbers or registration marks on the postcard.
- Don't animate the bouquet at rest or make turning it a prerequisite for enjoying it.
