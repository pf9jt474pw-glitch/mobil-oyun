# Melodim 🎵

Reklamsız, tamamen sana ait kişisel müzik uygulaması. Uygulamayı açınca son dinlediğin şey kaldığı yerden çalmaya başlar; ekranı kapatıp işine devam edebilirsin.

## Özellikler
- **Kitaplığım:** Telefonundaki müzik dosyalarını (MP3, M4A, AAC, OGG, WAV, FLAC) ekle. Şarkılar uygulamanın içine kaydedilir, internet gerekmez. Arama, karışık çalma, tümünü/tek şarkıyı tekrar.
- **Listem:** Spotify'daki "1. çalma listem" listesinin şarkı adları. Kitaplığa eklediğin dosyalar bu listeyle otomatik eşleşir ve buradan çalınır; eksik olanlar Spotify'da açılabilir. (Spotify'dan ses alınmaz, yalnızca şarkı adları.)
- **Arka planda çalma:** Ekran kapalıyken ve başka uygulamalardayken çalmaya devam eder.
  - Android: bildirim çubuğunda ve kilit ekranında önceki / çal-duraklat / sonraki / kapat düğmeleri; kulaklık çıkarılınca otomatik duraklar.
  - iOS: kilit ekranı ve Denetim Merkezi kontrolleri.
- **Uyku zamanlayıcısı:** 15 dk – 1,5 saat sonra müziği kendiliğinden durdurur.
- **Kaldığın yerden devam:** Uygulamayı açınca son şarkı otomatik başlar.

Şarkı adları dosya adından okunur: `Sanatçı - Şarkı Adı.mp3` biçimindeki dosyalar düzgün görünür.

## APK'yı indirme
GitHub'da **Actions → "Uygulamaları derle" → son çalışma → Artifacts** bölümünden `melodim-android-apk` dosyasını indir, zip'i aç ve `melodim.apk`'yı telefona kur.

## Kendi bilgisayarında derleme
```bash
cd muzik
npm install
npm run android   # Android Studio'da açar
npm run ios       # Xcode'da açar (macOS gerekir)
```

## Yapı
- `www/` – uygulamanın arayüzü ve çalar mantığı (`index.html`, `app.js`)
- `android/app/src/main/java/.../PlaybackService.java` – arka planda çalmayı sağlayan ön plan servisi, bildirim ve kilit ekranı kontrolleri
- `android/app/src/main/java/.../MediaServicePlugin.java` – web çalar ile servis arasındaki köprü
- `ios/App/App/AppDelegate.swift` + `Info.plist` – iOS arka plan ses modu
