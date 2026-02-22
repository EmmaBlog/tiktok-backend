import fetch from "node-fetch";

export default async function handler(req, res) {

  try {

    const { url } = req.query;

    if (!url) {
      return res.json({
        status: false,
        message: "No URL provided"
      });
    }

    // Resolve short URL
    const resolve = await fetch(url, {
      redirect: "follow"
    });

    const finalUrl = resolve.url;

    // Extract video ID
    const idMatch = finalUrl.match(/video\/(\d+)/);

    if (!idMatch) {
      return res.json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    const videoID = idMatch[1];

    // TikTok internal API
    const apiUrl =
      `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoID}`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "com.ss.android.ugc.trill/494+ (Linux; U; Android 10)"
      }
    });

    const json = await response.json();

    if (!json.aweme_list || json.aweme_list.length === 0) {
      return res.json({
        status: false,
        message: "Video not found"
      });
    }

    const video = json.aweme_list[0];

    const videoUrl =
      video.video.play_addr.url_list[0];

    const audioUrl =
      video.music.play_url.url_list[0];

    const thumbnail =
      video.video.cover.url_list[0];

    const title =
      video.desc;

    const author =
      video.author.nickname;

    const duration =
      video.video.duration / 1000;

    // Get size
    const head = await fetch(videoUrl, { method: "HEAD" });

    const bytes = head.headers.get("content-length");

    const sizeMB = bytes
      ? (bytes / 1024 / 1024).toFixed(2)
      : "Unknown";

    const quality =
      video.video.ratio === "720p"
        ? "HD"
        : "SD";

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
