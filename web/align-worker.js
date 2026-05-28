import { compositeAligned, findBestAlignmentWithFallback } from "../src/index.js";

self.addEventListener("message", (event) => {
  const { base, overlay, options, fallbackOptions, outputOptions } = event.data;
  try {
    restoreImageData(base);
    restoreImageData(overlay);
    const progress = (event) => {
      self.postMessage({ type: "progress", ...event });
    };
    const result = findBestAlignmentWithFallback(
      base,
      overlay,
      { ...options, onProgress: progress },
      fallbackOptions ? { ...fallbackOptions, onProgress: progress } : undefined,
    );
    if (result.status !== "ok") {
      self.postMessage({ type: "result", ok: true, result, merged: undefined });
      return;
    }

    self.postMessage({ type: "progress", progress: 0.99, phase: "Building merged image" });
    const merged = compositeAligned(base, overlay, result, outputOptions);
    self.postMessage({
      type: "result",
      ok: true,
      result,
      merged: {
        width: merged.width,
        height: merged.height,
        buffer: merged.data.buffer,
      },
    }, [merged.data.buffer]);
  } catch (error) {
    self.postMessage({
      type: "result",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

function restoreImageData(image) {
  image.data = new Uint8ClampedArray(image.buffer);
  delete image.buffer;
}
