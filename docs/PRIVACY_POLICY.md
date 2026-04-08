# Privacy Policy — ShieldMail

**Last updated**: 2026-04-08  
**Effective date**: 2026-04-08

---

## Summary (Plain Language)

ShieldMail creates temporary email addresses so you don't have to share your real email when signing up for websites. We only extract OTP codes and verification links from emails you receive through ShieldMail — and we delete them automatically after 10 minutes. We store nothing else.

---

## 1. What We Collect

### 1a. Email Content (Server-side, Temporary)

When an email is sent to a ShieldMail alias you created:

- **We extract**: OTP codes (6–8 digit numbers), verification/activation links
- **We discard immediately**: Email body, HTML, sender address, subject line, attachments, raw message
- **Retention**: Extracted OTP and links are stored in volatile server memory for a maximum of **10 minutes**, then automatically deleted via a server-side timer (`setAlarm()`). Clicking "Confirm" or "Acknowledge" deletes them immediately.

We use a whitelist-based storage system. Any data field outside `{otp, confidence, verifyLinks, receivedAt}` throws an error at the server layer and is never persisted.

### 1b. Alias Metadata (Local, User-controlled)

For aliases you choose to save in Managed Mode:

- **We store locally**: Alias address, associated website domain, creation time, user-assigned label
- **Storage location**: iOS Keychain (encrypted) and/or Chrome extension local storage
- **We do not send this to our servers**
- **Deletion**: You can delete individual aliases or all aliases at any time from the app

### 1c. Page Detection Data (Local Only)

Our content script analyzes web pages to detect signup forms:

- **Analyzed locally**: Page URL, heading text, form field attributes, URL path keywords
- **Never transmitted**: No page content, no form values, no HTML, no user input is sent to our servers
- **Only sent to server**: Alias generation mode (`ephemeral` or `managed`), origin domain (e.g., `example.com`), and page title — solely to label the alias

---

## 2. What We Do NOT Collect

- Email addresses (real or temporary) you did not create through ShieldMail
- Passwords, credit card numbers, or any form field values
- Your name, phone number, or physical address
- Device identifiers (IDFA, device fingerprints)
- Location data
- Photos, contacts, or media
- Analytics or behavioral tracking of any kind
- Crash reports or performance data

---

## 3. How We Use Data

| Data | Purpose | Retention |
|---|---|---|
| OTP codes | Display in extension popup for you to copy | ≤ 10 minutes, then deleted |
| Verification links | Display in extension popup for you to open | ≤ 10 minutes, then deleted |
| Alias metadata | Show in Managed Mode list | Until you delete |
| Origin domain + page title | Label the alias (e.g., "GitHub") | Stored with alias |

We use data solely to provide the core functionality of the extension. We do not sell, share, or use data for advertising.

---

## 4. Data Storage and Security

### Server (Cloudflare)
- Cloudflare Durable Objects: in-memory storage, 10-minute auto-expiry
- Cloudflare KV: alias index (address + mode + expiry), no email content
- All connections: HTTPS only
- Authentication: HMAC-signed JWT per alias (not per user)

### Device (iOS / macOS)
- iOS Keychain: AES-256 encrypted by iOS, `kSecAttrAccessibleAfterFirstUnlock`
- Chrome extension local storage: alias list (no email content)
- No iCloud sync of sensitive data

---

## 5. Third-Party Services

| Service | Purpose | Data Shared |
|---|---|---|
| Cloudflare (Workers, KV, Durable Objects) | Backend infrastructure | Email routing, alias storage (see §1) |
| Apple (iOS Keychain) | Secure token/alias storage | None — local device only |

We do not use Google Analytics, Firebase, Mixpanel, Sentry, or any other analytics or monitoring service.

---

## 6. Your Rights

You can at any time:

- **Delete a specific alias**: Tap the alias in the app → Delete
- **Delete all aliases**: App Settings → Delete All Data
- **Disable the extension**: Safari Settings → Extensions → ShieldMail → toggle off
- **Request data deletion**: Email us at privacy@shld.me — we will confirm within 30 days

Because we do not store personal information linked to an identity, we cannot provide a "data export" — there is nothing to export beyond the alias list visible in the app itself.

---

## 7. Children

ShieldMail is not directed at children under 13. We do not knowingly collect information from children.

---

## 8. Changes to This Policy

We will update this page when our practices change. The "Last updated" date at the top will reflect the revision. Continued use after a change constitutes acceptance.

---

## 9. Contact

**Email**: privacy@shld.me  
**GitHub**: https://github.com/moonkj/shieldmail  
**Mailing address**: (to be updated before App Store submission)
