require("dotenv").config();
require("./connection/firebase-admin");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();

// if (process.env.NODE_ENV !== "production") {
//   console.error("詳細錯誤信息（僅在非生產環境）:", error);
// }

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// 可以在 CORS 設置中使用這個 allowedOrigins
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [
        process.env.ALLOW_URL_ZEABER,
        process.env.ALLOW_URL_GIT,
        process.env.PayGateWay,
      ]
    : "*";

// CORS 配置
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins === "*" || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

console.log(corsOptions);

// app.use(cors(corsOptions));
// 使用條件檢查的中間件
app.use((req, res, next) => {
  if (req.path === "/newebpay-notify") {
    // 直接進入下一個中間件，不使用 CORS
    next();
  } else {
    // 應用 CORS 中間件
    cors(corsOptions)(req, res, next);
  }
});
app.use(bodyParser.json());

// admin 路由
const productsRouter = require("./routes/admin/products");
const couponsRouter = require("./routes/admin/coupons");
const authRouter = require("./routes/admin/auth");
const checkRouter = require("./routes/admin/check");
const ordersRouter = require("./routes/admin/orders");
const uploadRouter = require("./routes/admin/upload");

// user 路由
const cartRouter = require("./routes/user/cart");
const userProductsRouter = require("./routes/user/products");
const userOrdersRouter = require("./routes/user/orders");

// 設定管理員 路由
const setRoleRouter = require("./setRole");
app.use(express.json()); // 解析 JSON 請求
app.use(express.urlencoded({ extended: false }));
app.use("/", setRoleRouter); // 設定管理員

app.use("/admin", productsRouter);
app.use("/admin", couponsRouter);
app.use("/admin", ordersRouter);
app.use("/admin", authRouter);
app.use("/admin", checkRouter);
app.use("/admin", uploadRouter);

app.use("/cart", cartRouter);
app.use("/", userProductsRouter);
app.use("/", userOrdersRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});
