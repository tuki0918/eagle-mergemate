import { compositeAligned, findBestAlignment } from "../src/index.js";
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
  formatNumber,
  getPresetOptions,
  normalizeBackgroundColor,
  summarizeOverlapDifference,
} from "../src/web-utils.js";

const MAX_IMAGE_FILE_BYTES = 100 * 1024 * 1024;
const DEFAULT_DOWNLOAD_PLUGIN_NAME = "MergeMate";
let downloadPluginName = DEFAULT_DOWNLOAD_PLUGIN_NAME;

const els = {
  workspace: document.querySelector(".workspace"),
  windowCloseButton: document.querySelector("#windowCloseButton"),
  inputProgress: document.querySelector("#inputProgress"),
  backToInputButton: document.querySelector("#backToInputButton"),
  imageA: document.querySelector("#imageA"),
  imageB: document.querySelector("#imageB"),
  imageACard: document.querySelector("#imageACard"),
  imageBCard: document.querySelector("#imageBCard"),
  imageAName: document.querySelector("#imageAName"),
  imageASize: document.querySelector("#imageASize"),
  imageBName: document.querySelector("#imageBName"),
  imageBSize: document.querySelector("#imageBSize"),
  clearImageA: document.querySelector("#clearImageA"),
  clearImageB: document.querySelector("#clearImageB"),
  order: document.querySelector("#order"),
  preset: document.querySelector("#preset"),
  presetDisplayIcon: document.querySelector("#presetDisplayIcon"),
  presetDisplayName: document.querySelector("#presetDisplayName"),
  presetDisplayDescription: document.querySelector("#presetDisplayDescription"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  runButton: document.querySelector("#runButton"),
  cancelButton: document.querySelector("#cancelButton"),
  status: document.querySelector("#status"),
  downloadLink: document.querySelector("#downloadLink"),
  candidateList: document.querySelector("#candidateList"),
  candidatePreviewStatus: document.querySelector("#candidatePreviewStatus"),
  detailsDrawer: document.querySelector("#detailsDrawer"),
  detailsDrawerToggle: document.querySelector("#detailsDrawerToggle"),
  detailsDrawerClose: document.querySelector("#detailsDrawerClose"),
  previewCancelButton: document.querySelector("#previewCancelButton"),
  stackOrderSwitch: document.querySelector(".stack-order-switch"),
  stackOrderButtons: document.querySelectorAll("[data-stack-top]"),
  manualOffsetHelp: document.querySelector("#manualOffsetHelp"),
  manualOffsetControls: document.querySelector("#manualOffsetControls"),
  previewFrame: document.querySelector(".merged-preview"),
  baseCanvas: document.querySelector("#baseCanvas"),
  overlayCanvas: document.querySelector("#overlayCanvas"),
  mergedCanvas: document.querySelector("#mergedCanvas"),
  metricOffsetX: document.querySelector("#metricOffsetX"),
  metricOffsetY: document.querySelector("#metricOffsetY"),
  metricScore: document.querySelector("#metricScore"),
  backgroundColor: document.querySelector("#backgroundColor"),
  outputMode: document.querySelector("#outputMode"),
  transparentBackground: document.querySelector("#transparentBackground"),
  backgroundOptions: document.querySelectorAll("[data-background-choice]"),
  manualOffsetX: document.querySelector("#manualOffsetX"),
  manualOffsetY: document.querySelector("#manualOffsetY"),
  previewMode: document.querySelector("#previewMode"),
  showFrameOverlay: document.querySelector("#showFrameOverlay"),
  overlayOpacityControl: document.querySelector("#overlayOpacityControl"),
  overlayOpacity: document.querySelector("#overlayOpacity"),
  overlayOpacityValue: document.querySelector("#overlayOpacityValue"),
  zoomLevel: document.querySelector("#zoomLevel"),
  zoomValue: document.querySelector("#zoomValue"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomFitButton: document.querySelector("#zoomFitButton"),
  zoomActualButton: document.querySelector("#zoomActualButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  nudgeUp: document.querySelector("#nudgeUp"),
  nudgeLeft: document.querySelector("#nudgeLeft"),
  nudgeRight: document.querySelector("#nudgeRight"),
  nudgeDown: document.querySelector("#nudgeDown"),
};

const optionIds = [
  "tileSize",
  "tileStep",
  "sourceStep",
  "refineRadius",
  "maxOverlayTiles",
  "maxCandidates",
  "maxVerifiedCandidates",
  "minComparedPixels",
  "ambiguityRatio",
];

const settingElementIds = [
  "order",
  "preset",
  "backgroundColor",
  "outputMode",
  "transparentBackground",
  "previewMode",
  "showFrameOverlay",
  "overlayOpacity",
  ...optionIds,
];

let lastDownloadUrl;
let workerAvailable = true;
let progressStartedAt = 0;
let currentBase;
let currentOverlay;
let currentMerged;
let currentAlignment;
let currentResult;
let currentWorkerUsed;
let currentElapsedMs;
let currentWorker;
let currentCancel;
let latestCandidates = [];
let appliedCandidateIndex;
let stackTop = "B";
let selectedImageA;
let selectedImageB;
let selectedImageAKey;
let selectedImageBKey;
let selectedImageAInfo;
let selectedImageBInfo;
let previewReadToken = 0;
let lastAppliedZoom = 1;
let panX = 0;
let panY = 0;
let panPointerId;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;
let customZoom = 1;
let customBackgroundColorChosen = false;

const DEFAULT_ZOOM_LEVEL = "fit";
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 8;
const WHEEL_ZOOM_SENSITIVITY = 0.0025;
const WHEEL_PAN_DELTA_RATIO = 1.35;
const ZOOM_STEPS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8];
const PREVIEW_CONTROL_SELECTOR = ".preview-view-menu, .zoom-dock, .overlay-opacity-control, .stack-order-switch";

els.runButton.addEventListener("click", async () => {
  await runAlignment();
});

setupEagleWindowControls();
initSegmentedControls();

els.backToInputButton?.addEventListener("click", () => {
  setAppView("input");
});

els.cancelButton.addEventListener("click", () => {
  cancelAlignment();
});

els.imageA.addEventListener("change", () => {
  readSelectedImagesForPreview();
});

els.imageB.addEventListener("change", () => {
  readSelectedImagesForPreview();
});

els.clearImageA.addEventListener("click", () => {
  clearSelectedImage("a");
});

els.clearImageB.addEventListener("click", () => {
  clearSelectedImage("b");
});

setupDropZone(els.imageACard, els.imageA);
setupDropZone(els.imageBCard, els.imageB);

els.preset.addEventListener("change", () => {
  applyPreset(els.preset.value);
  updatePresetDisplay();
});

els.resetSettingsButton?.addEventListener("click", () => {
  resetSettingsToDefault();
});

els.manualOffsetX.addEventListener("input", applyManualOffsetFromInputs);
els.manualOffsetY.addEventListener("input", applyManualOffsetFromInputs);

els.detailsDrawerToggle?.addEventListener("click", () => {
  if (!hasPreviewContent()) return;
  setDetailsDrawerOpen(!els.detailsDrawer.classList.contains("open"));
});

els.detailsDrawerClose?.addEventListener("click", () => {
  setDetailsDrawerOpen(false);
});

els.previewCancelButton?.addEventListener("click", () => {
  setAppView("input");
});

els.stackOrderButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setStackTop(button.dataset.stackTop);
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!els.detailsDrawer?.classList.contains("open")) return;
  const target = event.target;
  if (
    target instanceof Element
    && (els.detailsDrawer.contains(target) || els.detailsDrawerToggle?.contains(target) || target.closest(".preview-view-menu, .stack-order-switch"))
  ) return;
  setDetailsDrawerOpen(false);
});

