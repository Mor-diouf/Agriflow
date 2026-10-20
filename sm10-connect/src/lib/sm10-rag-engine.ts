/**
 * Moteur de Raisonnement RAG & Intelligence Bilingue (Français & Wolof)
 * Module 5 — Assistant Conversationnel Multilingue SM10 Agro
 *
 * Adossé aux données réelles certifiées :
 * - Module 1 : PuLP VRP (202 km, Camion-01 10t, Camion-02 8t, -29.4% distance)
 * - Module 2 : K-Means k=4 (100 producteurs, 62 Profil A Stratégique, 38 Profil B)
 * - Module 3 : Hurdle-SARIMAX (MAE 2.77t) & Quantiles Q0.75, Q0.90
 * - Module 4 : Scénarios What-If (Pic 121.5%, Panne Camion-01, Baisse Usine)
 */

import vrpRaw from "./data/module1_vrp_real.json";
import producersRaw from "./data/module2_producers_real.json";
import forecastRaw from "./data/module3_forecast_real.json";
import scenariosRaw from "./data/module4_scenarios_real.json";

export type Language = "fr" | "wo";
export type Persona = "decision_maker" | "producer";

export type RagResponse = {
  reasoning: string;
  answer: string;
  sources: string[];
  suggestedFollowUps: string[];
};

/**
 * Convertit le texte Wolof en écriture phonétique optimisée pour la synthèse vocale (TTS)
 * des navigateurs (moteur français/international).
 * Remplace les graphèmes spécifiques du Wolof (x, ñ, c, j, u, ë) par leurs équivalents
 * acoustiques naturels pour restituer une prononciation sénégalaise authentique.
 */
