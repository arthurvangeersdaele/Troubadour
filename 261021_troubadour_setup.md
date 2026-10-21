# Mise en route de Troubadour

Bardic devient Troubadour. Ce repo repart d'un historique neuf, avec tout ce qu'avait Bardic au 21 octobre 2026. Voici, dans l'ordre, ce qu'il reste à faire de ton côté sur GitHub et Cloudflare. Compte une vingtaine de minutes.

## 1. Publier le site (GitHub Pages)

1. Sur github.com, ouvre `arthurvangeersdaele/Troubadour`, puis **Settings**, **Pages**.
2. **Source** : *Deploy from a branch*. **Branch** : `main`, dossier `/docs`. **Save**.
3. Une à deux minutes plus tard, le site est en ligne : https://arthurvangeersdaele.github.io/Troubadour/

## 2. Laisser les actions écrire dans le repo

Les actions publient l'APK (release `dev-latest`) et mettent à jour l'index du Recueil.

1. **Settings**, **Actions**, **General**.
2. **Workflow permissions** : coche *Read and write permissions*. **Save**.
3. Onglet **Actions** : si GitHub demande d'activer les workflows, accepte.
4. Relance **Build APK** (*Run workflow*) si le premier passage a échoué faute de permission. La release `dev-latest` apparaît avec `AAMMJJ_troubadour-….apk`.

## 3. Connexion GitHub (nom de troubadour)

Le bouton **Connect with GitHub** passe par un petit worker Cloudflare. L'ancien (`bardic-auth`) écrit dans le repo Bardic : il en faut un nouveau, `troubadour-auth`, qui écrit dans `docs/recueil/troubadours.json` de ce repo. Ton nom déjà enregistré (Chiffon) y est repris.

### 3.1 L'application OAuth GitHub

Le plus simple est de **renommer celle de Bardic** : le Client ID ne change pas.

1. github.com, ta photo, **Settings**, **Developer settings**, **OAuth Apps**, ouvre **Bardic**.
2. **Application name** : `Troubadour`.
3. **Homepage URL** et **Authorization callback URL** : `https://arthurvangeersdaele.github.io/Troubadour/`
4. Vérifie que **Enable Device Flow** est coché. **Update application**.
5. Copie le **Client ID** (affiché en haut).

