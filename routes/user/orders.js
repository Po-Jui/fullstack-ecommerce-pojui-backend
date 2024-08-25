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
    order.aesEncrypt = aesEncrypt;
    order.shaEncrypt = shaEncrypt;

    orders[TimeStamp] = order;
    console.log(orders[TimeStamp]);

    res.json({
      success: true,
      message: "建立成功",
      data: order,
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

router.post("/sendPayment", async (req, res) => {
  try {
    const { aesEncrypt, shaEncrypt } = req.body;

    const formData = new URLSearchParams();
    formData.append("MerchantID", MerchantID);
    formData.append("TradeInfo", aesEncrypt);
    formData.append("TradeSha", shaEncrypt);
    formData.append("Version", Version);

    console.log("Request Data:", formData.toString());
    console.log("PayGateWay:", PayGateWay);

    const response = await axios.post(PayGateWay, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Origin: process.env.ALLOW_URL_ZEABER,
        Referer: process.env.ALLOW_URL_ZEABER,
      },
      maxRedirects: 0, // 防止自動重定向
      validateStatus: function (status) {
        return status >= 200 && status < 500; // 接受狀態碼在200到500之間的響應
      },
    });

    console.log("Response Status:", response.status);
    console.log("Response Headers:", response.headers);
    console.log("Response Data:", response.data);

    if (response.status === 302) {
      // 如果是重定向，返回重定向URL
      res.redirect(response.headers.location);
    } else {
      // 否則返回支付閘道回應
      res.send(response.data);
    }
  } catch (error) {
    console.error(
      "Error in Payment Gateway Request:",
      error.response ? error.response.data : error.message
    );
    res
      .status(500)
      .send(
        "Payment request failed: " +
          (error.response ? JSON.stringify(error.response.data) : error.message)
      );
  }
});

module.exports = router;