els.previewMode.addEventListener("change", () => {
  updatePreviewModeControlsVisibility();
  redrawMergedPreview();
});

els.showFrameOverlay.addEventListener("change", () => {
  redrawMergedPreview();
});

els.overlayOpacity.addEventListener("input", () => {
  updateOverlayOpacityLabel();
  if (els.previewMode.value === "overlay") redrawMergedPreview();
});

els.zoomLevel.addEventListener("change", () => {
  applyZoom();
});

els.zoomOutButton.addEventListener("click", () => {
  stepZoom(-1);
});

els.zoomFitButton.addEventListener("click", () => {
  setZoomLevel("fit");
});

els.zoomActualButton.addEventListener("click", () => {
  setZoomLevel("1");
});

els.zoomInButton.addEventListener("click", () => {
  stepZoom(1);
});

window.addEventListener("resize", () => {
  if (els.detailsDrawer?.classList.contains("open")) updatePreviewMenuAnchor();
  if (els.zoomLevel.value === "fit") applyZoom();
});

els.previewFrame.addEventListener("wheel", handlePreviewWheel, { passive: false });
els.previewFrame.addEventListener("pointerdown", startPreviewPan);
els.previewFrame.addEventListener("pointermove", movePreviewPan);
els.previewFrame.addEventListener("pointerup", endPreviewPan);
els.previewFrame.addEventListener("pointercancel", endPreviewPan);

els.backgroundColor.addEventListener("input", () => {
  customBackgroundColorChosen = true;
  updateBackgroundControlStyle();
  updateBackgroundChoiceSelection("custom");
  if (currentBase && currentOverlay && currentAlignment) applyManualOffset();
});

els.outputMode.addEventListener("change", () => {
  if (currentBase && currentOverlay && currentAlignment) applyManualOffset();
});

els.transparentBackground.addEventListener("change", () => {
  updateBackgroundChoiceSelection();
  if (currentBase && currentOverlay && currentAlignment) applyManualOffset();
});

for (const option of els.backgroundOptions) {
  option.addEventListener("click", () => {
    applyBackgroundChoice(option.dataset.backgroundChoice);
  });
}

els.nudgeUp?.addEventListener("click", () => {
  nudgeOffset(0, -1);
});
els.nudgeLeft?.addEventListener("click", () => {
  nudgeOffset(-1, 0);
});
els.nudgeRight?.addEventListener("click", () => {
  nudgeOffset(1, 0);
});
els.nudgeDown?.addEventListener("click", () => {
  nudgeOffset(0, 1);
});

async function runAlignment() {
  clearDownload();
  setBusy(true);
  progressStartedAt = performance.now();
  setProgressStatus("Loading images", 0);
  appliedCandidateIndex = undefined;
  renderCandidates([]);
  resetMetrics();

  try {
    const imageA = selectedImageA ?? await readImageFile(els.imageA.files?.[0], "Image A");
    const imageB = selectedImageB ?? await readImageFile(els.imageB.files?.[0], "Image B");
    selectedImageAInfo = imageA;
    selectedImageBInfo = imageB;
    const base = els.order.value === "a-base" ? imageA : imageB;
    const overlay = els.order.value === "a-base" ? imageB : imageA;
    currentBase = base;
    currentOverlay = overlay;

    const options = readOptionValues();

    drawImageToCanvas(els.baseCanvas, base);
    drawImageToCanvas(els.overlayCanvas, overlay);

    const backgroundColor = normalizeBackgroundColor(els.backgroundColor.value);
    const startedAt = performance.now();
    const job = await runAlignmentJob(base, overlay, options, buildOutputOptions(backgroundColor), (progress) => {
      setProgressStatus(progress.phase, progress.progress);
    });
    const elapsedMs = performance.now() - startedAt;
    const { result } = job;
    currentResult = result;
    currentWorkerUsed = job.workerUsed;
    currentElapsedMs = elapsedMs;
    updateMetrics(result);
    const failureGuidance = describeFailure(result);

    if (result.status !== "ok") {
      renderCandidates(result.candidates ?? []);
      clearCanvas(els.mergedCanvas);
      logAlignmentDiagnostics({
        reason: "alignment-failed",
        result,
        elapsedMs,
        workerUsed: job.workerUsed,
      });
      const userMessage = result.status === "ambiguous" ? "Multiple matches found" : "No match found";
      setStatus(result.status === "ambiguous" ? "warn" : "error", userMessage);
      setInputProgressStatus("error", userMessage);
      return;
    }

    currentAlignment = { offsetX: result.offsetX, offsetY: result.offsetY };
    currentMerged = buildCurrentMergedImage();
    appliedCandidateIndex = findCandidateIndexByOffset(currentAlignment.offsetX, currentAlignment.offsetY, result.candidates ?? []);
    renderCandidates(result.candidates ?? []);
    logAlignmentDiagnostics({
      reason: "alignment-complete",
      workerUsed: job.workerUsed,
      elapsedMs,
      merged: currentMerged,
      result,
      stats: summarizeOverlapDifference(currentBase, currentOverlay, currentAlignment),
    });
    setManualOffset(currentAlignment.offsetX, currentAlignment.offsetY);
    resetOutputZoom();
    redrawMergedPreview();
    enableDownloadFromImage(currentMerged);
    setStatus("ok", "success");
    setInputProgressStatus("idle", "");
    setDetailsDrawerOpen(false);
    setAppView("result");
  } catch (error) {
    clearCanvas(els.mergedCanvas);
    if (error instanceof Error && error.message === "cancelled") {
      setStatus("warn", "Processing cancelled");
      setInputProgressStatus("warn", "Processing cancelled");
    } else {
      const message = error instanceof Error ? error.message : String(error);
      setStatus("error", message);
      setInputProgressStatus("error", message);
    }
  } finally {
    setBusy(false);
  }
}

