/**
 * Icon pipeline for מוֹלָד (Molad).
 *
 * One source illustration - the navy/cream tear-off calendar with the
 * crescent moon and the word מוֹלָד - drives every icon the app ships:
 *
 *   public/icon-32.png            favicon
 *   public/icon-64.png            in-app mark (Wordmark.jsx)
 *   public/apple-touch-icon.png   iOS home screen (180, fully opaque)
 *   public/icon-192.png           PWA manifest
 *   public/icon-512.png           PWA manifest / splash
 *   public/icon-maskable-512.png  Android adaptive icon (safe-zone inset)
 *
 * The source lives in `assets/` rather than `public/` on purpose: it is
 * build input, not something to serve to browsers.
 *
 * `assets/icon.jpeg` is the artwork as delivered - a progressive,
 * chroma-subsampled JPEG out of WhatsApp. This script reads only PNG;
 * `scripts/jpeg-to-png.ps1` decodes the JPEG once into the lossless
 * master `assets/icon-source.png`, which is what everything here works
 * from. Hand-rolling a progressive JPEG decoder would be hundreds of
 * lines of risk for no quality gain - the platform decoder already does
 * that part correctly, and it only has to happen when the art changes.
 *
 * The artwork's own background is plain white, and shipping that
 * produced the one thing an icon cannot afford: four white corners.
 * Unmasked (favicon, Android `any`) they read as a pale square stuck
 * behind the tile; masked (iOS squircle) the clip lands on white and the
 * icon looks like a screenshot of a sticker. So the pipeline re-mattes
 * the art onto ICON_BACKGROUND - the palette's navy-deep - before it
 * resizes anything, which both kills the white and gives the tile a
 * deliberate dark plate to sit on. The night sky at the top of the
 * illustration is already close to that navy, so the top corners read as
 * continuous; the bottom corners become a navy mount under the paper's
 * gold edge.
 *
 * Node built-ins only, no image library:
 *
 *   decodePng    inflate + unfilter + expand to RGBA8. Bit depth 8 and
 *                16 across greyscale, RGB, palette and both alpha
 *                variants; rejects interlaced files with a clear message
 *                rather than producing garbage.
 *   findBackgroundMask  flood fill inward from the border across
 *                near-white pixels, marking the source's background.
 *                Flood fill rather than a plain whiteness threshold
 *                because the illustration contains white *content* -
 *                the stars in the night sky, the highlights on the gold
 *                rings - and a threshold would punch holes through all
 *                of it. Only white reachable from the edge is
 *                background.
 *   rematte      replaces the masked pixels with the brand colour and
 *                composites any alpha onto it, giving an opaque
 *                full-resolution RGB buffer.
 *   resample     separable Lanczos-3 in linear light. Two reasons it
 *                isn't the box filter it replaced: averaging
 *                gamma-encoded samples darkens an image as it shrinks,
 *                and a box kernel is a poor low-pass - it leaves the
 *                nikud and the moon's terminator softer than the same
 *                pixels can be. Kernel support scales with the
 *                reduction ratio, so a 1074 -> 32 step integrates every
 *                source pixel it should.
 *   compose      contains the (non-square) artwork in a square canvas
 *                at a requested inset. Nothing is cropped and the
 *                result carries no transparency, which is what iOS
 *                requires of an apple-touch-icon.
 *   sharpen      optional unsharp mask, applied in sRGB space after the
 *                downscale. Only the small sizes use it; see OUTPUTS.
 *   encodePng    24-bit truecolour PNG with per-row adaptive filtering.
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(root, 'assets', 'icon-source.png')
const ORIGINAL = join(root, 'assets', 'icon.jpeg')
const PUBLIC_DIR = join(root, 'public')

/**
 * What the source's white background is replaced with, and what any
 * inset padding is filled with - the palette's `--color-navy-deep`
 * (#16294a, see src/index.css).
 *
 * Measured against the artwork rather than picked for looks: the
 * illustration's night sky runs about (49,65,98) at the tile's top edge
 * and (36,50,76) deeper in, so this sits just below the darkest sky
 * tone. The tile's own corner radius is ~18.6% of its width, which means
 * the only places this colour is ever visible are the four corner
 * wedges, the strip above the tile where the binder rings stand up, and
 * the deliberate inset on the apple-touch and maskable outputs.
 *
 * It is also the one navy in the palette dark enough to stay clearly
 * "background" against the tile's own navy body, so the tile keeps a
 * readable edge instead of dissolving into its frame.
 */
