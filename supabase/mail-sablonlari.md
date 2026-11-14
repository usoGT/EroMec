# EroMec – Türkçe mail şablonları

Supabase → **Authentication → Emails → Templates**. Her şablonun **Subject** ve **Message body** alanına aşağıdakini yapıştır.

## Confirm signup (kayıt onayı)

Subject:
```
EroMec – e-posta adresinizi onaylayın
```

Message body:
```html
<h2>EroMec'e hoş geldiniz</h2>
<p>Hesabınızı açmak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{ .ConfirmationURL }}">E-posta adresimi onayla</a></p>
<p>Bu kaydı siz yapmadıysanız bu maili dikkate almayın.</p>
<p>— Eroğlu Mechanic</p>
```

## Reset password (şifre yenileme)

Subject:
```
EroMec – şifre yenileme
```

Message body:
```html
<h2>Şifrenizi yenileyin</h2>
<p>EroMec şifrenizi yenilemek için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{ .ConfirmationURL }}">Yeni şifre belirle</a></p>
<p>Bu isteği siz yapmadıysanız bu maili dikkate almayın; şifreniz değişmez.</p>
<p>— Eroğlu Mechanic</p>
```

## Change email address (e-posta değişikliği)

Subject:
```
EroMec – yeni e-posta adresinizi onaylayın
```

Message body:
```html
<h2>E-posta değişikliği</h2>
<p>EroMec hesabınızın e-postasını {{ .NewEmail }} olarak değiştirmek için bağlantıya tıklayın:</p>
<p><a href="{{ .ConfirmationURL }}">Değişikliği onayla</a></p>
<p>— Eroğlu Mechanic</p>
```
