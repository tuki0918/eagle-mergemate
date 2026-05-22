import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number.parseInt(process.env.PORT ?? "5173", 10);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/") {
      res.writeHead(302, {
        "Location": "/web/index.html",
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }

    const pathname = url.pathname;
    const filePath = resolve(root, `.${normalize(pathname)}`);

    if (!filePath.startsWith(root)) {
      respond(res, 403, "Forbidden");
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      respond(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error?.code === "ENOENT") {
      respond(res, 404, "Not found");
      return;
    }
    respond(res, 500, "Internal server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PNG Alignment Tool: http://127.0.0.1:${port}/`);
});

function respond(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}