const ICON_BACKGROUND = [0x16, 0x29, 0x4a]

/**
 * How far from pure white a pixel may be and still count as background,
 * per channel.
 *
 * 20 sits in a wide, empty gap: the actual background is 0-2 off white,
 * the nearest *content* is the cream paper at ~42 off white, and the
 * anti-aliased boundary between tile and background is only 2-4 pixels
 * across at the source's 1074px - roughly a third of a pixel once
 * downscaled to 192, so where exactly the threshold falls inside that
 * boundary is not something any output can show.
 */
const WHITE_TOLERANCE = 20

/**
 * `inset` is the fraction of the canvas left as background on each side.
 *
 *   0      artwork fills the frame. The illustration is already drawn as
 *          an app-icon tile with its own rounded corners, and favicons
 *          and manifest `any` icons are displayed unmasked, so padding
 *          them would only make the art smaller.
 *   0.06   apple-touch-icon. iOS masks to a superellipse with roughly a
 *          22% corner radius, against the tile's own ~10%, so at inset 0
 *          the mask bites into the badge's gold corner edges. This backs
 *          the art off until the clip lands on background instead.
 *   0.18   maskable. Android crops adaptive icons to an OEM shape that
 *          can be a full circle - radius 0.4 of the canvas. At this
 *          inset the tile's rounded corners fall just inside that
 *          circle, so no OEM shape clips artwork. A stricter reading of
 *          the spec wants 0.22; 0.18 keeps the mark from looking lost
 *          inside squircle masks and risks a couple of pixels of the
 *          corner arc on circular ones.
 *
 * `sharpen` is unsharp-mask amount. A correct downscale is a low-pass
 * filter, so the smaller outputs come back soft; this restores the edge
 * contrast the kernel removed. It scales with how far the image fell -
 * 512 is a 2.2x reduction and needs none, 32 is 35x and needs the most.
 * Kept well below the point where halos appear around the navy letters.
 */
const OUTPUTS = [
  { name: 'icon-32.png', size: 32, inset: 0, sharpen: 0.5 },
  { name: 'icon-64.png', size: 64, inset: 0, sharpen: 0.4 },
  { name: 'apple-touch-icon.png', size: 180, inset: 0.06, sharpen: 0.25 },
  { name: 'icon-192.png', size: 192, inset: 0, sharpen: 0.25 },
  { name: 'icon-512.png', size: 512, inset: 0, sharpen: 0 },
  { name: 'icon-maskable-512.png', size: 512, inset: 0.18, sharpen: 0 },
]

// --- PNG decoding -----------------------------------------------------

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Reverses the per-scanline filters PNG applies before compression. */
function unfilter(raw, width, height, bpp, stride) {
  const out = Buffer.alloc(height * stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const target = y * stride
    const above = target - stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? out[target + x - bpp] : 0
      const up = y > 0 ? out[above + x] : 0
      const upLeft = y > 0 && x >= bpp ? out[above + x - bpp] : 0
      let value = line[x]

      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error(`Unsupported PNG filter type ${filter} on row ${y}`)

      out[target + x] = value & 0xff
    }
  }

  return out
}

