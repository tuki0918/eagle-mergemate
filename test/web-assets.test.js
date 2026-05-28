import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("browser entry page references assets from paths that work in Eagle and local server", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");

  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /"\/web\/(?:styles\.css|app\.js)"/);
});

test("local web server redirects root to the web entry path for relative assets", async () => {
  const server = await readFile(new URL("../scripts/serve-web.js", import.meta.url), "utf8");

  assert.match(server, /url\.pathname === "\/"/);
  assert.match(server, /Location": "\/web\/index\.html"/);
  assert.doesNotMatch(server, /const pathname = url\.pathname === "\/" \? "\/web\/index\.html" : url\.pathname/);
});

test("Eagle window plugin manifest points at the browser UI", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "8e0949c7-8d9a-4abe-982b-c237855b7fc0");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.name, "MergeMate");
  assert.equal(manifest.description, "Automatically align two images and export the merged result.");
  assert.equal(manifest.platform, "all");
  assert.equal(manifest.arch, "all");
  assert.equal(manifest.logo, "/logo.png");
  assert.equal(manifest.main.url, "web/index.html");
  assert.equal(manifest.main.width, 1280);
  assert.equal(manifest.main.height, 840);
  assert.equal(manifest.main.minWidth, 1280);
  assert.equal(manifest.main.minHeight, 840);
  assert.equal(manifest.main.resizable, true);
  assert.equal(manifest.main.multiple, false);
  assert.equal(manifest.main.frame, true);
  assert.equal(manifest.main.backgroundColor, "#f4f1ec");
  assert.equal(manifest.main.runAfterInstall, false);
});

test("Eagle window plugin includes a PNG logo asset", async () => {
  const logo = await stat(new URL("../logo.png", import.meta.url));

  assert.equal(logo.isFile(), true);
  assert.equal(logo.size > 0, true);
});

