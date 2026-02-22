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
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
      }
    });

    const finalUrl = resolve.url;

    // Extract Video ID
    const videoID = extractVideoId(finalUrl);

    if (!videoID) {
      return res.status(400).json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    // Fetch TikTok metadata
    const api =
      `https://www.tiktok.com/api/item/detail/?itemId=${videoID}`;

    const response = await fetch(api, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
        "Referer": "https://www.tiktok.com/"
      }
    });

    const json = await response.json();

    const item = json?.itemInfo?.itemStruct;

    if (!item) {
      return res.status(500).json({
        status: false,
        message: "Failed to fetch video"
      });
    }

    // Get BEST video source (works even if download disabled)
    const videoUrl =
      item.video.bitRate?.[0]?.playAddr ||
      item.video.playAddr ||
      item.video.downloadAddr ||
      null;

    if (!videoUrl) {
      return res.status(500).json({
        status: false,
        message: "No playable video found"
      });
    }

    const audioUrl =
      item.music?.playUrl || null;

    const thumbnail =
      item.video?.cover || null;

    const title =
      item.desc || "TikTok Video";

    const duration =
      item.video?.duration || 0;

    // Get file size
    const sizeMB = await getFileSize(videoUrl);

    const quality =
      item.video?.ratio || "Unknown";

    // If download requested → download file
    if (download === "true") {

      const videoRes = await fetch(videoUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
          "Referer": "https://www.tiktok.com/"
        }
      });

      const buffer =
        Buffer.from(await videoRes.arrayBuffer());

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tiktok-${videoID}.mp4"`
      );

      return res.send(buffer);
    }

    // Otherwise return JSON
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
      message: e.toString()
    });
  }
}


// Extract video ID
function extractVideoId(url) {

  const regex =
    /video\/(\d+)/;

  const match =
    url.match(regex);

  return match ? match[1] : null;
}


// Get file size in MB
async function getFileSize(url) {
  try {

    const res = await fetch(url, {
      method: "HEAD"
    });

    const bytes =
      res.headers.get("content-length");

    if (!bytes) return "Unknown";

    return (
      bytes / 1024 / 1024
    ).toFixed(2);

  } catch {

    return "Unknown";
  }
}