/** Decodes a PNG into `{ width, height, data }` where data is RGBA8. */
function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Source is not a PNG file')
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let palette = null
  let paletteAlpha = null
  const idat = []

  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) {
        throw new Error('Interlaced PNGs are not supported - re-export without interlacing')
      }
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS' && colorType === 3) {
      paletteAlpha = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }

    offset += 12 + length
  }

  const channels = CHANNELS[colorType]
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`)
  if (bitDepth !== 8 && bitDepth !== 16) {
    throw new Error(`Unsupported PNG bit depth ${bitDepth} - re-export as 8-bit`)
  }
  if (colorType === 3 && !palette) throw new Error('Palette PNG has no PLTE chunk')

  const sampleBytes = bitDepth / 8
  const bpp = channels * sampleBytes
  const stride = width * bpp
  const pixels = unfilter(inflateSync(Buffer.concat(idat)), width, height, bpp, stride)

  // 16-bit samples are truncated to their high byte: the outputs are
  // 8-bit either way, and the downscale averages far more than enough
  // samples for the lost precision not to show.
  const sampleAt = (index) => pixels[index * sampleBytes]

  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const s = i * channels
    const d = i * 4
    let r
    let g
    let b
    let a = 255

    if (colorType === 0) {
      r = g = b = sampleAt(s)
    } else if (colorType === 4) {
      r = g = b = sampleAt(s)
      a = sampleAt(s + 1)
    } else if (colorType === 2) {
      r = sampleAt(s)
      g = sampleAt(s + 1)
      b = sampleAt(s + 2)
    } else if (colorType === 6) {
      r = sampleAt(s)
      g = sampleAt(s + 1)
      b = sampleAt(s + 2)
      a = sampleAt(s + 3)
    } else {
      const index = sampleAt(s)
      r = palette[index * 3]
      g = palette[index * 3 + 1]
      b = palette[index * 3 + 2]
      a = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255
    }

    data[d] = r
    data[d + 1] = g
    data[d + 2] = b
    data[d + 3] = a
  }

  return { width, height, data }
}

// --- background removal + re-matting ----------------------------------

/**
 * Marks every pixel belonging to the source's white background.
 *
 * An iterative 4-connected flood fill seeded from all four edges, so
 * only white that is *reachable from outside* is marked. That
 * distinction is the whole reason this isn't a one-line whiteness test:
 * the illustration's stars are white pixels surrounded by navy sky, and
 * the gold rings carry white specular highlights. A threshold alone
 * would erase all of them; a flood fill cannot reach them, because the
 * tile's dark edge blocks every path in.
 *
 * Explicitly iterative (an array used as a stack) rather than
 * recursive: at 1074x1124 a recursive fill overflows the call stack.
 *
 * Also treats a transparent pixel as background, so an artwork delivered
 * as a PNG with real alpha works the same way - the current master is
 * fully opaque, having come from a JPEG, but that's a property of this
 * file rather than of the pipeline.
 *
 * @returns {Uint8Array} one byte per pixel, 1 = background
 */
function findBackgroundMask({ width, height, data }) {
  const mask = new Uint8Array(width * height)
  const stack = []

  const isBackgroundCandidate = (i) => {
    const s = i * 4
    if (data[s + 3] < 250) return true
    const whiteDistance = Math.max(255 - data[s], 255 - data[s + 1], 255 - data[s + 2])
    return whiteDistance < WHITE_TOLERANCE
  }

  const push = (x, y) => {
    const i = y * width + x
    if (mask[i] || !isBackgroundCandidate(i)) return
    mask[i] = 1
    stack.push(i)
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (stack.length > 0) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    if (x > 0) push(x - 1, y)
    if (x < width - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < height - 1) push(x, y + 1)
  }

  let count = 0
  for (const value of mask) count += value
  return { mask, count }
}

/**
 * Produces the opaque RGB8 buffer everything downstream works from:
 * masked background pixels become `background` outright, and anything
 * else is composited onto `background` according to its alpha.
 *
 * The 2-4px anti-aliased rim where the tile meets the old white is
 * deliberately left alone. Those pixels are already blends of artwork
 * and white, so on navy they're very slightly light - but at the
 * source's 1074px that rim is under a third of a pixel by the time it
 * reaches the 192px output, well below what the Lanczos kernel resolves.
 * Trying to un-blend it would mean guessing an alpha per pixel and would
 * cost more in artefacts than it removes.
 */
function rematte({ width, height, data }, mask, background) {
  const out = new Uint8Array(width * height * 3)

  for (let i = 0; i < width * height; i += 1) {
    const s = i * 4
    const d = i * 3

    if (mask[i]) {
      out[d] = background[0]
      out[d + 1] = background[1]
      out[d + 2] = background[2]
      continue
    }

    const alpha = data[s + 3] / 255
    for (let c = 0; c < 3; c += 1) {
      out[d + c] = Math.round(data[s + c] * alpha + background[c] * (1 - alpha))
    }
  }

  return out
}

// --- resampling -------------------------------------------------------

const TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

function toSrgb(value) {
  const clamped = value <= 0 ? 0 : value >= 1 ? 1 : value
  const c =
    clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(c * 255)
}

const LOBES = 3

/** Lanczos-3: sinc(x) windowed by sinc(x/3). */
function lanczos(x) {
  if (x === 0) return 1
  const a = Math.abs(x)
  if (a >= LOBES) return 0
  const px = Math.PI * a
  return (LOBES * Math.sin(px) * Math.sin(px / LOBES)) / (px * px)
}

/**
 * Precomputes, for one axis, which source samples each destination
 * sample reads and with what weight.
 *
 * Support is widened by the reduction ratio: shrinking 1074 -> 32 means
 * one destination pixel covers ~34 source pixels, and a kernel that only
 * looked 3 pixels out would alias badly by ignoring most of them.
 * Weights are normalised per destination pixel, which also handles the
 * clamped edges without darkening or brightening the border.
 */
function buildWeights(srcLength, dstLength) {
  const scale = srcLength / dstLength
  const filterScale = Math.max(1, scale)
  const support = LOBES * filterScale
  const rows = []

  for (let d = 0; d < dstLength; d += 1) {
    const center = (d + 0.5) * scale
    const from = Math.max(0, Math.floor(center - support + 0.5))
    const to = Math.min(srcLength - 1, Math.ceil(center + support - 0.5))
    const indices = []
    const weights = []
    let sum = 0

    for (let s = from; s <= to; s += 1) {
      const weight = lanczos((s + 0.5 - center) / filterScale)
      if (weight === 0) continue
      indices.push(s)
      weights.push(weight)
      sum += weight
    }

    for (let i = 0; i < weights.length; i += 1) weights[i] /= sum
    rows.push({ indices, weights })
  }

  return rows
}

/**
 * Separable Lanczos-3 resample of an RGB8 buffer, computed entirely in
 * linear light. Returns linear-light floats: the caller may still want
 * to filter further (see sharpen) before paying the conversion back to
 * sRGB and 8 bits.
 */
function resample(rgb, srcWidth, srcHeight, dstWidth, dstHeight) {
  const horizontal = buildWeights(srcWidth, dstWidth)
  const vertical = buildWeights(srcHeight, dstHeight)

  // Pass 1: full source height, destination width.
  const mid = new Float64Array(dstWidth * srcHeight * 3)
  for (let y = 0; y < srcHeight; y += 1) {
    const row = y * srcWidth
    for (let x = 0; x < dstWidth; x += 1) {
      const { indices, weights } = horizontal[x]
      let r = 0
      let g = 0
      let b = 0
      for (let i = 0; i < indices.length; i += 1) {
        const s = (row + indices[i]) * 3
        const w = weights[i]
        r += TO_LINEAR[rgb[s]] * w
        g += TO_LINEAR[rgb[s + 1]] * w
        b += TO_LINEAR[rgb[s + 2]] * w
      }
      const d = (y * dstWidth + x) * 3
      mid[d] = r
      mid[d + 1] = g
      mid[d + 2] = b
    }
  }

  // Pass 2: destination height.
  const out = new Float64Array(dstWidth * dstHeight * 3)
  for (let y = 0; y < dstHeight; y += 1) {
    const { indices, weights } = vertical[y]
    for (let x = 0; x < dstWidth; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      for (let i = 0; i < indices.length; i += 1) {
        const s = (indices[i] * dstWidth + x) * 3
        const w = weights[i]
        r += mid[s] * w
        g += mid[s + 1] * w
        b += mid[s + 2] * w
      }
      const d = (y * dstWidth + x) * 3
      out[d] = r
      out[d + 1] = g
      out[d + 2] = b
    }
  }

  return out
}

// --- composition + sharpening -----------------------------------------

/** Largest w/h with the source aspect ratio that fits in `box`. */
function containedSize(srcWidth, srcHeight, box) {
  const ratio = Math.min(box / srcWidth, box / srcHeight)
  return {
    width: Math.max(1, Math.round(srcWidth * ratio)),
    height: Math.max(1, Math.round(srcHeight * ratio)),
  }
}

/**
 * Centres a resampled image in a square canvas filled with `background`,
 * converting to sRGB8 on the way in. Letterboxes rather than crops, so a
 * non-square source keeps all of its artwork.
 */
function compose(linear, width, height, size, background) {
  const out = new Uint8Array(size * size * 3)
  for (let i = 0; i < size * size; i += 1) {
    out[i * 3] = background[0]
    out[i * 3 + 1] = background[1]
    out[i * 3 + 2] = background[2]
  }

  const offsetX = Math.floor((size - width) / 2)
  const offsetY = Math.floor((size - height) / 2)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 3
      const d = ((y + offsetY) * size + x + offsetX) * 3
      out[d] = toSrgb(linear[s])
      out[d + 1] = toSrgb(linear[s + 1])
      out[d + 2] = toSrgb(linear[s + 2])
    }
  }

  return out
}

/**
 * Unsharp mask with a 1-2-1 separable Gaussian, in place.
 *
 * Deliberately done in sRGB rather than linear light: linear-light
 * sharpening pushes most of the correction into highlights, which on
 * cream paper reads as blown edges, while the symmetric gamma-space
 * version lifts the navy letterforms evenly. Edges are clamped, so the
 * border is blurred against itself rather than against black.
 */
function sharpen(rgb, size, amount) {
  if (amount <= 0) return rgb

  const clamp = (v) => (v < 0 ? 0 : v > size - 1 ? size - 1 : v)
  const blurred = new Float64Array(rgb.length)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = (y * size + x) * 3
      for (let c = 0; c < 3; c += 1) {
        blurred[d + c] =
          (rgb[(y * size + clamp(x - 1)) * 3 + c] +
            2 * rgb[d + c] +
            rgb[(y * size + clamp(x + 1)) * 3 + c]) /
          4
      }
    }
  }

  const out = new Uint8Array(rgb.length)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = (y * size + x) * 3
      for (let c = 0; c < 3; c += 1) {
        const vertical =
          (blurred[(clamp(y - 1) * size + x) * 3 + c] +
            2 * blurred[d + c] +
            blurred[(clamp(y + 1) * size + x) * 3 + c]) /
          4
        const value = rgb[d + c] + amount * (rgb[d + c] - vertical)
        out[d + c] = value < 0 ? 0 : value > 255 ? 255 : Math.round(value)
      }
    }
  }

  return out
}

// --- PNG encoding -----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * Encodes an RGB buffer as a 24-bit (opaque, no alpha) PNG.
 *
 * Each row is filtered all five ways and the candidate with the smallest
 * sum of absolute signed deviations is kept - the standard libpng
 * heuristic. It costs a few milliseconds and is lossless; it exists
 * because an icon ships to every visitor and the alternative (no
 * filtering) left the 512 roughly twice this size.
 */
function encodePng(pixels, size) {
  const bpp = 3
  const stride = size * bpp
  const raw = Buffer.alloc((stride + 1) * size)
  const candidate = Buffer.alloc(stride)
  const previous = Buffer.alloc(stride)
  const current = Buffer.alloc(stride)

  for (let y = 0; y < size; y += 1) {
    current.set(pixels.subarray(y * stride, (y + 1) * stride))

    let bestFilter = 0
    let bestScore = Infinity
    let best = null

    for (let filter = 0; filter <= 4; filter += 1) {
      let score = 0
      for (let x = 0; x < stride; x += 1) {
        const left = x >= bpp ? current[x - bpp] : 0
        const up = y > 0 ? previous[x] : 0
        const upLeft = y > 0 && x >= bpp ? previous[x - bpp] : 0
        let value = current[x]

        if (filter === 1) value -= left
        else if (filter === 2) value -= up
        else if (filter === 3) value -= (left + up) >> 1
        else if (filter === 4) value -= paeth(left, up, upLeft)

        candidate[x] = value & 0xff
        // Signed magnitude: 0xfe is -2, a small residual, not a big one.
        score += candidate[x] < 128 ? candidate[x] : 256 - candidate[x]
      }

      if (score < bestScore) {
        bestScore = score
        bestFilter = filter
        best = Buffer.from(candidate)
      }
    }

    raw[y * (stride + 1)] = bestFilter
    best.copy(raw, y * (stride + 1) + 1)
    previous.set(current)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // color type 2 = truecolor RGB, no alpha
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- entry point ------------------------------------------------------

export {
  decodePng,
  findBackgroundMask,
  rematte,
  resample,
  containedSize,
  compose,
  sharpen,
  encodePng,
  ICON_BACKGROUND,
  OUTPUTS,
}

const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`