test("browser entry page exposes mac-style progressive disclosure UI", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(html, /<section class="input-panel" aria-label="input images">/);
  assert.match(html, /<section class="preview-panel" aria-label="output preview">/);
  assert.match(html, /<section class="input-card empty" id="imageACard">/);
  assert.match(html, /<label class="file-control drop-zone" for="imageA">/);
  assert.match(html, /<span>Image A<\/span>/);
  assert.match(html, /<span>Image B<\/span>/);
  assert.doesNotMatch(html, /Image A <small>\(base\)<\/small>/);
  assert.doesNotMatch(html, /Image B <small>\(overlay\)<\/small>/);
  assert.match(html, /Drop Image A/);
  assert.match(html, /Drop Image B/);
  assert.doesNotMatch(html, /PNG, JPG, WEBP up to 20MB/);
  assert.match(html, /id="clearImageA"/);
  assert.match(html, /id="clearImageB"/);
  assert.match(html, /id="imageAName"/);
  assert.match(html, /id="imageASize"/);
  assert.match(html, /id="imageBName"/);
  assert.match(html, /id="imageBSize"/);
  assert.match(html, /<figure class="merged-preview empty">/);
  assert.match(html, /<div class="preview-empty-state">/);
  assert.doesNotMatch(html, /mergedCaption/);
  assert.doesNotMatch(html, /<figcaption[^>]*>Merged<\/figcaption>/);
  assert.doesNotMatch(html, /preview-toolbar/);
  assert.match(html, /class="preview-view-menu"/);
  assert.match(html, /class="segmented-control compact-segments vertical-segments"/);
  assert.match(html, /id="overlayOpacityControl"[^>]*hidden/);
  assert.match(html, /class="zoom-dock"/);
  assert.match(html, /id="zoomValue"/);
  assert.match(html, /<option value="fit" selected>Fit<\/option>/);
  assert.match(html, /<option value="0\.01">1%<\/option>/);
  assert.match(html, /<option value="8">800%<\/option>/);
  assert.match(html, /<option value="custom" hidden>Custom<\/option>/);
  assert.match(html, /data-tooltip="Fit to view"/);
  assert.match(html, /data-tooltip="Zoom out"/);
  assert.doesNotMatch(html, /<select id="zoomLevel"[\s\S]*name=/);
  assert.match(html, /<form class="settings-panel" id="controls">/);
  assert.match(html, /<a id="downloadLink" class="download disabled" aria-disabled="true">/);
  assert.match(html, /<section class="workspace two-pane view-input" aria-label="alignment workspace">/);
  assert.match(html, /<div class="preview-header">[\s\S]*<div class="pane-title">Result Preview<\/div>/);
  assert.match(html, /<symbol id="icon-panel-left-open"[\s\S]*<\/symbol>/);
  assert.match(html, /<symbol id="icon-panel-left-close"[\s\S]*<\/symbol>/);
  assert.match(html, /<symbol id="icon-chevrons-left"[\s\S]*<\/symbol>/);
  assert.match(html, /<symbol id="icon-weight"[\s\S]*<\/symbol>/);
  assert.match(html, /id="detailsDrawerToggle"[\s\S]*href="#icon-panel-left-open"[\s\S]*href="#icon-panel-left-close"/);
  assert.match(html, /<section class="result-panel" aria-label="alignment results">[\s\S]*id="downloadLink"[\s\S]*id="metricOffsetX"[\s\S]*id="metricOffsetY"[\s\S]*id="metricScore"[\s\S]*id="detailsDrawerToggle"[\s\S]*disabled/);
  assert.doesNotMatch(html, /id="status"/);
  assert.match(html, /id="detailsDrawerClose"[\s\S]*href="#icon-chevrons-left"/);
  assert.doesNotMatch(html, /id="metricStatus"/);
  assert.match(html, /<aside id="detailsDrawer" class="details-drawer" aria-label="manual offset and candidates">/);
  assert.match(html, /<legend>Settings<\/legend>/);
  assert.match(html, /class="background-control"/);
  assert.match(html, /<span>Background<\/span>/);
  assert.match(html, /class="transparent-chip"/);
  assert.doesNotMatch(html, /Background Color/);
  assert.doesNotMatch(html, /Transparent PNG background/);
  assert.match(html, /<div id="inputProgress" class="input-progress hidden" aria-live="polite"><\/div>/);
  assert.doesNotMatch(html, /id="guidance"/);
  assert.doesNotMatch(html, /id="metricMatched"|id="metricCompared"/);
  assert.doesNotMatch(html, /<dt>matched<\/dt>|<dt>compared<\/dt>/);
  assert.match(html, /<label class="preset-setting">[\s\S]*<select id="preset">/);
  assert.doesNotMatch(html, /value="inpaint"|Inpaint edits|icon-inpaint-edits/);
  assert.match(html, /Standard matching for most images/);
  assert.match(html, /<option value="standard">Standard<\/option>/);
  assert.doesNotMatch(html, /<option value="balanced">Standard<\/option>/);
  assert.doesNotMatch(html, /<option value="fast">Fast<\/option>/);
  assert.doesNotMatch(app, /fast: \["Fast"/);
  assert.match(app, /standard: \["Standard", "Standard matching for most images", "#icon-scale"\]/);
  assert.match(app, /precise: \["Precise", "More verification for detailed edges", "#icon-star"\]/);
  assert.doesNotMatch(app, /huge: \["Huge images"/);
  assert.doesNotMatch(html, /<option value="huge">Huge images<\/option>/);
  assert.doesNotMatch(html, /Advanced Tuning/);
  assert.doesNotMatch(html, /id="resetSettingsButton"/);
  assert.doesNotMatch(html, />Basic<\/legend>/);
  assert.doesNotMatch(html, /Reset Settings|<span>Reset<\/span>/);
  assert.doesNotMatch(html, /Rebuild|Previewing|Apply Candidate/);
  assert.doesNotMatch(html, /id="applyOffsetButton"|id="confirmCandidateButton"/);
  assert.match(html, /<div class="detail-section-title"><span>Manual Offset<\/span><\/div>/);
  assert.match(html, /<p id="manualOffsetHelp" class="detail-help-text">No result yet\.<\/p>/);
  assert.match(html, /<div id="manualOffsetControls" class="adjust-panel" aria-label="manual adjustment" hidden>/);
  assert.doesNotMatch(html, /class="help-dot"/);
  assert.doesNotMatch(html, /<details class="advanced-settings result-adjust">/);
  assert.doesNotMatch(html, /Diagnostics/);
  assert.doesNotMatch(html, /imageInfo|preflightStatus|preflightInfo|processingLog|diffStats|outputPrecheck/);
  assert.match(html, /data-select-target="order"/);
  assert.match(html, /<input id="outputMode" type="hidden" value="union">/);
  assert.doesNotMatch(html, /Output Bounds/);
  assert.doesNotMatch(html, /Base \+ overlay union/);
  assert.doesNotMatch(html, />Union<\/span>/);
  assert.doesNotMatch(html, />Base<\/span>/);
  assert.doesNotMatch(html, />Overlay<\/span>/);
  assert.doesNotMatch(html, /Comparison Range/);
  assert.doesNotMatch(html, /roiEnabled|roiX|roiY|roiWidth|roiHeight|roiTool|brushRadius|showComparisonMask/);
  assert.doesNotMatch(html, /maskImage/);
  assert.doesNotMatch(html, /maskMode/);
  assert.doesNotMatch(html, /Optional Mask/);

  const settingsPanelHtml = html.match(/<form class="settings-panel" id="controls">[\s\S]*?<\/form>/)?.[0] ?? "";
  assert.doesNotMatch(settingsPanelHtml, /Manual Offset/);
});

test("web app caps selected image files at 100MB without showing helper copy", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /up to 20MB/);
  assert.match(app, /const MAX_IMAGE_FILE_BYTES = 100 \* 1024 \* 1024;/);
  assert.match(app, /if \(file\.size > MAX_IMAGE_FILE_BYTES\)/);
  assert.match(app, /exceeds the 100MB limit/);
});

