export default async function handler(req, res) {
  try {
    const { url, download } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "No URL provided" });

    const videoPageUrl = url.startsWith('http') ? url : `https://www.tiktok.com${url}`;

    // 1. Get session cookies
    const initialRes = await fetch(videoPageUrl, { headers: headers(), redirect: "follow" });
    const finalUrl = initialRes.url;

    const cookieArray = initialRes.headers.raw ? initialRes.headers.raw()['set-cookie'] || [] : [];
    const cookieHeader = cookieArray.map(c => c.split(';')[0]).join('; ');

    // 2. Fetch HTML + extract rehydration data
    const htmlRes = await fetch(finalUrl, { headers: { ...headers(), Cookie: cookieHeader } });
    const html = await htmlRes.text();

    const jsonMatch = html.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.+?)<\/script>/s);
    if (!jsonMatch) throw new Error("Failed to extract rehydration data");

    const jsonData = JSON.parse(jsonMatch[1]);
    const item = jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;

    // Extract video ID
    let videoId = item?.id;
    if (!videoId) {
      const idMatch = videoPageUrl.match(/video\/(\d+)/);
      videoId = idMatch ? idMatch[1] : null;
    }
    if (!videoId) throw new Error("Could not extract video ID");

    // 3. Get best playable URL (multiple fallbacks)
    let videoUrl = getBestVideoUrl(item);

    if (!videoUrl) {
      videoUrl = await getVideoUrlFromWebAPI(videoId, cookieHeader, finalUrl);
    }
    if (!videoUrl) {
      videoUrl = await getVideoUrlFromAwemeAPI(videoId, cookieHeader);
    }

    if (!videoUrl) throw new Error("Could not find playable video URL after all attempts");

    videoUrl = cleanVideoUrl(videoUrl);

    // 4. DOWNLOAD
    if (download === "true") {
      const videoRes = await fetchVideoWithRetry(videoUrl, finalUrl, cookieHeader);

      if (!videoRes.ok) {
        throw new Error(`TikTok CDN returned ${videoRes.status}. The video_url below still works in browser.`);
      }

      const arrayBuffer = await videoRes.arrayBuffer();

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}.mp4"`);
      return res.send(Buffer.from(arrayBuffer));
    }

    // 5. Metadata response
    return res.json({
      status: true,
      title: item?.desc || "TikTok Video",
      thumbnail: item?.video?.cover,
      video_url: videoUrl,
      audio_url: item?.music?.playUrl,
      author: {
        name: item?.author?.nickname,
        avatar: item?.author?.avatarThumb,
        region: item?.locationCreated || "Global"
      },
      stats: {
        duration: item?.video?.duration,
        quality: "HD",
        size_mb: await getSize(videoUrl, cookieHeader, finalUrl)
      }
    });

  } catch (e) {
    console.error("TikTok Handler Error:", e.message);
    return res.status(500).json({ 
      status: false, 
      message: e.message,
      tip: "Try the video_url in a new browser tab first — if it plays, the downloader works."
    });
  }
}

// ==================== HELPERS ====================

function getBestVideoUrl(item) {
  const v = item?.video || {};
  // Priority: direct no-wm links
  if (v.playAddr) return Array.isArray(v.playAddr) ? v.playAddr[0] : v.playAddr;
  if (v.downloadAddr) return Array.isArray(v.downloadAddr) ? v.downloadAddr[0] : v.downloadAddr;

  // Priority: highest quality bit_rate
  const bitRates = v.bit_rate || v.bitrate || [];
  if (bitRates.length) {
    const best = bitRates.sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))[0];
    return best?.play_addr?.url_list?.[0] || best?.play_url?.url_list?.[0];
  }
  return null;
}

async function getVideoUrlFromWebAPI(videoId, cookieHeader, referer) {
  try {
    const params = new URLSearchParams({
      itemId: videoId,
      aid: "1988",
      app_name: "tiktok_web",
      device_platform: "web_pc",
      region: "US"
    });
    const res = await fetch(`https://www.tiktok.com/api/item/detail/?${params}`, {
      headers: { ...headers(), Cookie: cookieHeader, Referer: referer }
    });
    const data = await res.json();
    const aweme = data.itemInfo?.itemStruct || data.item_list?.[0];
    return aweme?.video?.play_addr?.url_list?.[0] || aweme?.video?.download_addr?.url_list?.[0];
  } catch { return null; }
}

async function getVideoUrlFromAwemeAPI(videoId, cookieHeader) {
  try {
    const deviceId = Math.floor(1e18 + Math.random() * 9e18).toString();
    const iid = Math.floor(1e18 + Math.random() * 9e18).toString();

    const apiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/multi/aweme/detail/?aweme_ids=[${videoId}]&aid=1233&app_name=musical_ly&version_code=350103&device_platform=android&device_id=${deviceId}&iid=${iid}`;

    const res = await fetch(apiUrl, {
      headers: {
        ...headers(),
        Cookie: cookieHeader,
        "User-Agent": "com.zhiliaoapp.musically/2023501030 (Linux; U; Android 14; en_US; Pixel 8; Build/UP1A.231105.001;tt-ok/3.12.13.4-tiktok)"
      }
    });
    const data = await res.json();
    const aweme = data.aweme_details?.[0] || data.aweme_list?.[0];
    const v = aweme?.video || {};
    return v.play_addr?.url_list?.[0] || v.download_addr?.url_list?.[0] || v.bit_rate?.[0]?.play_addr?.url_list?.[0];
  } catch { return null; }
}

function cleanVideoUrl(url) {
  return String(url).replace(/playwm|watermark/gi, "play");
}

async function fetchVideoWithRetry(url, referer, cookieHeader, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          ...headers(),
          Cookie: cookieHeader,
          Referer: referer || "https://www.tiktok.com/",
          Accept: "video/mp4,video/*,*/*;q=0.9",
          "sec-fetch-dest": "video",
          "sec-fetch-mode": "no-cors"
        },
        redirect: "follow"
      });
      if (res.ok) return res;
    } catch {}
    await new Promise(r => setTimeout(r, 700 * (i + 1)));
  }
  // last attempt with minimal headers
  return fetch(url, { headers: { ...headers(), Referer: "https://www.tiktok.com/" } });
}

function headers() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Referer": "https://www.tiktok.com/",
    "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
  };
}

async function getSize(url, cookieHeader, referer) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { ...headers(), Cookie: cookieHeader, Referer: referer || "https://www.tiktok.com/" }
    });
    const bytes = res.headers.get("content-length");
    return bytes ? (parseInt(bytes) / (1024 * 1024)).toFixed(2) : "0.00";
  } catch { return "Unknown"; }
}
