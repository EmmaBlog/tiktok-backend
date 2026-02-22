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

    // Extract video ID
    const idMatch = finalUrl.match(/video\/(\d+)/);
    if (!idMatch) {
      return res.status(400).json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    const videoId = idMatch[1];

    // Call TikTok API
    const apiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`;

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
    // IMAGE POST
    // =========================
    if (item.image_post_info) {

      const images = item.image_post_info.images.map(img => ({
        url: img.display_image.url_list[0],
        width: img.display_image.width,
        height: img.display_image.height
      }));

      // DOWNLOAD specific image
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

      // JSON response for images
      return res.json({
        status: true,
        type: "image",
        title,
        total_images: images.length,
        images,
        author: {
          name: item.author.nickname,
          avatar: item.author.avatar_thumb.url_list[0]
        }
      });
    }

    // =========================
    // VIDEO POST
    // =========================

    const videoUrl =
      item.video.play_addr.url_list[0].replace("playwm", "play");

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
      thumbnail: item.video.cover.url_list[0],
      video_url: videoUrl,
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
