import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);

export async function loadPng(path) {
  const { PNG } = loadPngJs();
  const buffer = await readFile(path);
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  };
}

export async function savePng(path, image) {
  const { PNG } = loadPngJs();
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  await writeFile(path, PNG.sync.write(png));
}

function loadPngJs() {
  try {
    return require("pngjs");
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      throw new Error("PNG file IO requires installing the optional peer dependency: npm install pngjs");
    }
    throw error;
  }
}
