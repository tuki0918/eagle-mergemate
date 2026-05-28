import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAlignmentOptions,
  buildAlignmentFrameRects,
  buildCandidateStatsSummary,
  buildDefaultSettings,
  buildOutputPrecheck,
  buildProcessingLog,
  createDifferenceImage,
  createQualityMapImage,
  describeFailure,
  formatBytes,
  getPresetOptions,
  normalizeBackgroundColor,
  PRESETS,
  summarizeOverlapDifference,
} from "../src/web-utils.js";

test("buildAlignmentOptions parses positive integer and numeric fields", () => {
  const options = buildAlignmentOptions({
    tileSize: "48",
    tileStep: "12",
    sourceStep: "4",
    refineRadius: "3",
    maxOverlayTiles: "256",
    maxCandidates: "10",
    maxVerifiedCandidates: "6",
    minComparedPixels: "2048",
    ambiguityRatio: "0.91",
    cornerAnchorMode: "candidate",
    coarseToFine: "true",
    coarseMinDimension: "1200",
    coarseMaxDimension: "600",
  });

  assert.deepEqual(options, {
    tileSize: 48,
    tileStep: 12,
    sourceStep: 4,
    refineRadius: 3,
    maxOverlayTiles: 256,
    maxCandidates: 10,
    maxVerifiedCandidates: 6,
    minComparedPixels: 2048,
    ambiguityRatio: 0.91,
    cornerAnchorMode: "candidate",
    coarseToFine: true,
    coarseMinDimension: 1200,
    coarseMaxDimension: 600,
  });
});

test("buildAlignmentOptions falls back for invalid values", () => {
  const options = buildAlignmentOptions({
    tileSize: "0",
    tileStep: "-2",
    sourceStep: "bad",
    ambiguityRatio: "2",
  });

  assert.equal(options.tileSize, 32);
  assert.equal(options.tileStep, 16);
  assert.equal(options.sourceStep, 4);
  assert.equal(options.refineRadius, 1);
  assert.equal(options.ambiguityRatio, 0.98);
  assert.equal(options.cornerAnchorMode, "accept");
  assert.equal(options.coarseToFine, false);
  assert.equal(options.coarseMinDimension, 1800);
  assert.equal(options.coarseMaxDimension, 900);
});

test("normalizeBackgroundColor accepts hex colors and falls back to white", () => {
  assert.equal(normalizeBackgroundColor("#123abc"), "#123abc");
  assert.equal(normalizeBackgroundColor("123ABC"), "#123abc");
  assert.equal(normalizeBackgroundColor("bad"), "#ffffff");
});

test("createDifferenceImage highlights changed pixels", () => {
  const diff = createDifferenceImage(
    {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        10, 10, 10, 255,
        20, 20, 20, 255,
      ]),
    },
    {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        10, 10, 10, 255,
        40, 20, 20, 255,
      ]),
    },
  );

  assert.deepEqual(Array.from(diff.data.slice(0, 4)), [255, 255, 255, 255]);
  assert.deepEqual(Array.from(diff.data.slice(4, 8)), [255, 15, 15, 255]);
});

test("getPresetOptions returns known alignment presets", () => {
  assert.equal(getPresetOptions("standard").sourceStep, 4);
  assert.equal(getPresetOptions("standard").cornerAnchorMode, "accept");
  assert.equal(getPresetOptions("precise").sourceStep, 1);
  assert.equal(getPresetOptions("precise").cornerAnchorMode, "candidate");
  assert.equal(getPresetOptions("unknown").sourceStep, 4);
  assert.equal(getPresetOptions("unknown").cornerAnchorMode, "accept");
  assert.deepEqual(Object.keys(PRESETS), ["standard", "precise"]);
});

test("detection presets keep candidate verification bounded for similar images", () => {
  const verificationBudget = (preset) => preset.maxCandidates * (preset.refineRadius * 2 + 1) ** 2;

  assert.ok(verificationBudget(PRESETS.standard) <= 160);
});