function cancelAlignment() {
  if (currentCancel) {
    currentCancel();
    return;
  }
  setBusy(false);
  setStatus("warn", "Processing cancelled. For large images, try the fast or huge images preset.");
}

function applyPreset(name) {
  const preset = getPresetOptions(name);
  for (const [key, value] of Object.entries(preset)) {
    const input = document.querySelector(`#${key}`);
    if (input) input.value = String(value);
  }
}

function resetSettingsToDefault() {
  applySettingsToControls(buildDefaultSettings());
  refreshSegmentedControls();
  updateOverlayOpacityLabel();
  resetOutputZoom();
  if (currentBase && currentOverlay && currentAlignment) {
    applyManualOffset();
  } else {
    redrawMergedPreview();
  }
  setStatus("ok", "Settings reset to defaults");
}

function applyManualOffsetFromInputs() {
  if (!currentBase || !currentOverlay || !currentAlignment) return;
  if (!isIntegerInput(els.manualOffsetX.value) || !isIntegerInput(els.manualOffsetY.value)) return;
  applyManualOffset();
}

function isIntegerInput(value) {
  return /^-?\d+$/.test(String(value).trim());
}

function applyManualOffset() {
  if (!currentBase || !currentOverlay) return;
  const offsetX = Number.parseInt(els.manualOffsetX.value, 10);
  const offsetY = Number.parseInt(els.manualOffsetY.value, 10);
  if (!Number.isInteger(offsetX) || !Number.isInteger(offsetY)) {
    setStatus("error", "offsetX and offsetY must be integers");
    return;
  }
  currentAlignment = { offsetX, offsetY };
  appliedCandidateIndex = findCandidateIndexByOffset(offsetX, offsetY);
  currentMerged = buildCurrentMergedImage();
  logAlignmentDiagnostics({
    reason: "manual-offset",
    workerUsed: currentWorkerUsed,
    elapsedMs: currentElapsedMs,
    merged: currentMerged,
    result: currentResult,
    stats: summarizeOverlapDifference(currentBase, currentOverlay, currentAlignment),
  });
  updateManualMetrics();
  renderCandidates(latestCandidates);
  redrawMergedPreview();
  enableDownloadFromImage(currentMerged);
  setStatus("ok", "success");
}

function nudgeOffset(dx, dy) {
  els.manualOffsetX.value = String((Number.parseInt(els.manualOffsetX.value, 10) || 0) + dx);
  els.manualOffsetY.value = String((Number.parseInt(els.manualOffsetY.value, 10) || 0) + dy);
  applyManualOffset();
}

function setManualOffset(offsetX, offsetY) {
  els.manualOffsetX.value = String(offsetX);
  els.manualOffsetY.value = String(offsetY);
}

function findCandidateIndexByOffset(offsetX, offsetY, candidates = latestCandidates) {
  const index = candidates.findIndex((candidate) => candidate.offsetX === offsetX && candidate.offsetY === offsetY);
  return index >= 0 ? index : undefined;
}

function findCandidateByOffset(offsetX, offsetY, candidates = latestCandidates) {
  return candidates.find((candidate) => candidate.offsetX === offsetX && candidate.offsetY === offsetY);
}

function initSegmentedControls() {
  for (const group of document.querySelectorAll("[data-select-target]")) {
    const select = document.querySelector(`#${group.dataset.selectTarget}`);
    if (!select) continue;
    for (const button of group.querySelectorAll("button[data-value]")) {
      button.addEventListener("click", () => {
        if (select.value === button.dataset.value) return;
        select.value = button.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refreshSegmentedControl(group, select);
      });
    }
    select.addEventListener("change", () => {
      refreshSegmentedControl(group, select);
    });
    refreshSegmentedControl(group, select);
  }
}

function setupEagleWindowControls() {
  if (!els.windowCloseButton) return;
  const eagleWindow = globalThis.eagle?.window;
  const hasEagleWindow = Boolean(eagleWindow);
  els.windowCloseButton.classList.toggle("is-unavailable", !hasEagleWindow);

  els.windowCloseButton.addEventListener("click", async () => {
    if (eagleWindow?.hide) {
      await eagleWindow.hide();
      return;
    }
    window.close();
  });
}

function refreshSegmentedControls() {
  for (const group of document.querySelectorAll("[data-select-target]")) {
    const select = document.querySelector(`#${group.dataset.selectTarget}`);
    if (select) refreshSegmentedControl(group, select);
  }
}