function main() {
  if (!existsSync(SOURCE)) {
    console.error(
      [
        `Master artwork not found: ${SOURCE}`,
        '',
        existsSync(ORIGINAL)
          ? 'Build it from the delivered JPEG first (Windows):\n  powershell -ExecutionPolicy Bypass -File scripts/jpeg-to-png.ps1'
          : 'Save the מוֹלָד illustration as assets/icon-source.png (8-bit PNG,\nnot interlaced, any size) and re-run `npm run icons`.',
        '',
        'Existing icons in public/ were left untouched.',
      ].join('\n'),
    )
    process.exit(1)
  }

  const decoded = decodePng(readFileSync(SOURCE))
  const background = ICON_BACKGROUND
  const { mask, count } = findBackgroundMask(decoded)
  const rgb = rematte(decoded, mask, background)

  const pixels = decoded.width * decoded.height
  console.log(
    `source: ${decoded.width}x${decoded.height}, ` +
      `re-matted ${count} background px (${((100 * count) / pixels).toFixed(1)}%) ` +
      `onto ${hex(background)}`,
  )

  // A sanity check with teeth: the corner wedges plus the strip above
  // the binder rings come to roughly 9% of this artwork. Near 0% means
  // the fill found no way in (a source whose background isn't white, or
  // a tile drawn flush to the edges); a large fraction means it leaked
  // through the tile and is eating the illustration. Either way the
  // output would be wrong in a way that's easy to miss in a terminal,
  // so it stops here instead.
  const fraction = count / pixels
  if (fraction < 0.01 || fraction > 0.35) {
    console.error(
      `\nAborting: background fill covered ${(100 * fraction).toFixed(1)}% of the source, ` +
        'which is outside the expected 1-35% range.\n' +
        `Check that ${SOURCE} still has a white border around the icon tile, ` +
        'or adjust WHITE_TOLERANCE.\n' +
        'Existing icons in public/ were left untouched.',
    )
    process.exit(1)
  }

  mkdirSync(PUBLIC_DIR, { recursive: true })
  for (const { name, size, inset, sharpen: amount } of OUTPUTS) {
    const box = Math.max(1, Math.round(size * (1 - 2 * inset)))
    const { width, height } = containedSize(decoded.width, decoded.height, box)
    const linear = resample(rgb, decoded.width, decoded.height, width, height)
    const png = encodePng(
      sharpen(compose(linear, width, height, size, background), size, amount),
      size,
    )
    writeFileSync(join(PUBLIC_DIR, name), png)
    console.log(
      `wrote public/${name} (${size}x${size}, art ${width}x${height}, ` +
        `sharpen ${amount}, ${(png.length / 1024).toFixed(1)} kB)`,
    )
  }
}

// Only run when invoked directly, so the functions above can be imported
// and exercised without the script trying to produce icons.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
