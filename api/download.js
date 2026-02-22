export default async function handler(req, res) {
  try {
    const { url, download } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "No URL provided"
      });
    }

    // ================================
    // RAPIDAPI CONFIG
    // ================================

    const RAPIDAPI_KEY = "7aaac51453mshc8ae82ba7200252p197d61jsncb56c163a327";
    const RAPIDAPI_HOST = "social-media-video-downloader.p.rapidapi.com";

    let videoUrl = null;
    let audioUrl = null;
    let thumbnail = null;
    let title = null;
    let author = {};

    // ================================
    // PRIMARY: RAPIDAPI METHOD
    // ================================

    try {
      const rapidResponse = await fetch(
        `https://${RAPIDAPI_HOST}/smvd/get/all?url=${encodeURIComponent(url)}`,
        {
          method: "GET",
          headers: {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
          }
        }
      );

      const rapidData = await rapidResponse.json();

      if (!rapidData.error && rapidData.contents?.length > 0) {

        const content = rapidData.contents[0];

        // BEST VIDEO PRIORITY
        videoUrl =
          rapidData.metadata?.additionalData?.video?.downloadAddr ||
          content.audios?.[0]?.url ||
          content.videos?.[0]?.url;

        audioUrl = content.audios?.[0]?.url;

        thumbnail = rapidData.metadata?.thumbnailUrl;

        title = rapidData.metadata?.title;

        author = {
          name: rapidData.metadata?.author?.user?.nickname,
          avatar: rapidData.metadata?.author?.user?.avatarThumb,
          username: rapidData.metadata?.author?.user?.uniqueId
        };
      }

    } catch (err) {
      console.log("RapidAPI error:", err.message);
    }

    // ================================
    // FAIL SAFE
    // ================================

    if (!videoUrl) {
      throw new Error("Failed to fetch video from RapidAPI");
    }

    // ================================
    // DOWNLOAD MODE
    // ================================

    if (download === "true") {

      const videoResponse = await fetch(videoUrl);

      const buffer = await videoResponse.arrayBuffer();

      res.setHeader("Content-Type", "video/mp4");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="video.mp4"`
      );

      return res.send(Buffer.from(buffer));
    }

    // ================================
    // NORMAL JSON RESPONSE
    // ================================

    return res.json({
      status: true,
      title,
      thumbnail,
      video_url: videoUrl,
      audio_url: audioUrl,
      author
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      status: false,
      message: error.message
    });

  }
}
