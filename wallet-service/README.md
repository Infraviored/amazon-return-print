# wallet-service

Tiny server that turns an Amazon return QR code into a Google Wallet "save" link.
No dependencies, no outbound calls: the pass class and object travel inside a JWT
signed with your service account key, and Google creates them when the user saves.

## One-time setup

1. Google Cloud Console: enable the **Google Wallet API**, create a **service account**, create a JSON key for it.
2. [Google Pay & Wallet Console](https://pay.google.com/business/console): create an **issuer**, note the issuer ID, and add the service account's e-mail as a user.
3. While the issuer is in **demo mode**, only Google accounts you add as test users can save passes. Request publishing access to open it to everyone.

## Run

```bash
docker build -t wallet-service .
docker run -d --name wallet-service -p 8787:8787 \
  -e WALLET_ISSUER_ID=3388000000012345678 \
  -e WALLET_KEY_FILE=/key.json -v /path/to/key.json:/key.json:ro \
  -e API_TOKEN=some-long-random-string \
  wallet-service
```

The extension calls the shared instance at `https://wallet.infraviored.com` without a token, so that instance runs with `ALLOW_PUBLIC=1`. What limits abuse there: only DHL return QR codes (`RON|<number>|…`) are accepted, layout and card title are fixed, input is strictly validated, and every request counts against a per-IP limit (20/hour). Behind a reverse proxy, make it set `X-Real-IP`; the rate limit keys on it.

For a private instance, set `API_TOKEN` instead: requests then need `Authorization: Bearer <token>`. The extension does not send one, so a private instance is only for your own clients.

`docker-compose.yml` is the home-server variant: it expects `.env`, `secrets/` and the external `proxy-network`.

## API

`POST /pass` with JSON:

| field | required | |
|---|---|---|
| `qr` | yes | DHL return QR content (`RON|<number>|…`), up to 500 chars |
| `returnId` | no | shown on the pass and under the QR |
| `carrier` | no | e.g. `DHL` |
| `deadline` | no | `YYYY-MM-DD`; the pass expires after that day |
| `title` | no | pass header, default `Rücksendung` |

Returns `{ "saveUrl": "https://pay.google.com/gp/v/save/<jwt>" }`. Title, colours and layout are fixed server-side; unknown fields are rejected; 20 passes per IP per hour (`RATE_LIMIT`).

## Test

```bash
node --test wallet-service/server.test.mjs
```
