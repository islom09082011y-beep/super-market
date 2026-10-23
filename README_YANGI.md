# Yangi imkoniyatlar (sozlash qo'llanmasi)

## 1. AI yordamchi (admin)
`.env` ga `ANTHROPIC_API_KEY` qo'shing. Admin panelda pastki o'ng burchakda "AI yordamchi" tugmasi chiqadi.
- Oddiy ishlar (kategoriya/mahsulot qo'shish, narx, status, davomat, promo-kod, sozlamalar...) darhol bajariladi.
- Bekor qilish, mahsulotni o'chirish, foydalanuvchini bloklash faqat TAKLIF qilinadi — admin "Tasdiqlayman" tugmasini bosgandagina bajariladi.
- Barcha amallar `AiLog` kolleksiyasida saqlanadi.

## 2. Onlayn to'lov
- Test rejimi: `PAYMENT_SANDBOX=true` — `/tolov/:id` sahifasida test karta (4242 4242 4242 4242). Pul yechilmaydi.
- Click / Payme: `.env` da kalitlarni to'ldiring, provayder kabinetida callback manzillarini kiriting (`.env.example` da yozilgan).
  MUHIM: ishga tushirishdan oldin Click va Payme'ning o'z test muhitida sinab ko'ring.
- To'lanmagan onlayn buyurtmalar 60 daqiqadan keyin avtomatik bekor qilinadi (ombor qoldig'i qaytariladi).
- Onlayn to'langan buyurtma bekor qilinsa, pulni provayder kabinetidan qo'lda qaytarish kerak (tizim eslatadi).

## 3. Yuz orqali tasdiqlash
Xaridor Profil sahifasida yuzini ro'yxatdan o'tkazadi. Rasm saqlanmaydi, faqat 128 sonli imzo.
Kamera faqat HTTPS yoki localhost'da ishlaydi.
