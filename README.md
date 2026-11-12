# 🎵 Müzik Çalar

Telefonda çalışan, uygulama gibi ana ekrana eklenebilen müzik çalar (PWA).

## Özellikler
- **Popüler şarkılar:** Açılışta haftanın en çok dinlenenleri, türlere göre (Hip-Hop, Pop, Elektronik…).
- **Şarkı arama:** Şarkı ya da sanatçı adını yaz, sonuçlardan birine dokun, tam şarkı çalar.
- **Arka planda çalma:** Ekran kilitlense ya da başka uygulamaya geçsen de müzik devam eder.
- **Kilit ekranı kontrolleri:** Oynat/duraklat, sonraki/önceki ve ileri-geri sarma kilit ekranından yapılır.
- **Karıştır ve tekrarla:** Rastgele çalma; listeyi ya da tek şarkıyı tekrar etme.
- **Favoriler:** ♡ ile beğendiğin şarkılar telefonda saklanır.
- **Kalıcı kitaplık:** Telefondaki şarkı dosyalarını bir kez ekle; uygulamayı kapatsan da saklanır, internetsiz çalar. Kitaplıkta arama, tümünü çal ve silme var.

Müzikler [Audius](https://audius.co) açık müzik platformundan, telifli olmayan yasal yollarla gelir
(ücretsiz, hesap ve API anahtarı gerekmez).

## Yayına alma (GitHub Pages)
1. GitHub'da depo → **Settings → Pages**.
2. *Source*: **Deploy from a branch**, branch olarak bu dalı (veya `main`) ve `/ (root)` seç → **Save**.
3. Bir iki dakika sonra `https://<kullanıcı-adın>.github.io/mobil-oyun/` adresinde açılır.

## Telefona yükleme
- **iPhone (Safari):** Adresi aç → Paylaş ⬆️ → **Ana Ekrana Ekle**.
- **Android (Chrome):** Adresi aç → ⋮ menü → **Uygulamayı yükle / Ana ekrana ekle**.

Ana ekrandaki simgeden açınca tam ekran uygulama gibi çalışır.

## Bilgisayarda deneme
```bash
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```
