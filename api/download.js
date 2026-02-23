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

    const idMatch = finalUrl.match(/video\/(\d+)/);
    if (!idMatch) {
      return res.status(400).json({
        status: false,
        message: "Invalid TikTok URL"
      });
    }

    const videoId = idMatch[1];

    // TikTok mobile API (strongest)
    const api =
      `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/multi/aweme/detail/?aweme_ids=[${videoId}]`;

    const apiRes = await fetch(api, {
      headers: {
        ...browserHeaders(),
        "User-Agent":
          "com.zhiliaoapp.musically/2023501030 (Linux; Android 14)"
      }
    });

    const json = await apiRes.json();

    const item =
      json.aweme_details?.[0] ||
      json.aweme_list?.[0];

    if (!item) {
      return res.status(404).json({
        status: false,
        message: "Video not found"
      });
    }

    const region = item.region || "Unknown";

    const author = {
      username: item.author?.unique_id,
      nickname: item.author?.nickname,
      avatar: item.author?.avatar_larger?.url_list?.slice(-1)[0]
    };

    const stats = {
      likes: formatNumber(item.statistics?.digg_count),
      views: formatNumber(item.statistics?.play_count),
      comments: formatNumber(item.statistics?.comment_count),
      shares: formatNumber(item.statistics?.share_count)
    };

    const musicUrl =
      item.music?.play_url?.url_list?.slice(-1)[0];

    // IMAGE POST SUPPORT
    if (item.image_post_info?.images?.length) {

      const images =
        item.image_post_info.images.map(img =>
          img.display_image.url_list.slice(-1)[0]
        );

      if (download === "true") {

        const i = parseInt(index || "0");

        const imgRes = await fetch(images[i]);

        res.setHeader(
          "Content-Type",
          "image/jpeg"
        );

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="tiktok_${videoId}_${i}.jpg"`
        );

        return imgRes.body.pipe(res);
      }

      return res.json({
        status: true,
        type: "images",
        id: videoId,
        region,
        author,
        stats,
        title: item.desc,
        images,
        total_images: images.length,
        thumbnail: images[0]
      });
    }

    // VIDEO SECTION

    const videoData = extractVideo(item);

    const sizeMB = await getSize(videoData.nowm);

    // DIRECT DOWNLOAD STREAM
    if (download === "true") {

      const videoRes = await fetch(videoData.nowm, {
        headers: browserHeaders()
      });

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tiktok_${videoId}.mp4"`
      );

      return videoRes.body.pipe(res);
    }

    return res.json({
      status: true,
      type: "video",

      id: videoId,

      region,

      title: item.desc,

      duration: item.video?.duration,

      thumbnail:
        item.video?.cover?.url_list?.slice(-1)[0],

      size_mb: sizeMB,

      author,

      stats,

      download: {
        nowm: videoData.nowm,
        wm: videoData.wm,
        hd: videoData.hd,
        direct:
          `${req.headers.host}/api/download?url=${encodeURIComponent(url)}&download=true`
      },

      music: {
        url: musicUrl,
        size_mb: await getSize(musicUrl)
      }
    });

  } catch (e) {

    return res.status(500).json({
      status: false,
      message: e.toString()
    });

  }
}


// Extract strongest video sources
function extractVideo(item) {

  const wm =
    item.video?.download_addr?.url_list?.slice(-1)[0];

  const nowm =
    item.video?.play_addr?.url_list?.slice(-1)[0]
      ?.replace("playwm", "play");

  let hd = nowm;

  const bitrates =
    item.video?.bit_rate;

  if (bitrates?.length) {

    const best =
      bitrates.sort(
        (a, b) =>
          (b.bit_rate || 0) -
          (a.bit_rate || 0)
      )[0];

    hd =
      best?.play_addr?.url_list?.slice(-1)[0]
        ?.replace("playwm", "play") || nowm;
  }

  return { wm, nowm, hd };
}


// Get file size
async function getSize(url) {

  try {

    const res = await fetch(url, {
      method: "HEAD",
      headers: browserHeaders()
    });

    const bytes =
      res.headers.get("content-length");

    if (!bytes) return null;

    return (
      bytes /
      1024 /
      1024
    ).toFixed(2);

  } catch {

    return null;

  }
}


// Format numbers like 1M, 1K
function formatNumber(num) {

  if (!num) return "0";

  if (num >= 1000000)
    return (num / 1000000).toFixed(1) + "M";

  if (num >= 1000)
    return (num / 1000).toFixed(1) + "K";

  return num.toString();
}


// Browser headers
function browserHeaders() {

  return {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    Referer: "https://www.tiktok.com/",
    Accept: "*/*"
  };

}
