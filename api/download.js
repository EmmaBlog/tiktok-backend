export default async function handler(req, res) {
  try {
    const { url, download } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No URL provided"
      });
    }

    // Resolve shortened URL
    const resolve = await fetch(url, {
      redirect: "follow",
      headers: browserHeaders()
    });

    const finalUrl = resolve.url;

    const videoID = extractVideoId(finalUrl);

    if (!videoID) {
      return res.status(400).json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    // Fetch TikTok API
    const api = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoID}`;

    const response = await fetch(api, {
      headers: browserHeaders()
    });

    if (!response.ok) {
      throw new Error(`TikTok API error: ${response.status}`);
    }

    const json = await response.json();

    const item = json.aweme_list?.[0];

    if (!item) {
      return res.status(404).json({
        status: false,
        message: "Video not found"
      });
    }

    // Extract best video URL (no watermark)
    let videoUrl = extractBestVideoUrl(item);
    if (!videoUrl) {
      throw new Error("No video URL found in API response");
    }

    const audioUrl = item.music?.play_url?.url_list?.[0];
    const thumbnail = item.video?.cover?.url_list?.[0];
    const title = item.desc || "Untitled";
    const duration = item.video?.duration;
    const quality = item.video?.ratio || "HD";

    // Download mode
    if (download === "true") {
      // Fetch video from TikTok CDN
      const videoRes = await fetch(videoUrl, {
        headers: browserHeaders()
      });

      if (!videoRes.ok) {
        throw new Error(`Failed to fetch video from TikTok: ${videoRes.status} ${videoRes.statusText}`);
      }

      // Set headers for download
      res.setHeader("Content-Type", videoRes.headers.get("content-type") || "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="tiktok-${videoID}.mp4"`);

      // Optional: forward content-length if present
      const contentLength = videoRes.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);

      // Stream video directly to client (no buffering)
      return videoRes.body.pipe(res);
    }

    // Metadata mode – get file size
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
    // Return proper error status
    return res.status(500).json({
      status: false,
      message: e.toString()
    });
  }
}

// Browser-like headers to avoid blocking
function browserHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://www.tiktok.com/",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.tiktok.com"
  };
}

// Extract video ID from various URL formats
function extractVideoId(url) {
  const patterns = [
    /video\/(\d+)/,
    /\/v\/(\d+)/,
    /\/t\/(\d+)/,
    /(\d{15,})/ // raw numeric ID
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Extract the highest quality video URL (no watermark)
function extractBestVideoUrl(item) {
  // Try bit_rate array (multiple qualities)
  const bitRates = item.video?.bit_rate;
  if (bitRates && bitRates.length) {
    // Sort by bitrate descending (higher = better)
    const sorted = [...bitRates].sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
    for (const br of sorted) {
      const url = br.play_addr?.url_list?.[0];
      if (url) return url.replace("playwm", "play");
    }
  }

  // Fallback to play_addr
  const fallbackUrl = item.video?.play_addr?.url_list?.[0];
  if (fallbackUrl) return fallbackUrl.replace("playwm", "play");

  return null;
}

// Get file size in MB (with error fallback)
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