test("describeFailure returns English guidance", () => {
  assert.match(describeFailure({ status: "ambiguous" }), /Too many similar areas/);
  assert.match(describeFailure({ status: "no-match", reason: "no-candidate-offsets" }), /No matching area found/);
  assert.match(describeFailure({ status: "no-match", reason: "no-verifiable-candidates" }), /Found candidates, but none matched well enough/);
  assert.match(describeFailure({ status: "no-match", reason: "not-enough-overlap" }), /Not enough overlapping area/);
  assert.match(describeFailure({ status: "no-match", reason: "match-rate-too-low" }), /Match rate is too low/);
  assert.match(describeFailure({ status: "ok" }), /succeeded/);
});

test("describeFailure suggests concrete next settings for ambiguous matches", () => {
  const message = describeFailure({ status: "ambiguous", score: 0.98, comparedPixels: 1200 });
  assert.match(message, /Too many similar areas/);
  assert.match(message, /repeating patterns/);
});

test("describeFailure suggests overlap checks for unverifiable candidates", () => {
  const message = describeFailure({ status: "no-match", reason: "no-verifiable-candidates" });
  assert.match(message, /Found candidates, but none matched well enough/);
  assert.match(message, /different crop/);
});

test("describeFailure suggests precision changes when no offset candidates are found", () => {
  const message = describeFailure({ status: "no-match", reason: "no-candidate-offsets" });
  assert.match(message, /No matching area found/);
  assert.match(message, /offset manually/);
});

test("formatBytes formats image memory sizes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(2.5 * 1024 * 1024 * 1024), "2.5 GB");
});

test("buildProcessingLog summarizes completed alignment work", () => {
  const rows = buildProcessingLog({
    workerUsed: true,
    elapsedMs: 1234,
    preset: "standard",
    outputMode: "union",
    merged: { width: 7000, height: 5000 },
    result: {
      coarseToFine: true,
      fallbackUsed: true,
      fallbackPreset: "precise",
      candidates: [{}, {}],
      matchedPixels: 1200,
      comparedPixels: 2400,
    },
  });

  assert.deepEqual(rows, [
    ["Processing", "Web Worker"],
    ["Time", "1.2s"],
    ["Preset", "standard"],
    ["Strategy", "coarse-to-fine"],
    ["Fallback", "precise"],
    ["Output", "union / 7000 x 5000 px"],
    ["Candidates", "2"],
    ["Comparison", "matched 1,200 / compared 2,400"],
  ]);
});

test("summarizeOverlapDifference compares only overlapping pixels", () => {
  const base = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      10, 10, 10, 255,
      20, 20, 20, 255,
    ]),
  };
  const overlay = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      20, 20, 20, 255,
      90, 20, 20, 255,
    ]),
  };

  assert.deepEqual(summarizeOverlapDifference(base, overlay, { offsetX: 1, offsetY: 0 }, 8), {
    overlapPixels: 1,
    comparedPixels: 1,
    mismatchPixels: 0,
    mismatchRatio: 0,
    averageDiff: 0,
    maxDiff: 0,
  });

  assert.deepEqual(summarizeOverlapDifference(base, overlay, { offsetX: 0, offsetY: 0 }, 8), {
    overlapPixels: 2,
    comparedPixels: 2,
    mismatchPixels: 2,
    mismatchRatio: 1,
    averageDiff: 40,
    maxDiff: 70,
  });
});

test("createQualityMapImage marks matching overlap green and mismatch red", () => {
  const base = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      10, 10, 10, 255,
      20, 20, 20, 255,
    ]),
  };
  const overlay = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      10, 10, 10, 255,
      90, 20, 20, 255,
    ]),
  };

  const map = createQualityMapImage(base, overlay, { offsetX: 0, offsetY: 0 });

  assert.equal(map.width, 2);
  assert.equal(map.height, 1);
  assert.deepEqual(Array.from(map.data.slice(0, 4)), [31, 135, 64, 255]);
  assert.deepEqual(Array.from(map.data.slice(4, 8)), [204, 53, 53, 255]);
});

