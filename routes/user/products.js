const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();

// 獲取分頁商品
router.get("/products", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10; // 每頁顯示的商品數量

    const productsRef = db.collection("products");
    const snapshot = await productsRef.where("is_enabled", "==", 1).get();

    const allProducts = [];
    snapshot.forEach((doc) => {
      allProducts.push({ id: doc.id, ...doc.data() });
    });

    const totalProducts = allProducts.length;
    const totalPages = Math.ceil(totalProducts / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedProducts = allProducts.slice(startIndex, endIndex);

    res.json({
      success: true,
      products: paginatedProducts,
      pagination: {
        total_pages: totalPages,
        current_page: page,
        has_pre: page > 1,
        has_next: page < totalPages,
        category: null,
      },
      messages: [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 獲取全部商品列表
router.get("/products/all", async (req, res) => {
  try {
    const productsRef = db.collection("products");
    const snapshot = await productsRef.where("is_enabled", "==", 1).get();

    const products = [];
    snapshot.forEach((doc) => {
      products.push({ id: doc.id, ...doc.data() });
    });

    res.json({
      success: true,
      products: products,
      messages: [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 獲取單一商品細節
router.get("/product/:id", async (req, res) => {
  try {
    // console.log(req.params.id);
    const searchId = req.params.id;
    // 查詢所有產品文檔
    const productsRef = db.collection("products");
    const querySnapshot = await productsRef.where("id", "==", searchId).get();

    if (querySnapshot.empty) {
      return res.status(404).json({ success: false, message: "找不到產品" });
    }

    let product;
    querySnapshot.forEach((doc) => {
      product = doc.data();
      // 如果有多個文檔符合條件，你可以選擇返回第一個或所有符合條件的文檔
    });

    if (product.is_enabled !== 1) {
      return res.status(400).json({ success: false, message: "產品未啟用" });
    }

    // 返回找到的產品數據
    res.json({
      success: true,
      product: {
        ...product,
        id: searchId, // 使用查詢條件中的 ID
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
