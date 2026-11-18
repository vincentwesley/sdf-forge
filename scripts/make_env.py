"""Build the pre-filtered studio reflection map used by the renderer.

Source: "Studio Small 09" by Sergej Majboroda, Poly Haven, CC0
(https://polyhaven.com/a/studio_small_09). The 1k .hdr is downloaded once by
hand (see the usage line) and is not committed; only the small processed file is.

Output: public/env/studio.bin, a mip chain of equirectangular RGB9E5 texels
(little-endian uint32), level 0 = 128x64 down to 4x2. Level k is blurred for
roughness k/5 with a cosine-power lobe, so the shader picks lod = roughness * 5.
The map is rotated so the brightest softbox sits at +Z, where the shader puts
the renderer's key light, and scaled so its average brightness is 1.

Usage:
  curl -o /tmp/studio.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr
  python scripts/make_env.py /tmp/studio.hdr public/env/studio.bin
"""

import math
import sys
from pathlib import Path

import numpy as np

# The shader turns lookups by the key light's yaw so the key always maps to +Z here.
KEY_DIR = np.array([0.0, 0.72, 0.62])
LEVELS = 6
W0, H0 = 128, 64


def read_hdr(path: Path) -> np.ndarray:
    """Radiance RGBE reader (new-style RLE and flat). Returns float32 HxWx3."""
    data = path.read_bytes()
    pos = 0
    while True:
        end = data.index(b"\n", pos)
        line = data[pos:end]
        pos = end + 1
        if line.startswith(b"-Y") or line.startswith(b"+Y"):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
    out = np.zeros((h, w, 4), dtype=np.uint8)
    buf = np.frombuffer(data, dtype=np.uint8)
    for y in range(h):
        if buf[pos] == 2 and buf[pos + 1] == 2 and (int(buf[pos + 2]) << 8 | int(buf[pos + 3])) == w:
            pos += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = int(buf[pos])
                    pos += 1
                    if n > 128:
                        n -= 128
                        out[y, x : x + n, c] = buf[pos]
                        pos += 1
                    else:
                        out[y, x : x + n, c] = buf[pos : pos + n]
                        pos += n
                    x += n
        else:
            out[y] = buf[pos : pos + 4 * w].reshape(w, 4)
            pos += 4 * w
    e = out[..., 3].astype(np.float32)
    scale = np.where(out[..., 3] > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0.0)
    return out[..., :3].astype(np.float32) * scale[..., None]


def area_resize(img: np.ndarray, w: int, h: int) -> np.ndarray:
    sh, sw = img.shape[:2]
    return img.reshape(h, sh // h, w, sw // w, 3).mean(axis=(1, 3))


def directions(w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    """Unit directions and solid angles of texel centres (u: atan(z,x), v: polar from +Y)."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    phi = (u - 0.5) * 2 * math.pi
    theta = v * math.pi
    st, ct = np.sin(theta), np.cos(theta)
    d = np.stack(
        [st[:, None] * np.cos(phi)[None, :], np.repeat(ct[:, None], w, 1), st[:, None] * np.sin(phi)[None, :]],
        -1,
    )
    sa = np.repeat((st * (math.pi / h) * (2 * math.pi / w))[:, None], w, 1)
    return d, sa


def blur(src: np.ndarray, w: int, h: int, rough: float) -> np.ndarray:
    """Convolve with a cosine-power lobe whose width follows GGX roughness."""
    sd, sa = directions(src.shape[1], src.shape[0])
    sd = sd.reshape(-1, 3)
    sw = (src.reshape(-1, 3) * sa.reshape(-1, 1)).astype(np.float64)
    sa = sa.reshape(-1)
    a = max(rough, 0.05) ** 2
    power = 2.0 / (a * a) - 2.0  # Blinn-Phong exponent matching GGX alpha
    dd, _ = directions(w, h)
    dd = dd.reshape(-1, 3)
    out = np.zeros((dd.shape[0], 3))
    for i in range(0, dd.shape[0], 512):
        c = np.clip(dd[i : i + 512] @ sd.T, 0, 1)
        k = c ** max(power, 1.0)
        out[i : i + 512] = (k @ sw) / np.maximum(k @ sa, 1e-12)[:, None]
    return out.reshape(h, w, 3)


def to_rgb9e5(rgb: np.ndarray) -> np.ndarray:
    """Pack linear RGB into GL_RGB9_E5 (shared exponent) uint32."""
    mx = 65408.0
    c = np.clip(rgb, 0, mx)
    m = c.max(-1)
    e = np.maximum(-16, np.floor(np.log2(np.maximum(m, 1e-30)))) + 16
    e = np.clip(e, 0, 31)
    denom = np.power(2.0, e - 15 - 9)
    mm = np.floor(m / denom + 0.5)
    e = np.where(mm == 512, e + 1, e)
    denom = np.power(2.0, e - 15 - 9)
    q = np.clip(np.floor(c / denom[..., None] + 0.5), 0, 511).astype(np.uint32)
    return q[..., 0] | (q[..., 1] << 9) | (q[..., 2] << 18) | (e.astype(np.uint32) << 27)


def main(src_path: str, out_path: str) -> None:
    hdr = read_hdr(Path(src_path))
    h, w = hdr.shape[:2]
    # work at 256x128, rotate so the brightest region lines up with the key light's azimuth
    base = area_resize(hdr, 256, 128)
    lum = base @ np.array([0.2126, 0.7152, 0.0722])
    d, sa = directions(256, 128)
    weights = (lum * sa)[..., None]
    upper = (d[..., 1] > 0.1)[..., None]
    bright = (d * weights * upper * (lum[..., None] > np.quantile(lum, 0.98))).sum((0, 1))
    phi_src = math.atan2(bright[2], bright[0])
    phi_key = math.atan2(KEY_DIR[2], KEY_DIR[0])
    shift = int(round((phi_src - phi_key) / (2 * math.pi) * 256)) % 256
    base = np.roll(base, -shift, axis=1)
    # average brightness 1 over the sphere
    base = base / ((lum * sa).sum() / sa.sum())
    levels = [area_resize(base, W0, H0)]
    src = area_resize(base, 128, 64)
    for k in range(1, LEVELS):
        lw, lh = W0 >> k, H0 >> k
        levels.append(blur(src, lw, lh, k / (LEVELS - 1)))
    packed = np.concatenate([to_rgb9e5(lv.astype(np.float64)).reshape(-1) for lv in levels]).astype("<u4")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_bytes(packed.tobytes())
    print(f"source {w}x{h}, rotated {shift} px; wrote {len(packed)} texels ({packed.nbytes} bytes) to {out_path}")
    for k, lv in enumerate(levels):
        print(f"  level {k}: {lv.shape[1]}x{lv.shape[0]}  mean {lv.mean():.3f}  max {lv.max():.2f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
