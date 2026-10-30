// Renders the alignment + merge pipeline as a terminal diagram, then runs the real
// algorithm on a synthetic image pair so the numbers shown come from src/core.js.
import { compositeAligned, findBestAlignmentWithFallback } from "../src/index.js";
import { PRESETS } from "../src/web-utils.js";

const useColor = process.env.NO_COLOR === undefined && (process.stdout.isTTY || process.env.FORCE_COLOR);
const skipDemo = process.argv.includes("--no-demo");

const palette = {
  cyan: [127, 216, 232],
  blue: [106, 168, 240],
  green: [127, 217, 154],
  yellow: [232, 200, 110],
  purple: [185, 160, 240],
  red: [240, 128, 128],
  gray: [138, 147, 166],
  white: [230, 233, 240],
};

const paint = (name, text, bold = false) => {
  if (!useColor) return text;
  const [r, g, b] = palette[name];
  return `\x1b[${bold ? "1;" : ""}38;2;${r};${g};${b}m${text}\x1b[0m`;
};
const c = Object.fromEntries(Object.keys(palette).map((name) => [name, (text) => paint(name, text)]));
const b = Object.fromEntries(Object.keys(palette).map((name) => [name, (text) => paint(name, text, true)]));

function visibleWidth(text) {
  let width = 0;
  for (const char of text.replace(/\x1b\[[0-9;]*m/g, "")) {
    const code = char.codePointAt(0);
    const wide = (code >= 0x1100 && code <= 0x115f)
      || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe4f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

const pad = (text, width) => text + " ".repeat(Math.max(0, width - visibleWidth(text)));
const center = (text, width) => {
  const space = Math.max(0, width - visibleWidth(text));
  return " ".repeat(Math.floor(space / 2)) + text + " ".repeat(Math.ceil(space / 2));
};

function box({ title, badge = "", lines, width, color }) {
  const inner = width - 4;
  const edge = (text) => paint(color, text);
  const head = badge
    ? pad(b[color](title), inner - visibleWidth(badge)) + badge
    : b[color](title);
  return [
    edge(`┌${"─".repeat(width - 2)}┐`),
    `${edge("│")} ${pad(head, inner)} ${edge("│")}`,
    ...lines.map((line) => `${edge("│")} ${pad(line, inner)} ${edge("│")}`),
    edge(`└${"─".repeat(width - 2)}┘`),
  ];
}

const LEFT = 58;
const LINK = 10;
const RIGHT = 38;
const TOTAL = LEFT + LINK + RIGHT;

function stageRow(left, right, linkLabel = "") {
  const height = Math.max(left.length, right?.length ?? 0);
  const out = [];
  for (let i = 0; i < height; i += 1) {
    const l = left[i] ?? " ".repeat(LEFT);
    let link = " ".repeat(LINK);
    if (right && i === 1) link = c.gray(" ─ ─ ─ ─▶ ");
    if (right && i === 2 && linkLabel) link = center(c.gray(linkLabel), LINK);
    out.push(pad(l, LEFT) + link + (right?.[i] ?? ""));
  }
  return out;
}

function arrowDown(label = "") {
  const mid = Math.floor(LEFT / 2);
  return [
    " ".repeat(mid) + c.gray("│") + (label ? "  " + c.gray(label) : ""),
    " ".repeat(mid) + c.gray("▼"),
  ];
}

// ---------------------------------------------------------------- live run

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function syntheticBase(width, height) {
  const rand = mulberry32(918);
  const image = makeImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      image.data[i] = (x * 255) / width;
      image.data[i + 1] = (y * 255) / height;
      image.data[i + 2] = 140;
      image.data[i + 3] = 255;
    }
  }
  for (let n = 0; n < 90; n += 1) {
    const rw = 8 + Math.floor(rand() * 50);
    const rh = 8 + Math.floor(rand() * 40);
    const rx = Math.floor(rand() * (width - rw));
    const ry = Math.floor(rand() * (height - rh));
    const color = [rand() * 255, rand() * 255, rand() * 255];
    for (let y = ry; y < ry + rh; y += 1) {
      for (let x = rx; x < rx + rw; x += 1) {
        const i = (y * width + x) * 4;
        image.data.set(color, i);
      }
    }
  }
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = Math.floor(rand() * 9) - 4;
    image.data[i] += noise;
    image.data[i + 1] += noise;
  }
  return image;
}

function crop(image, x0, y0, width, height) {
  const out = makeImage(width, height);
  for (let y = 0; y < height; y += 1) {
    const start = ((y0 + y) * image.width + x0) * 4;
    out.data.set(image.data.subarray(start, start + width * 4), y * width * 4);
  }
  return out;
}

