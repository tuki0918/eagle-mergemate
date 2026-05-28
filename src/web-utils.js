export const DEFAULT_WEB_OPTIONS = {
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
};

export const PRESETS = {
  standard: DEFAULT_WEB_OPTIONS,
  precise: {
    tileSize: 24,
    tileStep: 8,
    sourceStep: 1,
    refineRadius: 0,
    maxOverlayTiles: 1024,
    maxCandidates: 24,
    maxVerifiedCandidates: 12,
    minComparedPixels: 8192,
    ambiguityRatio: 0.99,
    cornerAnchorMode: "candidate",
  },
};

const INTEGER_FIELDS = [
  "tileSize",
  "tileStep",
  "sourceStep",
  "refineRadius",
  "maxOverlayTiles",
  "maxCandidates",
  "maxVerifiedCandidates",
  "minComparedPixels",
  "coarseMinDimension",
  "coarseMaxDimension",
];

export function buildAlignmentOptions(values = {}) {
  const options = {};
  for (const field of INTEGER_FIELDS) {
    options[field] = parsePositiveInteger(values[field], DEFAULT_WEB_OPTIONS[field]);
  }
  options.refineRadius = parseNonNegativeInteger(values.refineRadius, DEFAULT_WEB_OPTIONS.refineRadius);
  options.ambiguityRatio = parseRatio(values.ambiguityRatio, DEFAULT_WEB_OPTIONS.ambiguityRatio);
  options.cornerAnchorMode = parseCornerAnchorMode(values.cornerAnchorMode, DEFAULT_WEB_OPTIONS.cornerAnchorMode);
  options.coarseToFine = values.coarseToFine === true || values.coarseToFine === "true";
  return options;
}

export function buildCandidateStatsSummary(candidate = {}, stats) {
  const matchRatio = Number.isFinite(stats?.mismatchRatio) ? 1 - stats.mismatchRatio : undefined;
  return {
    score: formatNumber(candidate.score, 3),
    offset: `x ${candidate.offsetX ?? "-"} / y ${candidate.offsetY ?? "-"}`,
    mismatch: `Match ${formatPercent(matchRatio)}`,
    mismatchRate: formatPercent(matchRatio),
    averageDiff: `Avg diff ${formatNumber(stats?.averageDiff, 2)}`,
    overlap: `Overlap ${formatPixelCount(stats?.overlapPixels)}`,
    compared: `Compared ${formatPixelCount(stats?.comparedPixels)}`,
  };
}

export function buildDefaultSettings() {
  return {
    order: "a-base",
    preset: "standard",
    backgroundColor: "#ffffff",
    outputMode: "union",
    transparentBackground: true,
    previewMode: "merged",
    showFrameOverlay: false,
    overlayOpacity: "0.5",
    zoomLevel: "fit",
    ...DEFAULT_WEB_OPTIONS,
  };
}

export function buildAlignmentFrameRects({ base, overlay, alignment, outputMode = "union", trim } = {}) {
  if (!base || !overlay || !alignment) {
    throw new TypeError("base, overlay, and alignment are required");
  }
  const bounds = getOutputBounds(base, overlay, alignment, outputMode);
  const trimX = trim?.changed ? Number(trim.x) || 0 : 0;
  const trimY = trim?.changed ? Number(trim.y) || 0 : 0;
  const originX = bounds.minX + trimX;
  const originY = bounds.minY + trimY;
  const rects = [
    {
      key: "base",
      label: "base",
      x: normalizeZero(-originX),
      y: normalizeZero(-originY),
      width: base.width,
      height: base.height,
    },
    {
      key: "overlay",
      label: "overlay",
      x: normalizeZero(alignment.offsetX - originX),
      y: normalizeZero(alignment.offsetY - originY),
      width: overlay.width,
      height: overlay.height,
    },
  ];

  const overlapMinX = Math.max(0, alignment.offsetX);
  const overlapMinY = Math.max(0, alignment.offsetY);
  const overlapMaxX = Math.min(base.width, alignment.offsetX + overlay.width);
  const overlapMaxY = Math.min(base.height, alignment.offsetY + overlay.height);
  if (overlapMaxX > overlapMinX && overlapMaxY > overlapMinY) {
    rects.push({
      key: "overlap",
      label: "overlap",
      x: normalizeZero(overlapMinX - originX),
      y: normalizeZero(overlapMinY - originY),
      width: overlapMaxX - overlapMinX,
      height: overlapMaxY - overlapMinY,
    });
  }
  return rects;
}

