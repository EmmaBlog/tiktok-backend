export default async function handler(req, res) {
  try {
    const { url, download } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "No URL provided" });

    // 1. Initial fetch to get session cookies
    const initialRes = await fetch(url, {
      headers: headers(),
      redirect: "follow"
    });

    // Grab cookies to bypass TikTok's "Save" restrictions
    const setCookie = initialRes.headers.get("set-cookie");
    const finalUrl = initialRes.url;

    // 2. Fetch HTML with the session cookies
    const htmlRes = await fetch(finalUrl, {
      headers: { ...headers(), "Cookie": setCookie }
    });

    const html = await htmlRes.text();
    const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);

    if (!jsonMatch) throw new Error("Failed to extract video data. TikTok might be blocking the request.");

    const jsonData = JSON.parse(jsonMatch[1]);
    const item = jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;

    if (!item) throw new Error("Video metadata not found or restricted.");

    // 3. TARGET THE NWM (No Watermark) URL
    // We use the ID to construct the direct CDN link if playAddr is restricted
    const videoId = item.id;
    const videoUrl = item.video.playAddr || `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`;

    // 4. DOWNLOAD LOGIC (Using Streams to prevent Memory Crashes)
    if (download === "true") {
      const videoFetch = await fetch(videoUrl, { headers: headers() });
      const arrayBuffer = await videoFetch.arrayBuffer();
      
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}.mp4"`);
      return res.send(Buffer.from(arrayBuffer));
    }

    // 5. RESPONSE FOR UI
    return res.json({
      status: true,
      title: item.desc || "TikTok Video",
      thumbnail: item.video.cover,
      video_url: videoUrl.replace("playwm", "play"), // Strip watermark
      audio_url: item.music.playUrl,
      author: {
        name: item.author.nickname,
        avatar: item.author.avatarThumb,
        region: item.locationCreated || "Global"
      },
      stats: {
        duration: item.video.duration,
        quality: item.video.ratio || "HD",
        size_mb: await getSize(videoUrl)
      }
    });

  } catch (e) {
    return res.status(500).json({ status: false, message: e.message });
  }
}

function headers() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Referer": "https://www.tiktok.com/"
  };
}

async function getSize(url) {
  try {
    const res = await fetch(url, { method: "HEAD", headers: headers() });
    const bytes = res.headers.get("content-length");
    return bytes ? (bytes / 1024 / 1024).toFixed(2) : "0.00";
  } catch { return "Unknown"; }
}