function runDemo() {
  const base = syntheticBase(480, 320);
  const truth = { x: 173, y: 91 };
  const overlay = crop(base, truth.x, truth.y, 200, 150);
  // An edited patch the base does not have, so the match is realistic rather than perfect.
  for (let y = 20; y < 44; y += 1) {
    for (let x = 120; x < 180; x += 1) overlay.data.set([255, 255, 255, 255], (y * overlay.width + x) * 4);
  }

  const log = [];
  const started = performance.now();
  const onProgress = ({ phase, progress }) => {
    if (log.at(-1)?.phase === phase) {
      log.at(-1).progress = progress;
      return;
    }
    log.push({ phase, progress, ms: performance.now() - started });
  };
  const result = findBestAlignmentWithFallback(
    base,
    overlay,
    { ...PRESETS.standard, onProgress },
    { ...PRESETS.precise, onProgress },
  );
  const elapsed = performance.now() - started;
  const merged = result.status === "ok" ? compositeAligned(base, overlay, result) : undefined;
  return { base, overlay, truth, result, merged, log, elapsed };
}

// ---------------------------------------------------------------- render

function stageState(demo) {
  if (!demo) return {};
  const phases = new Set(demo.log.map((entry) => entry.phase));
  const tilesRan = phases.has("Selecting feature tiles");
  const coarseRan = phases.has("Coarse alignment");
  const ok = demo.result.status === "ok";
  const ran = c.green("● ran");
  const skip = c.gray("○ skip");
  return {
    corner: !tilesRan && !coarseRan && ok ? c.green("● hit") : c.gray("✕ miss"),
    coarse: coarseRan ? ran : skip,
    tiles: tilesRan ? ran : skip,
    vote: phases.has("Searching candidate offsets") ? ran : skip,
    verify: phases.has("Verifying candidates") ? ran : skip,
    judge: ok ? c.green(`● ${demo.result.status}`) : c.red(`● ${demo.result.status}`),
    fallback: demo.result.fallbackUsed ? c.yellow("● used") : c.gray("○ idle"),
    merge: demo.merged ? ran : skip,
  };
}