function refreshSegmentedControl(group, select) {
  for (const button of group.querySelectorAll("button[data-value]")) {
    const isActive = button.dataset.value === select.value;
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function updateManualMetrics() {
  els.metricOffsetX.textContent = String(currentAlignment.offsetX);
  els.metricOffsetY.textContent = String(currentAlignment.offsetY);
  const matchingCandidate = findCandidateByOffset(currentAlignment.offsetX, currentAlignment.offsetY);
  const stats = matchingCandidate ? buildCandidateStats(matchingCandidate) : undefined;
  els.metricScore.textContent = matchingCandidate ? buildCandidateStatsSummary(matchingCandidate, stats).mismatchRate : "-";
}

function renderCandidates(candidates) {
  latestCandidates = candidates;
  els.candidateList.replaceChildren();
  if (!candidates.length) {
    els.candidatePreviewStatus.hidden = true;
    els.candidateList.textContent = "No candidates yet.";
    return;
  }

  els.candidatePreviewStatus.hidden = false;
  renderCandidatePreviewStatus();
  for (const [index, candidate] of candidates.slice(0, 8).entries()) {
    const stats = buildCandidateStats(candidate);
    const summary = buildCandidateStatsSummary(candidate, stats);
    const button = document.createElement("button");
    button.type = "button";
    const isApplied = appliedCandidateIndex === index;
    button.className = ["candidate-row", isApplied ? "applied" : ""].filter(Boolean).join(" ");
    button.title = "Apply this candidate offset to the output.";
    const action = candidateCell(isApplied ? "Applied" : "Apply", "candidate-action");
    button.append(
      candidateCell(String(index + 1), "candidate-rank"),
      candidateMetric("Match", summary.mismatchRate, "candidate-mismatch"),
      candidateMetric("X / Y", `${candidate.offsetX ?? "-"} / ${candidate.offsetY ?? "-"}`, "candidate-offset"),
      action,
    );
    button.addEventListener("click", () => {
      applyCandidate(candidate, index);
    });
    els.candidateList.append(button);
  }
}

function applyCandidate(candidate, index) {
  if (!currentBase || !currentOverlay) return;
  appliedCandidateIndex = index;
  setManualOffset(candidate.offsetX, candidate.offsetY);
  applyManualOffset();
}

function renderCandidatePreviewStatus() {
  els.candidatePreviewStatus.textContent = "Select a candidate to apply its offset.";
  els.candidatePreviewStatus.classList.remove("active");
}

function drawPreviewImage(image, alignment) {
  drawImageToCanvas(els.mergedCanvas, image);
  drawFrameOverlay(alignment);
  applyZoom();
}

function candidateCell(text, className) {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

function candidateMetric(label, value, className) {
  const wrapper = document.createElement("span");
  wrapper.className = `candidate-metric ${className ?? ""}`.trim();
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  wrapper.append(labelEl, valueEl);
  return wrapper;
}

function buildCandidateStats(candidate) {
  const comparedPixels = Number(candidate.comparedPixels);
  const mismatchedPixels = Number(candidate.mismatchedPixels);
  return {
    overlapPixels: computeOverlapPixels(candidate),
    comparedPixels: Number.isFinite(comparedPixels) ? comparedPixels : undefined,
    mismatchRatio: Number.isFinite(comparedPixels) && comparedPixels > 0 && Number.isFinite(mismatchedPixels)
      ? mismatchedPixels / comparedPixels
      : undefined,
    averageDiff: Number.isFinite(candidate.meanAbsoluteError) ? candidate.meanAbsoluteError : undefined,
  };
}

function computeOverlapPixels(alignment) {
  if (!currentBase || !currentOverlay) return undefined;
  const startX = Math.max(0, alignment.offsetX);
  const startY = Math.max(0, alignment.offsetY);
  const endX = Math.min(currentBase.width, alignment.offsetX + currentOverlay.width);
  const endY = Math.min(currentBase.height, alignment.offsetY + currentOverlay.height);
  const width = Math.max(0, endX - startX);
  const height = Math.max(0, endY - startY);
  return width * height;
}

function redrawMergedPreview() {
  updatePreviewModeControlsVisibility();
  if (!currentMerged) return;
  if (els.previewMode.value === "merged") {
    drawImageToCanvas(els.mergedCanvas, currentMerged);
    drawFrameOverlay(currentAlignment);
    applyZoom();
    return;
  }
  if (els.previewMode.value === "overlay") {
    drawOverlayPreview();
    return;
  }
  if (els.previewMode.value === "quality") {
    drawQualityPreview();
    return;
  }
  drawDifferencePreview();
}

function getBaseImageLabel() {
  return els.order.value === "a-base" ? "A" : "B";
}

function getOverlayImageLabel() {
  return els.order.value === "a-base" ? "B" : "A";
}

function getStackPair() {
  if (!currentBase || !currentOverlay || !currentAlignment) return undefined;
  const topIsOverlay = getOverlayImageLabel() === stackTop;
  return topIsOverlay
    ? { bottom: currentBase, top: currentOverlay, alignment: currentAlignment }
    : {
        bottom: currentOverlay,
        top: currentBase,
        alignment: {
          offsetX: -currentAlignment.offsetX,
          offsetY: -currentAlignment.offsetY,
        },
      };
}

function buildCurrentMergedImage() {
  const pair = getStackPair();
  if (!pair) return undefined;
  return compositeAligned(pair.bottom, pair.top, pair.alignment, {
    ...buildOutputOptions(normalizeBackgroundColor(els.backgroundColor.value)),
  });
}

function setStackTop(value) {
  stackTop = value === "A" ? "A" : "B";
  updateStackOrderControl();
  if (!currentBase || !currentOverlay || !currentAlignment) return;
  currentMerged = buildCurrentMergedImage();
  redrawMergedPreview();
  enableDownloadFromImage(currentMerged);
}

function updateStackOrderControl() {
  els.stackOrderButtons.forEach((button) => {
    const isPressed = button.dataset.stackTop === stackTop;
    button.setAttribute("aria-pressed", String(isPressed));
  });
}

function updateStackOrderVisibility() {
  if (!els.stackOrderSwitch) return;
  els.stackOrderSwitch.hidden = els.previewMode.value !== "merged" || !currentMerged;
}

function drawOverlayPreview() {
  const opacity = Number.parseFloat(els.overlayOpacity.value);
  const pair = getStackPair();
  if (!pair) return;
  const bottomOnly = compositeAligned(pair.bottom, {
    width: pair.top.width,
    height: pair.top.height,
    data: new Uint8ClampedArray(pair.top.width * pair.top.height * 4),
  }, pair.alignment, {
    ...buildOutputOptions(normalizeBackgroundColor(els.backgroundColor.value)),
  });
  drawImageToCanvas(els.mergedCanvas, bottomOnly);
  applyZoom();
  const ctx = els.mergedCanvas.getContext("2d");
  const minX = Math.min(0, pair.alignment.offsetX);
  const minY = Math.min(0, pair.alignment.offsetY);
  const overlayCanvas = imageToCanvas(pair.top);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.drawImage(
    overlayCanvas,
    pair.alignment.offsetX - minX,
    pair.alignment.offsetY - minY,
  );
  ctx.restore();
  drawFrameOverlay();
}

function drawDifferencePreview() {
  const baseOnly = compositeAligned(currentBase, {
    width: currentOverlay.width,
    height: currentOverlay.height,
    data: new Uint8ClampedArray(currentOverlay.width * currentOverlay.height * 4),
  }, currentAlignment, {
    ...buildOutputOptions(normalizeBackgroundColor(els.backgroundColor.value)),
  });
  const overlayOnly = compositeAligned({
    width: currentBase.width,
    height: currentBase.height,
    data: new Uint8ClampedArray(currentBase.width * currentBase.height * 4),
  }, currentOverlay, currentAlignment, {
    ...buildOutputOptions(normalizeBackgroundColor(els.backgroundColor.value)),
  });
  drawImageToCanvas(els.mergedCanvas, createDifferenceImage(baseOnly, overlayOnly));
  drawFrameOverlay();
  applyZoom();
}

function drawQualityPreview() {
  drawImageToCanvas(els.mergedCanvas, createQualityMapImage(currentBase, currentOverlay, currentAlignment));
  drawFrameOverlay();
  applyZoom();
}

function drawFrameOverlay(alignment = currentAlignment) {
  if (!els.showFrameOverlay.checked || !currentBase || !currentOverlay || !alignment) return;
  const ctx = els.mergedCanvas.getContext("2d");
  const rects = buildAlignmentFrameRects({
    base: currentBase,
    overlay: currentOverlay,
    alignment,
    outputMode: els.outputMode.value,
  });
  const imageAStyle = { color: "#f25aa8", dash: [12, 8], label: "A" };
  const imageBStyle = { color: "#1f8cff", dash: [12, 8], label: "B" };
  const styles = getBaseImageLabel() === "A"
    ? { base: imageAStyle, overlay: imageBStyle }
    : { base: imageBStyle, overlay: imageAStyle };

  ctx.save();
  ctx.lineWidth = Math.max(2, Math.ceil(Math.min(els.mergedCanvas.width, els.mergedCanvas.height) / 900));
  const labelFontSize = Math.max(16, ctx.lineWidth * 7);
  ctx.font = `700 ${labelFontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  for (const rect of rects) {
    const style = styles[rect.key];
    if (!style) continue;
    ctx.setLineDash(style.dash);
    ctx.strokeStyle = style.color;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    drawFrameLabel(ctx, rect, style.color, style.label, labelFontSize);
  }
  ctx.restore();
}

function drawFrameLabel(ctx, rect, color, label, fontSize) {
  const boxSize = Math.max(28, Math.ceil(ctx.lineWidth * 12));
  const labelX = Math.max(2, Math.min(rect.x + 6, els.mergedCanvas.width - boxSize - 2));
  const labelY = Math.max(2, Math.min(rect.y + 6, els.mergedCanvas.height - boxSize - 2));
  const metrics = ctx.measureText(label);
  const textX = labelX + (boxSize - metrics.width) / 2;
  const textY = labelY + (boxSize - fontSize) / 2;
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.fillRect(labelX, labelY, boxSize, boxSize);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, textX, textY);
}

async function runAlignmentJob(base, overlay, options, outputOptions, onProgress) {
  if (workerAvailable && window.Worker) {
    try {
      return {
        ...(await runAlignmentInWorker(base, overlay, options, outputOptions, onProgress)),
        workerUsed: true,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "cancelled") throw error;
      workerAvailable = false;
      console.warn("Worker alignment failed; falling back to main thread.", error);
    }
  }

  const result = findBestAlignment(base, overlay, {
    ...options,
    onProgress,
  });
  onProgress({ phase: "Building merged image", progress: 0.99 });
  const merged = result.status === "ok"
    ? compositeAligned(base, overlay, result, outputOptions)
    : undefined;
  return { result, merged, workerUsed: false };
}

function runAlignmentInWorker(base, overlay, options, outputOptions, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("align-worker.js", import.meta.url), { type: "module" });
    currentWorker = worker;
    let settled = false;
    currentCancel = () => {
      if (settled) return;
      settled = true;
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      currentWorker = undefined;
      currentCancel = undefined;
      reject(new Error("cancelled"));
    };
    const handleMessage = (event) => {
      if (event.data.type === "progress") {
        onProgress({
          phase: event.data.phase,
          progress: event.data.progress,
        });
        return;
      }

      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      currentWorker = undefined;
      currentCancel = undefined;
      settled = true;
      if (!event.data.ok) {
        reject(new Error(event.data.message));
        return;
      }
      const merged = event.data.merged
        ? {
            width: event.data.merged.width,
            height: event.data.merged.height,
            data: new Uint8ClampedArray(event.data.merged.buffer),
          }
        : undefined;
      resolve({ result: event.data.result, merged });
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", (event) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      currentWorker = undefined;
      currentCancel = undefined;
      reject(new Error(event.message || "Worker execution failed"));
    }, { once: true });

    const payload = {
      base: toTransferableImage(base),
      overlay: toTransferableImage(overlay),
      options,
      outputOptions,
    };
    const transfers = [payload.base.buffer, payload.overlay.buffer];
    worker.postMessage(payload, transfers);
  });
}

function buildOutputOptions(backgroundColor) {
  return {
    backgroundColor,
    outputMode: els.outputMode.value,
    transparentBackground: els.transparentBackground.checked,
  };
}

function toTransferableImage(image) {
  return {
    width: image.width,
    height: image.height,
    buffer: image.data.slice().buffer,
  };
}

function readOptionValues() {
  const values = {};
  for (const id of optionIds) {
    values[id] = document.querySelector(`#${id}`).value;
  }
  return buildAlignmentOptions(values);
}

async function readImageFile(file, label) {
  if (!file) {
    throw new Error(`Choose ${label}`);
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error(`${label} exceeds the 100MB limit`);
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: imageData.data,
      name: file.name,
      type: file.type,
      fileSize: file.size,
    };
  } finally {
    bitmap.close();
  }
}

function drawImageToCanvas(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  if (canvas === els.mergedCanvas) applyZoom();
}

function imageToCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas;
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
  if (canvas === els.mergedCanvas) applyZoom();
}