(Pour en créer une nouvelle à la place : **New OAuth App**, mêmes champs, coche *Enable Device Flow*, puis copie le nouveau Client ID. Aucun secret n'est nécessaire.)

### 3.2 Le jeton qui écrit le registre des noms

L'ancien jeton ne peut écrire que dans Bardic : il en faut un nouveau.

1. **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**.
2. Nom : `troubadour-registry`. Expiration : à ton choix (note la date pour le renouveler).
3. **Repository access** : *Only select repositories*, `arthurvangeersdaele/Troubadour`.
4. **Permissions**, **Repository permissions**, **Contents** : *Read and write*.
5. **Generate token** et copie-le tout de suite (il ne s'affiche qu'une fois).

### 3.3 Les secrets et la variable du repo Troubadour

Dans `arthurvangeersdaele/Troubadour`, **Settings**, **Secrets and variables**, **Actions** :

| Onglet | Nom | Valeur |
| --- | --- | --- |
| Secrets | `CLOUDFLARE_API_TOKEN` | le même jeton Cloudflare que pour Bardic (modèle *Edit Cloudflare Workers*) |
| Secrets | `CLOUDFLARE_ACCOUNT_ID` | le même Account ID que pour Bardic |
| Secrets | `TROUBADOUR_REGISTRY_TOKEN` | le jeton de l'étape 3.2 |
| Variables | `TROUBADOUR_GITHUB_CLIENT_ID` | le Client ID de l'étape 3.1 |

Les deux valeurs Cloudflare se retrouvent sur dash.cloudflare.com : l'Account ID dans **Workers & Pages**, colonne de droite. Si tu n'as plus le jeton API, crée-en un : **My Profile**, **API Tokens**, **Create Token**, modèle *Edit Cloudflare Workers*.

### 3.4 Déployer le worker

1. Onglet **Actions**, workflow **Troubadour auth worker**, **Run workflow**.
2. Il teste puis déploie `troubadour-auth`. À la fin du journal, l'adresse s'affiche : `https://troubadour-auth.<sous-domaine>.workers.dev`.
3. Le site est réglé sur `https://troubadour-auth.bardic.workers.dev` (ton sous-domaine Cloudflare actuel s'appelle `bardic`). Si l'adresse affichée est différente, remplace-la dans `docs/auth/config.json`. Toutes les plateformes la lisent, sans mise à jour d'app.
4. Test : sur le site, **Settings**, **Connect with GitHub**. Ton nom Chiffon doit revenir tout seul.

### 3.5 Optionnel : renommer le sous-domaine Cloudflare

Pour une adresse en `….troubadour.workers.dev` : dash.cloudflare.com, **Workers & Pages**, **Subdomain**, **Change**, `troubadour`. Mets ensuite à jour `docs/auth/config.json`. Attention : l'ancien worker `bardic-auth` change d'adresse lui aussi.

## 4. Android

- L'identifiant devient `com.troubadour.app` : Troubadour s'installe **à côté** de Bardic, comme une nouvelle app.
- Dans Bardic : **Settings**, **Export every story**. Installe Troubadour (release `dev-latest` du nouveau repo), puis **Import** de chaque fichier. Les anciens `.bardic` s'ouvrent tels quels.
- Ensuite, désinstalle Bardic.
- La clé de signature est la même (`app/debug.keystore`). Avant la publication sur le Play Store, il faudra une clé de release : à faire ensemble le moment venu.

## 5. iPhone et tablettes

- Nouvelle adresse : https://arthurvangeersdaele.github.io/Troubadour/ios/ : il faut l'ajouter à l'écran d'accueil.
- L'ancienne app Bardic affiche un message qui guide l'export des histoires, puis l'installation de Troubadour.
- Dans Troubadour : **Import**, puis choisis les fichiers exportés. Les `.bardic` s'ouvrent tels quels.
- Supprime ensuite Bardic de l'écran d'accueil.

## 6. L'ancien repo Bardic

1. Le site Bardic affiche maintenant « Bardic devient Troubadour » avec les liens vers le nouveau site. Les anciennes apps en ligne (iPhone, lecteur web) affichent le même message.
2. Quand tout fonctionne ici : `arthurvangeersdaele/Bardic`, **Settings**, **General**, tout en bas **Archive this repository**. Les pages GitHub restent en ligne pour un repo archivé, donc le message de redirection continue de s'afficher.
3. Sur Cloudflare, supprime l'ancien worker `bardic-auth` (**Workers & Pages**, `bardic-auth`, **Settings**, **Delete**) une fois que la connexion fonctionne sur Troubadour.

## 7. Ce qui change de nom

| Avant | Maintenant |
| --- | --- |
| Bardic | Troubadour |
| `.bardic` (format `bardic`) | `.troubadour` (format `troubadour`), les `.bardic` restent lisibles partout |
| Bardic Flow, `.bardic-flow` | Troubadour Ballade, `.troubadour-ballade` (les `.bardic-flow` restent lisibles) |
| Compagnie des bardes | La Troupe dans les menus, La Troupe des Troubadours en titre |
| Bard name, Forgotten Barde | Troubadour name, Forgotten Troubadour |
| `/compagnie/`, `/flow/`, `/bardic-flow/` | `/troupe/`, `/ballade/`, `/troubadour-ballade/` |
| `com.bardic.app` | `com.troubadour.app` |

Le Recueil garde son nom. Ses contes ont été réécrits au format Troubadour et sont signés Troubadour.
