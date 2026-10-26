// Zero-dependency dev server: serves the app and proxies county parcel
// queries, for browsers that block the cross-origin call to the county API.
// Usage: node server.mjs [port]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const COUNTY = "https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/FeatureServer/0/query";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/parcels") {
    try {
      const upstream = await fetch(`${COUNTY}?${url.searchParams}`, { signal: AbortSignal.timeout(10000) });
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(await upstream.text());
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `County API unreachable: ${err.message}` } }));
    }
    return;
  }

  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`Home Lock running at http://localhost:${PORT}`));
