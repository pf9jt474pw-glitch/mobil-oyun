> Bu depoda iki uygulama var: **Gök Kaçışı** (oyun, kök klasör) ve **Melodim** (müzik çalar, [`muzik/`](muzik/README.md)).

# Gök Kaçışı 🚀

Parmağını sürükleyerek gemini yönet, meteorlardan kaç, yıldızları topla. Oyun **Android**, **iOS** ve **web (PWA)** olarak çalışır. Yerel uygulamalar [Capacitor](https://capacitorjs.com) ile aynı web kodundan üretilir.

## Nasıl oynanır
- **Dokunmatik:** Ekranda parmağını sağa/sola sürükle.
- **Klavye:** ← / → (veya A / D), duraklatmak için `P` ya da `Esc`.
- ⭐ Yıldız: +10 puan · 🛡️ Kalkan: 6 sn dokunulmazlık · ❤️ Kalp: +1 can (en fazla 5)
- Android'de geri tuşu oyunu duraklatır, menüdeyken uygulamadan çıkar.

## Proje yapısı
| Klasör | İçerik |
|---|---|
| `www/` | Oyunun kendisi (HTML/JS). Tüm platformlar bunu kullanır. |
| `android/` | Android Studio projesi |
| `ios/` | Xcode projesi |
| `assets/` | Uygulama simgesi ve açılış ekranı kaynakları |
| `.github/workflows/build.yml` | Her push'ta Android APK ve iOS derlemesi |

## Hazır APK'yı indirme (bilgisayar kurulumu gerekmez)
Her push'ta GitHub Actions uygulamaları derler. GitHub'da **Actions → "Uygulamaları derle" → son çalışma → Artifacts** bölümünden `gok-kacisi-android-apk` dosyasını indir, zip'i aç ve `app-debug.apk`'yı telefona kur (Ayarlar'dan "bilinmeyen kaynaklara izin ver" gerekebilir).

## Kendi bilgisayarında derleme
Gerekenler: Node.js 22+, Android için Android Studio (JDK 21), iOS için macOS + Xcode 26+.

```bash
npm install
npm run android   # kodu kopyalar ve Android Studio'yu açar → ▶ Çalıştır
npm run ios       # kodu kopyalar ve Xcode'u açar → ▶ Çalıştır
```

`www/` içinde değişiklik yaptıktan sonra `npx cap sync` çalıştır. Simgeyi değiştirmek için `assets/` içindeki PNG'leri güncelleyip `npm run assets` çalıştır.

## Mağazalara yükleme
- **Google Play:** Android Studio → *Build → Generate Signed Bundle (AAB)*, kendi imza anahtarınla imzala ve Play Console'a yükle.
- **App Store:** Xcode'da *Signing & Capabilities* bölümünde Apple Developer hesabını seç, *Product → Archive* ile App Store Connect'e gönder.
- Uygulama kimliği: `com.mobiloyun.gokkacisi`. Yayınlamadan önce kendine ait bir kimlikle değiştirmek istersen `capacitor.config.json`, `android/app/build.gradle` ve Xcode'daki Bundle Identifier'ı güncelle.

## Web sürümü
```bash
npm run serve     # http://localhost:8000
```
GitHub Pages ile yayınlarsan (`www/` klasörü) telefonda "Ana ekrana ekle" ile de kurulabilir.
