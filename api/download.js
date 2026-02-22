export default async function handler(req, res) {
  try {
    const { url, download } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "No URL provided" });

    // 1. Initial fetch to capture session cookies + final URL after redirects
    const initialRes = await fetch(url, {
      headers: headers(),
      redirect: "follow"
    });

    const finalUrl = initialRes.url; // use this as Referer
    // Get ALL set-cookie headers (important!)
    const cookieArray = initialRes.headers.getSetCookie ? initialRes.headers.getSetCookie() : [];
    const cookieHeader = cookieArray.length ? cookieArray.join('; ') : initialRes.headers.get("set-cookie") || "";

    // 2. Fetch HTML with cookies (same as before)
    const htmlRes = await fetch(finalUrl, {
      headers: { ...headers(), Cookie: cookieHeader }
    });

    const html = await htmlRes.text();
    const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);

    if (!jsonMatch) throw new Error("Failed to extract video data. TikTok might be blocking.");

    const jsonData = JSON.parse(jsonMatch[1]);
    const item = jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;

    if (!item) throw new Error("Video metadata not found or restricted.");

    const videoId = item.id;

    // ====================== IMPROVED VIDEO URL EXTRACTION ======================
    let videoUrl = item.video?.playAddr || item.video?.downloadAddr;

    // Robust fallback using aweme feed API (works when download is disabled)
    if (!videoUrl) {
      const feedRes = await fetch(
        `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}&device_platform=webapp&aid=1988`,
        { headers: { ...headers(), Cookie: cookieHeader } }
      );

      const feedJson = await feedRes.json();
      const feedItem = feedJson.aweme_list?.[0] || feedJson.aweme_details?.[0];

      if (feedItem?.video) {
        const va = feedItem.video.play_addr || feedItem.video.download_addr || feedItem.video.bit_rate?.[0];
        videoUrl = va?.url_list?.find(u => u.includes("play") && !u.includes("playwm")) 
                || va?.url_list?.[0];
      }
    }

    if (!videoUrl) throw new Error("Could not find any playable video URL");

    // Strip watermark (works on both web and API links)
    videoUrl = String(videoUrl).replace(/playwm/gi, "play");

    // ====================== DOWNLOAD LOGIC ======================
    if (download === "true") {
      const videoFetch = await fetch(videoUrl, {
        headers: {
          ...headers(),
          Cookie: cookieHeader,
          Referer: finalUrl || "https://www.tiktok.com/"   // ← CRITICAL for restricted videos
        }
      });

      if (!videoFetch.ok) throw new Error(`Video fetch failed: ${videoFetch.status}`);

      const arrayBuffer = await videoFetch.arrayBuffer();

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}.mp4"`);
      return res.send(Buffer.from(arrayBuffer));
    }

    // ====================== UI RESPONSE ======================
    return res.json({
      status: true,
      title: item.desc || "TikTok Video",
      thumbnail: item.video.cover,
      video_url: videoUrl,
      audio_url: item.music?.playUrl,
      author: {
        name: item.author?.nickname,
        avatar: item.author?.avatarThumb,
        region: item.locationCreated || "Global"
      },
      stats: {
        duration: item.video.duration,
        quality: item.video.ratio || "HD",
        size_mb: await getSize(videoUrl, cookieHeader, finalUrl)
      }
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: false, message: e.message });
  }
}

function headers() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Referer": "https://www.tiktok.com/",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
  };
}

async function getSize(url, cookieHeader = "", referer = "") {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        ...headers(),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...(referer && { Referer: referer })
      }
    });
    const bytes = res.headers.get("content-length");
    return bytes ? (bytes / 1024 / 1024).toFixed(2) : "0.00";
  } catch {
    return "Unknown";
  }
}