function updateMetrics(result) {
  els.metricOffsetX.textContent = result.offsetX ?? "-";
  els.metricOffsetY.textContent = result.offsetY ?? "-";
  els.metricScore.textContent = formatMatchRatio(result.exactMatchRatio);
}

function formatMatchRatio(ratio) {
  return Number.isFinite(ratio) ? `${formatNumber(ratio * 100, 2)}%` : "-";
}

function resetMetrics() {
  for (const el of [
    els.metricOffsetX,
    els.metricOffsetY,
    els.metricScore,
  ]) {
    el.textContent = "-";
  }
}

function logAlignmentDiagnostics({ reason, result, merged, stats, workerUsed, elapsedMs }) {
  const processing = buildProcessingLog({
    workerUsed,
    elapsedMs,
    preset: els.preset.value,
    outputMode: els.outputMode.value,
    merged,
    result,
  });
  const diff = stats ? [
    ["Overlap", `${stats.overlapPixels.toLocaleString()} px`],
    ["Compared", `${stats.comparedPixels.toLocaleString()} px`],
    ["Mismatch rate", `${formatNumber(stats.mismatchRatio * 100, 2)}%`],
    ["Average diff", formatNumber(stats.averageDiff, 2)],
    ["Max diff", formatNumber(stats.maxDiff, 0)],
  ] : [];
  const output = merged ? buildOutputPrecheck({
    image: merged,
    outputMode: els.outputMode.value,
    transparentBackground: els.transparentBackground.checked,
    backgroundColor: normalizeBackgroundColor(els.backgroundColor.value),
  }) : [];
  console.log("[MergeMate] run", {
    reason,
    base: describeDebugImage(currentBase),
    overlay: describeDebugImage(currentOverlay),
    layerOrder: els.order.value,
    status: result?.status,
    offsetX: result?.offsetX,
    offsetY: result?.offsetY,
    score: result?.score,
    matchedPixels: result?.matchedPixels,
    comparedPixels: result?.comparedPixels,
    candidates: result?.candidates?.length ?? 0,
    processing: rowsToObject(processing),
    ...(diff.length ? { difference: rowsToObject(diff) } : {}),
    ...(output.length ? { output: rowsToObject(output) } : {}),
  });
}

