# Portelio — Plan d'implémentation MVP

## Concept

Application iOS permettant de lier deux utilisateurs via un widget partagé. Chaque utilisateur peut envoyer une photo par jour qui apparaît sur le widget du téléphone de son partenaire.

---

## Stack technique

| Couche             | Techno                                       |
| ------------------ | -------------------------------------------- |
| App (UI/logique)   | Nuxt 3 + Capacitor iOS                       |
| Styles             | Tailwind CSS                                 |
| Widget             | Swift + SwiftUI + WidgetKit                  |
| Backend            | Supabase (DB, Auth, Storage, Edge Functions) |
| Push notifications | APNs via Supabase Edge Function              |
| IAP                | StoreKit 2                                   |
| Auth               | Supabase anonymous auth + Keychain           |
| Analytics          | PostHog                                      |

**iOS minimum : 17.0**

---

## Schéma de base de données

```
users
  id            uuid (PK)
  username      text
  device_token  text        -- APNs token
  created_at    timestamp

pairs
  id            uuid (PK)
  user_a_id     uuid (FK → users)
  user_b_id     uuid (FK → users)
  created_at    timestamp

invitations
  id            uuid (PK)
  inviter_id    uuid (FK → users)
  token         text (unique)
  status        enum (pending | accepted | expired)
  created_at    timestamp
  expires_at    timestamp   -- 24h après création

photos
  id            uuid (PK)
  pair_id       uuid (FK → pairs)
  sender_id     uuid (FK → users)
  storage_path  text
  caption       text (max 50 chars)
  sent_at       timestamp
```

---

## Règles métier

- **Gratuit** : 1 paire max, historique 5 derniers jours
- **Premium** : jusqu'à 5 paires, historique illimité, widget dédié par paire, personnalisation des widgets (v2)
- L'expiration des invitations est de 24h
- La limite 1 photo/jour est vérifiée côté client et serveur (Edge Function)

---

## Architecture widget — point critique

Le widget est une **Widget Extension Swift/SwiftUI native**, ajoutée au projet Xcode généré par Capacitor. Elle est entièrement indépendante de Nuxt.

**Communication app ↔ widget** : App Groups (container partagé sur le device). Le layer Capacitor/Nuxt écrit l'URL de la photo + métadonnées dans ce container via un plugin Capacitor natif.

**Flow de mise à jour instantanée du widget** :

```
User A uploade photo
  → Supabase Storage
  → Edge Function déclenchée
  → Push APNs de type "widget" envoyé au device de User B
  → Widget de User B reload immédiatement (iOS 17.2+)
  → Fallback : WidgetCenter.shared.reloadTimelines() depuis l'app au prochain foreground
```

Cette approche (APNs direct vers le widget) est la plus rapide techniquement possible sur iOS. Elle bypasse l'app principale.

---

## Branding

- **Ambiance** : Chaleureuse, minimaliste, photo-first. L'interface s'efface pour laisser place aux photos et aux émotions.
- **Palette** : Tons neutres chauds (crème, blanc cassé, beige doux) + une couleur d'accent chaude unique (pêche, corail doux, ou rose terracotta). Pas de bleu froid, pas de violet tech.
- **Typographie** : SF Rounded (native iOS, arrondi, humain)
- **UI** : Grandes photos, beaucoup d'espace blanc, coins très arrondis, animations fluides et douces. Cartes avec légère ombre. Esthétique "fenêtre sur l'autre personne", pas "dashboard app".
- **Références** : Locket Widget (concurrent direct), Jour, Mela, Craft

---

## Phase 0 — Infrastructure ✅

### Nuxt 3 + Capacitor ✅

- ✅ Init projet Nuxt 3 (v3.21.2, Vite 7, Vue 3)
- ✅ Installation et configuration Capacitor iOS (v8)
- ✅ Ajout des plugins Capacitor nécessaires :
  - ✅ `@capacitor/camera`
  - ✅ `@capacitor/push-notifications`
  - ✅ `@capacitor/local-notifications`
  - ✅ `@capacitor/share` (Share Sheet iOS natif)
  - ✅ `@capacitor/app` (deep links)
  - Plugin custom natif Swift pour App Groups (communication avec le widget)
- ✅ Tailwind CSS v4 (via `@tailwindcss/vite`)
- ✅ HMR configuré (`CAP_DEV=true` → serveur Nuxt dans le simulateur)
- ✅ Projet Xcode généré dans `ios/`
- ✅ `.nvmrc` Node 22

### Supabase

- Création du projet Supabase
- Schéma DB (tables ci-dessus)
- Bucket Storage `photos` (accès privé, URLs signées)
- Activation de l'**anonymous auth**
- Edge Functions :
  - `create-invitation` — génère un token unique + enregistre l'invitation
  - `accept-invitation` — valide le token, crée la paire, expire l'invitation
  - `upload-photo` — vérifie la règle 1 photo/jour, enregistre, déclenche le push widget
  - `send-widget-push` — envoie le push APNs de type widget à User B
  - `verify-premium` — valide le receipt StoreKit côté serveur

