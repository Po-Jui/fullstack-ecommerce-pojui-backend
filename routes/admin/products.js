// routes/admin/products.js
const express = require("express");
const router = express.Router();
const { authenticateFirebaseToken, checkAdmin } = require("./middleware");
const admin = require("firebase-admin");
const db = admin.firestore();
const { v4: uuidv4 } = require("uuid");

// 商品建立(需要管理員身份)
router.post(
  "/product",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const { data } = req.body;
      console.log(data);
      if (!data) {
        return res
          .status(400)
          .json({ success: false, message: "請提供商品數據 (data)" });
      }

      const requiredFields = [
        "title",
        "category",
        "unit",
        "origin_price",
        "price",
      ];
      const allFields = [
        "category",
        "content",
        "description",
        "id",
        "imageUrl",
        "imagesUrl",
        "is_enabled",
        "num",
        "origin_price",
        "price",
        "title",
        "unit",
      ];
      const errorMessages = [];

      for (let field of requiredFields) {
        if (!data[field]) {
          errorMessages.push(`${field} 欄位為必填`);
        } else if (
          typeof data[field] !== "string" &&
          field !== "origin_price" &&
          field !== "price" &&
          field !== "is_enabled" &&
          field !== "num"
        ) {
          errorMessages.push(`${field} 型別錯誤`);
        } else if (data[field] === "") {
          errorMessages.push(`${field} 屬性不得為空`);
        }
      }

      // 檢查 origin_price 和 price 是否為正整數
      if (!Number.isInteger(data.origin_price) || data.origin_price <= 0) {
        errorMessages.push("origin_price 必須為正整數");
      }
      if (!Number.isInteger(data.price) || data.price <= 0) {
        errorMessages.push("price 必須為正整數");
      }

      if (errorMessages.length > 0) {
        return res.status(400).json({ success: false, message: errorMessages });
      }

      // 生成 UUID 作為 id 並以 - 開頭
      data.id = uuidv4();

      // 獲取並更新 num 編碼
      const countersRef = db.collection("newcounters").doc("productNum");
      const countersDoc = await countersRef.get();
      let num;
      if (!countersDoc.exists) {
        num = 1;
        await countersRef.set({ currentNum: num });
      } else {
        num = countersDoc.data().currentNum + 1;
        await countersRef.update({ currentNum: num });
      }
      data.num = num;

      const productData = {};
      for (let field of allFields) {
        if (data[field] !== undefined) {
          productData[field] = data[field];
        }
      }

      const productRef = await db.collection("products").add(productData);
      res.json({ success: true, message: "已建立產品" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 取得商品列表(需要管理員身份)
router.get(
  "/products",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      let page = parseInt(req.query.page) || 1; // 取得請求中的頁碼，如果未提供則預設為1
      const pageSize = 10; // 每頁顯示的商品數量

      // 確保頁碼在有效範圍內
      page = Math.max(1, page);

      // 取得商品列表
      const productsSnapshot = await db
        .collection("products")
        .orderBy("title")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .get();

      const products = [];
      productsSnapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() }); // 將每個商品的數據存入 products 陣列中
      });

      // 總商品數量
      const totalProductsSnapshot = await db.collection("products").get();
      const totalProducts = totalProductsSnapshot.size;
      const totalPages = Math.ceil(totalProducts / pageSize); // 計算總頁數

      // 確保當前頁碼不超過總頁數
      page = Math.min(page, totalPages);

      res.json({
        success: true,
        products, // 返回當前頁面的商品
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

// 取得全部商品列表(需要管理員身份)
router.get(
  "/products/all",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const productsSnapshot = await db.collection("products").get();
      const products = {};
      productsSnapshot.forEach((doc) => {
        products[doc.id] = { id: doc.id, ...doc.data() };
      });
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 修改產品(需要管理員身份)
router.put(
  "/product/:id",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { data } = req.body;
      const requiredFields = [
        "title",
        "category",
        "unit",
        "origin_price",
        "price",
      ];
      const allFields = [
        "category",
        "content",
        "description",
        "id",
        "imageUrl",
        "imagesUrl",
        "is_enabled",
        "num",
        "origin_price",
        "price",
        "title",
        "unit",
      ];
      const errorMessages = [];

      // 驗證必填字段
      for (let field of requiredFields) {
        if (!data[field]) {
          errorMessages.push(`${field} 欄位為必填`);
        } else if (
          typeof data[field] !== "string" &&
          field !== "origin_price" &&
          field !== "price" &&
          field !== "is_enabled" &&
          field !== "num"
        ) {
          errorMessages.push(`${field} 型別錯誤`);
        } else if (data[field] === "") {
          errorMessages.push(`${field} 屬性不得為空`);
        }
      }

      // 檢查 origin_price 和 price 是否為正整數
      if (!Number.isInteger(data.origin_price) || data.origin_price <= 0) {
        errorMessages.push("origin_price 必須為正整數");
      }
      if (!Number.isInteger(data.price) || data.price <= 0) {
        errorMessages.push("price 必須為正整數");
      }

      if (errorMessages.length > 0) {
        return res.status(400).json({ success: false, message: errorMessages });
      }

      // 查詢產品集合中是否存在對應的 id
      const productQuerySnapshot = await db
        .collection("products")
        .where("id", "==", id)
        .get();

      if (productQuerySnapshot.empty) {
        return res
          .status(404)
          .json({ success: false, message: "找不到對應的產品" });
      }

      // 假設只會有一個符合條件的產品
      const productDoc = productQuerySnapshot.docs[0];
      const updateData = {};

      for (let field of allFields) {
        if (data[field] !== undefined) {
          updateData[field] = data[field];
        }
      }

      await productDoc.ref.update(updateData);
      res.json({ success: true, message: "已更新產品" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 刪除產品 (需要管理員身份)
router.delete(
  "/product/:product_id",
  authenticateFirebaseToken,
  checkAdmin,
  async (req, res) => {
    try {
      const { product_id } = req.params;

      // 查詢產品集合中是否存在對應的 id
      const productQuerySnapshot = await db
        .collection("products")
        .where("id", "==", product_id)
        .get();

      if (productQuerySnapshot.empty) {
        return res.status(404).json({ success: false, message: "找不到產品" });
      }

      // 假設只會有一個符合條件的產品
      const productDoc = productQuerySnapshot.docs[0];

      // 刪除產品文檔
      await productDoc.ref.delete();
      res.json({ success: true, message: "已刪除產品" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
