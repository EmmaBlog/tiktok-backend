export default async function handler(req, res) {
  try {
    const { url, download, index } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "No URL provided" });

    // Resolve URL
    const resolve = await fetch(url, { redirect: "follow", headers: browserHeaders() });
    const finalUrl = resolve.url;

    // Extract video/post ID
    const match = finalUrl.match(/video\/(\d+)/);
    if (!match) return res.status(400).json({ status: false, message: "Invalid URL" });
    const videoId = match[1];

    // Fetch aweme detail
    const apiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/multi/aweme/detail/?aweme_ids=[${videoId}]`;
    const apiRes = await fetch(apiUrl, { headers: { ...browserHeaders(), "User-Agent": "com.zhiliaoapp.musically/2023501030 (Linux; Android 14)" } });
    const data = await apiRes.json();
    const item = data.aweme_details?.[0] || data.aweme_list?.[0];

    if (!item) return res.status(404).json({ status: false, message: "Post not found" });

    // ===== IMAGE SLIDESHOW =====
    if (item.image_post_info?.images?.length) {
      const images = item.image_post_info.images.map(img => img.display_image.url_list.slice(-1)[0]);

      // download specific image
      if (download === "true") {
        const i = parseInt(index || "0");
        const imgRes = await fetch(images[i]);
        const buffer = await imgRes.arrayBuffer();
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", `attachment; filename="tiktok_${videoId}_${i}.jpg"`);
        return res.send(Buffer.from(buffer));
      }

      // Return all images as JSON
      return res.json({
        status: true,
        type: "image",
        total_images: images.length,
        images,
        thumbnail: images[0],
        title: item.desc,
        author: item.author?.nickname
      });
    }

    // ===== VIDEO =====
    if (item.video?.play_addr?.url_list?.length) {
      const videoUrl = item.video.play_addr.url_list.slice(-1)[0].replace(/playwm|watermark/gi, "play");
      if (download === "true") {
        const videoRes = await fetch(videoUrl);
        const buffer = await videoRes.arrayBuffer();
        res.setHeader("Content-Type", "video/mp4");
        return res.send(Buffer.from(buffer));
      }
      return res.json({
        status: true,
        type: "video",
        video_url: videoUrl,
        thumbnail: item.video.cover.url_list[0],
        title: item.desc,
        author: item.author?.nickname
      });
    }

    // ===== FALLBACK =====
    return res.json({
      status: true,
      type: "unknown",
      thumbnail: item.video?.cover?.url_list?.[0] || "",
      title: item.desc,
      author: item.author?.nickname
    });

  } catch (e) {
    return res.status(500).json({ status: false, message: e.message });
  }
}

function browserHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133 Safari/537.36",
    Referer: "https://www.tiktok.com/"
  };
}