function describeDebugImage(image) {
  if (!image) return undefined;
  return {
    name: image.name,
    width: image.width,
    height: image.height,
    pixels: image.width * image.height,
    rgbaBytes: image.width * image.height * 4,
    fileSize: image.fileSize,
    type: image.type,
  };
}

function rowsToObject(rows) {
  return Object.fromEntries(rows.map(([key, value]) => [String(key), value]));
}

function updateOverlayOpacityLabel() {
  const percent = Math.round(Number.parseFloat(els.overlayOpacity.value) * 100);
  els.overlayOpacityValue.textContent = `${percent}%`;
  els.overlayOpacity.style.setProperty("--opacity-progress", `${percent}%`);
}

function updateOverlayOpacityVisibility() {
  els.overlayOpacityControl.hidden = els.previewMode.value !== "overlay";
}

function updatePreviewModeControlsVisibility() {
  updateOverlayOpacityVisibility();
  updateStackOrderVisibility();
}

function setDetailsDrawerOpen(isOpen) {
  if (!els.detailsDrawer || !els.detailsDrawerToggle) return;
  if (isOpen) updatePreviewMenuAnchor();
  els.detailsDrawer.classList.toggle("open", isOpen);
  els.workspace?.classList.toggle("details-open", isOpen);
  els.detailsDrawerToggle.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) requestAnimationFrame(updatePreviewMenuAnchor);
}

function updatePreviewMenuAnchor() {
  if (!els.workspace || !els.detailsDrawer || !els.previewFrame) return;
  const workspaceRect = els.workspace.getBoundingClientRect();
  const previewRect = els.previewFrame.getBoundingClientRect();
  const drawerWidth = els.detailsDrawer.getBoundingClientRect().width;
  els.workspace.style.setProperty("--preview-menu-left", `${Math.round(workspaceRect.left + drawerWidth + 12)}px`);
  els.workspace.style.setProperty("--preview-menu-top", `${Math.round(previewRect.top + 12)}px`);
}

function setAppView(view) {
  const isResult = view === "result";
  els.workspace.classList.toggle("view-result", isResult);
  els.workspace.classList.toggle("view-input", !isResult);
  if (!isResult) {
    setDetailsDrawerOpen(false);
  } else {
    requestAnimationFrame(() => applyZoom());
  }
}

function setStatus(kind, message) {
  if (!els.status) return;
  els.status.className = `status ${kind}`;
  els.status.replaceChildren();
  if (kind === "ok" && message) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("lucide-icon", "status-icon");
    icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#icon-check");
    icon.append(use);
    const label = document.createElement("span");
    label.textContent = message;
    els.status.append(icon, label);
  } else {
    els.status.textContent = message;
  }
  els.status.classList.toggle("hidden", !message);
}

function setProgressStatus(phase, progress) {
  setInputProgressStatus("running", "", phase, progress);
}

function setInputProgressStatus(kind, message, phase, progress = 0) {
  if (!els.inputProgress) return;
  els.inputProgress.className = `input-progress ${kind}`;
  els.inputProgress.replaceChildren();
  els.inputProgress.classList.toggle("hidden", !message && kind !== "running");
  if (kind !== "running") {
    els.inputProgress.textContent = message;
    return;
  }

  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  const elapsedSeconds = Math.max(0, (performance.now() - progressStartedAt) / 1000);
  const remainingSeconds = progress > 0.03 && progress < 0.98
    ? Math.max(0, elapsedSeconds * (1 - progress) / progress)
    : undefined;

  const label = document.createElement("div");
  label.className = "progress-label";
  const labelText = document.createElement("span");
  labelText.textContent = phase;
  const percentText = document.createElement("span");
  percentText.textContent = `${percent}%`;
  label.append(labelText, percentText);

  const meta = document.createElement("div");
  meta.className = "progress-meta";
  meta.textContent = "Running...";

  const track = document.createElement("div");
  track.className = "progress-track";
  const bar = document.createElement("div");
  bar.className = "progress-bar";
  bar.style.width = `${percent}%`;
  track.append(bar);

  els.inputProgress.append(label, meta, track);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function setBusy(isBusy) {
  els.runButton.disabled = isBusy;
  els.cancelButton.disabled = !isBusy;
  els.cancelButton.classList.toggle("hidden", !isBusy);
  setControlText(els.runButton, isBusy ? "Running" : "Run");
}

function setControlText(control, text) {
  const label = control.querySelector("span");
  if (label) {
    label.textContent = text;
  } else {
    control.textContent = text;
  }
}

function applyZoom() {
  updatePreviewEmptyState();
  const zoom = resolveZoomLevel();
  lastAppliedZoom = zoom;
  els.mergedCanvas.style.width = `${Math.max(1, els.mergedCanvas.width)}px`;
  els.mergedCanvas.style.height = `${Math.max(1, els.mergedCanvas.height)}px`;
  els.mergedCanvas.style.transform = `translate(calc(-50% + ${Math.round(panX)}px), calc(-50% + ${Math.round(panY)}px)) scale(${zoom})`;
  updateZoomValueLabel(zoom);
}

function resolveZoomLevel() {
  if (!hasPreviewContent()) return 1;
  if (els.zoomLevel.value === "fit") return calculateFitZoom();
  if (els.zoomLevel.value === "custom") return customZoom;
  return Number.parseFloat(els.zoomLevel.value) || 1;
}

function calculateFitZoom() {
  const frame = els.mergedCanvas.closest(".merged-preview");
  if (!frame || !els.mergedCanvas.width || !els.mergedCanvas.height) return 1;
  const availableWidth = Math.max(1, frame.clientWidth - 32);
  const availableHeight = Math.max(1, frame.clientHeight - 32);
  return clampZoom(Math.min(availableWidth / els.mergedCanvas.width, availableHeight / els.mergedCanvas.height));
}

function updateZoomValueLabel(zoom) {
  const percent = zoom * 100;
  els.zoomValue.textContent = percent < 10
    ? `${percent.toFixed(1).replace(/\.0$/, "")}%`
    : `${Math.round(percent)}%`;
}

function setZoomLevel(value) {
  els.zoomLevel.value = value;
  if (value !== "fit" && value !== "custom") customZoom = Number.parseFloat(value) || 1;
  applyZoom();
}

function resetOutputZoom() {
  resetPreviewPan();
  setZoomLevel(DEFAULT_ZOOM_LEVEL);
}

function resetPreviewPan() {
  panX = 0;
  panY = 0;
}

function stepZoom(direction) {
  const current = els.zoomLevel.value === "fit" || els.zoomLevel.value === "custom"
    ? lastAppliedZoom
    : (Number.parseFloat(els.zoomLevel.value) || 1);
  const next = direction < 0
    ? [...ZOOM_STEPS].reverse().find((value) => value < current - 0.01) ?? ZOOM_STEPS[0]
    : ZOOM_STEPS.find((value) => value > current + 0.01) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  setZoomLevel(String(next));
}

function setContinuousZoom(nextZoom, event) {
  if (!hasPreviewContent()) {
    updateZoomValueLabel(1);
    return;
  }
  const oldZoom = lastAppliedZoom || resolveZoomLevel();
  const zoom = clampZoom(nextZoom);
  const frameRect = els.previewFrame.getBoundingClientRect();
  const pointerX = event.clientX - frameRect.left - frameRect.width / 2;
  const pointerY = event.clientY - frameRect.top - frameRect.height / 2;
  panX = pointerX - (zoom / oldZoom) * (pointerX - panX);
  panY = pointerY - (zoom / oldZoom) * (pointerY - panY);
  customZoom = zoom;
  els.zoomLevel.value = "custom";
  applyZoom();
}

function clampZoom(zoom) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function hasPreviewContent() {
  return Boolean(currentMerged);
}

function updatePreviewEmptyState() {
  els.previewFrame.classList.toggle("empty", !hasPreviewContent());
  updateDetailsAvailability();
}

function updateDetailsAvailability() {
  const hasOutput = hasPreviewContent();
  els.detailsDrawerToggle.disabled = !hasOutput;
  els.detailsDrawerToggle.setAttribute("aria-disabled", String(!hasOutput));
  els.manualOffsetControls.hidden = !hasOutput;
  els.manualOffsetHelp.textContent = hasOutput ? "Adjust the applied output offset." : "No result yet.";
  if (!hasOutput) {
    setDetailsDrawerOpen(false);
  }
}

function updateInputEmptyState() {
  els.imageACard.classList.toggle("empty", !selectedImageA);
  els.imageBCard.classList.toggle("empty", !selectedImageB);
  renderInputMeta("a", selectedImageAInfo);
  renderInputMeta("b", selectedImageBInfo);
}

function renderInputMeta(target, image) {
  const nameEl = target === "a" ? els.imageAName : els.imageBName;
  const sizeEl = target === "a" ? els.imageASize : els.imageBSize;
  nameEl.textContent = image?.name ?? "-";
  sizeEl.textContent = image ? `${image.width} x ${image.height} px` : "-";
}

function handlePreviewWheel(event) {
  if (event.target.closest(PREVIEW_CONTROL_SELECTOR)) return;
  event.preventDefault();
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) * WHEEL_PAN_DELTA_RATIO) {
    panX -= event.deltaX;
    panY -= event.deltaY;
    applyZoom();
    return;
  }
  const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
  setContinuousZoom(lastAppliedZoom * factor, event);
}

