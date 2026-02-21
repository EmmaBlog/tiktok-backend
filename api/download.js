import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No TikTok URL provided"
      });
    }

    // Launch browser
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // Extract video data
    const data = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");

      for (let script of scripts) {
        if (script.innerHTML.includes("playAddr")) {
          const json = script.innerHTML;
          const match = json.match(/"playAddr":"(.*?)"/);

          if (match) {
            return {
              video_url: match[1].replace(/\\u0026/g, "&"),
              thumbnail: document.querySelector("video")?.poster || "",
              title: document.title || ""
            };
          }
        }
      }

      return null;
    });

    await browser.close();

    if (!data || !data.video_url) {
      return res.status(500).json({
        status: false,
        message: "Failed to fetch video"
      });
    }

    // Get video size
    const head = await fetch(data.video_url, { method: "HEAD" });
    const bytes = head.headers.get("content-length");

    const sizeMB = bytes
      ? (parseInt(bytes) / (1024 * 1024)).toFixed(2)
      : "Unknown";

    // Determine quality
    const quality = sizeMB > 10 ? "HD" : "SD";

    res.json({
      status: true,
      video_url: data.video_url,
      thumbnail: data.thumbnail,
      title: data.title,
      size_mb: sizeMB,
      quality: quality
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.toString()
    });
  }
}
