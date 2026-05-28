const DEFAULT_OPTIONS = {
  tileSize: 32,
  tileStep: 16,
  sourceStep: 1,
  maxOverlayTiles: 512,
  maxCandidates: 16,
  maxVerifiedCandidates: 8,
  minTileVariance: 24,
  minEdgeEnergy: 8,
  minUniqueColors: 8,
  maxMaskedTileRatio: 0.2,
  minComparedPixels: 1024,
  tolerance: 0,
  ambiguityRatio: 0.98,
  cornerAnchorRatio: 0.97,
  cornerAnchorMode: "accept",
  minBestSecondGap: 0.02,
  ignoreTransparent: true,
  overlayPhaseCoverage: true,
};

export function findBestAlignment(source, overlay, options = {}) {
  const opts = normalizeOptions(options);
  validateImage(source, "source");
  validateImage(overlay, "overlay");
  validateMask(opts.ignoreMask, overlay, "ignoreMask");
  validateMask(opts.validMask, overlay, "validMask");

  emitProgress(opts, 0, "Preparing");
  const cornerCandidates = findCornerCandidates(source, overlay, opts);
  const cornerAlignment = opts.cornerAnchorMode === "accept" ? buildCornerAlignment(cornerCandidates[0]) : undefined;
  if (cornerAlignment) {
    emitProgress(opts, 1, "Alignment complete");
    return cornerAlignment;
  }

  const overlayTiles = selectOverlayTiles(overlay, opts);
  if (overlayTiles.length === 0) {
    emitProgress(opts, 1, "No comparable tiles");
    return noMatch("no-informative-tiles");
  }

  const selectedTiles = overlayTiles.slice(0, opts.maxOverlayTiles);
  const wantedHashes = new Map();
  for (const tile of selectedTiles) {
    const list = wantedHashes.get(tile.hash);
    if (list) {
      list.push(tile);
    } else {
      wantedHashes.set(tile.hash, [tile]);
    }
  }

  const votes = voteOffsets(source, selectedTiles, wantedHashes, opts);
  if (votes.size === 0) {
    emitProgress(opts, 1, "No candidates found");
    return noMatch("no-candidate-offsets");
  }

  const coarseCandidates = [...votes.values()]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, opts.maxCandidates);
  const refined = mergeVerifiedCandidates(refineCandidates(source, overlay, coarseCandidates, opts), cornerCandidates);
  if (refined.length === 0) {
    emitProgress(opts, 1, "No verifiable candidates");
    return noMatch("no-verifiable-candidates");
  }

  refined.sort(compareVerification);
  const [best, second] = refined;
  const status = classifyBest(best, second, opts);

  const output = {
    status,
    reason: status === "ok" ? undefined : status,
    offsetX: best.offsetX,
    offsetY: best.offsetY,
    score: best.score,
    exactMatchRatio: best.exactMatchRatio,
    meanAbsoluteError: best.meanAbsoluteError,
    matchedPixels: best.matchedPixels,
    mismatchedPixels: best.mismatchedPixels,
    comparedPixels: best.comparedPixels,
    candidates: refined.slice(0, opts.maxCandidates),
  };
  emitProgress(opts, 1, "Alignment complete");
  return output;
}

export function compositeAligned(base, overlay, alignment, options = {}) {
  validateImage(base, "base");
  validateImage(overlay, "overlay");
  const offsetX = Number(alignment.offsetX);
  const offsetY = Number(alignment.offsetY);
  if (!Number.isInteger(offsetX) || !Number.isInteger(offsetY)) {
    throw new TypeError("alignment.offsetX and alignment.offsetY must be integers");
  }

  const bounds = outputBounds(base, overlay, offsetX, offsetY, options.outputMode ?? "union");
  const { minX, minY, maxX, maxY } = bounds;
  const out = {
    width: maxX - minX,
    height: maxY - minY,
    data: new Uint8ClampedArray((maxX - minX) * (maxY - minY) * 4),
  };
  const ignoreTransparent = options.ignoreTransparent ?? true;
  const background = options.transparentBackground
    ? [0, 0, 0, 0]
    : parseBackgroundColor(options.backgroundColor ?? "#ffffff");

  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = background[0];
    out.data[i + 1] = background[1];
    out.data[i + 2] = background[2];
    out.data[i + 3] = background[3];
  }

  drawImageOver(out, base, -minX, -minY, { ignoreTransparent });
  drawImageOver(out, overlay, offsetX - minX, offsetY - minY, { ignoreTransparent });

  return out;
}

