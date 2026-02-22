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
      headers: browserHeaders()
    });

    const finalUrl = resolve.url;

    // Extract video ID
    const videoID = extractVideoId(finalUrl);

    if (!videoID) {
      return res.status(400).json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    // Generate random device values (prevents denied error)
    const device_id = randomDigits(18);
    const iid = randomDigits(18);

    // Official TikTok mobile API (works even if download disabled)
    const api =
      `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?` +
      `aweme_id=${videoID}` +
      `&device_id=${device_id}` +
      `&iid=${iid}` +
      `&app_name=musical_ly` +
      `&channel=googleplay` +
      `&device_platform=android` +
      `&version_code=190103` +
      `&version_name=19.1.3`;

    const response = await fetch(api, {
      headers: browserHeaders()
    });

    if (!response.ok) {
      throw new Error("TikTok API blocked request");
    }

    const json = await response.json();

    const item = json.aweme_list?.[0];

    if (!item) {
      throw new Error("Video not found");
    }

    // Get best quality video URL
    const videoUrl = extractBestVideoUrl(item);

    if (!videoUrl) {
      throw new Error("Failed to extract video URL");
    }

    const audioUrl = item.music?.play_url?.url_list?.[0] || null;
    const thumbnail = item.video?.cover?.url_list?.[0] || null;
    const title = item.desc || "TikTok Video";
    const duration = item.video?.duration || 0;
    const quality = item.video?.ratio || "HD";

    // DOWNLOAD MODE
    if (download === "true") {

      const videoRes = await fetch(videoUrl, {
        headers: browserHeaders()
      });

      const buffer = Buffer.from(await videoRes.arrayBuffer());

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="tiktok-${videoID}.mp4"`);

      return res.send(buffer);
    }

    // METADATA MODE
    const sizeMB = await getSize(videoUrl);

    return res.json({
      status: true,
      video_url: videoUrl,
      audio_url: audioUrl,
      thumbnail: thumbnail,
      title: title,
      duration: duration,
      size_mb: sizeMB,
      quality: quality
    });

  } catch (e) {
    return res.status(500).json({
      status: false,
      message: e.message
    });
  }
}


// Generate random numbers
function randomDigits(length) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}


// Browser headers (prevents blocking)
function browserHeaders() {
  return {
    "User-Agent": "com.zhiliaoapp.musically/190103 (Linux; Android 10)",
    "Accept": "application/json",
    "Referer": "https://www.tiktok.com/",
    "Connection": "keep-alive"
  };
}


// Extract video ID
function extractVideoId(url) {
  const patterns = [
    /video\/(\d+)/,
    /\/v\/(\d+)/,
    /\/t\/(\d+)/,
    /(\d{15,})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}


// Extract highest quality video
function extractBestVideoUrl(item) {

  const bitRates = item.video?.bit_rate;

  if (bitRates && bitRates.length) {

    const sorted = bitRates.sort(
      (a, b) => (b.bit_rate || 0) - (a.bit_rate || 0)
    );

    const best = sorted[0];

    const url = best.play_addr?.url_list?.[0];

    if (url) return url.replace("playwm", "play");
  }

  const fallback = item.video?.play_addr?.url_list?.[0];

  if (fallback) return fallback.replace("playwm", "play");

  return null;
}


// Get file size
async function getSize(url) {
  try {

    const res = await fetch(url, {
      method: "HEAD",
      headers: browserHeaders()
    });

    const bytes = res.headers.get("content-length");

    if (!bytes) return "Unknown";

    return (bytes / 1024 / 1024).toFixed(2);

  } catch {

    return "Unknown";

  }
}
