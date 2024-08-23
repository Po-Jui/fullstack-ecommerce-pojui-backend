const admin = require("firebase-admin");

// 驗證 Firebase ID token 的中間件
async function authenticateFirebaseToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  // console.log(authHeader);
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "認證失敗",
      error: "UNAUTHORIZED",
    });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    // 嘗試驗證 Token
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("認證錯誤:", error);
    return res.status(403).json({
      success: false,
      message: "認證失敗",
      error: "FORBIDDEN",
    });
  }
}

// 確認用戶是否為管理員
function checkAdmin(req, res, next) {
  // console.log(req.user);
  if (req.user && req.user.admin) {
    // 確認用戶是否為管理員
    next();
  } else {
    res.status(403).json({ success: false, message: "需要管理員權限" });
  }
}

module.exports = { authenticateFirebaseToken, checkAdmin };
