# Gök Kaçışı 🚀

Telefonda çalışan, kurulabilir (PWA) bir arcade oyunu. Parmağını sürükleyerek gemini yönet, meteorlardan kaç, yıldızları topla.

## Nasıl oynanır
- **Dokunmatik:** Ekranda parmağını sağa/sola sürükle.
- **Klavye:** ← / → (veya A / D), duraklatmak için `P` ya da `Esc`.
- ⭐ Yıldız: +10 puan · 🛡️ Kalkan: 6 sn dokunulmazlık · ❤️ Kalp: +1 can (en fazla 5)
- Hayatta kaldıkça puan kazanırsın, oyun zamanla hızlanır. En yüksek skor cihazda saklanır.

## Çalıştırma
Herhangi bir statik sunucu yeterli:

```bash
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```

## Telefona kurma
Dosyaları HTTPS üzerinden yayınla (örn. GitHub Pages: Settings → Pages → bu dal / kök klasör). Sonra telefonda sayfayı aç:
- **Android (Chrome):** Menü → "Ana ekrana ekle"
- **iPhone (Safari):** Paylaş → "Ana Ekrana Ekle"

Kurulduktan sonra tam ekran açılır ve service worker sayesinde çevrimdışı da çalışır.

## Dosyalar
- `index.html` – ekranlar ve arayüz
- `game.js` – oyun döngüsü, çizim, ses ve girdi
- `manifest.json`, `sw.js`, `icons/` – PWA kurulumu ve çevrimdışı önbellek
