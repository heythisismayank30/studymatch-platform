# Heroku setup on a new laptop

## Important: the Heroku "IP mismatch" error is not caused by this project

Heroku's browser-based CLI authentication can fail if the login flow is started from one public IP/network and completed from another (for example: VPN, mobile hotspot switching, office Wi-Fi, or a browser/network security proxy).

### Recommended fix

1. On the new laptop, use the same stable network for the entire login process.
2. Turn off VPN/proxy temporarily.
3. In Command Prompt:

```bat
heroku update
heroku logout
heroku login
```

4. Press a key when Heroku asks to open the browser.
5. Complete the login in the browser that opens. Do not switch networks while it is waiting.
6. Verify:

```bat
heroku whoami
heroku apps
```

If the browser flow still reports an IP mismatch, try a fresh private/incognito browser window while staying on the same network.

## If browser login is impossible

If your Heroku account does NOT have MFA enabled, Heroku supports:

```bat
heroku login -i
```

If MFA is enabled, use browser authentication instead.

## Connect this project to an existing Heroku app

From this project folder:

```bat
heroku git:remote -a YOUR-HEROKU-APP-NAME
```

Then configure production variables on Heroku:

```bat
heroku config:set TWILIO_ACCOUNT_SID="YOUR_SID"
heroku config:set TWILIO_AUTH_TOKEN="YOUR_TOKEN"
heroku config:set TWILIO_PHONE_NUMBER="YOUR_TWILIO_NUMBER"
heroku config:set PUBLIC_BASE_URL="https://YOUR-HEROKU-APP-NAME.herokuapp.com"
```

Do NOT commit `.env` to Git. It is ignored by `.gitignore`.

## Deploy

```bat
git add .
git commit -m "Fix Heroku deployment and public webhook URL"
git push heroku main
```

Then check:

```bat
heroku logs --tail
```

and open:

```text
https://YOUR-HEROKU-APP-NAME.herokuapp.com/
```

## Why the project was changed

The app previously depended directly on `SERVER_URL` for Twilio webhook URLs. The updated server resolves a safe public base URL from `PUBLIC_BASE_URL`, Heroku's app name, or the incoming request host. This makes moving the project to another laptop/deployment less fragile.
