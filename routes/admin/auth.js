const express = require("express");
const { authenticateFirebaseToken, checkAdmin } = require("./middleware");
const admin = require("firebase-admin");
const router = express.Router();

// 登入
router.post("/signin", async (req, res) => {
  const { idToken } = req.body;
  console.log(req.body);
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    res.json({
      success: true,
      message: "登入成功",
      uid: decodedToken.uid,
      token: idToken,
      expired: decodedToken.exp * 1000,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "登入失敗", error: error });
  }
});

// 登出
router.post("/logout", authenticateFirebaseToken, (req, res) => {
  admin
    .auth()
    .revokeRefreshTokens(req.user.uid)
    .then(() => {
      res.json({ success: true, message: "已登出" });
    })
    .catch((error) => {
      res.status(500).json({ success: false, message: "登出失敗" });
    });
});

module.exports = router;
