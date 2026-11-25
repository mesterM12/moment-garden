# Flowers for You

## UI work

Before using ui-sdk, follow `.agents/skills/ui-sdk/SKILL.md` if installed and read `node_modules/@ui-sdk/react/docs/llms.txt`. When building a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading and read `node_modules/@ui-sdk/react/docs/rendering.md`.

Use ui-sdk for interactive behavior and the local shadcn primitives for presentation; compose them onto a single DOM control. Preserve the warm stationery system in `DESIGN.md` and the product constraints in `PRODUCT.md`.

## Bouquet rendering

Keep seeded generation deterministic: a shared URL must restore the same bouquet. Keep per-frame geometry and rotation updates outside React state. Dispose the renderer, listeners, textures, and observers when its React owner unmounts, including Strict Mode remounts. Honor reduced motion without removing direct pointer or keyboard control.