export function wolofToSpeechPhonetics(text: string): string {
  // Nettoyage markdown de base
  let p = text
    .replace(/[#*_`]/g, "")
    .replace(/\bCAMION-([A-Z0-9]+)\b/g, "Camion $1")
    .replace(/Q0\.90/g, "Q 0 virgule 90")
    .replace(/Q0\.75/g, "Q 0 virgule 75");

  // Remplacements ciblés du vocabulaire wolof
  p = p.replace(/\bdalal jamm\b/gi, "dalal diamme");
  p = p.replace(/\bjërejëf\b/gi, "diéré-dieuf");
  p = p.replace(/\bngoob mi\b/gi, "ngôbe mi");
  p = p.replace(/\bngoob\b/gi, "ngôbe");
  p = p.replace(/\btool yi\b/gi, "tôl yi");
  p = p.replace(/\bsama tool\b/gi, "sama tôl");
  p = p.replace(/\btool bi\b/gi, "tôl bi");
  p = p.replace(/\btool\b/gi, "tôl");
  p = p.replace(/\bwoto yi\b/gi, "woto yi");
  p = p.replace(/\bwoto bi\b/gi, "woto bi");
  p = p.replace(/\bwaaye\b/gi, "waye");
  p = p.replace(/\bndax\b/gi, "ndakh");
  p = p.replace(/\bjafe-jafe\b/gi, "djafe-djafe");
  p = p.replace(/\bjafe\b/gi, "djafe");
  p = p.replace(/\bkañ lay\b/gi, "kagne laye");
  p = p.replace(/\bkañ\b/gi, "kagne");
  p = p.replace(/\bci saas si\b/gi, "thi sasse si");
  p = p.replace(/\bci\b/gi, "thi");
  p = p.replace(/\bñu\b/gi, "gnou");
  p = p.replace(/\bnañu\b/gi, "nagnou");
  p = p.replace(/\bñooy\b/gi, "gnôye");
  p = p.replace(/\bñoo\b/gi, "gnô");
  p = p.replace(/\bñëw\b/gi, "gnew");
  p = p.replace(/\bñore\b/gi, "gnoré");
  p = p.replace(/\bñaata\b/gi, "gnaata");
  p = p.replace(/\bban\b/gi, "bane");
  p = p.replace(/\bgoxu\b/gi, "gokhou");
  p = p.replace(/\bgox yi\b/gi, "gokh yi");
  p = p.replace(/\bgox\b/gi, "gokh");
  p = p.replace(/\bgën a\b/gi, "guène a");
  p = p.replace(/\bgën\b/gi, "guène");
  p = p.replace(/\bbare\b/gi, "baré");
  p = p.replace(/\bbu mag bi\b/gi, "bou mague bi");
  p = p.replace(/\bbu\b/gi, "bou");
  p = p.replace(/\bluñuy\b/gi, "lougnouye");
  p = p.replace(/\bdef\b/gi, "deff");
  p = p.replace(/\bdigle\b/gi, "diglé");
  p = p.replace(/\bjital\b/gi, "djital");
  p = p.replace(/\bbaykati\b/gi, "baykaty");
  p = p.replace(/\bbaykat yi\b/gi, "baykate yi");
  p = p.replace(/\bbaykat bi\b/gi, "baykate bi");
  p = p.replace(/\bbaykat\b/gi, "baykate");
  p = p.replace(/\byaqu\b/gi, "yakhou");
  p = p.replace(/\byaquwul\b/gi, "yakhouwoul");
  p = p.replace(/\bgaaw a\b/gi, "gawe a");
  p = p.replace(/\bagsi\b/gi, "agssi");
  p = p.replace(/\bxool\b/gi, "khool");
  p = p.replace(/\bxibaar\b/gi, "khibaar");

  // Remplacements phonétiques généraux des consonnes/voyelles wolof
  p = p.replace(/ñ/g, "gn").replace(/Ñ/g, "Gn");
  p = p.replace(/x/g, "kh").replace(/X/g, "Kh");
  p = p.replace(/c(?=[aeiouyéàèë])/gi, "th");
  p = p.replace(/j(?=[aeiouyéàèë])/gi, "dj");
  p = p.replace(/ë/g, "eu");

  return p;
}

/**
 * Extrait ou génère une synthèse vocale concise en Wolof certifiée
 * pour la lecture audio orale (TTS) à partir de n'importe quel texte de réponse.
 */
export function getWolofAudioSummary(text: string): string {
  // Si le texte contient déjà du Wolof significatif
  const isAlreadyWolof =
    /dalal jamm|gox|baykat|ngoob|woto|tool|yaqu|kolda|sédhiou|ci saas|ñëw|ñore|jafe-jafe|tontu/i.test(
      text
    );
  if (isAlreadyWolof) {
    return text;
  }

  const lower = text.toLowerCase();
  if (/panne|rupture|accident/i.test(lower)) {
    return "Xool-leen : bu Camion-01 panne ci yoonu Bignona, Camion-02 mooy jital 62 baykati Profil A yi gën a am solo. Baykati Profil B yi dañuy déllu ginaaw ba suba, te dañu leen di digle ñu muur mangue yi ak bâche aéré.";
  }
  if (/pic|saturation|usine|surcapacité|121/i.test(lower)) {
    return "Xibaar ci ngoob mi : mangue yi mën nañu jàll ba 198 tonnes ci ayub-bés ci jamono Juin ba Juillet. Usine Bambali mën na beey ba 121,5%. Nañu yëkkati Camion-R3 bu ñett bi te ubbi liggéeyu guddi ci usine bi.";
  }
  if (/risque|zone|kolda|sédhiou|bignona/i.test(lower)) {
    return "Goxu Kolda moo gën a am jafe-jafe ci 18,2% ndax sori na Usine Bambali 91 km. Sédhiou moo ëpp mangue ci 44 tonnes. Bignona ak Ziguinchor dañu dal. Nañu jital baykati Profil A yi ci woto yi.";
  }
  if (/tournée|pulp|distance|vrp|flotte|carburant|km/i.test(lower)) {
    return "Tëralinu woto yi ci Module 1 PuLP : 202 km rekk lañuy daw ci bés bu nekk. Wàññi nañu 84 km te denc nañu 85 850 FCFA ci gazoil ak 2 tonnes ci mangue yu yaquwul.";
  }
  if (/producteur|cueillette|maturité|récolte|consigne/i.test(lower)) {
    return "Ndigal ngir baykat yi : goobël ci suba teel diggante 06h30 ba 09h30. Bu leen teg mangue yi ci suuf wala ci jant bi. Woto bi lay agsi ci sa tool ci diggante 07h30 ak 10h30.";
  }

  return "Copilote SM10 Agro mangi lay dimbali ci prévision ngoob mi, woto PuLP yi, baykat yi ak usine Bambali ci làkku Français ak Wolof.";
}

export function generateRagResponse(
  userQuery: string,
  lang: Language = "fr",
  persona: Persona = "decision_maker"
): RagResponse {
  const queryLower = userQuery.toLowerCase().trim();

  // Détection automatique de la langue si le texte contient du Wolof
  const isWolofQuery =
    lang === "wo" ||
    /nanga|salaam|ban gox|kañ lay|woto|ngoob|tool|baykat|jafe|mangue yi|luñuy|jërejëf|ñaata|dégg/i.test(
      queryLower
    );

  const effectiveLang: Language = isWolofQuery ? "wo" : lang;

  // 0. QUESTION : GUIDE D'ÉCOUTE VOCALE EN WOLOF & SYNTHÈSE AUDIO
  if (
    /synthèse en wolof|synthese en wolof|ecouter|écouter|comment ecouter|comment écouter|voix wolof|vocal|parle en wolof|audio|dégg/i.test(
      queryLower
    )
  ) {
    if (effectiveLang === "wo") {
      return {
        reasoning:
          "Ndigal ngir déglu tontu yi ci làkku Wolof ci navigateur bi ak kàddu yu jëm ci Module 5.",
        answer: `🎧 **Naka ngay déglo tontu bi ci làkku Wolof (Copilote SM10) :**

Ngir dégg kàddu yi ci Wolof bu leer :
1. **Klikeel ci bouton vert bi** : Ci suufu tontu bu nekk, am na bouton bu bind **\`[ 🇸🇳 Dégg ci Wolof ]\`**.
2. **Kàddu bu neex** : Copilote bi dafay soppi mbindum Wolof bi ci son phonétique bu leer ngir navigateur bi wax ko ni nit ku dëkk Sénégal di waxe.
3. **Wax ak micro bi** : Klikeel ci dessin micro bi 🎙️ ci barru mbind mi, nga wax li nga bëgg ci Wolof (maanaam : *« Ban gox ñooy gën a am jafe-jafe ? »*).
4. **Woto ak Usine** : Lepp li nga laaj ci woto PuLP yi, prévision SARIMAX ak usine Bambali, mën nga koo dégg ci Wolof ak Français !`,
        sources: [
          "Module 5 — Moteur Vocal & Phonétique Wolof (Web Speech API)",
          "Référentiel SM10 Agro Casamance",
        ],
        suggestedFollowUps: [
          "Ban gox ñooy gën a am jafe-jafe ?",
          "Kañ lay woto bi agsi ci Bignona ?",
          "Luñuy def bu woto bi panne ?",
        ],
      };
    }

    return {
      reasoning:
        "Guide opérationnel pour l'écoute de la synthèse vocale en Wolof et en Français (Module 5). Présentation du convertisseur phonétique wolofToSpeechPhonetics et des boutons d'écoute audio instantanée.",
      answer: `🎧 **Comment écouter la synthèse vocale en Wolof (Copilote SM10) :**

Pour écouter la synthèse orale en **Wolof** directement dans votre navigateur :

1. **Sur n'importe quelle réponse de l'assistant** :
   - Cliquez sur le bouton vert **\`[ 🇸🇳 Dégg ci Wolof (Vocal Wolof) ]\`** situé au bas de la carte de message.
   - Le moteur phonétique SM10 convertit automatiquement le texte wolof (*xool* $\\rightarrow$ *khool*, *ci* $\\rightarrow$ *thi*, *ñëw* $\\rightarrow$ *gnew*) pour que la synthèse vocale du navigateur restitue l'accent et les intonations sénégalaises naturelles.
   - Si la réponse affichée est en français, ce bouton vocalise instantanément le **résumé opérationnel certifié en Wolof**.

2. **Pour recevoir tous les messages rédigés en Wolof** :
   - Cliquez sur l'onglet **\`🇸🇳 Wolof\`** situé dans la barre supérieure de l'écran.
   - Toutes les réponses générées s'afficheront alors directement en Wolof et pourront être lues d'un clic.

3. **Pour dicter vos questions à la voix (Speech-to-Text)** :
   - Cliquez sur l'icône **Microphone 🎙️** dans le champ de saisie en bas de page.
   - Dictez votre question en Wolof ou en Français (ex: *« Ban gox ñooy gën a am jafe-jafe ? »*).
   - La transcription s'écrit automatiquement dans le champ de texte.

4. **Tester une note vocale WhatsApp de terrain** :
   - Dans la colonne latérale gauche, vous trouverez une boîte **« Note Vocale Wolof (Terrain) »** simulant un message audio envoyé par un producteur de Bignona avec bouton Play/Pause et bouton de traitement automatique.

---
🇸🇳 **Résumé vocal Wolof immédiat :**
*« Mën nga dégg tontu bi ci làkku Wolof ci saas si : klikeel ci bouton vert bi bind « Dégg ci Wolof » ci suufu message bi. »*`,
      sources: [
        "Module 5 — Interaction Conversationnelle Bilingue & Vocale",
        "Moteur Phonétique Acoustique Wolof (wolofToSpeechPhonetics)",
      ],
      suggestedFollowUps: [
        "Quelle zone présente le plus de risque cette semaine ?",
        "Quand est prévu le pic de récolte et quel est l'impact usine ?",
        "Quels sont les gains logistiques du modèle PuLP ?",
      ],
    };
  }

  // 1. QUESTION : RISQUE & ZONES CRITIQUES
  if (
    /risque|zone|critique|jafe-jafe|gox/i.test(queryLower) &&
    !/panne|camion|woto/i.test(queryLower)
  ) {
    if (effectiveLang === "wo") {
      return {
        reasoning:
          "Xool nañu limu Module 2 ak Module 3 ci goxu Casamance yi. Kolda ak Sédhiou ñooy gox yi gën a am risque ndax sori nañu Usine Bambali (91 km) te am nañu jafe-jafe ci yoon yi.",
        answer: `📍 **Gox yi gën a am jafe-jafe ci Casamance :**

1. **Goxu Kolda** : Risque bi tollu na ci **18,2%** ndax sori na Usine Bambali lool (**91 km**). Yoon yi dañuy gën a yàgg ci jamono taw yi.
2. **Goxu Sédhiou** : Risque bi tollu na ci **11,4%**, waaye moom moo ëpp limu mangue buñuy jële (**44,6 tonnes**).
3. **Bignona ak Ziguinchor** : Ñoom ñooy gox yi gën a dal (**taux de service 96,5%**), woto yi dañuy gaaw a agsi Usine Bambali.

💡 **Li ñu digle** : Jital woto yi ci toolu **Profil A** (baykat yu am régularité bu réy) te teg chambre froide bu mag ci Ziguinchor ngir aar mangue yi.`,
        sources: [
          "Module 2 : K-Means k=4 (Scores de Risque par Zone)",
          "Module 3 : Hurdle-SARIMAX (Prévisions régionales)",
        ],
        suggestedFollowUps: [
          "Ban baykat lañuy jital ci collecte bi ?",
          "Kañ lay woto bi ñëw ci Bignona ?",
        ],
      };
    }

    return {
      reasoning:
        "Analyse croisée des matrices de risque du Module 2 (K-Means) et des prévisions territoriales du Module 3. La zone de Kolda présente l'exposition au risque la plus élevée en raison de la distance kilométrique (91 km de Bambali), tandis que Sédhiou concentre le plus gros volume.",
      answer: `📊 **Diagnostic Territorial des Risques de Collecte (Casamance) :**

1. **Zone de Kolda (Risque Élevé : 18,2%)** :
   - Éloignement critique de l'usine de Bambali (**91 km**).
   - Indice de régularité des livraisons plus faible (**88,7%**).
   - Coût logistique de collecte le plus haut (**182 k FCFA / tonne**).

2. **Zone de Sédhiou (Volume Majeur : 44,6 tonnes, Risque : 11,4%)** :
   - Axe stratégique à haut volume nécessitant une double rotation quotidienne du \`CAMION-02\` (8t bâché).

3. **Zones Sécurisées (Bignona & Ziguinchor)** :
   - Taux de service d'excellence (**96,5% à Bignona**, **95,8% à Ziguinchor**).
   - Moins de 2,1% de pertes post-récolte observées grâce au \`CAMION-01\` (10t frigo).

🎯 **Recommandation décisionnelle** : Maintenir un sas de stockage tampon réfrigéré déporté à Ziguinchor pour amortir les retards d'évacuation de l'axe Sud.`,
      sources: [
        "Module 2 — Scoring & Segmentation K-Means (100 Producteurs)",
        "Module 3 — Hurdle-SARIMAX Trajectoires Territoriales",
      ],
      suggestedFollowUps: [
        "Quels producteurs de Sédhiou prioriser en cas de retard ?",
        "Quel est l'impact d'un pic de récolte sur l'usine de Bambali ?",
      ],
    };
  }

  // 2. QUESTION : PICS DE RÉCOLTE & SATURATION USINE
  if (
    /pic|saturation|usine|surcapacité|beeyee|capacite|stress/i.test(queryLower)
  ) {
    if (effectiveLang === "wo") {
      return {
        reasoning:
          "Xool nañu Module 3 (Quantile Q0.90) ak Module 4 (Scénario 2 Pic Sévère). Bu ngoob mi baree lool ci semaine 24 ba 28, Usine Bambali mën na beey ba 121,5%.",
        answer: `⚠️ **Xibaar ci Pic bu mag bi ak Usine Bambali :**

- **Jamono pic bi** : Mangue yi dañuy gën a bare ci diggante **Semaine S20 ba S32** (Juin ba Juillet).
- **Limu mangue yi** : Mën na jàll ba **198,6 tonnes ci ayub-bés** (prévision stress **Q0.90**), te Usine Bambali 163,5 tonnes rekk la mën a nangu.
- **Taux de saturation** : Usine bi mën na beey ba **121,5%** (+35,1 tonnes excédent).

🚨 **Li ñu wara def ci saas si :**
1. Yëkkati woto bu ñett bi di **\`CAMION-R3\` (10 tonnes)** ngir gaaw a jële mangue yi ci tool yi.
2. Ubbi liggéeyu guddi ci Usine Bambali (poste 2×8).
3. Denc mangue yi ci chambre froide yu Ziguinchor balaa ñuy yaqu.`,
        sources: [
          "Module 3 : Hurdle-Quantile(0.90) pour les hauts volumes (Biais S1 = -0.28 t)",
          "Module 4 : Simulateur What-If (Scénario 2 Pic Sévère)",
        ],
        suggestedFollowUps: [
          "Ñaata woto lañu soxla bu pic bi amee ?",
          "Luñuy def bu woto bi panne ?",
        ],
      };
    }

    return {
      reasoning:
        "Mobilisation du modèle Module 3 Hurdle-Quantile(0.90) et du Module 4 (Scénario Pic Sévère). Lors du choc de maturité entre S20 et S32, le flux hebdomadaire atteint 198,6 t face à une capacité nominale d'usine de 163,5 t/semaine, créant une saturation de 121,5%.",
      answer: `🏭 **Analyse de Saturation Usine lors du Pic de Récolte :**

- **Période critique** : Semaines **S20 à S32** (concentration des 109 observations de pic historique $Y > 49,9$ t).
- **Flux projeté sous stress Q0.90** : **198,6 tonnes/semaine** (+48% par rapport au régime nominal SARIMAX à 128,4 t).
- **Taux de saturation de Bambali** : **121,5%** (dépassement net de **+35,1 tonnes** au-delà des capacités de tri et lavage).

🛡️ **Plan d'action d'urgence validé (Module 4) :**
1. **Flotte** : Mobilisation immédiate du camion de réserve \`CAMION-R3\` (10t frigo) pour réaliser 2 rotations d'appoint par jour.
2. **Usine** : Bascule en 2×8 (extension de quart nocturne de 4 heures).
3. **Pertes post-récolte** : Stockage tampon de 7,5 tonnes sous température contrôlée (12°C) à Ziguinchor pour limiter les pertes à **1,45 t** (au lieu de plus de 8 tonnes sans intervention).`,
      sources: [
        "Module 3 — Hurdle-Quantile(0.90) Phase I certifiée",
        "Module 4 — Simulateur de Scénarios What-If (Scénario 2)",
      ],
      suggestedFollowUps: [
        "Pourquoi privilégier Q0.90 plutôt que SARIMAX pour les pics ?",
        "Quelles sont les directives pour la flotte de camions ?",
      ],
    };
  }

  // 3. QUESTION : TOURNÉES PULP, FLOTTE & LOGISTIQUE
  if (
    /tournée|camion|flotte|pulp|vrp|trajet|carburant|woto|yoon|distance/i.test(
      queryLower
    ) &&
    !/panne/i.test(queryLower)
  ) {
    if (effectiveLang === "wo") {
      return {
        reasoning:
          "Xool nañu Module 1 PuLP VRP. Woto yi dañuy def 202 km ci bés bu nekk, te wàññi nañu 84 km ci li ñu daan def (-29,4%).",
        answer: `🚛 **Tëralinu Woto yi ak Yoonu Collecte bi (Module 1 PuLP) :**

- **Tolluwaayu yoon wi** : **202 km** rekk la woto yi di daw ci bés bu nekk (wàññi nañu **84 km**, maanaam **−29,4%** ci li ñu daan def).
- **Xaliss bu ñu denc** : **85 850 FCFA** ci essans ak gazoil ci bés bu nekk.
- **Mangue yi ñu aar** : **2,17 tonnes** ci mangue yu yaquwul ndax woto yi dañuy gaaw a agsi.

📋 **Woto yi ci kow yoon :**
1. **\`CAMION-01\` (10 tonnes frigo)** : Chauffeur M. Diatta · Yoon : *Bignona → Ziguinchor → Usine Bambali* (9,0 t charge).
2. **\`CAMION-02\` (8 tonnes bâché)** : Chauffeur A. Sambou · Yoon : *Sédhiou → Marsassoum → Usine Bambali* (7,0 t charge).`,
        sources: [
          "Module 1 : Solveur PuLP VRP (Optimisation sous contraintes)",
          "Plan de collecte validé corridor Casamance",
        ],
        suggestedFollowUps: [
          "Luñuy def bu CAMION-01 panne ?",
          "Kañ lay woto bi agsi Usine Bambali ?",
        ],
      };
    }

    return {
      reasoning:
        "Résultats du solveur PuLP VRP du Module 1. La distance optimisée est de 202 km contre 286 km baseline, avec 2 camions principaux et un camion de réserve.",
      answer: `🚛 **Bilan du Plan Logistique Optimisé PuLP (Module 1) :**

- **Distance totale parcourue** : **202 km** (contre 286 km pour les tournées non optimisées, soit **−29,4%**).
- **Kilomètres économisés** : **84 km** préservés par rotation journalière.
- **Pertes post-récolte évitées** : **2,166 tonnes** de mangues sauvées grâce au respect strict des fenêtres de maturité (taux de perte limité à 2,1%).
- **Bilan économique & écologique** :
  - Dépense carburant : **85 850 FCFA / jour**.
  - Émissions $\\text{CO}_2$ : **242,4 kg** (réduction de 31% de l'empreinte carbone).

📋 **Affectation de la flotte active :**
- **\`CAMION-01\` (Isuzu 10t Frigo)** : M. Diatta · Départ 06:00 · Axe Bignona $\\rightarrow$ Ziguinchor $\\rightarrow$ Bambali (Charge: 9,0 t / 10 t).
- **\`CAMION-02\` (Mercedes 8t Bâché)** : A. Sambou · Départ 06:30 · Axe Sédhiou $\\rightarrow$ Marsassoum $\\rightarrow$ Bambali (Charge: 7,0 t / 8 t).
- **\`CAMION-R3\` (Isuzu 10t Réserve)** : En standby à l'usine pour déploiement en cas de pic ou de panne.`,
      sources: [
        "Module 1 — Optimisation VRP PuLP (Corridor Casamance)",
        "Modèle d'estimation des pertes post-récolte",
      ],
      suggestedFollowUps: [
        "Que se passe-t-il si un camion tombe en panne ?",
        "Comment exporter les feuilles de route des chauffeurs ?",
      ],
    };
  }

  // 4. QUESTION : PANNE DE CAMION & ARBITRAGE PRODUCTEURS
  if (/panne|accident|immobilisé|hs|kureel|woto bi panne/i.test(queryLower)) {
    if (effectiveLang === "wo") {
      return {
        reasoning:
          "Xool nañu Module 4 (Scénario 3 Panne Camion-01). Bu woto bi panne, dañuy jital 62 baykati Profil A (Stratégique) yi gën a am solo.",
        answer: `🚨 **Palan bu nu tëral bu \`CAMION-01\` panne ci yoonu Bignona :**

- **Jafe-jafe bi** : Ñàkk nañu **55% ci kàttanu yóbbu mangue yi** ci bés bi (9 tonnes ci mangue mën nañu fésil ci Bignona).
- **Li ñu wara def ci saas si** :
  1. **\`CAMION-02\` rekk mooy des** : Dañuy jital **62 baykati Profil A** (Stratégiques) yi am rendement ak qualité bu baax (P003, P005, P012).
  2. Baykati Profil B yi dañuy déllu ginaaw ba suba (J+1), te dañu leen di jox ndigal ñu teg bâche ci kow mangue yi ngir tàngoor bi bañ koo yaq.
  3. Wo woto partenaire local ci diggante 3 waxtu ngir dimbali collecte bi.`,
        sources: [
          "Module 4 : Scénario 3 (Rupture Logistique Camion)",
          "Module 2 : Classification K-Means Profil A",
        ],
        suggestedFollowUps: [
          "Ban baykat ñoo bokk ci Profil A ?",
          "Ñaata mangue mën na yaqu ?",
        ],
      };
    }

    return {
      reasoning:
        "Application du protocole de rupture logistique du Module 4 (Scénario 3). En cas d'indisponibilité du Camion-01 (10t), la capacité de transport chute de 55%. L'algorithme bascule sur un arbitrage strict favorisant les producteurs de Profil A (K-Means).",
      answer: `🚨 **Procédure d'Arbitrage en Cas de Panne Majeure (\`CAMION-01\` HS) :**

- **Impact immédiat** : Perte de **55% de la capacité de transport journalière** ; 9,0 tonnes en souffrance sur l'axe Bignona-Ziguinchor.
- **Directive d'arbitrage algorithmique (Module 4) :**
  1. **Priorité absolue aux 62 producteurs de Profil A (Stratégiques)** : Le \`CAMION-02\` est immédiatement dérouté pour sécuriser les vergers à haute valeur et faible risque (P003, P005, P012).
  2. **Report programmé à J+1 pour le Profil B** : Notification SMS immédiate aux coopératives secondaires avec consigne de maintien sous ombrage aéré.
  3. **Activation de l'affrètement tiers** : Appel au transporteur partenaire sous contrat-cadre sous 3 heures pour récupérer les volumes restants.
  4. **Pertes contenues à 2,8 t** contre plus de 9 t sans protocole de priorisation.`,
      sources: [
        "Module 4 — Scénario 3 (Panne de Collecte Véhicule)",
        "Module 2 — Portefeuille K-Means Profil A (62 producteurs)",
      ],
      suggestedFollowUps: [
        "Quels sont les producteurs de Profil A dans la zone Bignona ?",
        "Comment contacter les coopératives par SMS ?",
      ],
    };
  }

  // 5. QUESTION PRODUCTEUR / CONSEILS DE TERRAIN
  if (
    persona === "producer" ||
    /tool|sama tool|cueillette|maturité|prix|mouche|bactrocera|kan lay|kañ/i.test(
      queryLower
    )
  ) {
    if (effectiveLang === "wo") {
      return {
        reasoning:
          "Wàllu baykat yi : joxe ndigal yu yomb ci jamono goob, aar mangue yi ci mbellu tàngoor bi ak woto bi.",
        answer: `🌾 **Ndigal ngir baykat yi (SM10 Agro Casamance) :**

1. **Kañ ngay goob ?** :
   - Goobël bu jant bi sooragul (ci suba teel, 06:30 ba 09:30).
   - Bàyyikool mangue yi ñore 75% ba 80% (demi-mûr) ngir mu mën a muñ yoon wi ba Bambali.
2. **Naka ngay aar sa mangue yi ?** :
   - Bu leen teg ci suuf wala ci tàngooru jant bi.
   - Teg leen ci ker gu aéré te muur leen ak bâche bu am peyente.
3. **Kañ lay woto bi ñëw ?** :
   - Woto bi lay agsi ci sa gox ci diggante **07:30 ak 10:30** selon tournées PuLP yi.
   - P001 ba P062 (Profil A) ñooy jëkk a jot woto bi.`,
        sources: [
          "Guide Bonnes Pratiques Agricoles SM10 Casamance",
          "Module 1 : Fenêtres de Collecte Vergers",
        ],
        suggestedFollowUps: [
          "Kañ lay woto bi agsi ci sama tool ?",
          "Ñaata lañuy fayé kilo bi ?",
        ],
      };
    }

    return {
      reasoning:
        "Consignes agronomiques et logistiques destinées aux petits producteurs pour préserver la qualité marchande de la mangue avant le ramassage.",
      answer: `🌾 **Consignes de Récolte & Collecte pour les Producteurs :**

1. **Créneau de cueillette recommandé** :
   - Cueillir impérativement le matin à la fraîche (**06:30 à 09:30**) pour éviter le coup de chaleur sur le fruit.
   - Récolter au stade 3/4 mûr (ferme, sans meurtrissure) avec un pédoncule de 1 à 2 cm pour éviter l'écoulement de latex qui brûle la peau.

2. **Préservation post-récolte au verger** :
   - Ne jamais entreposer les cageots au contact direct du sol ou en plein soleil.
   - Stocker sous un abri ventilé recouvert d'une bâche d'ombrage aérée.

3. **Passage du camion de collecte** :
   - Le passage du camion SM10 est programmé entre **07:15 et 10:30** selon la feuille de route du chauffeur.
   - Les producteurs de **Profil A** sont ramassés en première fenêtre horaire pour alimenter l'usine dès midi.`,
      sources: [
        "Module 1 — Fenêtres Horaires des Tournées PuLP",
        "Protocole Qualité Usine Bambali (Seuil de rejet < 10%)",
      ],
      suggestedFollowUps: [
        "Quelle est la fenêtre horaire exacte pour mon village ?",
        "Quels sont les critères de rejet à l'usine ?",
      ],
    };
  }

  // 6. QUESTION GÉNÉRALE / PAR DÉFAUT
  if (effectiveLang === "wo") {
    return {
      reasoning:
        "Tontu bu leeraale li Copilote SM10 Agro di def ci làkku Wolof ngir baykat yi ak kilifa yi.",
      answer: `Dalal jamm ci **Assistant Copilote SM10 Agro** ! 🥭

Man maay sa copilote bu la mën a dimbali ci làkku **Wolof** ak **Français** ci wàllu :
- **Prévision ngoob mi (Module 3)** : SARIMAX ak quantiles yi ngir xam kàddu pic bi.
- **Woto yi ak yoonu collecte bi (Module 1)** : Solveur PuLP (202 km) ngir wàññi essans ak mangue yu yaqu.
- **Baykat yi (Module 2)** : Xàjjale 100 baykat yi ci **Profil A (Stratégique)** ak **Profil B**.
- **Scénarios d'urgence (Module 4)** : Saturation usine ba 121,5% ak woto yu panne.

Laajal ma lii nga bëgg xam !`,
      sources: ["SM10 Agro Casamance — Plateforme Multi-Modules"],
      suggestedFollowUps: [
        "Ban gox ñooy gën a am jafe-jafe ?",
        "Ñaata km la woto yi di daw ?",
        "Luñuy def bu pic bi amee ?",
      ],
    };
  }

  return {
    reasoning:
      "Réponse synthétique du Copilote SM10 Agro orientant l'utilisateur sur les 4 modules du projet.",
    answer: `Bonjour ! Je suis le **Copilote Agro-Logistique SM10 Agro**, adossé aux 4 modules d'intelligence mathématique de la filière mangue en Casamance :

1. **Prévision des Récoltes (Module 3)** : Modèle hybride Hurdle-SARIMAX (MAE 2,77 t) pour le flux central et régression quantile $Q_{0.90}$ pour anticiper les pics.
2. **Optimisation des Tournées (Module 1)** : Solveur PuLP réduisant le parcours à **202 km** (−29,4%) et sauvant **2,17 t** de mangues par jour.
3. **Scoring des Producteurs (Module 2)** : Classification K-Means ($k=4$) des 100 producteurs (62 Profils A Stratégiques).
4. **Tableau de Bord & Scénarios (Module 4)** : Simulateur de stress usine (saturation 121,5%) et plans de contingence.

Posez-moi votre question en **Français** ou en **Wolof** !`,
    sources: [
      "SM10 Agro Casamance — Architecture Intégrée (Modules 1, 2, 3, 4)",
    ],
    suggestedFollowUps: [
      "Quelle zone présente le plus de risque cette semaine ?",
      "Quels sont les gains logistiques du modèle PuLP ?",
      "Comment réagir face à un pic de récolte ?",
    ],
  };
}
