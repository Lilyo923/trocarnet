# Brancher la coopération Trocarnet sur Firebase

Compte environ 5 à 10 minutes. Tant que ce n'est pas fait, le site marche
normalement en solo : seul le bloc « Coopération » du menu reste désactivé.

Les intitulés de la console Firebase peuvent varier un peu selon les mises à
jour de Google, mais les étapes restent les mêmes.

## 1. Créer le projet

1. Va sur https://console.firebase.google.com et connecte-toi avec ton compte Google.
2. « Créer un projet », nomme-le (par ex. `trocarnet`).
3. Google Analytics n'est pas utile ici, tu peux le désactiver.
4. Reste sur le plan gratuit **Spark**. Aucune carte bancaire n'est demandée.

## 2. Créer la base Firestore

1. Menu de gauche : **Firestore Database**, puis « Créer une base de données ».
2. Si on te demande une édition, prends **Standard**.
3. Choisis une région en Europe.
4. Démarre en **mode production** (on met nos propres règles juste après).

## 3. Coller les règles de sécurité

1. Dans Firestore Database, onglet **Règles**.
2. Remplace tout le contenu par celui du fichier `firestore.rules`.
3. Clique sur **Publier**.

## 4. Récupérer la configuration du site

1. Roue crantée en haut à gauche : **Paramètres du projet**.
2. Dans « Tes applications », clique sur l'icône **Web** `</>`.
3. Donne un surnom (`trocarnet-web`). Pas besoin d'activer Firebase Hosting.
4. Firebase affiche un objet `firebaseConfig = { apiKey: ..., projectId: ..., ... }`.
5. Copie ces valeurs dans `firebase-config.js`, à la place de `COLLE_TA_CLE_ICI`
   et des champs vides.

## 5. Mettre en ligne

Pousse tous les fichiers sur GitHub comme d'habitude. Netlify redéploie, et le
bloc « Coopération » apparaît dans le menu.

## Bon à savoir

- Le lien de session sert de clé : toute personne qui l'a peut lire et modifier
  le carnet commun. Ne le poste pas publiquement.
- Sur iPhone, l'appli ajoutée à l'écran d'accueil a son propre stockage, séparé
  de Safari. Pour rejoindre la session depuis l'appli installée, colle le lien
  dans « Tu as reçu un lien ou un code ? » du menu.
- Le plan gratuit permet 50 000 lectures et 20 000 écritures par jour. Une
  actualisation = 1 lecture, un ajout = 1 lecture + 1 écriture.
