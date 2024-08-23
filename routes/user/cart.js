// routes/user/cart.js
const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();
const moment = require("moment");

/**
 * 獲取特定用戶的購物車項目。
 * @param {string} userId - 用戶的 ID。
 * @returns {Promise<Object>} 用戶的購物車資料。
 */
async function getCartItems(userId) {
  const cartRef = db.collection("carts").doc(userId);
  const cartDoc = await cartRef.get();

  if (!cartDoc.exists) {
    return { carts: [], total: 0, final_total: 0 };
  }

  const cartData = cartDoc.data();
  const carts = [];

  // 取得優惠券資料
  const couponData = cartData.coupon || null;

  for (const item of cartData.items || []) {
    // 查詢產品集合中是否存在對應的 product_id
    const productQuerySnapshot = await db
      .collection("products")
      .where("id", "==", item.product_id)
      .get();

    if (productQuerySnapshot.empty) {
      continue; // 如果商品不存在，跳過此商品
    }

    // 假設只會有一個符合條件的產品
    const productDoc = productQuerySnapshot.docs[0];
    const productData = productDoc.data();

    const total = item.qty * productData.price;
    const finalTotal = couponData ? total * (couponData.percent / 100) : total;

    carts.push({
      product_id: item.product_id,
      qty: item.qty,
      product: productData,
      coupon: couponData,
      total: total,
      final_total: finalTotal,
    });
  }

  const total = carts.reduce((sum, item) => sum + item.total, 0);
  const final_total = carts.reduce((sum, item) => sum + item.final_total, 0);

  return {
    carts,
    total,
    final_total,
  };
}

/**
 * 將商品添加到用戶的購物車或更新已存在商品的數量。
 * @param {string} userId - 用戶的 ID。
 * @param {string} productId - 要添加的商品 ID。
 * @param {number} quantity - 要添加的數量。
 * @returns {Promise<Object>} 更新後的購物車資料。
 */
async function addItemToCart(userId, productId, quantity) {
  const cartRef = db.collection("carts").doc(userId);

  // 查詢產品集合中是否存在對應的 product_id
  const productQuerySnapshot = await db
    .collection("products")
    .where("id", "==", productId)
    .get();

  if (productQuerySnapshot.empty) {
    throw new Error("商品不存在");
  }

  // 這裡假設只有一個產品符合條件
  const productDoc = productQuerySnapshot.docs[0];
  const productData = productDoc.data();

  return db.runTransaction(async (transaction) => {
    const cartDoc = await transaction.get(cartRef);

    let items = cartDoc.exists ? cartDoc.data().items || [] : [];
    const itemIndex = items.findIndex((item) => item.product_id === productId);

    let itemsChanged = false;

    if (itemIndex > -1) {
      items[itemIndex].qty += quantity; // 累加數量而不是替換
      items[itemIndex].total = productData.price * items[itemIndex].qty;
      items[itemIndex].final_total = productData.price * items[itemIndex].qty;
      itemsChanged = true;
    } else {
      items.push({
        product_id: productId,
        qty: quantity,
        total: productData.price * quantity,
        final_total: productData.price * quantity,
      });
      itemsChanged = true;
    }

    const total = items.reduce((sum, item) => sum + item.total, 0);
    const final_total = items.reduce((sum, item) => sum + item.final_total, 0);

    const updateData = { items, total, final_total };

    // 如果購物車中的物品有變動且有優惠券，移除該優惠券
    if (itemsChanged && cartDoc.exists && cartDoc.data().coupon) {
      updateData.coupon = admin.firestore.FieldValue.delete(); // 完全移除 coupon 字段
    }

    // 更新購物車資料
    transaction.set(cartRef, updateData, { merge: true });

    return {
      product_id: productId,
      qty: itemIndex > -1 ? items[itemIndex].qty : quantity,
      id: cartRef.id,
      total:
        itemIndex > -1 ? items[itemIndex].total : productData.price * quantity,
      final_total:
        itemIndex > -1
          ? items[itemIndex].final_total
          : productData.price * quantity,
      product: productData,
    };
  });
}