function startPreviewPan(event) {
  if (event.button !== 0 || event.target.closest(PREVIEW_CONTROL_SELECTOR)) return;
  panPointerId = event.pointerId;
  panStartX = event.clientX;
  panStartY = event.clientY;
  panOriginX = panX;
  panOriginY = panY;
  els.previewFrame.setPointerCapture(event.pointerId);
  els.previewFrame.classList.add("is-panning");
}

function movePreviewPan(event) {
  if (event.pointerId !== panPointerId) return;
  panX = panOriginX + event.clientX - panStartX;
  panY = panOriginY + event.clientY - panStartY;
  applyZoom();
}

function endPreviewPan(event) {
  if (event.pointerId !== panPointerId) return;
  panPointerId = undefined;
  els.previewFrame.classList.remove("is-panning");
  if (els.previewFrame.hasPointerCapture(event.pointerId)) {
    els.previewFrame.releasePointerCapture(event.pointerId);
  }
}

function enableDownload(canvas) {
  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus("error", "Failed to generate PNG");
      return;
    }
    clearDownload();
    lastDownloadUrl = URL.createObjectURL(blob);
    els.downloadLink.href = lastDownloadUrl;
    els.downloadLink.download = buildDownloadFilename();
    els.downloadLink.classList.remove("disabled");
    els.downloadLink.setAttribute("aria-disabled", "false");
  }, "image/png");
}

function buildDownloadFilename(date = new Date()) {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-") + "_" + [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${sanitizeDownloadNamePart(downloadPluginName)}_${timestamp}.png`;
}

function sanitizeDownloadNamePart(value) {
  return String(value || DEFAULT_DOWNLOAD_PLUGIN_NAME)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "") || DEFAULT_DOWNLOAD_PLUGIN_NAME;
}

async function loadPluginNameFromManifest() {
  try {
    const response = await fetch("../manifest.json", { cache: "no-store" });
    if (!response.ok) return;
    const manifest = await response.json();
    downloadPluginName = sanitizeDownloadNamePart(manifest.name);
  } catch {
    downloadPluginName = DEFAULT_DOWNLOAD_PLUGIN_NAME;
  }
}

function enableDownloadFromImage(image) {
  enableDownload(imageToCanvas(image));
}

loadSettings();
updateBackgroundControlStyle();
updateBackgroundChoiceSelection();
updatePresetDisplay();
updateOverlayOpacityLabel();
updatePreviewModeControlsVisibility();
applyZoom();

function clearDownload() {
  if (lastDownloadUrl) {
    URL.revokeObjectURL(lastDownloadUrl);
    lastDownloadUrl = undefined;
  }
  els.downloadLink.removeAttribute("href");
  els.downloadLink.removeAttribute("download");
  els.downloadLink.classList.add("disabled");
  els.downloadLink.setAttribute("aria-disabled", "true");
  updateDetailsAvailability();
}

function loadSettings() {
  applySettingsToControls(buildDefaultSettings());
  els.zoomLevel.value = DEFAULT_ZOOM_LEVEL;
  refreshSegmentedControls();
  setDetailsDrawerOpen(false);
}

