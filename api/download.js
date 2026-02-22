export default async function handler(req, res) {
  try {
    const { url, download, index, all } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "No URL provided" });

    // Resolve short URL
    const resolve = await fetch(url, { redirect: "follow", headers: browserHeaders() });
    const finalUrl = resolve.url;

    // Extract video/post ID (handles multiple patterns)
    const videoId = extractVideoId(finalUrl);
    if (!videoId) return res.status(400).json({ status: false, message: "Invalid URL" });

    // Fetch post details from TikTok API
    const apiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/multi/aweme/detail/?aweme_ids=[${videoId}]`;
    const apiRes = await fetch(apiUrl, {
      headers: {
        ...browserHeaders(),
        "User-Agent": "com.zhiliaoapp.musically/2023501030 (Linux; Android 14)"
      }
    });
    if (!apiRes.ok) throw new Error(`API error: ${apiRes.status}`);
    const data = await apiRes.json();
    const item = data.aweme_details?.[0] || data.aweme_list?.[0];
    if (!item) return res.status(404).json({ status: false, message: "Post not found" });

    // Common metadata
    const common = {
      title: item.desc || "",
      author: item.author?.nickname || "",
      music: item.music?.play_url?.url_list?.[0] || null, // <-- added music
      thumbnail: item.video?.cover?.url_list?.[0] || item.image_post_info?.images?.[0]?.display_image?.url_list?.slice(-1)[0] || ""
    };

    // ----- IMAGE SLIDESHOW -----
    if (item.image_post_info?.images?.length) {
      const images = item.image_post_info.images.map(img =>
        img.display_image.url_list.slice(-1)[0] // highest quality
      );

      // Download single image by index
      if (download === "true" && index !== undefined) {
        const i = parseInt(index);
        if (isNaN(i) || i < 0 || i >= images.length) {
          return res.status(400).json({ status: false, message: "Invalid image index" });
        }
        const imgRes = await fetch(images[i], { headers: browserHeaders() });
        if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}_${i}.jpg"`);
        return imgRes.body.pipe(res); // stream
      }

      // Download all images as ZIP
      if (download === "true" && all === "true") {
        const archiver = (await import('archiver')).default(); // dynamic import to avoid bundling if not used
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}_images.zip"`);
        archiver.pipe(res);

        for (let i = 0; i < images.length; i++) {
          const imgRes = await fetch(images[i], { headers: browserHeaders() });
          if (!imgRes.ok) continue; // skip failed images
          const buffer = await imgRes.arrayBuffer(); // buffer one at a time
          archiver.append(Buffer.from(buffer), { name: `image_${i}.jpg` });
        }
        await archiver.finalize();
        return;
      }

      // Return image metadata
      return res.json({
        status: true,
        type: "image",
        total_images: images.length,
        images,
        ...common
      });
    }

    // ----- VIDEO -----
    if (item.video?.play_addr?.url_list?.length) {
      // Remove watermark
      let videoUrl = item.video.play_addr.url_list.slice(-1)[0].replace(/playwm|watermark/gi, "play");

      if (download === "true") {
        const videoRes = await fetch(videoUrl, { headers: browserHeaders() });
        if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}.mp4"`);
        return videoRes.body.pipe(res);
      }

      return res.json({
        status: true,
        type: "video",
        video_url: videoUrl,
        ...common
      });
    }

    // ----- FALLBACK (should rarely happen) -----
    return res.json({
      status: true,
      type: "unknown",
      ...common
    });

  } catch (e) {
    console.error(e); // log for debugging
    return res.status(500).json({ status: false, message: e.message });
  }
}

// Helper: browser-like headers
function browserHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Referer": "https://www.tiktok.com/",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.tiktok.com"
  };
}

// Helper: extract video ID from various URL formats
function extractVideoId(url) {
  const patterns = [
    /video\/(\d+)/,
    /\/v\/(\d+)/,
    /\/t\/(\d+)/,
    /(\d{15,})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
