# ShieldMail — App Store Connect Metadata

> Copy-paste into App Store Connect when creating the app listing.

---

## App Information

| Field | Value |
|---|---|
| Bundle ID | `me.shld.shieldmail` |
| SKU | `shieldmail-safari-extension` |
| Primary Language | Korean (한국어) |
| Category | Utilities |
| Secondary Category | Productivity |
| Content Rights | Does not contain third-party content |
| Age Rating | 4+ (no objectionable content) |

---

## App Name & Subtitle

| Locale | Name | Subtitle |
|---|---|---|
| ko | ShieldMail | 가입할 때 진짜 이메일 대신 임시 주소로 |
| en | ShieldMail | Disposable email for every signup |

---

## Description

### Korean (ko)

ShieldMail은 회원가입 시 진짜 이메일 주소 대신 일회용 임시 주소를 자동 생성해주는 Safari 확장 프로그램입니다.

**주요 기능**

• 🛡 Shield Mode — 이메일 입력 필드를 자동 감지하고 방패 아이콘을 표시합니다
• 📧 임시 주소 — 한 번의 탭으로 @shld.me 임시 이메일 주소를 생성합니다
• 🔑 OTP 자동 수신 — 인증번호와 인증 링크가 팝업에 바로 표시됩니다
• 📋 자동 복사 — OTP가 도착하면 클립보드에 자동으로 복사됩니다
• ⏰ 자동 삭제 — 이메일 내용은 10분 후 자동으로 삭제됩니다
• 🔒 프라이버시 — 메일 내용은 서버에 저장되지 않습니다

**사용 방법**

1. Safari 설정 → 확장 프로그램 → ShieldMail 활성화
2. 회원가입 페이지에서 이메일 필드를 탭
3. 방패 아이콘을 탭하여 임시 주소 생성
4. 인증번호가 팝업에 자동으로 표시

**Managed Mode (선택)**

자주 사용하는 서비스의 임시 주소를 영구 보관하고 태그로 관리할 수 있습니다.

개발자와 QA 엔지니어를 위해 설계되었습니다. 50번의 반복 가입 테스트도 스트레스 없이 진행할 수 있습니다.

### English (en)

ShieldMail is a Safari extension that auto-generates disposable email addresses whenever you sign up for a service — keeping your real inbox clean and your identity private.

**Key Features**

• 🛡 Shield Mode — auto-detects email fields and shows a shield icon
• 📧 Disposable address — tap once to generate an @shld.me temporary email
• 🔑 OTP auto-receive — verification codes and links appear directly in the popup
• 📋 Auto-copy — OTPs are automatically copied to clipboard on arrival
• ⏰ Auto-delete — email content is permanently deleted after 10 minutes
• 🔒 Privacy-first — no email content is ever stored on our servers

**How to use**

1. Safari Settings → Extensions → Enable ShieldMail
2. Visit any signup page and tap the email field
3. Tap the shield icon to generate a temporary address
4. Verification codes appear automatically in the popup

Built for developers and QA engineers. Run 50 signup tests without breaking a sweat.

---

## Keywords

### Korean
임시이메일,일회용이메일,가입자동화,OTP,프라이버시,이메일보호,스팸차단,개발자도구,QA테스트

### English
disposable,email,temporary,signup,OTP,privacy,spam,developer,QA

---

## Promotional Text

### Korean
가입할 때마다 진짜 이메일 노출 걱정 끝. ShieldMail이 임시 주소를 자동 생성하고 인증번호를 바로 보여줍니다.

### English
Stop exposing your real email at every signup. ShieldMail auto-generates disposable addresses and shows verification codes instantly.

---

## Support URL

https://github.com/moonkj/shieldmail/issues

## Marketing URL

https://github.com/moonkj/shieldmail

## Privacy Policy URL

https://github.com/moonkj/shieldmail/blob/main/docs/PRIVACY_POLICY.md

---

## What's New (Version 0.1.0)

### Korean
ShieldMail 첫 번째 릴리즈! Safari에서 임시 이메일 주소를 자동 생성하고 OTP를 바로 확인하세요.

### English
First release of ShieldMail! Auto-generate disposable email addresses in Safari and receive OTPs instantly.

---

## Screenshots

Required sizes:
- iPhone 6.7" (1290×2796)
- iPhone 6.1" (1179×2556)
- iPad Pro 12.9" (2048×2732)

Recommended shots (6 per device):
1. Shield icon appearing on a signup form email field
2. Popup showing the generated @shld.me address with Copy button
3. Popup showing the received OTP code (large digits)
4. Managed Mode — alias list with tags
5. iOS floating button on iPhone (bottom-right corner)
6. Onboarding screen (Safari activation guide)

---

## Review Notes

See [docs/APP_STORE_REVIEW_NOTES.md](APP_STORE_REVIEW_NOTES.md) for detailed
review notes including test credentials and demo page URL.

| Item | Value |
|---|---|
| Demo URL | `https://demo.shld.me/signup` (or GitHub Pages equivalent) |
| Test account | Not required — the extension generates its own temporary addresses |
| Permissions justification | See APP_STORE_REVIEW_NOTES.md |
