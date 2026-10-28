# Internet-do'kon — Backend (1-hafta: Arxitektura + Ma'lumotlar bazasi)

Node.js + Express + MongoDB (Mongoose) asosida qurilgan backend.
JWT bilan oddiy login/register, shuningdek **Google orqali kirish/ro'yxatdan o'tish** qo'shilgan.

## Nima bor

- **Users** — xaridorlar va xodimlar (admin, manager, cashier, warehouse, courier rollari)
- **Categories** — mahsulot kategoriyalari
- **Products** — mahsulotlar (narx, tannarx, qoldiq, shtrix-kod, muddat va h.k.)
- **Orders + Order_Items** — buyurtmalar va ichidagi mahsulotlar (status: yangi → tasdiqlandi → yigilmoqda → yetkazilmoqda → yetkazildi)
- **Coupons** — promo-kodlar (foiz yoki summada chegirma)
- **Bonus tangalar tizimi** — har 100 000 so'mlik xariddan 1 tanga (=1000 so'm) qo'shiladi
- **Dashboard** — direktor uchun kunlik/oylik tushum, TOP-10 mahsulot, kam qolgan mahsulotlar
- JWT autentifikatsiya + rol asosida ruxsatlar (`protect`, `authorize`)
- Xatoliklarni markazlashgan boshqarish

## O'rnatish

```bash
cd backend
npm install
cp .env.example .env
```

`.env` faylini oching va quyidagilarni to'ldiring:

- `MONGO_URI` — MongoDB manzili (local: `mongodb://127.0.0.1:27017/online_magazin` yoki MongoDB Atlas link)
- `JWT_SECRET` — istalgan uzun tasodifiy matn
- `GOOGLE_CLIENT_ID` — quyida tushuntirilgan

Ishga tushirish:

```bash
npm run dev     # nodemon bilan (development)
npm start        # oddiy ishga tushirish (production)
```

Server manzili: `http://localhost:5000`

## Google login qanday ishlaydi

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials** bo'limiga kiring.
2. **OAuth Client ID** yarating (Web application turi), **Authorized JavaScript origins** ga frontend manzilingizni qo'shing (masalan `http://localhost:3000`).
3. Olingan **Client ID** ni `.env` faylidagi `GOOGLE_CLIENT_ID` ga qo'ying.
4. Frontendda Google Sign-In tugmasi orqali foydalanuvchi kirganda, Google **idToken** qaytaradi.
5. Frontend shu `idToken` ni backendga yuboradi:

```
POST /api/auth/google
Body: { "idToken": "google_dan_kelgan_token" }
```

Backend tokenni Google serverida tasdiqlaydi, foydalanuvchi bazada bo'lmasa avtomatik yaratadi (email, ism, rasm bilan), bo'lsa — googleId ni biriktiradi va o'zining JWT tokenini qaytaradi. Frontend keyingi barcha so'rovlarda shu JWT tokenni `Authorization: Bearer <token>` header orqali yuboradi — oddiy login bilan bir xil tarzda.

## Asosiy endpointlar

### Auth
| Method | Endpoint | Tavsif |
|---|---|---|
| POST | /api/auth/register | Oddiy ro'yxatdan o'tish |
| POST | /api/auth/login | Oddiy login |
| POST | /api/auth/google | **Google orqali login/register** |
| GET | /api/auth/me | Joriy foydalanuvchi (token kerak) |

### Kategoriyalar
| Method | Endpoint | Tavsif |
|---|---|---|
| GET | /api/categories | Ro'yxat |
| POST | /api/categories | Yaratish (admin) |
| PUT | /api/categories/:id | Yangilash (admin) |
| DELETE | /api/categories/:id | O'chirish (admin) |

### Mahsulotlar
| Method | Endpoint | Tavsif |
|---|---|---|
| GET | /api/products?search=&category=&minPrice=&maxPrice=&page=&limit= | Qidiruv/filtr/sahifalash |
| GET | /api/products/:id | Bitta mahsulot |
| GET | /api/products/barcode/:code | Shtrix-kod bo'yicha (kassa) |
| GET | /api/products/low-stock | Kam qolgan mahsulotlar |
| GET | /api/products/expiring?days=7 | Muddati yaqinlashayotganlar |
| POST | /api/products | Yaratish (admin/manager/warehouse) |
| PUT | /api/products/:id | Yangilash |
| PATCH | /api/products/:id/stock | Kirim/chiqim (`{quantity, type: "kirim"|"chiqim"}`) |
| DELETE | /api/products/:id | O'chirish (admin) |

### Promo-kodlar
| Method | Endpoint | Tavsif |
|---|---|---|
| GET/POST/PUT/DELETE | /api/coupons | CRUD (admin/manager) |
| POST | /api/coupons/apply | Checkoutda tekshirish (`{code, orderAmount}`) |

### Buyurtmalar
| Method | Endpoint | Tavsif |
|---|---|---|
| POST | /api/orders | Yangi buyurtma (checkout) |
| GET | /api/orders/my | O'z buyurtmalarim (xaridor) |
| GET | /api/orders | Barcha buyurtmalar (admin/manager/cashier) |
| GET | /api/orders/:id | Bitta buyurtma |
| PATCH | /api/orders/:id/status | Statusni o'zgartirish |
| PATCH | /api/orders/:id/cancel | Bekor qilish (vozvrat) |

### Direktor paneli
| Method | Endpoint | Tavsif |
|---|---|---|
| GET | /api/dashboard/summary | Kunlik/oylik tushum, mijozlar soni va h.k. |
| GET | /api/dashboard/top-products | TOP-10 sotilgan mahsulot |
| GET | /api/dashboard/dead-stock | Umuman sotilmagan mahsulotlar |

### Foydalanuvchilar / xodimlar
| Method | Endpoint | Tavsif |
|---|---|---|
| GET | /api/users?role= | Ro'yxat (admin) |
| PATCH | /api/users/:id/role | Rol/huquq berish (admin) |
| PATCH | /api/users/:id/block | Bloklash/blokdan chiqarish (admin) |

## Keyingi qadamlar

Bu backend loyihaning **1-hafta** rejasidagi asosni (DB, JWT auth, CRUD API) va sizdan qo'shimcha so'ralgan **Google login**ni to'liq qamrab oladi. 2-4-haftalik rejadagi qolgan bo'limlar (to'lov tizimlari — Click/Payme integratsiyasi, real vaqtli xabarnomalar, kuryer moduli, fayl yuklash/rasm, batafsil davomat va h.k.) shu arxitektura ustiga bosqichma-bosqich qo'shiladi — xohlasangiz keyingi bosqichlarni ham alohida so'rab qoldirsangiz bo'ladi.
