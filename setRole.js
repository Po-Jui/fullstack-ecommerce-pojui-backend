const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const {
  authenticateFirebaseToken,
  checkAdmin,
} = require("./routes/admin/middleware");

// 設置角色的 API
router.post(
  "/set-role",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    const { email, role } = req.body;

    try {
      // 根據 email 查找用戶
      const user = await admin.auth().getUserByEmail(email);

      // 設置自定義聲明，例如 "admin" 或 "editor"
      let customClaims = {};
      if (role === "admin") {
        customClaims = { admin: true };
      } else if (role === "editor") {
        customClaims = { editor: true };
      } else {
        return res.status(400).json({ success: false, message: "無效的角色" });
      }

      await admin.auth().setCustomUserClaims(user.uid, customClaims);

      res.json({ success: true, message: `${email} 的角色已更新為 ${role}` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
