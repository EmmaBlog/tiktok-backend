export default async function handler(req, res) {
  try {
    const { url, download } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No URL provided"
      });
    }

    // Resolve short URL
    const resolve = await fetch(url, {
      redirect: "follow",
      headers: headers()
    });

    const finalUrl = resolve.url;

    // Fetch HTML page
    const htmlRes = await fetch(finalUrl, {
      headers: headers()
    });

    const html = await htmlRes.text();

    // Extract JSON data from page
    const jsonMatch = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/
    );

    if (!jsonMatch) {
      throw new Error("Failed to extract video data");
    }

    const jsonData = JSON.parse(jsonMatch[1]);

    const item =
      jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;

    if (!item) {
      throw new Error("Video not found");
    }

    // No watermark video
    const videoUrl =
      item.video.playAddr.replace("playwm", "play");

    const audioUrl = item.music.playUrl;
    const thumbnail = item.video.cover;
    const title = item.desc;
    const duration = item.video.duration;
    const quality = item.video.ratio || "HD";

    // DOWNLOAD MODE
    if (download === "true") {

      const videoRes = await fetch(videoUrl, {
        headers: headers()
      });

      const buffer = Buffer.from(await videoRes.arrayBuffer());

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="tiktok.mp4"`);

      return res.send(buffer);
    }

    // SIZE
    const sizeMB = await getSize(videoUrl);

    return res.json({
      status: true,
      video_url: videoUrl,
      audio_url: audioUrl,
      thumbnail,
      title,
      duration,
      size_mb: sizeMB,
      quality
    });

  } catch (e) {

    return res.status(500).json({
      status: false,
      message: e.message
    });

  }
}


// Headers
function headers() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://www.tiktok.com/",
    "Accept-Language": "en-US,en;q=0.9"
  };
}


// File size
async function getSize(url) {

  try {

    const res = await fetch(url, {
      method: "HEAD",
      headers: headers()
    });

    const bytes = res.headers.get("content-length");

    if (!bytes) return "Unknown";

    return (bytes / 1024 / 1024).toFixed(2);

  } catch {

    return "Unknown";

  }

}
