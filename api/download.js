export default async function handler(req, res) {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No TikTok URL provided"
      });
    }

    // Call TikWM API
    const api = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const data = await api.json();

    if (!data || !data.data) {
      return res.status(500).json({
        status: false,
        message: "Failed to fetch video"
      });
    }

    return res.status(200).json({
      status: true,
      video_url: data.data.play,
      audio_url: data.data.music,
      thumbnail: data.data.cover,
      title: data.data.title,
      author: data.data.author.nickname,
      duration: data.data.duration
    });

  } catch (e) {
    return res.status(500).json({
      status: false,
      message: e.toString()
    });
  }
}
