# Puanto – Türkçe mail şablonları

Supabase → **Authentication → Emails → Templates**. Her şablonun **Subject** ve **Message body** alanına aşağıdakini yapıştır.

## Confirm signup (kayıt onayı)

Subject:
```
Puanto – e-posta adresinizi onaylayın
```

Message body:
```html
<h2>Puanto'ya hoş geldiniz</h2>
<p>Hesabınızı açmak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{ .ConfirmationURL }}">E-posta adresimi onayla</a></p>
<p>Bu kaydı siz yapmadıysanız bu maili dikkate almayın.</p>
<p>— Puanto</p>
```

## Reset password (şifre yenileme)

Subject:
```
Puanto – şifre yenileme
```

Message body:
```html
<h2>Şifrenizi yenileyin</h2>
<p>Puanto şifrenizi yenilemek için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{ .ConfirmationURL }}">Yeni şifre belirle</a></p>
<p>Bu isteği siz yapmadıysanız bu maili dikkate almayın; şifreniz değişmez.</p>
<p>— Puanto</p>
```

## Change email address (e-posta değişikliği)

Subject:
```
Puanto – yeni e-posta adresinizi onaylayın
```

Message body:
```html
<h2>E-posta değişikliği</h2>
<p>Puanto hesabınızın e-postasını {{ .NewEmail }} olarak değiştirmek için bağlantıya tıklayın:</p>
<p><a href="{{ .ConfirmationURL }}">Değişikliği onayla</a></p>
<p>— Puanto</p>
```
