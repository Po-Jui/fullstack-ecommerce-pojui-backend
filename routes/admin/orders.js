// routes/admin/orders.js
const express = require("express");
const router = express.Router();
const { authenticateFirebaseToken, checkAdmin } = require("./middleware");
const admin = require("firebase-admin");
const db = admin.firestore();

// 獲取全部訂單(需要管理員身份)
router.get(
  "/orders",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      let page = parseInt(req.query.page) || 1; // 取得請求中的頁碼，如果未提供則預設為1
      const pageSize = 10; // 每頁顯示的訂單數量

      const ordersRef = db.collection("orders"); // 取得訂單集合的參考
      const snapshot = await ordersRef.orderBy("create_at", "desc").get(); // 按照創建時間降序查詢訂單

      const allOrders = [];
      snapshot.forEach((doc) => {
        allOrders.push({ id: doc.id, ...doc.data() }); // 將每個訂單的數據存入 allOrders 陣列中
      });

      const totalOrders = allOrders.length; // 總訂單數量
      const totalPages = Math.ceil(totalOrders / pageSize); // 計算總頁數

      // 確保頁碼在有效範圍內
      page = Math.max(1, Math.min(page, totalPages)); // 頁碼不得小於1，也不得大於總頁數

      const startIndex = (page - 1) * pageSize; // 計算當前頁面的起始索引
      const endIndex = startIndex + pageSize; // 計算當前頁面的結束索引

      const paginatedOrders = allOrders.slice(startIndex, endIndex); // 擷取當前頁面的訂單

      res.json({
        success: true,
        orders: paginatedOrders, // 返回當前頁面的訂單
        pagination: {
          total_pages: totalPages, // 總頁數
          current_page: page, // 當前頁碼
          has_pre: page > 1, // 是否有上一頁
          has_next: page < totalPages, // 是否有下一頁
          category: null, // 類別，這裡設為 null
        },
        messages: [],
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message }); // 捕捉並返回錯誤信息
    }
  }
);

// 修改訂單
router.put(
  "/order/:id",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const orderId = req.params.id;
      const { data } = req.body;

      // 驗證必填欄位
      if (typeof data.is_paid !== "boolean") {
        return res
          .status(400)
          .json({ success: false, message: "is_paid 型別錯誤" });
      }

      const orderRef = db.collection("orders").doc(orderId);
      const doc = await orderRef.get();

      if (!doc.exists) {
        return res.status(404).json({ success: false, message: "找不到訂單" });
      }

      await orderRef.update(data);

      res.json({
        success: true,
        message: "已更新訂單資訊",
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 刪除訂單
router.delete(
  "/order/:id",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const orderId = req.params.id;
      const orderRef = db.collection("orders").doc(orderId);
      const doc = await orderRef.get();

      if (!doc.exists) {
        return res.status(404).json({ success: false, message: "找不到訂單" });
      }

      await orderRef.delete();

      res.json({
        success: true,
        message: "已刪除",
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
