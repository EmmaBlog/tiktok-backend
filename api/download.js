export default async function handler(req, res) {
  try {
    const { url, download } = req.query;
    if (!url) return res.status(400).json({ status: false, message: 'No URL provided' });

    // Resolve and extract ID (same as before)
    const resolve = await fetch(url, { redirect: "follow" });
    const finalUrl = resolve.url;
    const videoID = extractVideoId(finalUrl);
    if (!videoID) return res.status(400).json({ status: false, message: 'Invalid TikTok URL' });

    // Fetch metadata from TikTok internal API
    const api = `https://www.tiktok.com/api/item/detail/?itemId=${videoID}`;
    const response = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const json = await response.json();
    const item = json.itemInfo.itemStruct;

    // If download flag is set, stream the video
    if (download === 'true') {
      const videoUrl = item.video.playAddr;
      const videoRes = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.tiktok.com/'
        }
      });
      if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
      res.setHeader('Content-Type', videoRes.headers.get('content-type') || 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="tiktok-${videoID}.mp4"`);
      res.setHeader('Content-Length', videoRes.headers.get('content-length'));
      videoRes.body.pipe(res);
      return;
    }

    // Otherwise return metadata as before
    res.json({
      status: true,
      video_url: item.video.playAddr,
      audio_url: item.music.playUrl,
      thumbnail: item.video.cover,
      title: item.desc,
      author: item.author.nickname,
      duration: item.video.duration,
      size_mb: await getFileSize(item.video.playAddr),
      quality: item.video.ratio || 'Unknown'
    });

  } catch (e) {
    res.status(500).json({ status: false, message: e.toString() });
  }
}

async function getFileSize(url) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const bytes = head.headers.get('content-length');
    return bytes ? (bytes / 1024 / 1024).toFixed(2) : 'Unknown';
  } catch {
    return 'Unknown';
  }
}
