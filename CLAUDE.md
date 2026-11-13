# Real67 Studio — proje notları

MelGeek Real67 klavye için ışık kontrolü. Kullanıcı Türkçe konuşur; arayüz ve yorumlar Türkçedir.

## Mimari
- `service/service.mjs`: Node servisi. node-hid ile klavyeye bağlanır, efektleri ~60 kare/sn oynatır, `web-app/` klasörünü `http://localhost:8667` üzerinden sunar. API: `/api/status`, `/api/play`, `/api/stop`, `/api/resume`, `/api/mood` (otomatik renk), `/api/mood/get`, `/api/mood/set`, `/api/quit`. Durum `service/state.json` içinde saklanır.
- `service/keys.mjs`: tuş basışı algılama (koffi + `GetAsyncKeyState`, kanca yok; tarama kodu o anki klavye düzeniyle çevrilir). Yalnızca `needsKeys: true` olan efektler (Halkalar, Tuş izi, Yazma akışı) oynarken yoklanır; sonuç `frame()`'e `presses` olarak gider. koffi yoksa servis çalışır, bu efektler tepkisiz kalır, kısayollar çalışmaz (`/api/status` → `keys: false`).
- Kısayollar (`hotkeyReader` + serviste `onHotkey`): Ctrl+Alt+← → efekt, ↑ ↓ parlaklık; her zaman 25 ms'de bir yoklanır, Hive duraklatmasında yoklanmaz. Her efektin son ayarları `state.json` → `fxParams`. Servis her `play`'de `rev` artırır; arayüz `revSource === 'hotkey'` olan değişikliği ekranına alır (`adoptServiceEffect`), kendi gönderdiklerini almaz.
- Favoriler: yalnızca arayüzde, `localStorage` → `store.favs` (`{id, fxId, name, params}`), en çok 12.
- Windows kilitliyken `GetAsyncKeyState` her şeyi 0 döner: kilit ekranında basış / kısayol algılanmaz (yapay tuş basışıyla sınama da o sırada çalışmaz).
- Uygulama denetimi (Smart App Control) başka klasöre kopyalanmış `koffi.node`'u engelliyor; ikinci bir çalışma kopyası kurarken `service/node_modules`'ü kopyalama, ana klasördekine junction ver ya da `npm install` çalıştır.
- `web-app/js/colorpicker.js`: uygulamanın kendi renk seçicisi (`colorControl`, `enhanceColorInput`). Renk alanı için `<input type="color">` kullanma: Windows'un renk penceresini açıyor, kullanıcı istemiyor.
- `web-app/js/effects.js`: tüm efektler (`EFFECTS`), paletler. **Servis ve arayüz bu dosyayı ortak kullanır**; efekt değişince servisi yeniden başlat.
- `web-app/js/protocol.js`: HID protokolü ve `Real67` sürücü sınıfı. `xfer` yalnızca ışık gruplarına (0x03, 0x06, 0x0b) izin verir; bu kilidi gevşetme.
- `web-app/js/app.js`: arayüz. Servis varsa her şey servisten gider (tarayıcıda WebHID gerekmez; kullanıcı Zen/Firefox kullanıyor). WebHID yolu yalnızca servis yokken yedektir.

## Cihazda doğrulanmış protokol bilgisi
- Paket: 64 bayt, rapor ID 0: `[grup, alt, uzunluk, 0,0,0, CRC16-CCITT-FALSE(lo,hi), veri…]`. Hata yanıtı grubu `0xEE`.
- Tuş renkleri: `0x03 0x84 [slot, başlangıç, bitiş, 0, (B,G,R,x)…]`, pakette en çok 12 tuş. 8 slot: 0–6 "Özel 1–7", 7 dinamik modların renkleri. Canlı efekt slot 6'yı kullanır.
- Mod parametresi 12 bayt: parlaklık 6 bit `(b2<<2)|(b1>>6)`; statik modda `b1` bit 5 silinirse ışık söner.
- Firmware modları: Dalga (4) ve Geçişli (2) yazılan renkleri yok sayar, kendi gökkuşağını oynatır. Halka (5) birkaç tuş ötede söner. Özel animasyon saklanamaz (grup 0x11 reddedilir).
- Ortam ışığı (grup 0x0b): yalnızca 8 hazır renk (7 = camgöbeği, Hive'da gizli).
- Windows zamanlayıcısı ~15,6 ms adımlıdır; servis bu yüzden 5 ms'de bir "kare vakti geldi mi" diye bakar.

## Kullanıcının tercihleri
- Arayüz sade olsun: tek ekran, açıklama metni az, düğme az. Bir efekte tıklamak onu oynatır.
- Yanıp sönme / nefes istemiyor; renkler aksın.
- Halkalar kendiliğinden (rastgele) halka çıkarmamalı; yalnızca tuş basışına tepki verir. Tuş tepkili efektlerde renkler üst üste toplanmamalı (beyaza dönüyor).
- Yeni özellikleri önce ayrı dalda / ayrı klasörde (git worktree) yap, ayrı portta dene; çalışan sürüm onay gelene kadar değişmesin.
- Rapid trigger ve tuş atamaları asla bozulmamalı. Kontrol için Hive'ın salt-okunur sorguları kullanılabilir (0x0a 0x97, 0x04 0x80/81/83/85, 0x02 0x80).
- Rafa kaldırılanlar (kod duruyor, arayüzde yok): Tuş dalgası efekti, Tuş boyama / Klavyeye kaydet / Paket günlüğü sekmeleri, Genel ayarlar kartı.

## Çalıştırma
- Servisi yeniden başlat: çalışan `node service\service.mjs` sürecini sonlandır, sonra `wscript arka-planda-baslat.vbs`.
- Servis Hive trafiğini görünce kendini duraklatır (`P.paused`).
