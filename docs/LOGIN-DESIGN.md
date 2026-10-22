# Login visual design

## Kondisi aktif — 22 Oktober 2026

Acuan lintas halaman: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md), bagian 9. Navy/amber menggantikan champagne/crimson; bagian lama di bawah disimpan untuk asal aset dan riwayat keputusan, bukan instruksi styling aktif.

Layout tetap: desktop pengantar kiri/form kanan maksimum 400px; di bawah 768px form-only. Foto dan emblem existing dipertahankan. Overlay navy #131B2E 80%; panel navy 40% dengan blur-md 12px, border putih 20% dan fallback 95%; input navy 25% dengan blur-sm 8px, border putih 20% dan fallback 95%. Teks putih/sekunder #BEC6E0, tombol #904D00 dengan hover #753E00, fokus #FE932C, emblem putih. Login tetap Geist existing; tipografi Inter workspace tidak mengubahnya.

Password selalu tersembunyi (type=password), tanpa Tampilkan/Sembunyikan atau ikon reveal. Styling dan perilaku login lainnya tetap: label/autocomplete/validation, pending/error, submit dan redirect. Perubahan warna atau kontrol tampilan bukan izin mengubah autentikasi.

## Riwayat dan provenance aset

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

## 2026-10-22 — Workspace palette alignment (current)

Owner requested matching the Figma workspace base colors while preserving the existing login layout. This supersedes the earlier champagne/crimson palette descriptions above.

- Owner rejected the opaque-looking white panel and requested the former glass appearance. Current treatment: navy photo overlay/background `#131B2E` at 80%, navy glass panel at 40% with the original medium backdrop blur, white form text, secondary `#BEC6E0`, and amber submit `#904D00` (hover `#753E00`). Panel fallback is navy at 95% without backdrop-filter support.
- Fields use navy `#131B2E` at 25% with the original small backdrop blur (95% fallback), thin white borders at 20%, white input text and secondary `#BEC6E0`. Focus uses orange `#FE932C` for contrast on dark glass. Left introductory copy stays white with secondary `#BEC6E0`.
- Restore the previous white emblem filter for readability on dark glass. No new asset or font is introduced.
- Preserve desktop columns, dimensions, spacing, background image selection, rounded corners, shadows, glass blur, and mobile form-only presentation. Implementation is Tailwind in page.tsx/login-form.tsx; the earlier CSS Module description is historical.
- Owner subsequently requested removing the Tampilkan/Sembunyikan control. Password now stays type=password, with normal symmetric input padding. Authentication, validation, pending/error copy and redirects remain unchanged. Actual checks are recorded in DEVLOG.
