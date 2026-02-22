export default async function handler(req, res) {

  try {

    const { url } = req.query;

    if (!url) {
      return res.json({
        status: false,
        message: "No URL provided"
      });
    }

    // Resolve shortened URL
    const resolve = await fetch(url, {
      redirect: "follow"
    });

    const finalUrl = resolve.url;

    // Extract video ID
    const match = finalUrl.match(/video\/(\d+)/);

    if (!match) {
      return res.json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    const videoID = match[1];

    // TikTok web API (THIS works for disabled downloads)
    const api =
      `https://www.tiktok.com/api/item/detail/?itemId=${videoID}`;

    const response = await fetch(api, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    const json = await response.json();

    const item = json.itemInfo.itemStruct;

    const videoUrl =
      item.video.playAddr;

    const audioUrl =
      item.music.playUrl;

    const thumbnail =
      item.video.cover;

    const title =
      item.desc;

    const author =
      item.author.nickname;

    const duration =
      item.video.duration;

    // Get file size
    const head = await fetch(videoUrl, {
      method: "HEAD"
    });

    const bytes =
      head.headers.get("content-length");

    const sizeMB =
      bytes
        ? (bytes / 1024 / 1024).toFixed(2)
        : "Unknown";

    const quality =
      item.video.ratio || "Unknown";

    res.json({
      status: true,
      video_url: videoUrl,
      audio_url: audioUrl,
      thumbnail: thumbnail,
      title: title,
      author: author,
      duration: duration,
      size_mb: sizeMB,
      quality: quality
    });

  } catch (e) {

    res.json({
      status: false,
      message: e.toString()
    });

  }

}
