# Login visual design

Approved by the owner on 2026-10-15, with explicit authorization to implement the frontend and add assets.

## Direction and implementation

Continuous warm hotel photograph, dark overlay for readable introductory copy, and a translucent champagne glass panel. Text and button use espresso brown with antique-gold details. Desktop keeps two columns; narrow screens stack the introduction and form. Glass is CSS (`backdrop-filter` plus translucent color), not baked into a screenshot. A more opaque fallback handles browsers without backdrop blur.

`page.tsx` stays a Server Component; only the existing interactive form is client-side. CSS Modules keep these styles local to login. `next/image` sizes the decorative images and optimizes delivery; the background is preloaded. Inputs retain real labels, autocomplete and native validation. The password control has an accessible label; errors use an alert; pending submit is disabled.

## Assets

Generated through the built-in image-generation tool from the owner's approved visual reference. These are decorative synthetic artwork, not photographs documenting actual hotel staff.

- `public/images/login/hotel-background.png`: full hotel scene with housekeeping attendant/cart, warm timber and brass, reconstructed background with all mockup text, form, logos and UI removed.
- `public/images/login/housekeeping-emblem.png`: isolated house/leaf/supply emblem in espresso brown and antique gold on transparent background, without wordmark.

Source generation outputs retained outside the repository:

- Background: `C:/Users/user/.codex/generated_images/01a13d2d-3be7-7ea0-949b-36ca2ddf3dbb/exec-722169c8-3088-43f8-a904-253612cabd3d.png`
- Emblem: `C:/Users/user/.codex/generated_images/01a13d2d-3be7-7ea0-949b-36ca2ddf3dbb/exec-720b645e-a8f3-4445-86eb-33950312fad9.png`

The login redesign adds no backend feature, recovery flow or remember-me behavior. Verification results and limitations are recorded in DEVLOG and CONTEXT.
