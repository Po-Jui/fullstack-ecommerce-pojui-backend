// routes/admin/coupons.js
const express = require("express");
const router = express.Router();
const { authenticateFirebaseToken, checkAdmin } = require("./middleware");
const admin = require("firebase-admin");
const db = admin.firestore();

// 新增優惠券(需要管理員身份)
router.post(
  "/coupon",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const { data } = req.body;
      const requiredFields = ["title", "is_enabled", "due_date", "code"];
      const errorMessages = [];

      for (let field of requiredFields) {
        if (!data[field]) {
          errorMessages.push(`${field} 欄位為必填`);
        } else if (
          typeof data[field] !== "string" &&
          field !== "is_enabled" &&
          field !== "percent" &&
          field !== "due_date"
        ) {
          errorMessages.push(`${field} 型別錯誤`);
        } else if (data[field] === "") {
          errorMessages.push(`${field} 屬性不得為空`);
        }
      }

      if (errorMessages.length > 0) {
        return res.status(400).json({ success: false, message: errorMessages });
      }

      // 如果 percent 沒有提供，預設為 100
      data.percent = data.percent ? Number(data.percent) : 100;
      data.due_date = Number(data.due_date); // 將 due_date 轉為數字格式

      await db.collection("coupons").add(data);
      res.json({ success: true, message: "已建立優惠券" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 取得優惠券列表(需要管理員身份)
router.get(
  "/coupons",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      let page = parseInt(req.query.page) || 1; // 取得請求中的頁碼，如果未提供則預設為1
      const pageSize = 10; // 每頁顯示的優惠券數量

      // 確保頁碼在有效範圍內
      page = Math.max(1, page);

      // 取得優惠券列表
      const couponsSnapshot = await db
        .collection("coupons")
        .orderBy("title")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .get();

      const coupons = [];
      couponsSnapshot.forEach((doc) => {
        coupons.push({ id: doc.id, ...doc.data() }); // 將每個優惠券的數據存入 coupons 陣列中
      });

      // 總優惠券數量
      const totalCouponsSnapshot = await db.collection("coupons").get();
      const totalCoupons = totalCouponsSnapshot.size;
      const totalPages = Math.ceil(totalCoupons / pageSize); // 計算總頁數

      // 確保當前頁碼不超過總頁數
      page = Math.min(page, totalPages);

      res.json({
        success: true,
        coupons, // 返回當前頁面的優惠券
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

// 修改優惠券(需要管理員身份)
router.put(
  "/coupon/:id",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { data } = req.body;
      const requiredFields = ["title", "is_enabled", "due_date", "code"];
      const errorMessages = [];

      for (let field of requiredFields) {
        if (!data[field]) {
          errorMessages.push(`${field} 欄位為必填`);
        } else if (
          typeof data[field] !== "string" &&
          field !== "is_enabled" &&
          field !== "percent" &&
          field !== "due_date"
        ) {
          errorMessages.push(`${field} 型別錯誤`);
        } else if (data[field] === "") {
          errorMessages.push(`${field} 屬性不得為空`);
        }
      }

      if (errorMessages.length > 0) {
        return res.status(400).json({ success: false, message: errorMessages });
      }

      data.percent = data.percent ? Number(data.percent) : 100;
      data.due_date = Number(data.due_date);

      await db.collection("coupons").doc(id).update(data);
      res.json({ success: true, message: "已更新優惠券" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 刪除優惠券(需要管理員身份)
router.delete(
  "/coupon/:id",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const couponDoc = await db.collection("coupons").doc(id).get();

      if (!couponDoc.exists) {
        return res
          .status(404)
          .json({ success: false, message: "找不到優惠券" });
      }

      await db.collection("coupons").doc(id).delete();
      res.json({ success: true, message: "已刪除優惠券" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
