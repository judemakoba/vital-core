// server.mjs — VitalCore PDF rendering sidecar
//
// Single endpoint: POST /render
//   Body: { html: string, ...puppeteerPdfOptions }
//   Returns: application/pdf (binary)
//
// The vitalcore-app container builds the lab/radiology report HTML using the
// shared template engine (lib/lab-templates.ts, lib/radiology-templates.ts),
// then POSTs that HTML here. We hand it to headless Chromium with
// displayHeaderFooter: false, so the four circled items in the previous
// print preview (date, "Lab Report - Full Blood Count", "about:blank",
// "1/1") never appear.
//
// Note: this service is on a private internal network — only the app
// container can reach it. There is no auth here because the app
// authenticates the user and only forwards requests after auth.

import express from 'express';
import puppeteer from 'puppeteer';

const app = express();

// Allow large report HTML (lab reports with letterhead + 30-row table
// can be ~15 KB; radiology a bit less. 1 MB is plenty of headroom).
app.use(express.json({ limit: '1mb' }));

// Single Chromium instance, reused across requests. launch() is slow
// (~1-2s on first start), so we keep it warm.
let browser = null;
let launching = null;

async function getBrowser() {
    if (browser && browser.connected) return browser;
    if (launching) return launching;
    launching = (async () => {
        // PUPPETEER_EXECUTABLE_PATH overrides the bundled Chromium — useful
        // when running the dev machine without the full puppeteer download.
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        const b = await puppeteer.launch({
            headless: true,
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',  // /dev/shm is small in containers
            ],
        });
        browser = b;
        launching = null;
        return b;
    })();
    return launching;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render', async (req, res) => {
    const { html, ...pdfOpts } = req.body || {};
    if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html (string) is required' });
    }

    let page = null;
    try {
        const b = await getBrowser();
        page = await b.newPage();

        // Set HTML and wait for any inline resources to load.
        // We use 'load' (not 'networkidle0') because some images may
        // legitimately 404 in the report and we don't want to block
        // forever. The report's CSS is inline so layout is immediate.
        await page.setContent(html, { waitUntil: 'load', timeout: 15000 });

        // Apply any caller-supplied pdf options on top of safe defaults.
        const finalOpts = {
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: false,   // <-- this kills all 4 circled items
            margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
            ...pdfOpts,
        };
        // Force displayHeaderFooter: false even if caller tried to set true.
        finalOpts.displayHeaderFooter = false;

        const pdf = await page.pdf(finalOpts);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(pdf.length));
        res.end(pdf);
    } catch (e) {
        console.error('render error', e);
        res.status(500).json({ error: e.message || 'render failed' });
    } finally {
        if (page) {
            try { await page.close(); } catch {}
        }
    }
});

// Graceful shutdown
async function shutdown() {
    if (browser) {
        try { await browser.close(); } catch {}
    }
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`vitalcore-pdf listening on :${PORT}`);
});
