// utils/previewWithPuppeteer.js
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer");
const { generateTicketPdf } = require("./ticketPdf");

/**
 * generateTicketPreviewPNGWithPuppeteer(ticket, options)
 * - ticket: ticket object passed to your existing generateTicketPdf()
 * - options:
 *    - viewport: {width, height} optional (defaults to 1200x1600)
 *    - waitFor: optional number of ms to wait before screenshot
 *
 * Returns: Promise<Buffer> PNG buffer (clean ticket render without viewer UI)
 */
async function generateTicketPreviewPNGWithPuppeteer(ticket, opts = {}) {
    const viewport = opts.viewport || { width: 1200, height: 1600 };
    const waitFor = opts.waitFor || 300;

    // 1) Generate PDF buffer
    const pdfBuffer = await generateTicketPdf(ticket);

    // 2) Convert to base64 for embedding
    const base64Pdf = pdfBuffer.toString("base64");

    // HTML that embeds PDF WITHOUT Chrome viewer
    const html = `
        <html>
            <body style="margin:0; padding:0; background:white;">
                <embed 
                    src="data:application/pdf;base64,${base64Pdf}" 
                    type="application/pdf" 
                    width="100%" 
                    height="100%" />
            </body>
        </html>
    `;

    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    let page;

    try {
        page = await browser.newPage();
        await page.setViewport(viewport);

        await page.setContent(html, { waitUntil: "load" });

        // Ensure rendering
        await new Promise((r) => setTimeout(r, waitFor));

        // Take clean screenshot of PDF only
        const screenshot = await page.screenshot({
            type: "png",
            fullPage: true
        });

        return screenshot;

    } finally {
        try { await browser.close(); } catch (e) {}
    }
}

module.exports = { generateTicketPreviewPNGWithPuppeteer };