test("alignment result labels and values center beside left icons", async () => {
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");

  assert.match(html, /<span>Offset X<\/span>/);
  assert.match(html, /<span>Offset Y<\/span>/);
  assert.match(html, /<span>Match<\/span>/);
  assert.match(css, /\.result-panel \{[\s\S]*grid-template-columns: minmax\(190px, 250px\) repeat\(3, minmax\(112px, 1fr\)\) 64px;/);
  assert.match(css, /\.result-panel \{[\s\S]*gap: 14px;/);
  assert.match(css, /\.metrics div \{[\s\S]*display: grid;[\s\S]*grid-template-columns: 34px minmax\(0, 1fr\);[\s\S]*grid-template-rows: auto auto;[\s\S]*align-content: center;[\s\S]*min-height: 48px;/);
  assert.match(css, /\.metrics div,[\s\S]*\.result-panel \.details-drawer-toggle \{[\s\S]*min-height: 64px;[\s\S]*border: 1px solid var\(--border-soft\);/);
  assert.doesNotMatch(css, /\.metrics div:first-child \{[\s\S]*border-left: 0;/);
  assert.match(css, /\.metrics dt > span:last-child \{[\s\S]*justify-self: center;[\s\S]*color: #63709f;[\s\S]*text-align: center;/);
  assert.match(css, /\.metric-icon \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 1 \/ 3;[\s\S]*align-self: center;/);
  assert.match(css, /\.metrics dd \{[\s\S]*justify-self: center;[\s\S]*align-self: start;[\s\S]*text-align: center;/);
  assert.match(css, /\.result-panel \.details-drawer-toggle \{[\s\S]*width: 64px;[\s\S]*min-width: 64px;[\s\S]*padding: 0;[\s\S]*justify-content: center;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.result-panel \.details-drawer-toggle > span \{[\s\S]*display: none;/);
  assert.match(css, /\.preview-header \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
});

test("manual offset match follows matching candidate only", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /function findCandidateByOffset\(offsetX, offsetY, candidates = latestCandidates\) \{[\s\S]*candidate\.offsetX === offsetX && candidate\.offsetY === offsetY/);
  assert.match(app, /function updateManualMetrics\(\) \{[\s\S]*const matchingCandidate = findCandidateByOffset\(currentAlignment\.offsetX, currentAlignment\.offsetY\);[\s\S]*const stats = matchingCandidate \? buildCandidateStats\(matchingCandidate\) : undefined;[\s\S]*els\.metricScore\.textContent = matchingCandidate \? buildCandidateStatsSummary\(matchingCandidate, stats\)\.mismatchRate : "-";/);
});

test("inactive preview mode buttons are visually muted", async () => {
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.vertical-segments button \{[\s\S]*opacity: 0\.48;/);
  assert.match(css, /\.vertical-segments button\[aria-pressed="true"\] \{[\s\S]*opacity: 1;/);
  assert.match(css, /\.vertical-segments button:hover \{[\s\S]*opacity: 0\.82;/);
});

test("candidate rows display metric labels above values with internal separators", async () => {
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /wrapper\.append\(labelEl, valueEl\);/);
  assert.doesNotMatch(app, /candidateMetric\("Score"/);
  assert.match(app, /candidateMetric\("Match", summary\.mismatchRate, "candidate-mismatch"\),[\s\S]*candidateMetric\("X \/ Y", `\$\{candidate\.offsetX \?\? "-"\} \/ \$\{candidate\.offsetY \?\? "-"\}`, "candidate-offset"\)/);
  assert.match(css, /\.candidate-row \{[\s\S]*grid-template-columns: 38px minmax\(82px, 0\.9fr\) minmax\(96px, 1fr\) auto;/);
  assert.match(css, /\.candidate-metric \{[\s\S]*display: grid;[\s\S]*grid-template-rows: auto auto;[\s\S]*justify-items: center;[\s\S]*padding-inline: 10px;[\s\S]*text-align: center;/);
  assert.match(css, /\.candidate-metric \+ \.candidate-metric \{[\s\S]*border-left: 1px solid var\(--border-soft\);/);
  assert.doesNotMatch(css, /\.candidate-score \{[\s\S]*border-left:/);
  assert.match(css, /\.candidate-offset \{[\s\S]*justify-items: center;[\s\S]*text-align: center;/);
  assert.match(css, /\.candidate-mismatch \{[\s\S]*justify-items: center;[\s\S]*text-align: center;/);
  assert.match(css, /\.candidate-action \{[\s\S]*padding: 6px 14px;/);
});

test("frame outline follows selected stack order", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /topIsOverlay[\s\S]*bottomLabel: getBaseImageLabel\(\),[\s\S]*topLabel: getOverlayImageLabel\(\)/);
  assert.match(app, /bottomLabel: getOverlayImageLabel\(\),[\s\S]*topLabel: getBaseImageLabel\(\)/);
  assert.match(app, /function drawFrameOverlay\(alignment = currentAlignment\) \{[\s\S]*const pair = getStackPair\(\);[\s\S]*base: pair\.bottom,[\s\S]*overlay: pair\.top,[\s\S]*alignment: pair\.alignment/);
  assert.match(app, /base: getFrameStyleForImageLabel\(pair\.bottomLabel\),[\s\S]*overlay: getFrameStyleForImageLabel\(pair\.topLabel\)/);
});

test("manual offset inputs use normal text weight", async () => {
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.adjust-grid input \{[\s\S]*font-size: 14px;[\s\S]*font-weight: 500;/);
});

test("details drawer always slides over the left column from left to right", async () => {
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(css, /\.workspace \{[\s\S]*grid-template-columns: minmax\(390px, 440px\) minmax\(0, 1fr\);[\s\S]*grid-template-areas:[\s\S]*"input preview";/);
  assert.match(css, /\.details-drawer-toggle \{[\s\S]*display: inline-flex;/);
  assert.match(css, /\.details-drawer \{[\s\S]*position: absolute;[\s\S]*left: 0;[\s\S]*right: auto;[\s\S]*width: min\(460px, calc\(100% - 30px\)\);[\s\S]*box-shadow: 22px 0 48px rgba\(31, 25, 93, 0\.18\);[\s\S]*transform: translateX\(-102%\);/);
  assert.match(css, /\.details-drawer \{[\s\S]*overflow: hidden;/);
  assert.match(css, /\.candidate-panel \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;[\s\S]*grid-template-rows: auto auto minmax\(0, auto\);[\s\S]*align-content: start;/);
  assert.match(css, /\.candidate-list \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/);
  assert.match(css, /\.details-drawer\.open \{[\s\S]*transform: translateX\(0\);/);
  assert.doesNotMatch(css, /details-collapsed/);
  assert.match(css, /\.workspace\.view-input \.preview-panel,[\s\S]*\.workspace\.view-input \.details-drawer,[\s\S]*\.workspace\.view-result \.input-panel \{[\s\S]*display: none;/);
  assert.doesNotMatch(css, /right: 0;[\s\S]*transform: translateX\(102%\);/);
  assert.doesNotMatch(app, /details-collapsed|isPersistentDetailsLayout|matchMedia\("\(min-width: 1361px\)"\)/);
});

test("workspace remains two columns and only image cards reflow when height is short", async () => {
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /@media \(max-width: 980px\) \{[\s\S]*\.workspace \{[\s\S]*grid-template-areas:[\s\S]*"input"[\s\S]*"preview";/);
  assert.doesNotMatch(css, /@media \(max-width: 560px\) \{[\s\S]*\.option-grid,[\s\S]*\.metrics \{[\s\S]*grid-template-columns: 1fr;/);
  assert.match(css, /\.workspace\.view-input \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*grid-template-areas: "input";/);
  assert.match(css, /\.workspace\.view-result \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*grid-template-areas: "preview";/);
  assert.match(css, /\.input-card-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.primary-action \{[^}]*height: 72px;[^}]*min-height: 72px;/);
  assert.match(css, /\.result-panel > \.download \{[\s\S]*min-height: 64px;/);
  assert.match(css, /@media \(max-width: 980px\) \{[\s\S]*\.input-card-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.input-progress \{[\s\S]*min-height: 70px;[\s\S]*display: grid;[\s\S]*gap: 10px;/);
  assert.match(css, /\.input-progress\.warn \{[\s\S]*min-height: 0;[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.background-swatch \{[\s\S]*border: 1px solid #dedcf4;/);
});

test("Eagle window uses the default title bar", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /<div class="window-controls" aria-label="window controls">/);
  assert.doesNotMatch(html, /id="windowCloseButton"[^>]*aria-label="Close window"/);
  assert.doesNotMatch(html, /id="windowMinimizeButton"[^>]*aria-label="Minimize window"/);
  assert.doesNotMatch(html, /id="windowFullscreenButton"[^>]*aria-label="Toggle fullscreen"/);
  assert.doesNotMatch(html, /<span class="traffic/);

  assert.doesNotMatch(css, /\.window-control-button\.fullscreen\[aria-pressed="true"\]/);
  assert.doesNotMatch(css, /\.window-controls::before/);
  assert.doesNotMatch(css, /\.window-controls::after/);
  assert.doesNotMatch(css, /\.window-control-button \{[\s\S]*background: #ff6159/);
  assert.match(css, /\.app-shell \{[\s\S]*width: 100vw;[\s\S]*padding: 0;/);
  assert.doesNotMatch(css, /\.window-control-button\.close:hover[\s\S]*background: #ff5f57/);
  assert.doesNotMatch(css, /\.window-control-button\.minimize:hover[\s\S]*background: #ffbd2e/);
  assert.doesNotMatch(css, /\.window-control-button\.fullscreen:hover[\s\S]*background: #28c840/);
  assert.doesNotMatch(css, /\.traffic/);

  assert.match(app, /setupEagleWindowControls\(\);/);
  assert.match(app, /if \(!els\.windowCloseButton\) return;/);
  assert.doesNotMatch(app, /windowMinimizeButton|windowFullscreenButton/);
  assert.doesNotMatch(app, /eagleWindow\.minimize\(\)/);
  assert.doesNotMatch(app, /eagleWindow\.isFullScreen\(\)/);
  assert.doesNotMatch(app, /eagleWindow\.setFullScreen/);
});

test("worker message listener remains active after progress messages", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /worker\.addEventListener\("message", handleMessage\);/);
  assert.doesNotMatch(app, /worker\.addEventListener\("message", handleMessage,\s*\{ once: true \}\);/);
});

test("web app passes preset-only detection strategy options", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /function readOptionValues\(\) \{[\s\S]*const values = \{ \.\.\.getPresetOptions\(els\.preset\.value\) \};[\s\S]*return buildAlignmentOptions\(values\);/);
});

test("result preview mouse wheel zooms and shift wheel pans", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /const WHEEL_PAN_DELTA_RATIO = 1\.35;/);
  assert.match(app, /if \(event\.shiftKey \|\| Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\) \* WHEEL_PAN_DELTA_RATIO\) \{/);
  assert.match(app, /panX -= event\.deltaX;/);
  assert.match(app, /panY -= event\.deltaY;/);
  assert.match(app, /const factor = Math\.exp\(-event\.deltaY \* WHEEL_ZOOM_SENSITIVITY\);/);
  assert.match(app, /setContinuousZoom\(lastAppliedZoom \* factor, event\);/);
  assert.doesNotMatch(app, /if \(event\.ctrlKey \|\| event\.metaKey\) \{/);
});

test("web app creates its worker from the module-relative plugin path", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /new Worker\(new URL\("align-worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
  assert.doesNotMatch(app, /new Worker\("\/web\/align-worker\.js"/);
});

test("web app names downloads from manifest plugin name and timestamp", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /const DEFAULT_DOWNLOAD_PLUGIN_NAME = "MergeMate";/);
  assert.match(app, /await fetch\("\.\.\/manifest\.json", \{ cache: "no-store" \}\);/);
  assert.match(app, /downloadPluginName = sanitizeDownloadNamePart\(manifest\.name\);/);
  assert.match(app, /return `\$\{sanitizeDownloadNamePart\(downloadPluginName\)\}_\$\{timestamp\}\.png`;/);
  assert.match(app, /els\.downloadLink\.download = buildDownloadFilename\(\);/);
  assert.doesNotMatch(app, /download = "merged\.png"/);
});

test("web app no longer exposes external mask input wiring", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(app, /maskImage/);
  assert.doesNotMatch(app, /maskMode/);
  assert.doesNotMatch(app, /readSelectedMask/);
  assert.doesNotMatch(app, /buildMaskOptions/);
});

test("web app no longer exposes comparison range wiring", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(app, /roiEnabled|roiX|roiY|roiWidth|roiHeight|roiTool|brushRadius|showComparisonMask/);
  assert.doesNotMatch(app, /buildOverlayRoiMask|createComparisonMaskPreview/);
  assert.doesNotMatch(app, /beginOverlaySelection|updateOverlaySelection|finishOverlaySelection/);
});

test("web app logs diagnostics to console instead of rendering diagnostics UI", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

  assert.match(app, /console\.log\("\[MergeMate\] run"/);
  assert.doesNotMatch(app, /\[MergeMate\] images|\[MergeMate\] alignment|\[MergeMate\] preflight|\[MergeMate\] image-read-error/);
  assert.doesNotMatch(app, /imageInfo|preflightStatus|preflightInfo|processingLog|diffStats|outputPrecheck/);
});