export function normalizeBackgroundColor(value) {
  const match = String(value ?? "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : "#ffffff";
}

export function getPresetOptions(name) {
  return { ...(PRESETS[name] ?? PRESETS.standard) };
}

export function describeFailure(result) {
  if (!result || result.status === "ok") {
    return "Alignment succeeded. Check candidates or manual offset if you need to verify the placement.";
  }
  if (result.status === "ambiguous") {
    return "Too many similar areas. The images may contain repeating patterns or large flat regions. Try Precise, choose a more distinctive image pair, or adjust the offset manually.";
  }
  if (result.reason === "no-informative-tiles") {
    return "No matching area found. The images may not share a distinctive visible area. Try Precise, use images with more detail, or adjust the offset manually.";
  }
  if (result.reason === "no-candidate-offsets") {
    return "No matching area found. The images may not share a distinctive visible area. Try Precise, use images with more detail, or adjust the offset manually.";
  }
  if (result.reason === "no-verifiable-candidates") {
    return "Found candidates, but none matched well enough. The images may use a different crop, include edits, or contain compression differences. Try Precise or adjust the offset manually.";
  }
  if (result.reason === "not-enough-overlap") {
    return "Not enough overlapping area. The images do not appear to share enough of the same visible region. Try images with a larger shared region or adjust the offset manually.";
  }
  if (result.reason === "match-rate-too-low") {
    return "Match rate is too low. The images do not appear to share a reliable visible area. Try Precise, choose a more similar image pair, or adjust the offset manually.";
  }
  if (result.status === "no-match") {
    return "No matching area found. The images may not share enough distinctive detail. Try Precise or adjust the offset manually.";
  }
  return "Could not finalize a result. Change the settings and run alignment again.";
}

export function createDifferenceImage(base, overlay) {
  if (!base || !overlay || base.width !== overlay.width || base.height !== overlay.height) {
    throw new TypeError("base and overlay must have the same width and height");
  }
  const data = new Uint8ClampedArray(base.width * base.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const diff = Math.max(
      Math.abs(base.data[i] - overlay.data[i]),
      Math.abs(base.data[i + 1] - overlay.data[i + 1]),
      Math.abs(base.data[i + 2] - overlay.data[i + 2]),
      Math.abs(base.data[i + 3] - overlay.data[i + 3]),
    );
    if (diff === 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    } else {
      data[i] = 255;
      data[i + 1] = Math.max(0, 255 - diff * 12);
      data[i + 2] = Math.max(0, 255 - diff * 12);
      data[i + 3] = 255;
    }
  }
  return {
    width: base.width,
    height: base.height,
    data,
  };
}

export function summarizeOverlapDifference(base, overlay, alignment, mismatchThreshold = 8) {
  validateImagePairForAlignment(base, overlay, alignment);
  const threshold = Math.max(0, Number(mismatchThreshold) || 0);
  let overlapPixels = 0;
  let comparedPixels = 0;
  let mismatchPixels = 0;
  let totalDiff = 0;
  let maxDiff = 0;

  forEachOverlapPixel(base, overlay, alignment, (baseIndex, overlayIndex) => {
    overlapPixels += 1;
    const baseAlpha = base.data[baseIndex + 3];
    const overlayAlpha = overlay.data[overlayIndex + 3];
    if (baseAlpha === 0 || overlayAlpha === 0) return;

    const diff = pixelDiff(base.data, baseIndex, overlay.data, overlayIndex);
    comparedPixels += 1;
    totalDiff += diff;
    maxDiff = Math.max(maxDiff, diff);
    if (diff > threshold) mismatchPixels += 1;
  });

  return {
    overlapPixels,
    comparedPixels,
    mismatchPixels,
    mismatchRatio: comparedPixels > 0 ? mismatchPixels / comparedPixels : 0,
    averageDiff: comparedPixels > 0 ? totalDiff / comparedPixels : 0,
    maxDiff,
  };
}

export function createQualityMapImage(base, overlay, alignment) {
  validateImagePairForAlignment(base, overlay, alignment);
  const bounds = getUnionBounds(base, overlay, alignment);
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  data.fill(255);

  forEachOverlapPixel(base, overlay, alignment, (baseIndex, overlayIndex, baseX, baseY) => {
    const outX = baseX - bounds.minX;
    const outY = baseY - bounds.minY;
    const outIndex = (outY * bounds.width + outX) * 4;
    const baseAlpha = base.data[baseIndex + 3];
    const overlayAlpha = overlay.data[overlayIndex + 3];
    if (baseAlpha === 0 || overlayAlpha === 0) {
      data[outIndex] = 180;
      data[outIndex + 1] = 187;
      data[outIndex + 2] = 196;
      data[outIndex + 3] = 255;
      return;
    }

    const diff = pixelDiff(base.data, baseIndex, overlay.data, overlayIndex);
    if (diff <= 8) {
      data[outIndex] = 31;
      data[outIndex + 1] = 135;
      data[outIndex + 2] = 64;
    } else if (diff <= 32) {
      data[outIndex] = 235;
      data[outIndex + 1] = 176;
      data[outIndex + 2] = 54;
    } else {
      data[outIndex] = 204;
      data[outIndex + 1] = 53;
      data[outIndex + 2] = 53;
    }
    data[outIndex + 3] = 255;
  });

  return {
    width: bounds.width,
    height: bounds.height,
    data,
  };
}

export function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ["KB", "MB", "GB"];
  let scaled = value / 1024;
  for (const unit of units) {
    if (scaled < 1024 || unit === units[units.length - 1]) {
      return `${scaled.toFixed(1)} ${unit}`;
    }
    scaled /= 1024;
  }
  return "-";
}

