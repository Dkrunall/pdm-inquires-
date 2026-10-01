# Webflow → Telegram enquiry notifier

A small Next.js service that receives Webflow form-submission webhooks and sends each enquiry to one or more people in their private chat with the Telegram bot. It has no database because Webflow keeps its own copy of every submission.

- `POST /api/booking?key=<WEBHOOK_KEY>`: Webflow webhook endpoint
- `POST /api/telegram`: receives bot commands from Telegram (secured with a secret header)
- `GET /api/telegram/setup?key=<WEBHOOK_KEY>`: one-time bot setup (webhook + command menu)
- `GET /api/health`: returns `{ "ok": true }`

## 1. Create the Telegram bot

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Choose a name and a username ending in `bot`.
3. BotFather replies with a token like `123456789:AA...`. This is `TG_TOKEN`. Keep it secret.

## 2. Get the chat ID(s)

Enquiries go to private chats with the bot, not a group.

1. Each person who should receive enquiries opens the bot in Telegram and presses **Start**. A bot can't message someone who hasn't started it.
2. Get their IDs: open `https://api.telegram.org/bot<TOKEN>/getUpdates` **before step 7** and copy each `"chat":{"id":...}` (a positive number). After step 7, anyone can just send `/id` to the bot.
3. Put the IDs in `TG_CHAT_ID`, separated by commas: `111111111,222222222`.
4. Optional: in BotFather, go to `/mybots` → your bot → **Bot Settings → Allow Groups? → Turn off** so nobody can add the bot to a group.

## 3. Deploy to Vercel

1. Push this project to a Git repo (GitHub/GitLab/Bitbucket).
2. On vercel.com: **Add New → Project**, then import the repo. The framework is detected as Next.js.
3. Under **Environment Variables**, add the following (Production, and Preview if you want):
   - `TG_TOKEN`: the bot token
   - `TG_CHAT_ID`: the group chat ID(s)
   - `WEBHOOK_KEY`: a long random string, e.g. the output of `openssl rand -hex 32`
4. Click **Deploy**. Then check `https://<app>.vercel.app/api/health` returns `{"ok":true}`.

If you change environment variables later, redeploy (**Deployments → ⋯ → Redeploy**) so they take effect.

## 4. Add the webhook in Webflow

**Site settings → Apps & Integrations → Webhooks → Add webhook**

- Trigger type: **Form submission**
- API version: **API V2**
- URL: `https://<app>.vercel.app/api/booking?key=<WEBHOOK_KEY>`

## 5. Check the form field names

In the Webflow Designer, select each form input and check its **Name** under element settings. Fields are matched by keyword after lowercasing and removing non-alphanumerics:

| Shown as | Name contains |
| --- | --- |
| ✉️ Email | `email`, `mail` |
| 📞 Phone | `phone`, `mobile`, `contact`, `whatsapp` |
| 💬 Message | `message`, `inquiry`, `enquiry`, `note`, `comment` |
| 👤 Name | `name` |

Anything else is listed at the end as `• <Field name>: value`. To change the matching, edit `FIELD_RULES` at the top of `lib/format.ts`.

## 6. Publish the site

Webflow only fires webhooks for submissions on the **published** site. Publish after adding the form or webhook.

## 7. Turn on the bot commands

Open this once on your **production** domain, not a preview URL:

`https://<app>.vercel.app/api/telegram/setup?key=<WEBHOOK_KEY>`

It should return `{"ok":true,...}`. This points Telegram at the app and sets the command menu. If you change the domain or `WEBHOOK_KEY`, open it again. After this, `getUpdates` stops working, so use `/id` instead.

| Command | Reply |
| --- | --- |
| `/start` | Says whether this chat receives enquiries (shows its ID if not) |
| `/help` | What the bot does |
| `/id` | This chat's ID |
| anything else | "This bot only sends enquiry notifications." |

Only chats listed in `TG_CHAT_ID` receive enquiries, even if strangers start the bot. Group messages are ignored. To change the reply texts, edit `lib/commands.ts`.

## Local testing

```bash
cp .env.example .env.local   # fill in values
npm install
npm test                     # unit tests
npm run dev
WEBHOOK_KEY=<your key> ./scripts/test-webhook.sh
# or: ./scripts/test-webhook.sh "https://<app>.vercel.app/api/booking?key=<key>"
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401` response | Wrong or missing `?key=` in the webhook URL, or it doesn't match `WEBHOOK_KEY` |
| No request in Vercel logs | Wrong webhook URL in Webflow, or the site isn't published |
| `502` response | Telegram rejected the message. Check `TG_TOKEN` and `TG_CHAT_ID`, and that each recipient has pressed Start. The Telegram error is in the Vercel function logs |
| Bot doesn't answer commands | Setup URL (step 7) not opened, or opened on a preview URL |
| `403 Forbidden: bot was blocked by the user` in logs | That person stopped the bot; they need to press Start again |
| `500` response | An environment variable is missing. The log line names which one |

Logs record only the form name and submission ID, never names, emails, phones, messages, the token or the key.
