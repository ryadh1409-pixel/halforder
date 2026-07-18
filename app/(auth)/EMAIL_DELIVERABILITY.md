# HalfOrder Authentication Email Deliverability

Configure Firebase Authentication emails (password reset and any future templates)
to send from a professional HalfOrder address with proper DNS authentication.

## Recommended sender

Use one of:

- `noreply@halforder.app`
- `support@halforder.app`

Do **not** hardcode secrets in the app. Configure the sender in the Firebase Console
(and/or a custom SMTP / SendGrid / Mailgun / Postmark provider) using environment
variables or secrets on the provider side only.

## Firebase Console steps

1. Open **Firebase Console → Authentication → Templates**.
2. Customize **Password reset** (and other templates if enabled).
3. Set the **From** name to `HalfOrder` and the sender to `noreply@halforder.app`
   (or `support@halforder.app`).
4. If using Firebase’s default mailer, complete domain verification when prompted.
5. Prefer a custom SMTP / ESP for production deliverability:
   - Firebase Console → Authentication → Templates → SMTP settings
   - Store host, port, username, and password as provider secrets / env vars
     (e.g. `AUTH_SMTP_HOST`, `AUTH_SMTP_USER`, `AUTH_SMTP_PASS`) — never commit them.

## DNS records (production)

Add these records at your DNS provider for `halforder.app`.
Exact values come from your ESP / Firebase domain verification UI — do not invent keys.

### SPF

Authorizes mail servers allowed to send for your domain.

```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com include:sendgrid.net ~all
```

Adjust `include:` entries to match your actual ESP (Firebase / Google / SendGrid /
Mailgun / Postmark). Use one consolidated SPF record only.

### DKIM

Cryptographically signs messages so receivers can verify authenticity.

```
Type: CNAME or TXT  (provider-specific)
Name: <selector>._domainkey   (example: s1._domainkey)
Value: <value provided by your ESP / Firebase>
```

Publish every DKIM record the provider shows until domain status is **Verified**.

### DMARC

Tells receivers what to do with unauthenticated mail and where to send reports.

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:support@halforder.app; pct=100
```

Start with `p=none` while monitoring reports, then tighten to `p=quarantine` or
`p=reject` once SPF + DKIM pass consistently.

## Email enumeration protection (Continue flow)

The login **Continue** button uses Firebase `fetchSignInMethodsForEmail()` to decide
whether to open the Password screen or the **Account not found** screen.

- Existing email → Password
- Unknown email → Account not found → user must tap **Create Account** to open Sign Up

If **Email enumeration protection** is enabled in Firebase Authentication settings,
that API may always return an empty list. For the Continue UX to work correctly:

1. Firebase Console → Authentication → Settings
2. Review **User actions / Email enumeration protection**
3. Disable protection **or** accept that Continue will always show Account not found
   for lookups that return no methods (existing users can still use Forgot Password /
   Google / Apple)

## App behavior (unchanged by DNS)

- Registration uses `createUserWithEmailAndPassword()` and creates the Firestore
  profile immediately — **no** `sendEmailVerification()` call.
- Forgot Password uses `sendPasswordResetEmail()`.
- Google and Apple use Firebase credential sign-in; new users get a profile via the
  existing auth bootstrap (`ensureUserDocument`).

## Checklist

- [ ] Domain `halforder.app` verified with ESP / Firebase
- [ ] SPF TXT published
- [ ] DKIM published and verified
- [ ] DMARC TXT published
- [ ] Password-reset template uses `noreply@halforder.app` or `support@halforder.app`
- [ ] SMTP / ESP credentials stored only in secrets / env — not in git
- [ ] Test password-reset delivery to Gmail, Outlook, and iCloud