function clearAlignmentState() {
  clearDownload();
  currentBase = undefined;
  currentOverlay = undefined;
  currentMerged = undefined;
  currentAlignment = undefined;
  currentResult = undefined;
  currentWorkerUsed = undefined;
  currentElapsedMs = undefined;
  updatePreviewModeControlsVisibility();
  appliedCandidateIndex = undefined;
  latestCandidates = [];
  renderCandidates([]);
  renderCandidatePreviewStatus();
  resetMetrics();
  clearCanvas(els.mergedCanvas);
  updatePreviewEmptyState();
  setInputProgressStatus("idle", "");
  setAppView("input");
}

function applySettingsToControls(settings) {
  for (const id of settingElementIds) {
    if (!(id in settings)) continue;
    const element = document.querySelector(`#${id}`);
    if (!element) continue;
    if (element.type === "checkbox") {
      element.checked = settings[id] === true || settings[id] === "true";
    } else {
      element.value = String(settings[id]);
    }
  }
}

function updateBackgroundControlStyle() {
  const backgroundColor = normalizeBackgroundColor(els.backgroundColor.value);
  const normalizedColor = backgroundColor.toLowerCase();
  const isPresetColor = normalizedColor === "#ffffff" || normalizedColor === "#111827" || normalizedColor === "#000000";
  const customSwatch = document.querySelector(".swatch-custom");
  const backgroundControl = els.backgroundColor.closest(".background-control");
  if (customBackgroundColorChosen || !isPresetColor) {
    backgroundControl?.style.setProperty("--background-swatch", backgroundColor);
    customSwatch?.style.setProperty("--background-swatch", backgroundColor);
  } else {
    backgroundControl?.style.removeProperty("--background-swatch");
    customSwatch?.style.removeProperty("--background-swatch");
  }
}

function applyBackgroundChoice(choice) {
  if (choice === "transparent") {
    els.transparentBackground.checked = true;
    customBackgroundColorChosen = false;
  } else {
    els.transparentBackground.checked = false;
    if (choice === "white") els.backgroundColor.value = "#ffffff";
    if (choice === "black") els.backgroundColor.value = "#111827";
    if (choice === "white" || choice === "black") customBackgroundColorChosen = false;
    if (choice === "custom") {
      updateBackgroundChoiceSelection("custom");
      els.backgroundColor.click();
    }
  }
  updateBackgroundControlStyle();
  updateBackgroundChoiceSelection(choice);
  if (currentBase && currentOverlay && currentAlignment) applyManualOffset();
}

function updateBackgroundChoiceSelection(explicitChoice) {
  const normalizedColor = normalizeBackgroundColor(els.backgroundColor.value).toLowerCase();
  const selected = explicitChoice
    ?? (els.transparentBackground.checked
      ? "transparent"
      : normalizedColor === "#ffffff"
        ? "white"
        : normalizedColor === "#111827" || normalizedColor === "#000000"
          ? "black"
          : "custom");
  for (const option of els.backgroundOptions) {
    option.classList.toggle("selected", option.dataset.backgroundChoice === selected);
  }
}

function updatePresetDisplay() {
  const labels = {
    balanced: ["Balanced", "Best balance of accuracy and detail", "#icon-scale"],
    fast: ["Fast", "Quick scan for simple images", "#icon-fast-forward"],
    precise: ["Precise", "More verification for detailed edges", "#icon-star"],
    huge: ["Huge images", "Reduced sampling for large inputs", "#icon-weight"],
  };
  const [name, description, icon] = labels[els.preset.value] ?? labels.balanced;
  if (els.presetDisplayIcon) els.presetDisplayIcon.setAttribute("href", icon);
  if (els.presetDisplayName) els.presetDisplayName.textContent = name;
  if (els.presetDisplayDescription) els.presetDisplayDescription.textContent = description;
}

async function readSelectedImagesForPreview() {
  const token = previewReadToken + 1;
  previewReadToken = token;
  const imageAFile = els.imageA.files?.[0];
  const imageBFile = els.imageB.files?.[0];
  const imageAKey = fileCacheKey(imageAFile);
  const imageBKey = fileCacheKey(imageBFile);
  selectedImageAInfo = undefined;
  selectedImageBInfo = undefined;
  clearAlignmentState();
  updateInputEmptyState();
  setStatus("idle", "Loading selected image preview");
  try {
    const [imageA, imageB] = await Promise.all([
      readOptionalCachedImageFile(imageAFile, "Image A", selectedImageAKey, selectedImageA),
      readOptionalCachedImageFile(imageBFile, "Image B", selectedImageBKey, selectedImageB),
    ]);
    if (token !== previewReadToken) return;
    selectedImageA = imageA;
    selectedImageB = imageB;
    selectedImageAKey = imageAKey;
    selectedImageBKey = imageBKey;
    selectedImageAInfo = imageA;
    selectedImageBInfo = imageB;
    drawSelectedInputPreview(els.baseCanvas, imageA);
    drawSelectedInputPreview(els.overlayCanvas, imageB);
    updateInputEmptyState();
    setStatus("idle", imageA && imageB ? "Ready to run alignment" : "");
  } catch (error) {
    if (token !== previewReadToken) return;
    selectedImageA = undefined;
    selectedImageB = undefined;
    selectedImageAKey = undefined;
    selectedImageBKey = undefined;
    updateInputEmptyState();
    setStatus("error", error instanceof Error ? error.message : String(error));
  }
}

async function readOptionalCachedImageFile(file, label, cachedKey, cachedImage) {
  if (!file) return undefined;
  const key = fileCacheKey(file);
  if (cachedImage && cachedKey === key) return cachedImage;
  return readImageFile(file, label);
}

function fileCacheKey(file) {
  return file ? `${file.name}:${file.size}:${file.lastModified}:${file.type}` : undefined;
}

function drawSelectedInputPreview(canvas, image) {
  if (image) {
    drawImageToCanvas(canvas, image);
  } else {
    clearCanvas(canvas);
  }
}

function clearSelectedImage(target) {
  if (target === "a") {
    els.imageA.value = "";
    selectedImageA = undefined;
    selectedImageAKey = undefined;
    selectedImageAInfo = undefined;
    clearCanvas(els.baseCanvas);
  } else {
    els.imageB.value = "";
    selectedImageB = undefined;
    selectedImageBKey = undefined;
    selectedImageBInfo = undefined;
    clearCanvas(els.overlayCanvas);
  }
  clearAlignmentState();
  updateInputEmptyState();
  setStatus("idle", "");
}

function setupDropZone(card, input) {
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("drag-over");
  });
  card.addEventListener("dragleave", (event) => {
    if (!card.contains(event.relatedTarget)) card.classList.remove("drag-over");
  });
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("drag-over");
    const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

loadPluginNameFromManifest();
updateStackOrderControl();
updateInputEmptyState();
updatePreviewEmptyState();