function outputBounds(base, overlay, offsetX, offsetY, mode) {
  if (mode === "base") {
    return {
      minX: 0,
      minY: 0,
      maxX: base.width,
      maxY: base.height,
    };
  }
  if (mode === "overlay") {
    return {
      minX: offsetX,
      minY: offsetY,
      maxX: offsetX + overlay.width,
      maxY: offsetY + overlay.height,
    };
  }
  if (mode !== "union") {
    throw new TypeError("outputMode must be one of: union, base, overlay");
  }
  return {
    minX: Math.min(0, offsetX),
    minY: Math.min(0, offsetY),
    maxX: Math.max(base.width, offsetX + overlay.width),
    maxY: Math.max(base.height, offsetY + overlay.height),
  };
}

function drawImageOver(out, image, offsetX, offsetY, options) {
  for (let y = 0; y < image.height; y += 1) {
    const oy = offsetY + y;
    if (oy < 0 || oy >= out.height) continue;
    for (let x = 0; x < image.width; x += 1) {
      const ox = offsetX + x;
      if (ox < 0 || ox >= out.width) continue;
      const si = (y * image.width + x) * 4;
      const alpha = image.data[si + 3];
      if (options.ignoreTransparent && alpha === 0) continue;
      const di = (oy * out.width + ox) * 4;
      alphaCompositePixel(out.data, di, image.data, si);
    }
  }
}

function alphaCompositePixel(dest, di, src, si) {
  const srcA = src[si + 3] / 255;
  if (srcA >= 1) {
    dest[di] = src[si];
    dest[di + 1] = src[si + 1];
    dest[di + 2] = src[si + 2];
    dest[di + 3] = src[si + 3];
    return;
  }
  if (srcA <= 0) return;

  const dstA = dest[di + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  dest[di] = Math.round((src[si] * srcA + dest[di] * dstA * (1 - srcA)) / outA);
  dest[di + 1] = Math.round((src[si + 1] * srcA + dest[di + 1] * dstA * (1 - srcA)) / outA);
  dest[di + 2] = Math.round((src[si + 2] * srcA + dest[di + 2] * dstA * (1 - srcA)) / outA);
  dest[di + 3] = Math.round(outA * 255);
}

function parseBackgroundColor(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length < 3) {
      throw new TypeError("backgroundColor array must contain at least RGB values");
    }
    return [
      clampByte(value[0]),
      clampByte(value[1]),
      clampByte(value[2]),
      clampByte(value.length > 3 ? value[3] : 255),
    ];
  }

  const match = String(value).trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) {
    throw new TypeError("backgroundColor must be a #rrggbb color or RGBA array");
  }
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    255,
  ];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function normalizeOptions(options) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  for (const key of [
    "tileSize",
    "tileStep",
    "sourceStep",
    "maxOverlayTiles",
    "maxCandidates",
    "maxVerifiedCandidates",
    "minComparedPixels",
  ]) {
    if (!Number.isInteger(opts[key]) || opts[key] < 1) {
      throw new TypeError(`${key} must be a positive integer`);
    }
  }
  if (opts.ignoreMask && opts.validMask) {
    throw new TypeError("Use either ignoreMask or validMask, not both");
  }
  opts.refineRadius = options.refineRadius ?? Math.max(0, opts.sourceStep - 1);
  if (!Number.isInteger(opts.refineRadius) || opts.refineRadius < 0) {
    throw new TypeError("refineRadius must be a non-negative integer");
  }
  if (!Number.isFinite(opts.cornerAnchorRatio) || opts.cornerAnchorRatio < 0 || opts.cornerAnchorRatio > 1) {
    throw new TypeError("cornerAnchorRatio must be a ratio between 0 and 1");
  }
  if (!["accept", "candidate", "off"].includes(opts.cornerAnchorMode)) {
    throw new TypeError("cornerAnchorMode must be one of: accept, candidate, off");
  }
  return opts;
}