### Xcode

- Ouvrir le projet généré par Capacitor dans Xcode
- Activer les capabilities :
  - Push Notifications
  - Background Modes (background fetch, remote notifications)
  - App Groups (définir le group identifier partagé)
- Ajouter la **Widget Extension** (target Swift)
- Configurer le provisioning profile avec push notifications

### CI

- GitHub Actions : build iOS automatisé sur chaque push `main`
- Secrets : certificats Apple, variables Supabase

---

## Phase 1 — Auth & Session

- Aucune inscription, aucun email au démarrage
- La session anonyme Supabase est créée **à la fin de l'onboarding** (après saisie du prénom)
- La session est stockée dans le **Keychain iOS** (persistance entre les sessions app)
- Récupération de compte (nouveau téléphone) : magic link email **optionnel**, accessible depuis les Settings uniquement si l'utilisateur en a besoin
- Pas de Sign in with Apple (Apple l'impose uniquement si d'autres logins sociaux sont proposés — on n'en propose pas)

---

## Phase 2 — Système de paires

### Création d'invitation (User A)

1. User A appuie sur "Inviter quelqu'un"
2. Edge Function `create-invitation` génère un token unique et un deep link du type `portelio://invite/{token}`
3. L'app ouvre le **Share Sheet iOS natif** avec le lien + message pré-rempli ("Installe Portelio et rejoins-moi !")
4. User A partage via iMessage, WhatsApp, etc.
5. L'invitation expire après 24h

### Acceptation (User B)

1. User B clique sur le lien
2. Si l'app est installée : deep link ouvre directement l'app sur l'écran d'acceptation
3. Si l'app n'est pas installée : redirection vers l'App Store, puis le deep link est traité au premier lancement
4. Edge Function `accept-invitation` valide le token, crée la paire, met l'invitation en `accepted`
5. La paire apparaît immédiatement dans le Home des deux utilisateurs

### Gestion des limites

- Gratuit : si une paire existe déjà et que User A tente d'en créer une nouvelle → paywall
- Premium : jusqu'à 5 paires
- Vérification côté serveur dans `create-invitation`

---

## Phase 3 — Flow photo core

### Écran Home

- Liste des paires de l'utilisateur
- Pour chaque paire : nom du partenaire + miniature de la dernière photo reçue + badge statut ("Photo envoyée ✓" ou "À envoyer aujourd'hui")
- CTA "+" pour créer une nouvelle paire

### Écran Paire

- Preview grande de la photo reçue (celle que le partenaire voit sur son widget)
- Preview plus petite de la photo envoyée (celle que l'utilisateur a envoyée)
- **Gros CTA principal** : "Envoyer la photo du jour" (grisé et remplacé par "Envoyée ✓" si déjà fait)
- Grille historique des photos échangées (5 derniers jours visible pour tous, plus pour premium)

### Upload photo

1. CTA déclenche le picker : choix entre caméra et galerie (`@capacitor/camera`)
2. Compression côté client avant upload (qualité adaptée, taille max raisonnable)
3. Upload vers Supabase Storage
4. Appel Edge Function `upload-photo` : vérification règle 1 photo/jour + enregistrement en DB
5. L'Edge Function déclenche `send-widget-push` pour le partenaire
6. UI mise à jour localement immédiatement (optimistic update)

### Caption

- Champ texte optionnel, affiché sous la photo
- 50 caractères maximum
- Visible dans le widget et dans l'écran Paire

---

## Phase 4 — Widget natif Swift

### Structure

- Target : Widget Extension (Swift)
- Taille supportée : **2x2 (Large)**
- SwiftUI layout : photo en plein fond + caption en bas + nom de l'expéditeur en overlay discret

### Données

- Le plugin Capacitor natif custom écrit dans le **App Group container** :
  - URL signée de la photo courante
  - Caption
  - Nom de l'expéditeur
  - Timestamp
- Le widget lit ces données depuis le container partagé via `UserDefaults(suiteName: appGroupIdentifier)`

### Timeline & Reload

- Entry unique dans la timeline (1 photo/jour)
- Reload déclenché par :
  1. **APNs widget push** (principal, iOS 17.2+) — push de type `background` avec `content-available: 1` ciblant le widget, déclenche `WidgetCenter.shared.reloadTimelines()` sur le device
  2. **Foreground app** — à chaque ouverture de l'app, `WidgetCenter.shared.reloadTimelines()` appelé en fallback

### Enregistrement APNs

- À la fin de l'onboarding, Swift natif enregistre l'app pour les push notifications
- Le device token APNs est transmis à Supabase (table `users`, colonne `device_token`)
- Mis à jour à chaque lancement si le token a changé

---

## Phase 5 — Notifications

### Rappel quotidien

- Notification locale (`@capacitor/local-notifications`) : rappel de mettre à jour la photo du jour
- Envoyée une fois par jour
- Heure configurable dans les Settings (défaut : 18h00)
- Annulée et re-schedulée automatiquement si l'utilisateur a déjà envoyé sa photo aujourd'hui

### Notification partenaire (optionnel)

- Toggle dans les Settings : "Me notifier quand {prénom} met à jour sa photo" — **off par défaut**
- Si activé : push serveur envoyé par `upload-photo` Edge Function
- Si désactivé : aucun push, uniquement la mise à jour silencieuse du widget

---

## Phase 6 — Premium & In-App Purchases

### Produits StoreKit 2

- Abonnement mensuel (avec 7 jours d'essai gratuit)
- Abonnement annuel (avec 7 jours d'essai gratuit)

### Paywall

- Accessible depuis :
  - Home, quand l'utilisateur tente de créer une 2ème paire (gratuit)
  - Settings → "Passer à Premium"
- Design : simple, clair, met en avant les bénéfices (pas de features techniques)

### Feature gating

- Côté app : vérification du statut premium via StoreKit 2 (`Product.SubscriptionInfo.Status`)
- Côté serveur : Edge Function `verify-premium` valide le statut pour les opérations sensibles (création de paire au-delà de 1)
- Restore purchases accessible dans les Settings

---

## Phase 7 — Onboarding

_Implémenté une fois que le core de l'app est fonctionnel, pour ne pas bloquer le développement des features._

### Écrans

1. **Bienvenue** — Écran d'accroche, visuel fort, baseline de l'app, CTA "Commencer"
2. **Prénom** — "Comment tu t'appelles ?" Champ texte simple, clavier auto-focus. Utilisé dans les messages de l'app ("Bonjour Henri !", "Henri a envoyé une photo")
3. **Permissions notifications** — Explication humaine du pourquoi ("Pour te rappeler d'envoyer ta photo du jour"), puis demande système iOS
4. **Permissions caméra/galerie** — Même approche pédagogique avant la demande système
5. **Prêt !** — Écran de confirmation, animation de bienvenue, CTA "Découvrir l'app"

### À la fin de l'onboarding

- Création de la session anonyme Supabase
- Enregistrement du prénom en DB
- Enregistrement du device token APNs
- Redirection vers le Home

### Notes

- L'onboarding n'est affiché qu'au premier lancement (flag stocké dans le Keychain)
- Aucune étape de l'onboarding n'est bloquante sauf la saisie du prénom
- Le skip des permissions est possible (l'app reste utilisable, rappels activables plus tard dans les Settings)

---

## Phase 8 — Paramètres

### Contenu de l'écran Settings

**Mon compte**

- Prénom (modifiable)
- Lier un email (magic link — pour récupérer le compte sur un nouveau téléphone)

**Notifications**

- Toggle : Rappel quotidien (on par défaut)
- Heure du rappel (picker, affiché si toggle activé, défaut 18h00)
- Toggle par paire : "Me notifier quand {prénom} met à jour sa photo" (off par défaut)

**Premium**

- Statut actuel (gratuit / premium actif + date de renouvellement)
- CTA "Passer à Premium" (si gratuit) ou "Gérer l'abonnement" (si premium)
- "Restaurer mes achats"

**Mes paires**

- Liste des paires actives avec option de suppression

**Général**

- Politique de confidentialité (lien web)
- Conditions d'utilisation (lien web)
- Version de l'app

---

## Phase 9 — Polish & Publication App Store

### États UI à couvrir

- Loading states (skeletons plutôt que spinners)
- Erreurs réseau avec message clair + action retry
- État vide Home (aucune paire) : écran incitatif avec CTA "Inviter quelqu'un"
- État vide Paire (aucune photo encore) : message d'encouragement
- Photo déjà envoyée aujourd'hui : état "Envoyée ✓" avec heure d'envoi

### Animations

- Transitions entre écrans : fluides, natives (pas de transitions web par défaut)
- Animation d'envoi photo : satisfaction visuelle (confirmation que c'est parti)
- Widget preview animée sur le paywall

### Prérequis App Store

- **Privacy Policy** hébergée (page web simple, URL permanente)
- **App Privacy** déclarée dans App Store Connect (données collectées, usage)
- Screenshots pour toutes les tailles iPhone requises (iPhone 16 Pro Max, iPhone SE)
- Métadonnées : titre, sous-titre, description, mots-clés, catégorie (Lifestyle)
- Support URL

### Publication

- Build TestFlight interne → tests sur devices réels (widget, push, deep links)
- Correction des bugs remontés
- Soumission App Store Review
- Prix des abonnements à définir avant soumission

---

## Priorités absolues pour le MVP

Les éléments suivants doivent fonctionner parfaitement avant toute autre consideration :

1. **Widget reload instantané** — c'est la promesse centrale de l'app
2. **Flow d'invitation** — sans friction, doit fonctionner via iMessage/WhatsApp
3. **Upload et affichage photo** — core loop de l'app
4. **Règle 1 photo/jour** — intégrité du concept, vérifiée côté serveur

Tout le reste (premium, personnalisation, historique long) peut être ajouté après la première soumission.
