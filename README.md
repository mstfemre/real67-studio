# Real67 Studio

MelGeek **Real67** klavye için ışık kontrolü: 20 canlı RGB efekti, 15 renk paleti ve ortam (mood) ışığı ayarları. Efektleri arka planda çalışan küçük bir servis oynatır; tarayıcı kapalıyken de akmaya devam eder.

Yalnızca ışık komutları gönderir. Tuş atamalarına, rapid trigger ve diğer klavye ayarlarına dokunmaz.

## Kurulum (format sonrası / yeni bilgisayar)

1. **Node.js** kurun: <https://nodejs.org> (LTS sürümü).
2. Bu depoyu indirin: yeşil **Code → Download ZIP** ile indirip bir klasöre çıkarın, ya da
   ```
   git clone <depo adresi>
   ```
3. Klasördeki **`kur.bat`** dosyasına çift tıklayın.

`kur.bat` bağımlılığı kurar, Başlat menüsüne **Real67 Studio** kısayolu ekler, isterseniz Windows açılışında otomatik başlatmayı kurar ve arayüzü açar.

> Klasörü sonradan başka bir yere taşırsanız `kur.bat` dosyasını yeniden çalıştırın; kısayollar klasörün yerini kaydeder.

## Kullanım

- Arayüz: <http://localhost:8667> (Başlat menüsünden **Real67 Studio**). Her tarayıcıda çalışır: Chrome, Edge, Firefox, Zen.
- Bir efekt kartına tıklayın; klavyede hemen oynar. Hız, parlaklık ve palet değişiklikleri anında uygulanır.
- Tarayıcıyı kapatabilirsiniz; efekt arka planda sürer ve bilgisayar yeniden başlayınca kaldığı yerden devam eder.
- Bilgisayar kapalıyken ya da servis çalışmıyorken klavye kendi belleğindeki ışığı gösterir.

### MelGeek Hive ile birlikte

Hive (web ya da masaüstü) klavyeye bağlandığında servis bunu algılar, kendini duraklatır ve klavyeyi önceki ışığına döndürür. Hive ile işiniz bitince Başlat menüsünden **Real67 Studio**'yu açın ya da arayüzde **Devam et**'e basın. Firmware güncellemesi yapacaksanız önce `servisi-durdur.bat` çalıştırın.

## Dosyalar

| Dosya / klasör | Ne işe yarar |
|---|---|
| `kur.bat` | Kurulum (yukarıda) |
| `kaldir.bat` | Servisi durdurur, kısayolları siler |
| `start.bat` | Servisi görünür bir pencerede başlatır (hata ayıklama için) |
| `arka-planda-baslat.vbs` | Servisi pencere açmadan başlatır |
| `web-app-ac.vbs` | Servis kapalıysa başlatır, arayüzü tarayıcıda açar |
| `servisi-durdur.bat` | Servisi durdurur; klavye önceki ışığına döner |
| `otomatik-baslat-ac.bat` / `-kapat.bat` | Windows açılışında başlatmayı açar / kapatır |
| `web-app/` | Arayüz (HTML, CSS, JS) ve efekt / protokol kodu |
| `service/` | Arka plan servisi (Node.js + node-hid) |

## Nasıl çalışır

- Klavye, USB üzerinden üreticiye özel bir HID arayüzü sunar (VID `0x0416`, PID `0x0112`, usage page `0xFF60`). Protokol, MelGeek Hive'ın gönderdiği paketler incelenerek çıkarıldı; ayrıntılar `web-app/js/protocol.js` başında.
- Firmware özel animasyon saklayamaz. Servis efekti bilgisayarda hesaplar ve tuş renklerini saniyede ~60 kez klavyenin "Özel 7" renk slotuna yazar.
- Efektler `web-app/js/effects.js` içinde tanımlıdır; arayüzdeki önizleme ve servis aynı kodu kullanır. Yeni efekt eklemek için bu dosyadaki `EFFECTS` dizisine bir kayıt eklemek yeterlidir.
- Servis yalnızca `127.0.0.1:8667` üzerinde dinler; ağdaki başka cihazlar erişemez.

## Sınırlar

- Yalnızca MelGeek Real67 (67 tuş) ile denendi.
- Ortam ışığı için firmware yalnızca 8 hazır rengi kabul eder.
- Windows içindir (başlatma betikleri ve kısayollar).
