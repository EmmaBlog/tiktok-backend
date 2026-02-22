export default async function handler(req, res) {
  try {
    const { url, download, index } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No URL provided"
      });
    }

    // Resolve shortened links
    const resolve = await fetch(url, {
      redirect: "follow",
      headers: browserHeaders()
    });

    const finalUrl = resolve.url;

    // Extract ID
    const idMatch = finalUrl.match(/video\/(\d+)/);
    if (!idMatch) {
      return res.status(400).json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    const videoId = idMatch[1];

    // TikTok internal API
    const apiUrl =
      `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`;

    const apiRes = await fetch(apiUrl, {
      headers: {
        ...browserHeaders(),
        "User-Agent":
          "com.zhiliaoapp.musically/2023501030 (Linux; Android 14)"
      }
    });

    const apiData = await apiRes.json();
    const item = apiData.aweme_list?.[0];

    if (!item) {
      throw new Error("Post not found");
    }

    const title = item.desc || "TikTok Post";

    // =========================
    // IMAGE DETECTION (ALL FORMATS)
    // =========================

    let images = [];

    // Format 1
    if (item.image_post_info?.images) {
      images = item.image_post_info.images.map(img => ({
        url:
          img.display_image?.url_list?.slice(-1)[0] ||
          img.owner_watermark_image?.url_list?.slice(-1)[0],
        width: img.display_image?.width || 0,
        height: img.display_image?.height || 0
      }));
    }

    // Format 2
    else if (item.images) {
      images = item.images.map(img => ({
        url: img.url_list?.slice(-1)[0],
        width: img.width || 0,
        height: img.height || 0
      }));
    }

    // Format 3 photomode fallback
    else if (
      item.video?.cover?.url_list &&
      item.duration === 0
    ) {
      images = item.video.cover.url_list.map(url => ({
        url,
        width: 0,
        height: 0
      }));
    }


    // =========================
    // IMAGE RESPONSE
    // =========================

    if (images.length > 0) {

      if (download === "true") {

        const i = parseInt(index || "0");

        if (!images[i]) {
          return res.status(400).json({
            status: false,
            message: "Invalid image index"
          });
        }

        const imageRes = await fetch(images[i].url);
        const buffer = await imageRes.arrayBuffer();

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="tiktok_${videoId}_${i}.jpg"`
        );

        return res.send(Buffer.from(buffer));
      }

      return res.json({
        status: true,
        type: "image",
        title,
        total_images: images.length,
        images,
        thumbnail: images[0].url,
        author: {
          name: item.author.nickname,
          avatar: item.author.avatar_thumb.url_list[0]
        }
      });
    }


    // =========================
    // VIDEO RESPONSE
    // =========================

    const videoUrl =
      item.video.play_addr.url_list.slice(-1)[0]
        .replace("playwm", "play");

    if (download === "true") {

      const videoRes = await fetch(videoUrl);
      const buffer = await videoRes.arrayBuffer();

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tiktok_${videoId}.mp4"`
      );

      return res.send(Buffer.from(buffer));
    }

    return res.json({
      status: true,
      type: "video",
      title,
      video_url: videoUrl,
      thumbnail: item.video.cover.url_list[0],
      audio_url: item.music.play_url.url_list[0],
      author: {
        name: item.author.nickname,
        avatar: item.author.avatar_thumb.url_list[0]
      },
      stats: {
        views: item.statistics.play_count,
        likes: item.statistics.digg_count,
        comments: item.statistics.comment_count,
        shares: item.statistics.share_count
      }
    });

  } catch (error) {

    return res.status(500).json({
      status: false,
      message: error.message
    });

  }
}


// Headers
function browserHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133 Safari/537.36",
    Accept: "*/*",
    Referer: "https://www.tiktok.com/"
  };
}