export function buildProcessingLog({ workerUsed, elapsedMs, preset, outputMode, merged, result } = {}) {
  const width = Number(merged?.width) || 0;
  const height = Number(merged?.height) || 0;
  const rows = [
    ["Processing", workerUsed ? "Web Worker" : "main thread"],
    ["Time", formatElapsedMs(elapsedMs)],
    ["Preset", String(preset || "-")],
  ];
  if (result?.coarseToFine) rows.push(["Strategy", "coarse-to-fine"]);
  if (result?.fallbackUsed) rows.push(["Fallback", String(result.fallbackPreset || "precise")]);
  rows.push(
    ["Output", `${String(outputMode || "-")} / ${width} x ${height} px`],
    ["Candidates", String(result?.candidates?.length ?? 0)],
    [
      "Comparison",
      `matched ${Number(result?.matchedPixels ?? 0).toLocaleString()} / compared ${Number(result?.comparedPixels ?? 0).toLocaleString()}`,
    ],
  );
  return rows;
}

export function buildOutputPrecheck({ image, outputMode, transparentBackground, backgroundColor } = {}) {
  const width = Number(image?.width) || 0;
  const height = Number(image?.height) || 0;
  const pixels = width * height;
  const memoryBytes = pixels * 4;
  return [
    ["Output size", `${width} x ${height} px`],
    ["RGBA memory", formatBytes(memoryBytes)],
    ["Output bounds", String(outputMode || "-")],
    ["Background", transparentBackground ? "transparent" : normalizeBackgroundColor(backgroundColor)],
    ["Note", outputWarning(memoryBytes, pixels)],
  ];
}

function outputWarning(memoryBytes, pixels) {
  if (memoryBytes >= 512 * 1024 * 1024 || pixels >= 120_000_000) {
    return "Large output. PNG generation may run out of memory";
  }
  if (memoryBytes >= 256 * 1024 * 1024 || pixels >= 60_000_000) {
    return "Somewhat large output";
  }
  return "Normal range";
}

function formatElapsedMs(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function validateImagePairForAlignment(base, overlay, alignment) {
  for (const [name, image] of [["base", base], ["overlay", overlay]]) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)) {
      throw new TypeError(`${name} image must include width and height`);
    }
    if (!image.data || image.data.length !== image.width * image.height * 4) {
      throw new TypeError(`${name} image data must contain width * height * 4 RGBA values`);
    }
  }
  if (!alignment || !Number.isInteger(alignment.offsetX) || !Number.isInteger(alignment.offsetY)) {
    throw new TypeError("alignment must include integer offsetX and offsetY");
  }
}

function getOutputBounds(base, overlay, alignment, outputMode) {
  if (outputMode === "base") {
    return { minX: 0, minY: 0 };
  }
  if (outputMode === "overlay") {
    return { minX: alignment.offsetX, minY: alignment.offsetY };
  }
  return {
    minX: Math.min(0, alignment.offsetX),
    minY: Math.min(0, alignment.offsetY),
  };
}

function getUnionBounds(base, overlay, alignment) {
  const minX = Math.min(0, alignment.offsetX);
  const minY = Math.min(0, alignment.offsetY);
  const maxX = Math.max(base.width, alignment.offsetX + overlay.width);
  const maxY = Math.max(base.height, alignment.offsetY + overlay.height);
  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function forEachOverlapPixel(base, overlay, alignment, callback) {
  const startX = Math.max(0, alignment.offsetX);
  const startY = Math.max(0, alignment.offsetY);
  const endX = Math.min(base.width, alignment.offsetX + overlay.width);
  const endY = Math.min(base.height, alignment.offsetY + overlay.height);
  for (let baseY = startY; baseY < endY; baseY += 1) {
    const overlayY = baseY - alignment.offsetY;
    for (let baseX = startX; baseX < endX; baseX += 1) {
      const overlayX = baseX - alignment.offsetX;
      const baseIndex = (baseY * base.width + baseX) * 4;
      const overlayIndex = (overlayY * overlay.width + overlayX) * 4;
      callback(baseIndex, overlayIndex, baseX, baseY, overlayX, overlayY);
    }
  }
}

function pixelDiff(baseData, baseIndex, overlayData, overlayIndex) {
  return Math.max(
    Math.abs(baseData[baseIndex] - overlayData[overlayIndex]),
    Math.abs(baseData[baseIndex + 1] - overlayData[overlayIndex + 1]),
    Math.abs(baseData[baseIndex + 2] - overlayData[overlayIndex + 2]),
    Math.abs(baseData[baseIndex + 3] - overlayData[overlayIndex + 3]),
  );
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCornerAnchorMode(value, fallback) {
  return ["accept", "candidate", "off"].includes(value) ? value : fallback;
}

function formatPercent(ratio) {
  if (!Number.isFinite(ratio)) return "-";
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatPixelCount(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Number(value).toLocaleString()} px`;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRatio(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : fallback;
}