function findCornerCandidates(source, overlay, opts) {
  if (opts.cornerAnchorMode === "off") return [];
  const cornerOffsets = uniqueOffsets([
    [0, 0],
    [source.width - overlay.width, 0],
    [0, source.height - overlay.height],
    [source.width - overlay.width, source.height - overlay.height],
  ]);
  const candidates = cornerOffsets
    .map(([offsetX, offsetY]) => verifyOffset(source, overlay, offsetX, offsetY, 0, opts))
    .filter((candidate) => (
      candidate.comparedPixels >= opts.minComparedPixels
      && candidate.exactMatchRatio >= opts.cornerAnchorRatio
    ))
    .sort(compareVerification);
  return candidates;
}

function buildCornerAlignment(candidate) {
  if (!candidate) return undefined;
  return {
    status: "ok",
    reason: undefined,
    offsetX: candidate.offsetX,
    offsetY: candidate.offsetY,
    score: candidate.score,
    exactMatchRatio: candidate.exactMatchRatio,
    meanAbsoluteError: candidate.meanAbsoluteError,
    matchedPixels: candidate.matchedPixels,
    mismatchedPixels: candidate.mismatchedPixels,
    comparedPixels: candidate.comparedPixels,
    candidates: [candidate],
  };
}

function uniqueOffsets(offsets) {
  const seen = new Set();
  const unique = [];
  for (const [offsetX, offsetY] of offsets) {
    const key = `${offsetX},${offsetY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push([offsetX, offsetY]);
  }
  return unique;
}

function mergeVerifiedCandidates(primary, extra) {
  if (extra.length === 0) return primary;
  const byOffset = new Map();
  for (const candidate of [...primary, ...extra]) {
    const key = `${candidate.offsetX},${candidate.offsetY}`;
    const existing = byOffset.get(key);
    if (!existing || compareVerification(candidate, existing) < 0) {
      byOffset.set(key, candidate);
    }
  }
  return [...byOffset.values()].sort(compareVerification);
}

function validateImage(image, name) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)) {
    throw new TypeError(`${name} must include integer width and height`);
  }
  if (image.width < 1 || image.height < 1) {
    throw new TypeError(`${name} width and height must be positive`);
  }
  if (!image.data || image.data.length !== image.width * image.height * 4) {
    throw new TypeError(`${name}.data must contain width * height * 4 RGBA values`);
  }
}

function validateMask(mask, image, name) {
  if (!mask) return;
  if (mask.length !== image.width * image.height) {
    throw new TypeError(`${name} must contain width * height values`);
  }
}

function selectOverlayTiles(overlay, opts) {
  const tiles = [];
  if (overlay.width < opts.tileSize || overlay.height < opts.tileSize) {
    return tiles;
  }

  const phaseCount = opts.overlayPhaseCoverage ? Math.max(1, opts.sourceStep) : 1;
  const phasedTileStep = opts.tileStep * phaseCount;
  let completedRows = 0;
  const rowsPerPhase = Math.max(0, Math.floor((overlay.height - opts.tileSize) / phasedTileStep) + 1);
  const totalRows = Math.max(1, rowsPerPhase * phaseCount * phaseCount);

  for (let yPhase = 0; yPhase < phaseCount; yPhase += 1) {
    for (let xPhase = 0; xPhase < phaseCount; xPhase += 1) {
      for (let y = yPhase; y <= overlay.height - opts.tileSize; y += phasedTileStep) {
        for (let x = xPhase; x <= overlay.width - opts.tileSize; x += phasedTileStep) {
          const metrics = tileMetrics(overlay, x, y, opts);
          if (!metrics.usable) continue;
          if (
            metrics.variance < opts.minTileVariance ||
            metrics.edgeEnergy < opts.minEdgeEnergy ||
            metrics.uniqueColors < opts.minUniqueColors
          ) {
            continue;
          }
          tiles.push({
            x,
            y,
            hash: hashTile(overlay, x, y, opts),
            infoScore: metrics.variance + metrics.edgeEnergy + metrics.uniqueColors * 4,
          });
        }
        completedRows += 1;
        if (completedRows % 8 === 0 || completedRows === totalRows) {
          emitProgress(opts, mapProgress(completedRows / totalRows, 0.02, 0.22), "Selecting feature tiles");
        }
      }
    }
  }

  tiles.sort((a, b) => b.infoScore - a.infoScore);
  return tiles;
}

function tileMetrics(image, x0, y0, opts) {
  let count = 0;
  let invalid = 0;
  let sum = 0;
  let sumSq = 0;
  let edge = 0;
  const unique = new Set();

  for (let y = 0; y < opts.tileSize; y += 1) {
    for (let x = 0; x < opts.tileSize; x += 1) {
      const px = x0 + x;
      const py = y0 + y;
      if (!isOverlayPixelComparable(image, px, py, opts)) {
        invalid += 1;
        continue;
      }
      const i = (py * image.width + px) * 4;
      const lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
      sum += lum;
      sumSq += lum * lum;
      count += 1;
      unique.add(((image.data[i] >> 4) << 8) | ((image.data[i + 1] >> 4) << 4) | (image.data[i + 2] >> 4));
      if (x > 0) {
        const left = i - 4;
        edge += Math.abs(lum - luminance(image.data[left], image.data[left + 1], image.data[left + 2]));
      }
      if (y > 0) {
        const up = i - image.width * 4;
        edge += Math.abs(lum - luminance(image.data[up], image.data[up + 1], image.data[up + 2]));
      }
    }
  }

  const total = opts.tileSize * opts.tileSize;
  if (count === 0 || invalid / total > opts.maxMaskedTileRatio) {
    return { usable: false };
  }
  const mean = sum / count;
  return {
    usable: true,
    variance: sumSq / count - mean * mean,
    edgeEnergy: edge / count,
    uniqueColors: unique.size,
  };
}

function voteOffsets(source, selectedTiles, wantedHashes, opts) {
  const votes = new Map();
  if (source.width < opts.tileSize || source.height < opts.tileSize) {
    return votes;
  }

  const totalRows = Math.max(1, Math.floor((source.height - opts.tileSize) / opts.sourceStep) + 1);
  let row = 0;
  for (let y = 0; y <= source.height - opts.tileSize; y += opts.sourceStep) {
    for (let x = 0; x <= source.width - opts.tileSize; x += opts.sourceStep) {
      const hash = hashTile(source, x, y, opts);
      const matches = wantedHashes.get(hash);
      if (!matches) continue;
      for (const tile of matches) {
        const offsetX = x - tile.x;
        const offsetY = y - tile.y;
        const key = `${offsetX},${offsetY}`;
        const vote = votes.get(key) ?? { offsetX, offsetY, votes: 0 };
        vote.votes += 1;
        votes.set(key, vote);
      }
    }
    row += 1;
    if (row % 16 === 0 || row === totalRows) {
      emitProgress(opts, mapProgress(row / totalRows, 0.22, 0.72), "Searching candidate offsets");
    }
  }
  return votes;
}

function refineCandidates(source, overlay, candidates, opts) {
  const bestByOffset = new Map();
  const checksPerCandidate = (opts.refineRadius * 2 + 1) ** 2;
  const totalChecks = Math.max(1, candidates.length * checksPerCandidate);
  let completedChecks = 0;
  for (const candidate of candidates) {
    for (let dy = -opts.refineRadius; dy <= opts.refineRadius; dy += 1) {
      for (let dx = -opts.refineRadius; dx <= opts.refineRadius; dx += 1) {
        const offsetX = candidate.offsetX + dx;
        const offsetY = candidate.offsetY + dy;
        const key = `${offsetX},${offsetY}`;
        if (!bestByOffset.has(key)) {
          bestByOffset.set(key, verifyOffset(source, overlay, offsetX, offsetY, candidate.votes, opts));
        }
        completedChecks += 1;
        if (completedChecks % 8 === 0 || completedChecks === totalChecks) {
          emitProgress(opts, mapProgress(completedChecks / totalChecks, 0.72, 0.98), "Verifying candidates");
        }
      }
    }
  }
  return [...bestByOffset.values()]
    .filter((candidate) => candidate.comparedPixels > 0)
    .sort(compareVerification)
    .slice(0, opts.maxVerifiedCandidates);
}

function verifyOffset(source, overlay, offsetX, offsetY, votes, opts) {
  let comparedPixels = 0;
  let matchedPixels = 0;
  let mismatchedPixels = 0;
  let absoluteError = 0;

  for (let y = 0; y < overlay.height; y += 1) {
    const sy = offsetY + y;
    if (sy < 0 || sy >= source.height) continue;
    for (let x = 0; x < overlay.width; x += 1) {
      const sx = offsetX + x;
      if (sx < 0 || sx >= source.width) continue;
      if (!isOverlayPixelComparable(overlay, x, y, opts)) continue;
      const oi = (y * overlay.width + x) * 4;
      const si = (sy * source.width + sx) * 4;
      const dr = Math.abs(source.data[si] - overlay.data[oi]);
      const dg = Math.abs(source.data[si + 1] - overlay.data[oi + 1]);
      const db = Math.abs(source.data[si + 2] - overlay.data[oi + 2]);
      const da = Math.abs(source.data[si + 3] - overlay.data[oi + 3]);
      const pixelError = dr + dg + db + da;
      absoluteError += pixelError;
      comparedPixels += 1;
      if (dr <= opts.tolerance && dg <= opts.tolerance && db <= opts.tolerance && da <= opts.tolerance) {
        matchedPixels += 1;
      } else {
        mismatchedPixels += 1;
      }
    }
  }

  const exactMatchRatio = comparedPixels === 0 ? 0 : matchedPixels / comparedPixels;
  const meanAbsoluteError = comparedPixels === 0 ? Number.POSITIVE_INFINITY : absoluteError / (comparedPixels * 4);
  const score = exactMatchRatio - Math.min(0.5, meanAbsoluteError / 510);
  return {
    offsetX,
    offsetY,
    votes,
    score,
    exactMatchRatio,
    meanAbsoluteError,
    matchedPixels,
    mismatchedPixels,
    comparedPixels,
  };
}

function classifyBest(best, second, opts) {
  if (best.comparedPixels < opts.minComparedPixels) {
    return "no-match";
  }
  if (best.exactMatchRatio <= 0) {
    return "no-match";
  }
  if (!second) {
    return "ok";
  }
  const ratioClose = second.score >= best.score * opts.ambiguityRatio;
  const gapClose = best.score - second.score < opts.minBestSecondGap;
  if (ratioClose || gapClose) {
    return "ambiguous";
  }
  return "ok";
}

function compareVerification(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.comparedPixels !== a.comparedPixels) return b.comparedPixels - a.comparedPixels;
  return b.votes - a.votes;
}

function isOverlayPixelComparable(image, x, y, opts) {
  const p = y * image.width + x;
  if (opts.ignoreTransparent && image.data[p * 4 + 3] === 0) return false;
  if (opts.ignoreMask && opts.ignoreMask[p] !== 0) return false;
  if (opts.validMask && opts.validMask[p] === 0) return false;
  return true;
}

function hashTile(image, x0, y0, opts) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(opts.tileSize / 4));
  for (let y = 0; y < opts.tileSize; y += step) {
    for (let x = 0; x < opts.tileSize; x += step) {
      const i = ((y0 + y) * image.width + (x0 + x)) * 4;
      hash = fnv(hash, image.data[i]);
      hash = fnv(hash, image.data[i + 1]);
      hash = fnv(hash, image.data[i + 2]);
      hash = fnv(hash, image.data[i + 3]);
    }
  }
  return hash >>> 0;
}

function fnv(hash, value) {
  hash ^= value;
  return Math.imul(hash, 16777619) >>> 0;
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mapProgress(value, start, end) {
  return start + Math.max(0, Math.min(1, value)) * (end - start);
}

function emitProgress(opts, progress, phase) {
  if (typeof opts.onProgress !== "function") return;
  opts.onProgress({
    progress: Math.max(0, Math.min(1, progress)),
    phase,
  });
}

function noMatch(reason) {
  return {
    status: "no-match",
    reason,
    offsetX: undefined,
    offsetY: undefined,
    score: 0,
    matchedPixels: 0,
    mismatchedPixels: 0,
    comparedPixels: 0,
    candidates: [],
  };
}
