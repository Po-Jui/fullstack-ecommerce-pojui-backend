const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();

// 建立訂單
router.post("/order/:userId", async (req, res) => {
  try {
    const { userId } = req.params; // 取得路由參數中的 userId
    const { data } = req.body;
    const { user } = data;
    let { message = "", payment_method = "credit_card" } = data;

    // 驗證必填欄位
    if (!user) {
      return res.status(400).json({ success: false, message: "尚無用戶資料" });
    }

    const requiredFields = ["name", "email", "tel", "address"];
    for (const field of requiredFields) {
      if (!user[field]) {
        return res
          .status(400)
          .json({ success: false, message: `${field} 屬性不得為空` });
      }
      if (typeof user[field] !== "string") {
        return res
          .status(400)
          .json({ success: false, message: `${field} 型別錯誤` });
      }
    }

    // 使用 getCartItems 函數來獲取購物車資訊
    const { carts, total, final_total } = await getCartItems(userId);
    // console.log(carts);

    if (carts.length === 0) {
      return res.status(400).json({ success: false, message: "購物車為空" });
    }

    // 創建訂單
    const orderRef = db.collection("orders").doc();
    const order = {
      id: orderRef.id,
      user: user,
      message: message,
      products: carts,
      total: total,
      final_total: final_total,
      is_paid: false,
      payment_method: payment_method, // 使用請求中的支付方式或默認方式
      create_at: admin.firestore.Timestamp.now().seconds,
    };

    await orderRef.set(order);

    // 刪除購物車資訊
    const cartRef = db.collection("carts").doc(userId);
    await cartRef.delete();

    res.json({
      success: true,
      message: "已建立訂單",
      total: order.total,
      final_total: order.final_total,
      create_at: order.create_at,
      orderId: order.id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 獲取購物車的資訊
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

// 獲取某一筆訂單
router.get("/order/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderRef = db.collection("orders").doc(orderId);
    const doc = await orderRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "找不到訂單" });
    }

    const orderData = doc.data();

    res.json({
      success: true,
      order: orderData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 結帳付款
router.post("/pay/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderRef = db.collection("orders").doc(orderId);
    const doc = await orderRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "找不到訂單" });
    }

    // 更新訂單狀態並新增 paid_date 欄位
    await orderRef.update({
      is_paid: true,
      paid_date: admin.firestore.Timestamp.now().seconds, // 新增付款日期
    });

    res.json({
      success: true,
      message: "付款完成",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
