# PRIME — mises a jour sans reinstallation Android
## Architecture effective depuis PRIME 2.5.0
- Application Android permanente : package `dev.septgigs.neonarena.prime` (ne pas le changer dans les futures versions).
- 150 illustrations françaises préinstallées : `assets/www/images_vf/*.webp`.
- Moteur et Worker IA actualisables depuis l'application : `index.html` + `ai-worker.js`.
- Bouton dans l'accueil : **↻ Vérifier les mises à jour**.
- GitHub fournit `updates/latest.json`, puis un ZIP de **contenu uniquement** depuis la Release `prime-content-v2.5.1`. L'URL du ZIP doit correspondre exactement au modèle GitHub fixé dans le code Java.
- L'application vérifie le SHA-256 et la structure du ZIP, télécharge en répertoire privé, propose un redémarrage, et peut revenir à la version intégrée dans l'APK.
- Les paramètres, decks et duels sauvegardés utilisent toujours `localStorage` sur l'origine `https://appassets.androidplatform.net`. **La mise à jour de contenu ne supprime pas ces données.**
- Sans connexion, la dernière version activée et les 150 illustrations restent disponibles.
- Le ZIP ne comprend **aucun visuel français** : le copyright des illustrations n'est pas exporté vers GitHub Releases.
- La publication du manifeste a lieu **après** les tests et l'upload de la Release.
- Audit officiel complet des 150 cartes : **toujours non certifié**.

## Les mises à jour natives exceptionnelles
Android exige : même application ID, même certificat de signature et versionCode non décroissant. Une confirmation Android peut rester nécessaire ; cette procédure n'exige **pas de désinstaller** l'application.

**Important : les APK 2.4.0 et antérieurs avaient des identifiants et certificats différents. Une migration vers 2.5.0 est donc inévitable une fois. Exporter les decks et la mémoire via les fonctions du jeu avant de changer d'application.**

### Configurer UNE FOIS la signature permanente sur GitHub
Le build `.github/workflows/build-prime250.yml` accepte deux secrets dans `Settings → Secrets and variables → Actions` du dépôt `lifequest` :
- `PRIME_KEYSTORE_B64` : contenu base64 d'un fichier PKCS12/JKS généré localement.
- `PRIME_KEYSTORE_PASS` : mot de passe de ce fichier. L'alias utilisé est `septgigs`, avec le même mot de passe pour la clé.

Exemple sur une machine avec Java :
```bash
keytool -genkeypair -alias septgigs -keyalg RSA -keysize 4096 -validity 10000 \
  -keystore prime-release.jks -storetype PKCS12 -dname "CN=7 Gigs PRIME Release"
base64 -w 0 prime-release.jks   # Linux ; sur Windows : base64 via PowerShell
```
Ne jamais envoyer le keystore ni le mot de passe sur un dépôt public, dans un ticket ou dans cette conversation. Sauvegarder la clé hors du dépôt. Le premier APK **définitif** doit être signé avec ces secrets ; une clé générée par job est une **clé de test** et ne permettra PAS de mettre à jour ultérieurement le code Android sans réinstallation.

Après avoir ajouté les deux secrets, relancer le workflow `7 Gigs PRIME 2.5.0 - OTA Bootstrap APK` via `Actions` (workflow_dispatch). Vérifier dans les journaux : `PERSISTENT_SIGNING_CERTIFICATE_CONFIGURED=YES`.

## Distribuer le jeu
- Installer une seule fois l'APK initial compilé et signé via GitHub Actions. Les **APK ne sont jamais distribués depuis un lien sandbox**.
- Pour les mises à jour de contenu, ouvrir le jeu, toucher `↻ Vérifier les mises à jour`, confirmer, puis choisir `Activer et relancer`. **Pas d'installation Android.**
- Pour une correction native exceptionnelle, préparer une APK avec le même package ID, la même clé et un versionCode plus élevé : Android l'installera par-dessus l'application existante, en préservant les données.

## Limites de sécurité et fiabilité
- Le SHA-256 protège contre un ZIP incorrect par rapport au manifeste GitHub, mais ne remplace pas une **signature numérique indépendante** du manifeste en cas de compromission du dépôt ; cette défense reste à ajouter avant une diffusion large.
- Les mises à jour n'entrent pas en vigueur pendant un duel sans confirmation ; elles sont installées après validation, avec relance immédiate ou au lancement suivant.
- La dernière version intégrée à l'APK est conservée comme secours ; le bouton `Réparer le jeu` rétablit cette version.
- Le passage de 2.4.0 à 2.5.0 change d'application Android : **les sauvegardes précédentes ne sont pas migrées automatiquement**.
