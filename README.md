# Real67 Studio

MelGeek **Real67** klavye için gayriresmî ışık kontrol uygulaması. Klavyenin kendi RGB modları az ve sınırlı olduğu için yazıldı: 20 canlı efekt, 15 renk paleti ve ortam (mood) ışığı ayarı sunar.

Efektleri arka planda çalışan küçük bir servis oynatır. Tarayıcıyı kapatsanız da ışıklar akmaya devam eder, bilgisayar yeniden açıldığında kaldığı yerden sürer.

> **Güvenli:** Klavyeye yalnızca ışık komutları gönderilir. Tuş atamalarına, rapid trigger ve diğer klavye ayarlarına dokunulmaz.

## İçindekiler

- [Ne yaptık, neden yaptık](#ne-yaptık-neden-yaptık)
- [Özellikler](#özellikler)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [MelGeek Hive ile birlikte kullanım](#melgeek-hive-ile-birlikte-kullanım)
- [Nasıl çalışır](#nasıl-çalışır)
- [Dosyalar](#dosyalar)
- [Sınırlar](#sınırlar)

## Ne yaptık, neden yaptık

Real67'nin resmî aracı [MelGeek Hive](https://hive.melgeek.com) yalnızca birkaç hazır ışık modu sunuyor ve kendi animasyonunuzu yapmanıza izin vermiyor. Bu proje o eksiği kapatmak için sıfırdan yazıldı:

1. **Protokolü çözdük.** MelGeek, klavyenin USB protokolünü yayımlamıyor. Hive'ın klavyeye gönderdiği paketleri tarayıcıda yakalayıp inceleyerek ışıkla ilgili komutları çıkardık: tuş renklerini yazma, ışık modunu ve parlaklığı ayarlama, ortam ışığını değiştirme.
2. **Firmware'in sınırını bulduk.** Klavye özel animasyon saklayamıyor; hazır "Dalga" ve "Geçişli" modları da yazdığınız renkleri yok sayıp kendi gökkuşağını oynatıyor. Yani özel bir efektin tek yolu, renkleri bilgisayardan sürekli göndermek.
3. **Arka plan servisi yazdık.** Efekti bilgisayarda hesaplayıp 67 tuşun rengini saniyede yaklaşık 60 kez klavyeye yazan küçük bir Node.js servisi. Pencere açmaz, Windows açılışında kendiliğinden başlayabilir.
4. **Web arayüzü yazdık.** Servis aynı zamanda `http://localhost:8667` adresinde tek ekranlık bir arayüz sunar. Bir efekte tıklarsınız, klavyede oynar. Arayüz servise konuştuğu için WebHID desteklemeyen tarayıcılarda da (Firefox, Zen) çalışır.
5. **Klavye ayarlarını koruduk.** Sürücü kodu ışık dışındaki komut gruplarını göndermeyi reddeder. Rapid trigger, tetik noktası ve tuş ataması blokları ışık işlemlerinden önce ve sonra okunup karşılaştırıldı; bayt bayt aynı kaldı.

## Özellikler

- **20 canlı efekt**, hepsinde hız ve parlaklık ayarı
- **15 renk paleti**; palet kullanan her efektte seçilebilir
- **Ortam ışığı:** renk, mod, hız, parlaklık ve efektin rengine göre otomatik renk
- **Tarayıcısız çalışma:** efekt arka planda sürer
- **Otomatik başlatma:** Windows açılışında son efekt kendiliğinden başlar
- **Hive ile uyum:** Hive klavyeye bağlanınca servis kendini duraklatır
- Arayüz, seçili efektin renklerine bürünür

### Efektler

| Efekt | Ne yapar |
|---|---|
| Gökkuşağı dalgası | Klavyenin üzerinden akan renk bandı |
| Spektrum döngüsü | Tüm tuşlar birlikte renk değiştirir |
| Kuzey ışıkları | Yavaşça dalgalanan renk perdeleri |
| Ateş | Alt sıradan yükselen alevler |
| Matrix yağmuru | Sütunlardan aşağı süzülen damlalar |
| Yıldız tozu | Sakin bir zemin üzerinde parlayan tuşlar |
| İki renkli nefes | İki renk arasında yumuşak geçiş |
| Plazma | Klasik plazma alanı |
| Radar | Merkez etrafında dönen tarama ışını |
| Kayan gradyan | Seçtiğiniz üç renk yatay olarak akar |
| Kuyruklu yıldız | Sıralar boyunca kayan yıldızlar ve izleri |
| Halkalar | Bastığınız tuştan yayılan su halkaları (hangi programda yazarsanız yazın) |
| Tuş izi | Bastığınız tuş yanar ve yavaşça söner |
| Yazma akışı | Yazdıkça hızlanan ve parlayan, durunca yavaşlayan renk akışı |
| Lav lambası | Birleşip ayrılan renk damlaları |
| Girdap | Merkez etrafında dönen renk sarmalı |
| Fırtına | Koyu bulutlar ve çakan şimşekler |
| Kalp atışı | Merkezden çift vuruşla yayılan nabız |
| Tarayıcı | Bir uçtan diğerine gidip gelen ışık çubuğu |
| Ateş böcekleri | Süzülen yumuşak ışık noktaları |
| Ekolayzer | Zıplayan çubuklar (ses dinlemez, canlandırmadır) |
| Yılan | Tuşların arasında kıvrılan ışıklı yılan |

## Kurulum

Yeni bir bilgisayarda ya da format sonrası üç adım:

**1. Node.js kurun.** <https://nodejs.org> adresinden LTS sürümünü indirip kurun.

**2. Projeyi indirin.** Git kuruluysa:

```
git clone https://github.com/mstfemre/real67-studio.git
```

Git yoksa bu sayfanın üstündeki yeşil **Code** düğmesinden **Download ZIP**'i seçin ve ZIP'i bir klasöre çıkarın.

**3. `kur.bat` dosyasına çift tıklayın.** Kurulum şunları yapar:

- gerekli bağımlılıkları (`node-hid`, `koffi`) indirir,
- Başlat menüsüne **Real67 Studio** kısayolu ekler,
- Windows açılışında otomatik başlatmak isteyip istemediğinizi sorar,
- servisi başlatır ve arayüzü tarayıcıda açar.

> Klasörü sonradan başka bir yere taşırsanız `kur.bat` dosyasını yeniden çalıştırın; kısayollar klasörün yerini kaydeder.

Kaldırmak için `kaldir.bat` dosyasını çalıştırın. Servisi durdurur ve kısayolları siler; klasörü silmez.

## Kullanım

- Arayüzü Başlat menüsünden **Real67 Studio** ile ya da <http://localhost:8667> adresinden açın. Chrome, Edge, Firefox ve Zen'de çalışır.
- Bir efekt kartına tıklayın; klavyede hemen oynar.
- Hız, parlaklık, palet ve renk değişiklikleri anında uygulanır.
- **★ Favorilere ekle** efekti o anki ayarlarıyla kaydeder; efekt listesinin üstündeki favori kartına tıklayınca aynen oynar. Favoriler tarayıcıda saklanır.
- **Kısayollar** (arayüz kapalıyken de çalışır):

  | Tuşlar | Ne yapar |
  |---|---|
  | Ctrl+Alt+→ / ← | Sonraki / önceki efekt (her efekt son ayarlarıyla gelir) |
  | Ctrl+Alt+↑ / ↓ | Oynayan efektin parlaklığını artırır / azaltır (basılı tutunca sürer) |

  Kısayol tuşları öndeki programa da gider; o programda aynı tuşların bir görevi varsa o da çalışır (ör. VS Code'da Ctrl+Alt+↑ / ↓ imleç ekler).
- Tarayıcıyı kapatabilirsiniz; efekt arka planda sürer.
- Servis çalışmıyorken ya da bilgisayar kapalıyken klavye kendi belleğindeki ışığı gösterir.

## MelGeek Hive ile birlikte kullanım

Rapid trigger, tuş ataması gibi ayarlar için Hive'ı kullanmaya devam edebilirsiniz.

- Hive (web ya da masaüstü) klavyeye bağlandığında servis bunu algılar, kendini duraklatır ve klavyeyi önceki ışığına döndürür.
- Hive ile işiniz bitince Başlat menüsünden **Real67 Studio**'yu açın ya da arayüzde **Devam et**'e basın.
- **Firmware güncellemesi** yapacaksanız önce `servisi-durdur.bat` dosyasını çalıştırın.

## Nasıl çalışır

```
Tarayıcı (arayüz)  ──HTTP──▶  Servis (Node.js)  ──USB HID──▶  Klavye
 localhost:8667                efekti hesaplar,                67 tuşun rengi
                               ~60 kare/sn gönderir
```

- Klavye, USB üzerinden üreticiye özel bir HID arayüzü sunar (VID `0x0416`, PID `0x0112`, usage page `0xFF60`). Paketler 64 bayttır ve CRC16 ile korunur. Ayrıntılar `web-app/js/protocol.js` dosyasının başında yazılıdır.
- Servis her karede 67 tuşun rengini hesaplar ve klavyenin "Özel 7" renk slotuna yazar. Durduğunda klavyeyi önceki ışık moduna geri döndürür.
- Efektler `web-app/js/effects.js` içinde tanımlıdır. Arayüzdeki önizleme ve servis aynı kodu kullanır; yeni efekt eklemek için bu dosyadaki `EFFECTS` dizisine bir kayıt eklemek yeterlidir.
- Servis yalnızca `127.0.0.1:8667` üzerinde dinler; ağdaki başka cihazlar erişemez.
- **Halkalar**, **Tuş izi** ve **Yazma akışı** oynarken servis, hangi tuşa basıldığını Windows'a sorar (`GetAsyncKeyState`, `service/keys.mjs`). Klavye kancası kurulmaz; basışlar yalnızca o karedeki ışık için kullanılır, kaydedilmez ve hiçbir yere gönderilmez. Başka bir efekt oynarken yalnızca kısayol tuşlarına (Ctrl, Alt, oklar) bakılır.

## Dosyalar

| Dosya / klasör | Ne işe yarar |
|---|---|
| `kur.bat` | Kurulum |
| `kaldir.bat` | Servisi durdurur, kısayolları siler |
| `web-app-ac.vbs` | Servis kapalıysa başlatır, arayüzü tarayıcıda açar |
| `arka-planda-baslat.vbs` | Servisi pencere açmadan başlatır |
| `start.bat` | Servisi görünür bir pencerede başlatır (hata ayıklama için) |
| `servisi-durdur.bat` | Servisi durdurur; klavye önceki ışığına döner |
| `otomatik-baslat-ac.bat` / `-kapat.bat` | Windows açılışında başlatmayı açar / kapatır |
| `web-app/` | Arayüz (HTML, CSS, JS), efektler ve protokol kodu |
| `service/` | Arka plan servisi (Node.js + node-hid; tuş basışları için koffi) |
| `service/klavye-testi.mjs` | Işık akışının 8K raporlamayı / gecikmeyi etkileyip etkilemediğini ölçer: `node service/klavye-testi.mjs` |

## Sınırlar

- Yalnızca MelGeek Real67 (67 tuş) ile denendi.
- Yalnızca Windows içindir (başlatma betikleri ve kısayollar).
- Efektler bilgisayardan gönderildiği için servis çalışmıyorken oynamaz; firmware özel animasyon saklayamaz.
- Ortam ışığı için firmware yalnızca 8 hazır rengi kabul eder.
- MelGeek ile bağlantısı olmayan, kişisel bir projedir.
