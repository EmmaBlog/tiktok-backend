import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No URL provided",
      });
    }

    // Fetch TikTok data from TikWM
    const api = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const json = await api.json();

    if (!json.data) {
      return res.status(404).json({
        status: false,
        message: "Video not found",
      });
    }

    const videoUrl = json.data.play;
    const audioUrl = json.data.music;
    const thumbnail = json.data.cover;
    const title = json.data.title;
    const author = json.data.author.nickname;
    const duration = json.data.duration;
    const region = json.data.region;

    // Get video size in MB
    const headResp = await fetch(videoUrl, { method: "HEAD" });
    const sizeBytes = headResp.headers.get("content-length");
    const sizeMB = sizeBytes ? (parseInt(sizeBytes) / (1024 * 1024)).toFixed(2) : "Unknown";

    // Determine quality (TikTok usually serves HD as 720p+)
    const quality = json.data.video_resolution >= 720 ? "HD" : "SD";

    res.status(200).json({
      status: true,
      video_url: videoUrl,
      audio_url: audioUrl,
      thumbnail: thumbnail,
      title: title,
      author: author,
      duration: duration,
      region: region,
      size_mb: sizeMB,
      quality: quality
    });
  } catch (e) {
    res.status(500).json({
      status: false,
      error: e.toString(),
    });
  }
}
