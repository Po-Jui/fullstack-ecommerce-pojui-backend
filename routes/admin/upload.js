const express = require("express");
const router = express.Router();
const multer = require("multer");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const bucket = admin.storage().bucket();
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
const tinify = require("tinify");
tinify.key = process.env.TINYPNG_API_KEY;

// 處理圖片上傳的 POST 請求
router.post("/upload/image", upload.single("file"), function (req, res) {
  const file = req.file;
  // 4. 上傳圖片到 TinyPNG 並壓縮
  tinify.fromBuffer(file.buffer).toBuffer(function (err, resultData) {
    if (err) throw err;

    const blob = bucket.file(
      `productImg/${uuidv4()}.${file.originalname.split(".").pop()}`
    );
    const blobStream = blob.createWriteStream();

    blobStream.on("finish", () => {
      // res.send("上傳成功");
      // 設定檔案的存取權限
      const config = {
        action: "read", // 權限
        expires: "12-31-2500", // 網址的有效期限
      };
      // 取得檔案的網址
      blob.getSignedUrl(config, (err, imageUrl) => {
        res.send({
          success: true,
          imageUrl,
        });
      });
    });

    blobStream.on("error", (err) => {
      res.status(500).send("上傳失敗");
    });

    // 將壓縮後的圖片上傳到 Firebase Storage
    blobStream.end(resultData);
  });
});

// 取得檔案名稱列表
router.get("/image", function (req, res) {
  // 取得檔案列表
  bucket
    .getFiles()
    .then((data) => {
      return data[0];
    })
    .then(async (files) => {
      const fileList = [];
      for (const file of files) {
        // 取得檔案的簽署 URL
        const fileUrl = await file.getSignedUrl({
          action: "read",
          expires: "03-09-2491",
        });
        fileList.push({
          fileName: file.name,
          imgUrl: fileUrl,
        });
      }
      res.send(fileList);
    })
    .catch((err) => {
      res.status(500).send("取得檔案列表失敗");
    });
});

module.exports = router;
