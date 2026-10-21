# Troubadour auth worker

The small helper behind **Connect with GitHub** in Troubadour's settings (Android, iPhone, web player, Story builder).

- GitHub's sign-in addresses cannot be called from a web page, so the worker relays GitHub's *device sign-in*: the troubadour types a short code on github.com. No GitHub permission is asked; Troubadour only learns the public username and id.
- It keeps the registry of troubadour names, [`docs/recueil/troubadours.json`](../docs/recueil/troubadours.json): one name per GitHub account, once and for all, unique whatever the case, accents or spacing.
- The Recueil check ([`build_recueil_index.py`](../.github/scripts/build_recueil_index.py)) reads that registry: a registered name only signs tales sent by its owner.

Without a GitHub connection, every story is signed **Forgotten Troubadour**.

## Routes

| Route | What it does |
| --- | --- |
| `POST /device/code` | Starts a GitHub device sign-in, returns the code to type on github.com. |
| `POST /device/token` | `{ device_code }`: has the troubadour typed the code yet? Returns the token, username and registered name once done. |
| `GET /troubadour` | With `Authorization: Bearer <token>`: username and registered name (null if none). |
| `POST /troubadour` | With the token, `{ name }`: registers the troubadour name for this account, once and for all. |

## Setting it up (once)

1. **GitHub OAuth App.** github.com, Settings, Developer settings, OAuth Apps, New OAuth App. Name `Troubadour`, homepage `https://arthurvangeersdaele.github.io/Troubadour/`, callback URL the same (unused). Tick **Enable Device Flow**. Copy the **Client ID** (no secret needed).
2. **Registry token.** Settings, Developer settings, Fine-grained tokens, Generate: repository access *only* `arthurvangeersdaele/Troubadour`, permission **Contents: Read and write**. Copy it.
3. **Cloudflare.** Create a free account at cloudflare.com. Note the **Account ID** (Workers & Pages overview), then create an **API token** with the template *Edit Cloudflare Workers*.
4. **Repository settings** (Settings, Secrets and variables, Actions):
   - secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TROUBADOUR_REGISTRY_TOKEN`;
   - variable `TROUBADOUR_GITHUB_CLIENT_ID`.
5. Run the workflow **Troubadour auth worker** (Actions tab, Run workflow). It tests and deploys the worker to `https://troubadour-auth.<your-subdomain>.workers.dev`.
6. Put that address in [`docs/auth/config.json`](../docs/auth/config.json) (`"worker": "https://troubadour-auth.….workers.dev"`). Every Troubadour reads it: the Connect with GitHub button appears everywhere, no app update needed.

## Tests

```
node --test auth-worker/test/worker.test.js
```
