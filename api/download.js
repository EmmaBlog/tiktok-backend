export default async function handler(req, res) {

  try {

    const { url, download } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No URL provided"
      });
    }

    // Resolve short link
    const resolve = await fetch(url, {
      redirect: "follow"
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

    // Fetch TikTok data
    const api =
      `https://www.tiktok.com/api/item/detail/?itemId=${videoID}`;

    const response = await fetch(api, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://www.tiktok.com/"
      }
    });

    const json = await response.json();

    const item = json.itemInfo.itemStruct;

    const videoUrl = item.video.playAddr;
    const audioUrl = item.music.playUrl;

    // DOWNLOAD MODE
    if (download === "true") {

      const videoRes = await fetch(videoUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0",
          "Referer":
            "https://www.tiktok.com/"
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

      res.send(buffer);

      return;
    }

    // METADATA MODE
    const sizeMB =
      await getFileSize(videoUrl);

    const quality =
      item.video.ratio || "HD";

    res.json({

      status: true,

      video_url: videoUrl,

      audio_url: audioUrl,

      thumbnail: item.video.cover,

      title: item.desc,

      author: item.author.nickname,

      duration: item.video.duration,

      size_mb: sizeMB,

      quality: quality

    });

  }
  catch (e) {

    res.status(500).json({
      status: false,
      message: e.toString()
    });

  }

}


// Extract ID function (REQUIRED)
function extractVideoId(url) {

  const match =
    url.match(/video\/(\d+)/);

  return match ? match[1] : null;

}


// File size function
async function getFileSize(url) {

  try {

    const head =
      await fetch(url, {
        method: "HEAD"
      });

    const bytes =
      head.headers.get(
        "content-length"
      );

    return bytes
      ? (bytes / 1024 / 1024).toFixed(2)
      : "Unknown";

  }
  catch {

    return "Unknown";

  }

}
