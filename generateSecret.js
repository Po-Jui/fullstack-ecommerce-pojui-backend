const crypto = require("crypto");

// 生成 64 字節的隨機密鑰，Base64 編碼
const secret = crypto.randomBytes(64).toString("base64");

console.log(secret);