function renderDiagram(demo) {
  const s = PRESETS.standard;
  const p = PRESETS.precise;
  const state = stageState(demo);
  const out = [];
  const W = LEFT;

  out.push("");
  out.push(center(
    `${b.white("EAGLE MERGEMATE")}  ${c.gray("·")}  ${b.cyan("DETECT")} ${c.white("offset")}  ${c.gray("·")}  ${b.purple("MERGE")} ${c.white("layers")}`,
    TOTAL,
  ));
  out.push(c.gray("═".repeat(TOTAL)));
  out.push(center([
    `${c.cyan("■")} 早期確定`,
    `${c.green("■")} 候補探索`,
    `${c.yellow("■")} 全画素検証`,
    `${c.purple("■")} 判定・合成`,
  ].join("    "), TOTAL));
  out.push("");

  out.push(...stageRow(box({
    title: "INPUT · base + overlay (RGBA)",
    width: W,
    color: "gray",
    lines: [
      `${c.white("base")}     下に敷く画像 (= source)`,
      `${c.white("overlay")}  上に重ねる画像  ${c.gray("透明px / mask は比較外")}`,
      `${c.gray("求めるもの: overlay を置く整数 offset (x, y)")}`,
    ],
  })));
  out.push(...arrowDown("findBestAlignment()"));

  out.push(...stageRow(box({
    title: "1 · CORNER ANCHOR",
    badge: state.corner ?? "",
    width: W,
    color: "cyan",
    lines: [
      "4 隅にピッタリ置いた場合だけを全画素で照合",
      c.gray("(0,0)  (W-w,0)  (0,H-h)  (W-w,H-h)"),
      `exactMatch ≥ ${c.cyan("0.97")} なら即採用`,
    ],
  }), box({
    title: "HIT → return ok",
    width: RIGHT,
    color: "cyan",
    lines: [
      "以降の探索を全部スキップ",
      c.gray(`mode: ${s.cornerAnchorMode} (standard)`),
      c.gray(`      ${p.cornerAnchorMode} (precise)`),
      c.gray("      = 即決せず候補に混ぜる"),
    ],
  }), "accept"));
  out.push(...arrowDown("miss"));

  out.push(...stageRow(box({
    title: "2 · COARSE-TO-FINE",
    badge: state.coarse ?? "",
    width: W,
    color: "blue",
    lines: [
      `最大辺 ≥ ${c.blue(String(s.coarseMinDimension))}px の大きい画像だけ`,
      `${c.blue(String(s.coarseMaxDimension))}px に最近傍縮小 → 3〜6 を再帰実行`,
      "粗い offset ÷ scale → 近傍を原寸で再検証",
    ],
  }), box({
    title: "ok → return",
    width: RIGHT,
    color: "blue",
    lines: [
      "result.coarseToFine = true",
      c.gray("失敗なら原寸のタイル探索へ"),
    ],
  }), "ok"));
  out.push(...arrowDown("small image / not ok"));

  out.push(...stageRow(box({
    title: "3 · FEATURE TILES (overlay)",
    badge: state.tiles ?? "",
    width: W,
    color: "green",
    lines: [
      `${c.green(`${s.tileSize}px`)} タイルを ${c.green(`${s.tileStep}px`)} 間隔で切り出し`,
      `strong: 分散≥24 · エッジ≥8 · 色数≥8`,
      `weak  : 分散>0 ${c.gray("(フラット絵の保険・低順位)")}`,
      `4×4 領域で round-robin 並べ → 上位 ${c.green(String(s.maxOverlayTiles))}`,
      `各タイル → ${c.white("FNV-1a hash")} ${c.gray("(4×4 サンプル点)")}`,
    ],
  }), box({
    title: "why",
    width: RIGHT,
    color: "gray",
    lines: [
      "模様のある所だけ使う",
      "= 一致位置が1点に絞れる",
      c.gray("領域分散で小さな重なりも拾う"),
      c.gray(`sourceStep 分の位相も網羅`),
    ],
  })));
  out.push(...arrowDown());

  out.push(...stageRow(box({
    title: "4 · HASH VOTE (base)",
    badge: state.vote ?? "",
    width: W,
    color: "green",
    lines: [
      `base を ${c.green(`${s.sourceStep}px`)} 刻みでスライドし hash 計算`,
      "同じ hash のタイル → offset = (bx−tx, by−ty)",
      "offset ごとに votes++",
      `得票数上位 ${c.green(String(s.maxCandidates))} 件を候補に`,
    ],
  }), box({
    title: "投票のイメージ (例)",
    width: RIGHT,
    color: "gray",
    lines: [
      `(173,91) ${c.green("████████")} 8`,
      `( 41,12) ${c.green("█")}        1`,
      `(302,77) ${c.green("█")}        1`,
      c.gray("正解 offset に票が集中する"),
    ],
  })));
  out.push(...arrowDown());

  out.push(...stageRow(box({
    title: "5 · VERIFY (全画素)",
    badge: state.verify ?? "",
    width: W,
    color: "yellow",
    lines: [
      `各候補の ±${c.yellow(String(s.refineRadius))}px 近傍も含めて重なり全体を比較`,
      `exact = 一致px / 比較px   ${c.gray(`(tolerance 0)`)}`,
      "MAE   = RGBA の平均絶対誤差",
      `score = exact − min(0.5, MAE / 510)`,
      `上位 ${c.yellow(String(s.maxVerifiedCandidates))} 件 + コーナー候補をマージ`,
    ],
  })));
  out.push(...arrowDown("score 降順 → 比較px → votes"));

  out.push(...stageRow(box({
    title: "6 · CLASSIFY",
    badge: state.judge ?? "",
    width: W,
    color: "purple",
    lines: [
      `${pad(`比較px < ${c.purple(String(s.minComparedPixels))}`, 16)} → ${c.red("no-match")} ${c.gray("not-enough-overlap")}`,
      `${pad(`exact < ${c.purple("0.01")}`, 16)} → ${c.red("no-match")} ${c.gray("match-rate-too-low")}`,
      `2px超離れた次点が score×${c.purple(String(s.ambiguityRatio))} 以上`,
      `${pad(`  or 差 < ${c.purple("0.02")}`, 16)} → ${c.yellow("ambiguous")}`,
      `${pad("それ以外", 16)} → ${c.green("ok")}`,
    ],
  }), box({
    title: "FALLBACK",
    badge: state.fallback ?? "",
    width: RIGHT,
    color: "yellow",
    lines: [
      "no-match かつ standard なら",
      `${c.white("precise")} で全工程リトライ`,
      c.gray(`tile ${p.tileSize}/${p.tileStep} · step ${p.sourceStep}`),
      c.gray(`top ${p.maxOverlayTiles} tiles · ratio ${p.ambiguityRatio}`),
    ],
  }), "no-match"));
  out.push(...arrowDown("ok"));

  out.push(...stageRow(box({
    title: "7 · COMPOSITE · compositeAligned()",
    badge: state.merge ?? "",
    width: W,
    color: "purple",
    lines: [
      `出力範囲: ${c.white("union")} | base | overlay`,
      "背景色 (#ffffff) または透明で塗りつぶし",
      "base を描画 → overlay を offset 位置に alpha 合成",
      c.gray("overlay の alpha=0 px は描かない (下が透ける)"),
    ],
  }), box({
    title: "OUTPUT",
    width: RIGHT,
    color: "cyan",
    lines: [
      "merged RGBA",
      c.gray("→ preview / 微調整 / PNG export"),
    ],
  })));
  return out;
}

