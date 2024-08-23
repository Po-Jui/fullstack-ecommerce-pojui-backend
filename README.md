# fullstack-ecommerce-pojui 電商網站 API

## 環境建置

- [Node.js](https://nodejs.org/en/)
- [Firebase](https://firebase.google.com/)

## 環境參數

```plain
FIREBASE_TYPE =
FIREBASE_PROJECT_ID =
FIREBASE_PRIVATE_KEY_ID =
FIREBASE_PRIVATE_KEY =
FIREBASE_CLIENT_EMAIL =
FIREBASE_CLIENT_ID =
FIREBASE_AUTH_URL =
FIREBASE_TOKEN_URL =
FIREBASE_AUTH_PROVIDER_X509_CERT_URL =
FIREBASE_CLIENT_X509_CERT_URL =
FIREBASE_UNIVERSE_DOMAIN =
FIREBASE_DATABASEURL =
FIREBASE_STORAGEBUCKET =

NODE_ENV =
TINYPNG_API_KEY =

# 根據需求增加
ALLOW_URL_GIT =
ALLOW_URL_ZEABER =

```

## 安裝流程

Clone 專案

```bash
git clone https://github.com/Po-Jui/fullstack-ecommerce-pojui-backend.git
```

安裝 npm 套件

```bash
npm install
```

設定環境參數

> 在非 development 環境下，Access-Control-Allow-Origin 將反映請求的來源

```plain
ex. NODE_ENV = "test"
```

> TinyPNG API 申請

```
- [TinyPNG](https://tinypng.com/developers)
```

啟動 server

```bash
npm run start 或 nodemon
```
