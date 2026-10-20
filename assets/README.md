# assets/

Build inputs, not served to browsers. Every icon in `public/` is
generated from here.

## The two source files

| file              | what it is                                                     |
| ----------------- | -------------------------------------------------------------- |
| `icon.jpeg`       | the artwork as delivered (WhatsApp): progressive JPEG, 4:2:0   |
| `icon-source.png` | lossless master decoded from it, 1074x1124 - the build's input |

`scripts/generate-icons.mjs` reads only PNG. Decoding progressive JPEG by
hand would be hundreds of lines of risk for no quality gain, since the
platform decoder already does that part correctly and it only has to
happen when the artwork changes. So the conversion is a separate,
Windows-only, run-it-once step.

## Regenerating

When the artwork changes, drop in a new `icon.jpeg` and run both steps:

```
powershell -ExecutionPolicy Bypass -File scripts/jpeg-to-png.ps1
npm run icons
```

If your source is already a PNG, save it as `icon-source.png` and only
the second step is needed. Requirements: 8-bit, not interlaced, any
dimensions - square or not, since a non-square source is letterboxed
rather than cropped. 1024px or more on the long edge keeps the 512
output crisp.

## What gets written

| file                           | size | notes                               |
| ------------------------------ | ---- | ----------------------------------- |
| `icon-32.png`                  | 32   | favicon, unsharp-masked             |
| `icon-64.png`                  | 64   | in-app mark (`Wordmark.jsx`)        |
| `apple-touch-icon.png`         | 180  | iOS home screen, 6% inset           |
| `icon-192.png`                 | 192  | manifest `any`                      |
| `icon-512.png`                 | 512  | manifest `any`, PWA splash          |
| `icon-maskable-512.png`        | 512  | manifest `maskable`, 18% safe inset |

All are fully opaque 24-bit PNGs - iOS rejects transparency in an
apple-touch-icon, and the artwork has an opaque background anyway.

Two things the pipeline derives from the artwork rather than assuming:
the pad colour comes from the modal colour of the source's border ring
(currently `#ffffff`), so insets and letterbox bars are seamless; and
the inset artwork is resampled straight from full resolution to its
final size in one Lanczos-3 pass, so nothing is scaled twice.

The insets exist because this artwork is drawn as an app-icon tile that
runs edge to edge. iOS masks to roughly a 22% corner radius against the
tile's own ~10%, and Android can crop an adaptive icon to a full circle,
so the masked outputs back the art off until the clip lands on
background instead of on the tile's gold edges. `manifest.json` must
keep the `maskable` entry pointing at the inset file, not at
`icon-512.png`.
