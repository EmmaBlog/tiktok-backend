export default async function handler(req, res) {

  try {

    const { url, download } = req.query;

    if (!url) {
      return res.json({
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
      return res.json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    // Fetch TikTok API
    const api =
      `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoID}`;

    const response = await fetch(api, {
      headers: browserHeaders()
    });

    const json = await response.json();

    const item = json.aweme_list?.[0];

    if (!item) {
      return res.json({
        status: false,
        message: "Video not found"
      });
    }

    // BEST VIDEO SOURCE (no watermark)
    let videoUrl =
      item.video?.bit_rate?.[0]?.play_addr?.url_list?.[0] ||
      item.video?.play_addr?.url_list?.[0];

    // Clean watermark params
    videoUrl = videoUrl.replace("playwm", "play");

    const audioUrl =
      item.music?.play_url?.url_list?.[0];

    const thumbnail =
      item.video?.cover?.url_list?.[0];

    const title =
      item.desc;

    const duration =
      item.video?.duration;

    const sizeMB =
      await getSize(videoUrl);

    const quality =
      item.video?.ratio || "HD";

    // Download mode
    if (download === "true") {

      const videoRes =
        await fetch(videoUrl, {
          headers: browserHeaders()
        });

      const buffer =
        Buffer.from(
          await videoRes.arrayBuffer()
        );

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

    // JSON response
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

  }
  catch (e) {

    return res.json({
      status: false,
      message: e.toString()
    });

  }

}


// Browser headers (IMPORTANT)
function browserHeaders() {

  return {

    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",

    "Referer":
      "https://www.tiktok.com/",

    "Accept":
      "*/*"

  };

}


// Extract video ID
function extractVideoId(url) {

  const match =
    url.match(/video\/(\d+)/);

  return match ? match[1] : null;

}


// Get size
async function getSize(url) {

  try {

    const res =
      await fetch(url, {
        method: "HEAD",
        headers: browserHeaders()
      });

    const bytes =
      res.headers.get("content-length");

    if (!bytes)
      return "Unknown";

    return (
      bytes / 1024 / 1024
    ).toFixed(2);

  }
  catch {

    return "Unknown";

  }

}
