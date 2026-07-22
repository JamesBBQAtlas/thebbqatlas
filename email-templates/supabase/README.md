# Supabase auth email templates — The BBQ Atlas

These four templates match the light "BBQ Mail" look and use Supabase's own
template variable `{{ .ConfirmationURL }}`. They are **pasted into the Supabase
dashboard**, not deployed with the app.

## Where they go
Supabase dashboard → **Authentication → Emails → Templates**. For each type,
switch the editor to the **HTML source** and paste the matching file:

| Supabase template        | File                  | Suggested subject                         |
|--------------------------|-----------------------|-------------------------------------------|
| Confirm signup           | `confirm-signup.html` | Confirm your email — The BBQ Atlas        |
| Magic Link               | `magic-link.html`     | Your BBQ Atlas sign-in link               |
| Reset Password           | `reset-password.html` | Reset your BBQ Atlas password             |
| Change Email Address     | `change-email.html`   | Confirm your new email — The BBQ Atlas    |

(The "Invite user" template can reuse `magic-link.html` if you ever invite users.)

## Notes
- The crest loads from `https://www.thebbqatlas.com/logos/crest-emblem.png`, so
  it renders once the site is live on that domain.
- These are sent by **Supabase**, independent of Resend. For deliverability,
  point Supabase's **custom SMTP** at Resend (Project Settings → Auth → SMTP)
  once the Resend domain is verified — that's the step that stops these landing
  in spam / getting rate-limited by Supabase's default sender.
- Every template includes a plain-text fallback link under the button in case a
  client blocks the styled button.