// 路由：獲取購物車列表
router.get("/:userId", async (req, res) => {
  try {
    const cartData = await getCartItems(req.params.userId);
    res.json({
      success: true,
      data: cartData,
      messages: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 路由：將商品添加到用戶的購物車
router.post("/:userId/add", async (req, res) => {
  try {
    const { data } = req.body;
    const { product_id, qty } = data;

    // 驗證輸入數據
    if (!product_id) {
      return res
        .status(400)
        .json({ success: false, message: "product_id 欄位為必填" });
    }
    if (typeof product_id !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "product_id 型別錯誤" });
    }
    if (product_id.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "product_id 屬性不得為空" });
    }
    if (typeof qty !== "number" || isNaN(qty)) {
      return res
        .status(400)
        .json({ success: false, message: "qty 必須為數字" });
    }

    // 查詢產品是否存在
    const productRef = db.collection("products");
    const querySnapshot = await productRef.where("id", "==", product_id).get();

    if (querySnapshot.empty) {
      return res
        .status(404)
        .json({ success: false, message: "找不到對應的產品" });
    }

    // 如果找到對應的產品，則繼續添加到購物車
    const updatedCart = await addItemToCart(req.params.userId, product_id, qty);
    res.status(201).json({
      success: true,
      message: "已加入購物車",
      data: updatedCart,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 路由：更新用戶的購物車
router.put("/:userId", async (req, res) => {
  try {
    const { data } = req.body;
    const { product_id, qty } = data;

    // 驗證輸入數據 (保留現有的驗證代碼)
    if (!product_id) {
      return res
        .status(400)
        .json({ success: false, message: "product_id 欄位為必填" });
    }
    if (typeof product_id !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "product_id 型別錯誤" });
    }
    if (product_id.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "product_id 屬性不得為空" });
    }
    if (typeof qty !== "number" || isNaN(qty)) {
      return res
        .status(400)
        .json({ success: false, message: "qty 必須為數字" });
    }

    const cartRef = db.collection("carts").doc(req.params.userId);

    await db.runTransaction(async (transaction) => {
      const cartDoc = await transaction.get(cartRef);
      if (!cartDoc.exists) {
        throw new Error("購物車不存在");
      }

      let items = cartDoc.data().items || [];
      const itemIndex = items.findIndex(
        (item) => item.product_id === product_id
      );
      if (itemIndex === -1) {
        throw new Error("商品不在購物車中");
      }

      // 查詢產品集合中是否存在對應的 product_id
      const productQuerySnapshot = await db
        .collection("products")
        .where("id", "==", product_id)
        .get();

      if (productQuerySnapshot.empty) {
        throw new Error("商品不存在");
      }

      // 假設只有一個產品符合條件
      const productDoc = productQuerySnapshot.docs[0];
      const productData = productDoc.data();

      // 更新購物車項目
      items[itemIndex].qty = qty;
      items[itemIndex].total = productData.price * qty;
      items[itemIndex].final_total = productData.price * qty;

      const total = items.reduce((sum, item) => sum + item.total, 0);
      const final_total = items.reduce(
        (sum, item) => sum + item.final_total,
        0
      );

      const updateData = { items, total, final_total };

      // 如果購物車內容有變動且存在優惠券，移除該優惠券
      if (cartDoc.data().coupon) {
        updateData.coupon = admin.firestore.FieldValue.delete(); // 完全移除 coupon 字段
      }

      transaction.update(cartRef, updateData);
    });

    res.json({
      success: true,
      message: "已更新購物車",
      data: { product_id, qty },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 路由：刪除用戶的購物車的某個商品
router.delete("/:userId/:productId", async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const cartRef = db.collection("carts").doc(userId);

    await db.runTransaction(async (transaction) => {
      const cartDoc = await transaction.get(cartRef);
      if (!cartDoc.exists) {
        throw new Error("購物車不存在");
      }

      let items = cartDoc.data().items || [];
      const updatedItems = items.filter(
        (item) => item.product_id !== productId
      );
      if (items.length === updatedItems.length) {
        throw new Error("商品不在購物車中");
      }

      // 重新計算 total 和 final_total
      const total = updatedItems.reduce((sum, item) => sum + item.total, 0);
      const final_total = updatedItems.reduce(
        (sum, item) => sum + item.final_total,
        0
      );

      // 更新購物車文檔
      const updateData = { items: updatedItems, total, final_total };

      // 如果購物車中存在優惠券，且有商品被刪除，移除優惠券字段
      if (cartDoc.data().coupon) {
        updateData.coupon = admin.firestore.FieldValue.delete();
      }

      transaction.update(cartRef, updateData);
    });

    res.json({
      success: true,
      message: "已刪除商品並移除優惠券",
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 路由：刪除全部購物車
router.delete("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const cartRef = db.collection("carts").doc(userId);

    const cartDoc = await cartRef.get();
    if (!cartDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "購物車無內容",
      });
    }

    const cartData = cartDoc.data();
    if (!cartData.items || cartData.items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "購物車無內容",
      });
    }

    // 刪除購物車內容
    await cartRef.update({
      items: [],
      total: 0,
      final_total: 0,
      coupon: admin.firestore.FieldValue.delete(), // 移除 coupon 字段
    });

    res.json({
      success: true,
      message: "已刪除",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 路由：使用優惠券
router.post("/:userId/coupon", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data } = req.body;
    const { code } = data;

    // 獲取購物車資料
    const cartRef = db.collection("carts").doc(userId);
    const cartDoc = await cartRef.get();

    if (!cartDoc.exists) {
      return res.status(404).json({ success: false, message: "購物車不存在" });
    }

    const cartData = cartDoc.data();

    if (!code) {
      // 沒有填優惠券代碼,將購物車的 final_total 設為 total 並移除 coupon
      await cartRef.update({
        final_total: cartData.total,
        coupon: null,
      });
      const updatedCartData = await getCartItems(userId);
      return res.json({
        success: false,
        message: "無法套用優惠券",
        data: updatedCartData,
      });
    }

    // 查詢優惠券
    const couponRef = db.collection("coupons").where("code", "==", code);
    const couponSnapshot = await couponRef.get();

    if (couponSnapshot.empty) {
      // 找不到優惠券,將購物車的 final_total 設為 total 並移除 coupon
      await cartRef.update({
        final_total: cartData.total,
        coupon: null,
      });
      const updatedCartData = await getCartItems(userId);
      return res.json({
        success: false,
        message: "找不到優惠券",
        data: updatedCartData,
      });
    }

    const couponDoc = couponSnapshot.docs[0];
    const couponData = couponDoc.data();

    // 檢查優惠券是否過期
    let dueDate;
    if (typeof couponData.due_date === "number") {
      dueDate = new Date(couponData.due_date * 1000);
    } else {
      throw new Error("優惠券的 due_date 格式不正確");
    }

    if (moment().isAfter(moment(dueDate))) {
      // 優惠券無法使用或已過期,將購物車的 final_total 設為 total 並移除 coupon
      await cartRef.update({
        final_total: cartData.total,
        coupon: null,
      });
      const updatedCartData = await getCartItems(userId);
      return res.json({
        success: false,
        message: "優惠券無法使用或已過期",
        data: updatedCartData,
      });
    }

    const percent = parseFloat(couponData.percent);
    const discountRate = percent / 100;
    const final_total = Math.round(cartData.total * discountRate);

    await cartRef.update({
      final_total,
      coupon: {
        id: couponDoc.id,
        code: couponData.code,
        percent: couponData.percent,
        title: couponData.title,
      },
    });

    const updatedCartData = await getCartItems(userId);

    res.json({
      success: true,
      message: `已套用優惠券:${code}`,
      data: updatedCartData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
