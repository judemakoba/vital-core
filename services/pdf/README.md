# VitalCore PDF Sidecar

Tiny headless-Chromium service that turns HTML into PDF with
`displayHeaderFooter: false`. Used by the lab and radiology pages to
replace the old `window.open → document.write → printWindow.print()`
flow that left Chrome's print-engine headers/footers (date, document
title, "about:blank" URL, page count) all over the report.

## Endpoints

- `GET /health` — `{"ok": true}`
- `POST /render` — `{"html": "<!doctype html>...", ...pdfOpts}` →
  `application/pdf` (binary)

The caller can pass any Puppeteer `page.pdf()` option in the body
(e.g. `format`, `landscape`, `margin`) — they're forwarded through
except `displayHeaderFooter`, which is force-locked to `false` so no
client can accidentally turn the headers/footers back on.

## Network

This service is on the `pdf-net` internal Docker network. Only the
`vitalcore-app` container can reach it. It's not exposed to the host
or to the public internet.

The vitalcore-app calls it via `http://pdf:3001/render`.