function bar(value, width, color) {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return c[color]("█".repeat(filled)) + c.gray("░".repeat(width - filled));
}

function renderMiniMap(demo) {
  const { base, overlay, result, merged } = demo;
  const minX = Math.min(0, result.offsetX);
  const minY = Math.min(0, result.offsetY);
  const cols = 44;
  const scale = cols / merged.width;
  const rows = Math.max(4, Math.round(merged.height * scale * 0.5));
  const toCol = (x) => Math.round((x - minX) * scale);
  const toRow = (y) => Math.round((y - minY) * scale * 0.5);
  const bx = [toCol(0), toCol(base.width) - 1];
  const by = [toRow(0), toRow(base.height) - 1];
  const ox = [toCol(result.offsetX), toCol(result.offsetX + overlay.width) - 1];
  const oy = [toRow(result.offsetY), toRow(result.offsetY + overlay.height) - 1];
  const lines = [];
  for (let r = 0; r < rows; r += 1) {
    let line = "";
    for (let col = 0; col < cols; col += 1) {
      const inO = col >= ox[0] && col <= ox[1] && r >= oy[0] && r <= oy[1];
      const inB = col >= bx[0] && col <= bx[1] && r >= by[0] && r <= by[1];
      line += inO ? c.purple("▓") : inB ? c.blue("░") : " ";
    }
    lines.push(line);
  }
  return lines;
}

function renderDemo(demo) {
  const { base, overlay, truth, result, log, elapsed } = demo;
  const out = [];
  const title = ` live run · base ${base.width}×${base.height} + overlay ${overlay.width}×${overlay.height} (crop @ ${truth.x},${truth.y} + 白パッチ) `;
  out.push("");
  out.push(c.gray("┌──┤") + c.white(title) + c.gray(`├${"─".repeat(Math.max(0, TOTAL - visibleWidth(title) - 6))}┐`));
  for (const entry of log) {
    const time = c.gray(`${entry.ms.toFixed(1).padStart(7)}ms`);
    const row = `${time}  ${pad(c.green(entry.phase), 34)} ${bar(entry.progress, 20, "cyan")} ${c.gray(`${Math.round(entry.progress * 100)}%`.padStart(4))}`;
    out.push(`${c.gray("│")} ${pad(row, TOTAL - 4)} ${c.gray("│")}`);
  }
  out.push(c.gray(`└${"─".repeat(TOTAL - 2)}┘`));

  out.push("");
  out.push(`  ${b.yellow("verified candidates")}`);
  out.push(c.gray("    offset      score                       exact   votes"));
  for (const candidate of (result.candidates ?? []).slice(0, 5)) {
    const isBest = candidate.offsetX === result.offsetX && candidate.offsetY === result.offsetY;
    const label = `(${candidate.offsetX},${candidate.offsetY})`.padEnd(11);
    out.push(`  ${isBest ? c.green("»") : " "} ${isBest ? b.white(label) : c.gray(label)} ${bar(Math.max(0, candidate.score), 20, isBest ? "green" : "gray")} ${candidate.score.toFixed(3)}  ${candidate.exactMatchRatio.toFixed(3)}    ${String(candidate.votes).padStart(4)}`);
  }

  if (demo.merged) {
    out.push("");
    out.push(`  ${b.purple("merged")} ${c.gray(`${demo.merged.width}×${demo.merged.height}`)}   ${c.blue("░")} base   ${c.purple("▓")} overlay @ (${result.offsetX}, ${result.offsetY})`);
    for (const line of renderMiniMap(demo)) out.push(`    ${line}`);
  }

  const verdict = result.status === "ok" ? c.green(result.status) : c.red(result.status);
  const correct = result.offsetX === truth.x && result.offsetY === truth.y;
  out.push("");
  out.push(`${c.cyan("~/eagle-mergemate $")} ${c.white("npm run diagram")}`);
  out.push([
    `${c.gray("preset")} ${c.white("[standard]")}`,
    `${c.gray("result")} [${verdict} (${result.offsetX}, ${result.offsetY})]`,
    `${c.gray("truth")} ${correct ? c.green("[match]") : c.red("[differs]")}`,
    `${c.gray("exact")} [${result.exactMatchRatio?.toFixed(3)}]`,
    `${c.gray("time")} [${elapsed.toFixed(0)}ms]`,
  ].join("   "));
  out.push("");
  return out;
}

const demo = skipDemo ? undefined : runDemo();
const lines = renderDiagram(demo);
if (demo) lines.push(...renderDemo(demo));
else lines.push("");
process.stdout.write(`${lines.join("\n")}\n`);
