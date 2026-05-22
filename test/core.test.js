import assert from "node:assert/strict";
import test from "node:test";

import {
  compositeAligned,
  findBestAlignment,
} from "../src/index.js";

function image(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b, a = 255] = pixelAt(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

function crop(source, x0, y0, width, height, mutate = () => null) {
  return image(width, height, (x, y) => {
    const sx = x0 + x;
    const sy = y0 + y;
    const si = (sy * source.width + sx) * 4;
    const original = [
      source.data[si],
      source.data[si + 1],
      source.data[si + 2],
      source.data[si + 3],
    ];
    return mutate(x, y, original) ?? original;
  });
}

function syntheticBase(width = 96, height = 80) {
  return image(width, height, (x, y) => {
    const edge = ((x * 17) ^ (y * 31) ^ ((x + y) * 7)) & 255;
    const r = (x * 5 + y * 3 + edge) & 255;
    const g = (x * 11 + y * 13 + (edge >> 1)) & 255;
    const b = (x * 19 + y * 23 + (edge << 1)) & 255;
    return [r, g, b, 255];
  });
}

test("finds the translation for a smaller crop inside a larger source", () => {
  const source = syntheticBase();
  const overlay = crop(source, 23, 17, 40, 32);

  const result = findBestAlignment(source, overlay, {
    tileSize: 8,
    tileStep: 4,
    maxCandidates: 5,
    minComparedPixels: 256,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.offsetX, 23);
  assert.equal(result.offsetY, 17);
  assert.equal(result.mismatchedPixels, 0);
});

test("finds arbitrary pixel offsets when sourceStep skips source positions", () => {
  const source = syntheticBase(120, 96);
  const overlay = crop(source, 23, 17, 48, 40);

  const result = findBestAlignment(source, overlay, {
    tileSize: 8,
    tileStep: 8,
    sourceStep: 4,
    refineRadius: 3,
    maxCandidates: 8,
    minComparedPixels: 256,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.offsetX, 23);
  assert.equal(result.offsetY, 17);
});

test("short-circuits identical source and overlay images", () => {
  const source = syntheticBase(240, 180);

  const result = findBestAlignment(source, source, {
    tileSize: 8,
    tileStep: 8,
    sourceStep: 4,
    refineRadius: 3,
    maxCandidates: 8,
    minComparedPixels: 256,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.offsetX, 0);
  assert.equal(result.offsetY, 0);
  assert.equal(result.mismatchedPixels, 0);
});

test("reports monotonic progress while finding an alignment", () => {
  const source = syntheticBase(96, 80);
  const overlay = crop(source, 23, 17, 40, 32);
  const events = [];

  const result = findBestAlignment(source, overlay, {
    tileSize: 8,
    tileStep: 4,
    maxCandidates: 5,
    minComparedPixels: 256,
    onProgress: (event) => events.push(event),
  });

  assert.equal(result.status, "ok");
  assert.ok(events.length >= 4);
  assert.equal(events.at(0).progress, 0);
  assert.equal(events.at(-1).progress, 1);
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(events[i].progress >= events[i - 1].progress);
  }
});

test("ignores masked inpaint pixels during matching and verification", () => {
  const source = syntheticBase();
  const ignoreMask = new Uint8Array(40 * 32);
  const overlay = crop(source, 29, 21, 40, 32, (x, y, original) => {
    if (x >= 12 && x < 23 && y >= 9 && y < 20) {
      ignoreMask[y * 40 + x] = 255;
      return [255 - original[0], 40, 200, 255];
    }
    return original;
  });

  const result = findBestAlignment(source, overlay, {
    ignoreMask,
    tileSize: 8,
    tileStep: 4,
    maxCandidates: 5,
    minComparedPixels: 256,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.offsetX, 29);
  assert.equal(result.offsetY, 21);
  assert.equal(result.mismatchedPixels, 0);
});

test("rejects repeated low-information imagery as ambiguous or no-match", () => {
  const source = image(80, 60, (x, y) => {
    const v = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) * 255;
    return [v, v, v, 255];
  });
  const overlay = crop(source, 16, 16, 24, 24);

  const result = findBestAlignment(source, overlay, {
    tileSize: 8,
    tileStep: 8,
    minTileVariance: 1,
    minUniqueColors: 2,
    ambiguityRatio: 0.85,
  });

  assert.notEqual(result.status, "ok");
});

test("supports overlays that extend outside the source bounds", () => {
  const source = syntheticBase(64, 64);
  const overlay = image(32, 32, (x, y) => {
    const sx = x - 5;
    const sy = y - 7;
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) {
      return [0, 0, 0, 0];
    }
    const si = (sy * source.width + sx) * 4;
    return [
      source.data[si],
      source.data[si + 1],
      source.data[si + 2],
      source.data[si + 3],
    ];
  });

  const result = findBestAlignment(source, overlay, {
    tileSize: 8,
    tileStep: 4,
    maxCandidates: 5,
    minComparedPixels: 128,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.offsetX, -5);
  assert.equal(result.offsetY, -7);
});

test("composites the aligned overlay onto a copy of the base image", () => {
  const source = syntheticBase(48, 48);
  const overlay = image(8, 8, () => [250, 10, 40, 255]);

  const composed = compositeAligned(source, overlay, { offsetX: 13, offsetY: 9 });
  const changed = ((9 + 3) * composed.width + (13 + 4)) * 4;
  const unchanged = (2 * composed.width + 2) * 4;

  assert.deepEqual(Array.from(composed.data.slice(changed, changed + 4)), [250, 10, 40, 255]);
  assert.deepEqual(
    Array.from(composed.data.slice(unchanged, unchanged + 4)),
    Array.from(source.data.slice(unchanged, unchanged + 4)),
  );
  assert.notEqual(composed.data, source.data);
});

test("composites to the full union bounds when overlay extends outside the base", () => {
  const source = image(4, 3, () => [10, 20, 30, 255]);
  const overlay = image(3, 2, () => [200, 40, 50, 255]);

  const composed = compositeAligned(source, overlay, {
    offsetX: -2,
    offsetY: 1,
  }, {
    backgroundColor: "#ffffff",
  });

  assert.equal(composed.width, 6);
  assert.equal(composed.height, 3);
  assert.deepEqual(Array.from(composed.data.slice(0, 4)), [255, 255, 255, 255]);

  const overlayPixel = (1 * composed.width + 0) * 4;
  const basePixel = (0 * composed.width + 2) * 4;

  assert.deepEqual(Array.from(composed.data.slice(overlayPixel, overlayPixel + 4)), [200, 40, 50, 255]);
  assert.deepEqual(Array.from(composed.data.slice(basePixel, basePixel + 4)), [10, 20, 30, 255]);
});

test("uses the configured background color for uncovered output pixels", () => {
  const source = image(2, 2, () => [0, 0, 0, 0]);
  const overlay = image(1, 1, () => [0, 0, 0, 0]);

  const composed = compositeAligned(source, overlay, {
    offsetX: 2,
    offsetY: 0,
  }, {
    backgroundColor: "#123abc",
  });

  assert.equal(composed.width, 3);
  assert.equal(composed.height, 2);
  assert.deepEqual(Array.from(composed.data.slice(0, 4)), [18, 58, 188, 255]);
});

test("can composite into base bounds for output", () => {
  const source = image(4, 3, () => [10, 20, 30, 255]);
  const overlay = image(3, 2, () => [200, 40, 50, 255]);

  const composed = compositeAligned(source, overlay, {
    offsetX: -2,
    offsetY: 1,
  }, {
    outputMode: "base",
  });

  assert.equal(composed.width, 4);
  assert.equal(composed.height, 3);
  assert.deepEqual(Array.from(composed.data.slice((1 * 4 + 0) * 4, (1 * 4 + 1) * 4)), [200, 40, 50, 255]);
});

test("can composite into overlay bounds for output", () => {
  const source = image(4, 3, () => [10, 20, 30, 255]);
  const overlay = image(3, 2, () => [200, 40, 50, 255]);

  const composed = compositeAligned(source, overlay, {
    offsetX: -2,
    offsetY: 1,
  }, {
    outputMode: "overlay",
  });

  assert.equal(composed.width, 3);
  assert.equal(composed.height, 2);
  assert.deepEqual(Array.from(composed.data.slice(0, 4)), [200, 40, 50, 255]);
});

test("supports transparent output background", () => {
  const source = image(2, 2, () => [0, 0, 0, 0]);
  const overlay = image(1, 1, () => [0, 0, 0, 0]);

  const composed = compositeAligned(source, overlay, {
    offsetX: 2,
    offsetY: 0,
  }, {
    outputMode: "union",
    transparentBackground: true,
  });

  assert.equal(composed.width, 3);
  assert.equal(composed.height, 2);
  assert.deepEqual(Array.from(composed.data.slice(0, 4)), [0, 0, 0, 0]);
});