test("buildOutputPrecheck summarizes output safety", () => {
  const rows = buildOutputPrecheck({
    image: { width: 5000, height: 5000 },
    outputMode: "union",
    transparentBackground: false,
    backgroundColor: "#ffffff",
  });

  assert.deepEqual(rows, [
    ["Output size", "5000 x 5000 px"],
    ["RGBA memory", "95.4 MB"],
    ["Output bounds", "union"],
    ["Background", "#ffffff"],
    ["Note", "Normal range"],
  ]);
});

test("buildAlignmentFrameRects returns base overlay and overlap rects in output coordinates", () => {
  const rects = buildAlignmentFrameRects({
    base: { width: 100, height: 80 },
    overlay: { width: 50, height: 40 },
    alignment: { offsetX: -10, offsetY: 20 },
    outputMode: "union",
  });

  assert.deepEqual(rects, [
    { key: "base", label: "base", x: 10, y: 0, width: 100, height: 80 },
    { key: "overlay", label: "overlay", x: 0, y: 20, width: 50, height: 40 },
    { key: "overlap", label: "overlap", x: 10, y: 20, width: 40, height: 40 },
  ]);
});

test("buildAlignmentFrameRects accounts for trimmed output offsets", () => {
  const rects = buildAlignmentFrameRects({
    base: { width: 100, height: 80 },
    overlay: { width: 50, height: 40 },
    alignment: { offsetX: -10, offsetY: 20 },
    outputMode: "union",
    trim: { changed: true, x: 10, y: 5 },
  });

  assert.deepEqual(rects[0], { key: "base", label: "base", x: 0, y: -5, width: 100, height: 80 });
  assert.deepEqual(rects[1], { key: "overlay", label: "overlay", x: -10, y: 15, width: 50, height: 40 });
  assert.deepEqual(rects[2], { key: "overlap", label: "overlap", x: 0, y: 15, width: 40, height: 40 });
});

test("buildCandidateStatsSummary formats candidate difference metrics", () => {
  assert.deepEqual(buildCandidateStatsSummary({
    score: 0.98765,
    offsetX: 12,
    offsetY: -4,
  }, {
    overlapPixels: 10000,
    comparedPixels: 8000,
    mismatchRatio: 0.1234,
    averageDiff: 4.567,
  }), {
    score: "0.988",
    offset: "x 12 / y -4",
    mismatch: "Match 87.66%",
    mismatchRate: "87.66%",
    averageDiff: "Avg diff 4.57",
    overlap: "Overlap 10,000 px",
    compared: "Compared 8,000 px",
  });

  assert.deepEqual(buildCandidateStatsSummary({ score: Number.NaN, offsetX: 0, offsetY: 0 }), {
    score: "-",
    offset: "x 0 / y 0",
    mismatch: "Match -",
    mismatchRate: "-",
    averageDiff: "Avg diff -",
    overlap: "Overlap -",
    compared: "Compared -",
  });
});

test("buildDefaultSettings returns reset values for controls", () => {
  assert.deepEqual(buildDefaultSettings(), {
    order: "a-base",
    preset: "standard",
    backgroundColor: "#ffffff",
    outputMode: "union",
    transparentBackground: true,
    previewMode: "merged",
    showFrameOverlay: false,
    overlayOpacity: "0.5",
    zoomLevel: "fit",
    tileSize: 32,
    tileStep: 16,
    sourceStep: 4,
    refineRadius: 1,
    maxOverlayTiles: 512,
    maxCandidates: 16,
    maxVerifiedCandidates: 8,
    minComparedPixels: 4096,
    ambiguityRatio: 0.98,
    cornerAnchorMode: "accept",
    coarseToFine: true,
    coarseMinDimension: 1800,
    coarseMaxDimension: 900,
  });
});
