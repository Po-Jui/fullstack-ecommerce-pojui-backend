const express = require("express");
const { authenticateFirebaseToken } = require("./middleware");
const router = express.Router();

// 檢查用戶是否仍持續登入
router.post("/check", authenticateFirebaseToken, (req, res) => {
  // console.log(res);
  res.json({ success: true });
});

module.exports = router;
