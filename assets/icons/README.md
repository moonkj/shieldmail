# ShieldMail Icons

Safari extension toolbar icons and brand logos for ShieldMail.

## Usage matrix

| File | Use case | Notes |
|---|---|---|
| `shield-mail-color.svg` | App icon, marketing, onboarding | Full color, multi-shape |
| `shield-mail-mono-black.svg` | Safari toolbar (light mode) | Single compound path, evenodd |
| `shield-mail-mono-white.svg` | Safari toolbar (dark mode) | Single compound path, evenodd |
| `shield-mail-gradient.svg` | Splash, store listing hero | Blue->mint linear gradient |
| `logo-full.svg` | Website header, README | Horizontal icon + wordmark |
| `logo-stacked.svg` | Square avatars, launch card | Icon above wordmark |

## Build hint

For Safari Web Extensions, rasterize mono variants to PNG at 16/19/32/38/48/72px:

```sh
for s in 16 19 32 38 48 72; do
  rsvg-convert -w $s -h $s shield-mail-mono-black.svg > toolbar-${s}.png
done
```

Safari automatically inverts the mono template on dark toolbars when supplied as a template image in the Xcode asset catalog — ship `mono-black` as the template source.

## Contrast ratios

| Variant | Background | Ratio | WCAG |
|---|---|---|---|
| mono-black `#000` | Safari light toolbar `#F5F5F7` | 20.35:1 | AAA |
| mono-white `#FFF` | Safari dark toolbar `#1C1C1E` | 17.56:1 | AAA |
| color blue `#007AFF` | white `#FFFFFF` | 4.03:1 | AA (large) |

## Do-not rules

- Do **not** recolor the shield outside the approved palette (`#007AFF`, `#00D4AA`).
- Do **not** add drop shadows or bevels — the mark is flat by design.
- Do **not** stretch non-uniformly; preserve the 1:1 icon aspect.
- Do **not** rotate the shield; the flat top must remain horizontal.
- Do **not** place the color variant on busy photographic backgrounds — use a mono variant.
- Do **not** reconstruct the envelope with a stroke; 16px rendering requires filled shapes.
- Do **not** remove the mint accent bar from the color/logo variants.

## License

Released under the MIT License. Copyright (c) 2026 ShieldMail contributors.
