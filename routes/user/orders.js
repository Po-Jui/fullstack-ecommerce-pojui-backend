const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();
const crypto = require("crypto");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config();

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

// 字串組合
function genDataChain(order) {
  return `MerchantID=${MerchantID}&TimeStamp=${
    order.TimeStamp
  }&Version=${Version}&RespondType=${RespondType}&MerchantOrderNo=${
    order.MerchantOrderNo
  }&Amt=${order.Amt}&NotifyURL=${encodeURIComponent(
    NotifyUrl
  )}&ReturnURL=${encodeURIComponent(ReturnUrl)}&ItemDesc=${encodeURIComponent(
    order.ItemDesc
  )}&Email=${encodeURIComponent(order.Email)}`;
}
// 對應文件 P17
// MerchantID=MS12345678&TimeStamp=1663040304&Version=2.0&RespondType=Stri
// ng&MerchantOrderNo=Vanespl_ec_1663040304&Amt=30&NotifyURL=https%3A%2F%2
// Fwebhook.site%2Fd4db5ad1-2278-466a-9d66-
// 78585c0dbadb&ReturnURL=&ItemDesc=test

// 對應文件 P17：使用 aes 加密
// $edata1=bin2hex(openssl_encrypt($data1, "AES-256-CBC", $key, OPENSSL_RAW_DATA, $iv));
function createSesEncrypt(TradeInfo) {
  const encrypt = crypto.createCipheriv("aes-256-cbc", HASHKEY, HASHIV);
  const enc = encrypt.update(genDataChain(TradeInfo), "utf8", "hex");
  return enc + encrypt.final("hex");
}

// 對應文件 P18：使用 sha256 加密
// $hashs="HashKey=".$key."&".$edata1."&HashIV=".$iv;
function createShaEncrypt(aesEncrypt) {
  const sha = crypto.createHash("sha256");
  const plainText = `HashKey=${HASHKEY}&${aesEncrypt}&HashIV=${HASHIV}`;

  return sha.update(plainText).digest("hex").toUpperCase();
}

// 對應文件 21, 22 頁：將 aes 解密
function createSesDecrypt(TradeInfo) {
  const decrypt = crypto.createDecipheriv("aes256", HASHKEY, HASHIV);
  decrypt.setAutoPadding(false);
  const text = decrypt.update(TradeInfo, "hex", "utf8");
  const plainText = text + decrypt.final("utf8");
  const result = plainText.replace(/[\x00-\x20]+/g, "");
  return JSON.parse(result);
}

const orders = {};

const {
  MerchantID,
  HASHKEY,
  HASHIV,
  Version,
  PayGateWay,
  NotifyUrl,
  ReturnUrl,
  redirectUrl,
} = process.env;
const RespondType = "JSON";

router.post("/createOrder", (req, res) => {
  try {
    const data = req.body;
    console.log(data);

    // 使用 Unix Timestamp 作為金流的時間戳記）
    const TimeStamp = Math.round(new Date().getTime() / 1000);
    const order = {
      ...data,
      TimeStamp,
      Amt: parseInt(data.Amt),
    };

    // 進行訂單加密
    // 加密第一段字串，此段主要是提供交易內容給予藍新金流
    const aesEncrypt = createSesEncrypt(order);
    console.log("aesEncrypt:", aesEncrypt);

    // 使用 HASH 再次 SHA 加密字串，作為驗證使用
    const shaEncrypt = createShaEncrypt(aesEncrypt);
    console.log("shaEncrypt:", shaEncrypt);
    order.TradeInfo = aesEncrypt;
    order.TradeSha = shaEncrypt;

    orders[data.MerchantOrderNo] = order;
    console.log(orders[data.MerchantOrderNo]);

    res.json({
      success: true,
      message: "建立成功",
      data: order,
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// // 交易成功：Return （可直接解密，將資料呈現在畫面上）
// router.post("/newebpay_return", (req, res, next) => {
//   console.log("req.body return data", req.body);
//   const response = req.body;
//   // 解密交易內容
//   const data = createSesDecrypt(response.TradeInfo);
//   console.log("data:", data.Result.MerchantOrderNo);

//   // 渲染結果頁面
//   res.render("success", {
//     title: "Express",
//     redirectUrl: `${redirectUrl}/${data.Result.MerchantOrderNo}`,
//   });
// });

// 交易成功：Return （可直接解密，將資料呈現在畫面上）
router.post("/newebpay_return", async (req, res, next) => {
  console.log("req.body return data", req.body);
  const response = req.body;

  // 解密交易內容
  const data = createSesDecrypt(response.TradeInfo);
  console.log("data:", data.Result.MerchantOrderNo);

  if (req.body.Status === "SUCCESS") {
    // 交易完成，將成功資訊儲存於資料庫
    try {
      // 獲取訂單參考
      const orderRef = db.collection("orders").doc(data.Result.MerchantOrderNo);
      const doc = await orderRef.get();

      if (!doc.exists) {
        console.error("找不到訂單，訂單號:", data.Result.MerchantOrderNo);
        return res.status(404).json({ success: false, message: "找不到訂單" });
      }

      // 更新訂單狀態並新增 paid_date 欄位
      await orderRef.update({
        is_paid: true,
        paid_date: admin.firestore.Timestamp.now().seconds, // 新增付款日期
      });
      // 確認更新後的文檔內容
      const updatedDoc = await orderRef.get();
      if (updatedDoc.exists && updatedDoc.data().is_paid === true) {
        console.log("訂單更新成功:", data.Result.MerchantOrderNo);
      } else {
        console.error("訂單更新後檢查失敗:", data.Result.MerchantOrderNo);
      }

      // 渲染結果頁面
      res.render("success", {
        title: "success",
        redirectUrl: `${redirectUrl}/${data.Result.MerchantOrderNo}`,
      });
    } catch (error) {
      // 處理錯誤
      console.error("更新訂單狀態失敗:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  } else {
    // 交易失敗
    // 渲染結果頁面
    res.render("error", {
      title: "error",
      redirectUrl: `${redirectUrl}/${data.Result.MerchantOrderNo}`,
    });
  }
});

// 確認交易：Notify
router.post("/newebpay_notify", (req, res, next) => {
  console.log("req.body notify data", req.body);
  const response = req.body;

  // 解密交易內容
  const data = createSesDecrypt(response.TradeInfo);
  console.log("data:", data);

  // 取得交易內容，並查詢本地端資料庫是否有相符的訂單
  console.log(orders[data?.Result?.MerchantOrderNo]);
  if (!orders[data?.Result?.MerchantOrderNo]) {
    console.log("找不到訂單");
    return res.end();
  }

  // 使用 HASH 再次 SHA 加密字串，確保比對一致（確保不正確的請求觸發交易成功）
  const thisShaEncrypt = createShaEncrypt(response.TradeInfo);
  if (!thisShaEncrypt === response.TradeSha) {
    console.log("付款失敗：TradeSha 不一致");
    return res.end();
  }

  // 交易完成，將成功資訊儲存於資料庫
  console.log("付款完成，訂單：", orders[data?.Result?.MerchantOrderNo]);

  return res.end();
});

module.exports = router;
