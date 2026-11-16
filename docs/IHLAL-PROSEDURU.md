# Puanto – veri ihlali olursa ne yapılır

> Bu bir çalışma planıdır, hukuki tavsiye değildir. Süreleri ve bildirim yükümlülüklerini bir avukatla teyit et.
> Kişisel Verileri Koruma Kurulu'nun 2019/10 sayılı kararı ihlalin "en kısa sürede ve en geç 72 saat içinde"
> Kurul'a bildirilmesini öngörüyor; güncel hâlini kvkk.gov.tr'den kontrol et.

## Roller
- **Puanto (hizmet sağlayıcı / veri işleyen):** Üsame Yusufoğlu — usameyusufoglu@gmail.com
- **İşletmeler (veri sorumlusu):** Her firma kendi çalışanlarının verisinden sorumludur. Puanto, ihlali fark edince
  etkilenen işletmelere **hemen** haber verir; işletmeler kendi çalışanlarını ve gerekiyorsa Kurul'u bilgilendirir.

## Saat saat yapılacaklar

### 0 – 2 saat: fark et, kayda al, durdur
1. Ne fark edildiğini, ne zaman ve kim tarafından fark edildiğini aşağıdaki **olay kaydına** yaz (saatleriyle).
2. Sızıntıyı durdur:
   - Supabase → **Authentication → Users**: şüpheli hesapları **Ban** et.
   - Supabase → **Authentication → Sign In / Providers**: gerekirse yeni kayıtları geçici olarak kapat (**Allow new users to sign up** kapalı).
   - Etkilenen işletmenin **firma kodunu yenilet** (Ayarlar → İşletme ve üyeler → Kodu yenile).
   - Bir hesabın şifresi ele geçtiyse kullanıcıdan şifresini yenilemesini iste.
   - Gizli anahtar (`service_role` / `sb_secret_`) sızdıysa: Supabase → **Project Settings → API Keys**'den hemen yenile.
3. Kanıtları sakla: Supabase → **Logs** (Auth, API, Postgres) ekranlarının görüntüsünü ya da dışa aktarımını al
   (ücretsiz planda kayıtlar kısa süre tutulur, beklemeden al).

### 2 – 24 saat: kapsamı belirle
4. Hangi işletmeler, hangi kişiler, hangi veri türleri (ad, T.C., IBAN, maaş…) etkilendi? Yaklaşık kişi sayısı?
5. Etkilenen **işletme sahiplerine** e-postayla haber ver (aşağıdaki şablon).

### 24 – 72 saat: bildirim
6. İşletmeler (veri sorumlusu) Kurul'a bildirim yapacaksa onlara ihtiyaç duydukları bilgiyi ver.
   Kurul'un ihlal bildirim formu ve yöntemi: kvkk.gov.tr → "Veri İhlali Bildirimi".
7. Puanto'nun kendi kullanıcı verileri (hesap e-postaları) etkilendiyse, bu veriler için bildirimi avukatla birlikte değerlendir.

### Sonrası
8. Nedeni düzelt, olay kaydını kapat, aynı şeyin tekrar olmaması için alınan önlemi yaz.

## Olay kaydı (her ihlal için kopyala)
| Alan | Bilgi |
|---|---|
| Fark edilme zamanı | |
| Fark eden | |
| Ne oldu (kısa) | |
| Etkilenen işletmeler | |
| Etkilenen veri türleri | |
| Yaklaşık kişi sayısı | |
| Alınan ilk önlemler (saatleriyle) | |
| İşletmelere bildirim zamanı | |
| Kurul'a bildirim (kim, ne zaman) | |
| Kök neden ve kalıcı önlem | |

## İşletme sahibine e-posta şablonu
> Konu: Puanto – güvenlik olayı bildirimi
>
> Merhaba, [tarih saat] tarihinde Puanto'da bir güvenlik olayı tespit ettik. İşletmeniz [işletme adı] için etkilenebilecek
> veriler: [veri türleri]. Aldığımız önlemler: [önlemler]. Sizden ricamız: [ör. şifrenizi yenileyin, firma kodunu yenileyin].
> Veri sorumlusu olarak çalışanlarınızı ve gerekiyorsa Kişisel Verileri Koruma Kurulu'nu bilgilendirmeniz gerekebilir;
> ihtiyaç duyacağınız bilgileri sağlamaya hazırız. İletişim: usameyusufoglu@gmail.com
>
> Puanto

## Önceden yapılması gerekenler (kontrol listesi)
- [ ] Supabase → **Organization → Settings → Notifications**: e-posta bildirimleri açık
- [ ] Supabase planındaki kayıt (log) saklama süresini öğren; yetmiyorsa planı ya da kayıt dışa aktarımını düşün
- [ ] Bu belgeyi yılda bir gözden geçir
