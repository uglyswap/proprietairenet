import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

// Pre-built templates for when no AI API is configured
const BUILT_IN_TEMPLATES = [
  // ─── Agences immobilières ────────────────────────────
  {
    id: 'agence-estimation',
    name: 'Estimation gratuite',
    category: 'agence',
    title: 'Estimation gratuite',
    body: `Madame, Monsieur,

Nous nous permettons de vous contacter au sujet de votre bien situé au {{bien_adresse}}.

La demande immobilière dans votre secteur est actuellement très soutenue. Nos acquéreurs recherchent activement des biens dans cette zone, et le vôtre pourrait correspondre à leurs critères.

Nous vous proposons une estimation gratuite et confidentielle de votre propriété, sans aucun engagement de votre part.

Un simple appel suffit pour convenir d'un rendez-vous.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'agence-mandat',
    name: 'Proposition de mandat',
    category: 'agence',
    title: 'Proposition de mandat',
    body: `Madame, Monsieur,

En tant que professionnel de l'immobilier implanté localement, nous avons identifié votre bien situé au {{bien_adresse}} comme correspondant aux attentes actuelles du marché.

Nous disposons d'acquéreurs qualifiés en recherche active dans votre quartier. Le moment est propice pour valoriser votre patrimoine dans d'excellentes conditions.

Seriez-vous ouvert(e) à un échange confidentiel sur les possibilités de mise en valeur de votre bien ?

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'agence-relance',
    name: 'Relance propriétaire',
    category: 'agence',
    title: 'Relance',
    body: `Madame, Monsieur,

Nous revenons vers vous suite à notre précédent courrier concernant votre bien situé au {{bien_adresse}}.

Depuis notre dernier contact, la dynamique du marché dans votre secteur s'est encore renforcée. Plusieurs transactions récentes confirment des valorisations intéressantes.

Si votre situation a évolué ou si vous souhaitez simplement connaître la valeur actuelle de votre bien, nous restons à votre disposition.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Marchands de biens ─────────────────────────────
  {
    id: 'marchand-achat',
    name: "Proposition d'achat direct",
    category: 'marchand',
    title: 'Achat direct',
    body: `Madame, Monsieur,

Notre société, {{expediteur_societe}}, est spécialisée dans l'acquisition de biens immobiliers. Nous avons identifié votre propriété située au {{bien_adresse}} dans le cadre de nos recherches.

Nous sommes en mesure de vous faire une proposition d'achat ferme, avec des délais rapides et sans condition suspensive de financement.

Si vous envisagez de céder ce bien, nous serions ravis d'en discuter directement avec vous.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'marchand-immeuble',
    name: 'Achat immeuble de rapport',
    category: 'marchand',
    title: 'Immeuble de rapport',
    body: `Madame, Monsieur,

Nous nous permettons de vous écrire concernant votre immeuble situé au {{bien_adresse}}.

Spécialisés dans l'acquisition et la valorisation d'immeubles, nous recherchons activement des biens dans votre secteur. Nous proposons des conditions attractives : prix juste, délais maîtrisés, et accompagnement complet.

Seriez-vous disposé(e) à échanger sur une éventuelle cession ?

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Promoteurs ────────────────────────────────────
  {
    id: 'promoteur-terrain',
    name: 'Acquisition terrain constructible',
    category: 'promoteur',
    title: 'Terrain constructible',
    body: `Madame, Monsieur,

Dans le cadre de nos projets de développement immobilier, nous avons identifié votre bien situé au {{bien_adresse}} comme présentant un potentiel intéressant.

Notre société, {{expediteur_societe}}, développe des programmes immobiliers de qualité et recherche des fonciers dans votre secteur.

Nous serions heureux de vous présenter notre projet et d'étudier avec vous les conditions d'une éventuelle acquisition, dans le respect de vos intérêts.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'promoteur-division',
    name: 'Projet de division foncière',
    category: 'promoteur',
    title: 'Division foncière',
    body: `Madame, Monsieur,

Votre propriété située au {{bien_adresse}} a retenu notre attention dans le cadre d'une étude de faisabilité immobilière.

La configuration de votre terrain pourrait permettre un projet de valorisation intéressant, dont vous pourriez être le premier bénéficiaire.

Accepteriez-vous un rendez-vous pour que nous vous présentions cette opportunité sans engagement ?

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Diagnostiqueurs ───────────────────────────────
  {
    id: 'diagnostiqueur-vente',
    name: 'Diagnostics obligatoires vente',
    category: 'diagnostiqueur',
    title: 'Diagnostics vente',
    body: `Madame, Monsieur,

En tant que diagnostiqueur immobilier certifié, nous nous permettons de vous contacter au sujet de votre bien situé au {{bien_adresse}}.

Saviez-vous que tout propriétaire souhaitant vendre ou louer son bien doit fournir un dossier de diagnostics techniques complet et à jour ? La réglementation évolue régulièrement et certains de vos diagnostics pourraient nécessiter une mise à jour.

Nous vous proposons un devis gratuit pour l'ensemble des diagnostics obligatoires, avec intervention rapide dans votre secteur.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'diagnostiqueur-dpe',
    name: 'Mise à jour DPE',
    category: 'diagnostiqueur',
    title: 'DPE à jour ?',
    body: `Madame, Monsieur,

Le Diagnostic de Performance Énergétique (DPE) de votre bien situé au {{bien_adresse}} est-il à jour ?

Depuis la réforme de 2021, le DPE est devenu opposable et son impact sur la valeur de votre bien est considérable. Un bon classement énergétique peut augmenter significativement la valeur de votre propriété.

Nous intervenons rapidement dans votre secteur. Contactez-nous pour un devis gratuit.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Chasseurs immobiliers ─────────────────────────
  {
    id: 'chasseur-recherche',
    name: 'Recherche pour client acquéreur',
    category: 'chasseur',
    title: 'Client acquéreur',
    body: `Madame, Monsieur,

Je me permets de vous contacter car l'un de mes clients acquéreurs recherche activement un bien dans votre secteur, et votre propriété située au {{bien_adresse}} correspond à ses critères.

En tant que chasseur immobilier, j'accompagne des acquéreurs sérieux et financés dans leur recherche. Mon client est prêt à se positionner rapidement.

Seriez-vous ouvert(e) à une discussion confidentielle ?

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'chasseur-offmarket',
    name: 'Opportunité off-market',
    category: 'chasseur',
    title: 'Vente discrète',
    body: `Madame, Monsieur,

Avez-vous déjà envisagé de céder votre bien situé au {{bien_adresse}} sans le mettre sur le marché public ?

La vente off-market vous permet de vendre en toute discrétion, sans visites multiples ni affichage public. Je dispose d'un réseau d'acquéreurs qualifiés qui privilégient ce type de transaction.

Si cette approche vous intéresse, je serais ravi(e) d'en discuter.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Administrateurs de biens ──────────────────────
  {
    id: 'admin-gestion',
    name: 'Proposition de gestion locative',
    category: 'administrateur',
    title: 'Gestion locative',
    body: `Madame, Monsieur,

Vous êtes propriétaire d'un bien situé au {{bien_adresse}} et vous gérez peut-être vous-même sa location ?

Notre cabinet, {{expediteur_societe}}, propose une gestion locative complète : recherche de locataires, encaissement des loyers, gestion des travaux, déclarations fiscales.

Libérez-vous de ces contraintes tout en optimisant la rentabilité de votre investissement. Nous vous proposons un rendez-vous gratuit pour étudier votre situation.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'admin-syndic',
    name: 'Proposition de syndic',
    category: 'administrateur',
    title: 'Changement de syndic',
    body: `Madame, Monsieur,

En tant qu'administrateur de biens, nous proposons nos services de syndic de copropriété pour votre immeuble situé au {{bien_adresse}}.

Transparence des comptes, réactivité, suivi personnalisé : nous nous engageons sur des résultats concrets pour votre copropriété.

Un changement de syndic est simple et peut être décidé en assemblée générale. Nous pouvons vous accompagner dans cette démarche.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Géomètres ─────────────────────────────────────
  {
    id: 'geometre-bornage',
    name: 'Bornage de terrain',
    category: 'geometre',
    title: 'Bornage',
    body: `Madame, Monsieur,

En tant que géomètre-expert, nous nous permettons de vous contacter au sujet de votre propriété située au {{bien_adresse}}.

Connaissez-vous précisément les limites de votre terrain ? Un bornage contradictoire est la seule garantie juridique de vos limites de propriété. Il est indispensable avant toute vente, construction ou division.

Nous intervenons dans votre secteur et vous proposons un devis gratuit et personnalisé.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'geometre-division',
    name: 'Division parcellaire',
    category: 'geometre',
    title: 'Division parcellaire',
    body: `Madame, Monsieur,

Votre terrain situé au {{bien_adresse}} pourrait présenter un potentiel de division parcellaire intéressant.

Vendre une partie de votre terrain tout en conservant votre habitation peut représenter une source de revenus significative. Nous pouvons étudier la faisabilité de cette opération.

Contactez-nous pour une étude préliminaire gratuite.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  // ─── Investisseurs ─────────────────────────────────
  {
    id: 'investisseur-achat',
    name: "Proposition d'investissement",
    category: 'investisseur',
    title: 'Investissement direct',
    body: `Madame, Monsieur,

Investisseur immobilier, je recherche activement des biens dans votre secteur. Votre propriété située au {{bien_adresse}} a retenu mon attention.

Je suis en mesure de vous faire une offre rapide, sans intermédiaire, avec un financement déjà en place. Ma priorité : une transaction simple et efficace pour les deux parties.

Si vous envisagez de céder ce bien, je serais ravi d'en discuter directement.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
  {
    id: 'investisseur-locatif',
    name: 'Rachat bien locatif',
    category: 'investisseur',
    title: 'Bien locatif',
    body: `Madame, Monsieur,

Je me permets de vous contacter au sujet de votre bien situé au {{bien_adresse}}.

Spécialisé dans l'investissement locatif, je recherche des biens avec ou sans locataire en place. Je rachète les biens en l'état, sans condition de travaux ni de vacance.

Si la gestion locative vous pèse ou si vous souhaitez libérer du capital, je serais heureux d'en discuter.

Cordialement,

{{expediteur_societe}}`,
    variables: ['nom', 'bien_adresse', 'expediteur_societe'],
  },
];

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const body = await req.json();
    const { type, context } = body;

    // Check if AI generation is requested
    if (type === 'custom') {
      // Get AI settings from DB
      const settingsResult = await pool.query(
        "SELECT provider, model, api_key, system_prompt FROM ai_settings WHERE id = '00000000-0000-0000-0000-000000000000'"
      );
      
      const settings = settingsResult.rows[0];
      
      if (settings?.api_key) {
        try {
          // Build user prompt from context
          const userPrompt = `Contexte de la lettre :
- Bien immobilier : ${context?.bien_adresse || 'non spécifié'}
- Type de prospection : ${context?.prospection_type || 'proposition générale'}
${context?.additional_info ? `- Informations supplémentaires : ${context.additional_info}` : ''}

Rédige la lettre en suivant les instructions du prompt système.`;

          let generatedText = '';

          if (settings.provider === 'openrouter') {
            const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.api_key}`,
                'HTTP-Referer': 'https://proprietaire.net',
                'X-Title': 'Proprietaire.net',
              },
              body: JSON.stringify({
                model: settings.model,
                messages: [
                  { role: 'system', content: settings.system_prompt },
                  { role: 'user', content: userPrompt },
                ],
                max_tokens: 1500,
                temperature: 0.7,
              }),
            });
            const aiResult = await aiResponse.json();
            generatedText = aiResult.choices?.[0]?.message?.content || '';
            // Log AI usage with actual cost from OpenRouter
            const usage = aiResult.usage || {};
            let costUsd = 0;
            // Fetch actual cost from OpenRouter generation endpoint
            if (aiResult.id) {
              try {
                const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${aiResult.id}`, {
                  headers: { 'Authorization': `Bearer ${settings.api_key}` },
                });
                if (genRes.ok) {
                  const genData = await genRes.json();
                  costUsd = parseFloat(genData.data?.total_cost || genData.data?.usage || '0') || 0;
                }
              } catch (costErr) { console.error('[AI COST FETCH]', costErr); }
            }
            try {
              await pool.query(
                'INSERT INTO ai_usage (organization_id, user_id, user_email, model, provider, prompt_tokens, completion_tokens, total_tokens, cost_usd, context) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [auth.user.organization_id, auth.user.id, auth.user.email, settings.model, 'openrouter', usage.prompt_tokens || 0, usage.completion_tokens || 0, usage.total_tokens || 0, costUsd, context?.prospection_type || 'template']
              );
            } catch (logErr) { console.error('[AI USAGE LOG]', logErr); }
          } else if (settings.provider === 'openai') {
            const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.api_key}`,
              },
              body: JSON.stringify({
                model: settings.model,
                messages: [
                  { role: 'system', content: settings.system_prompt },
                  { role: 'user', content: userPrompt },
                ],
                max_tokens: 1500,
                temperature: 0.7,
              }),
            });
            const aiResult = await aiResponse.json();
            generatedText = aiResult.choices?.[0]?.message?.content || '';
            // Log AI usage
            const usage2 = aiResult.usage || {};
            try {
              await pool.query(
                'INSERT INTO ai_usage (organization_id, user_id, user_email, model, provider, prompt_tokens, completion_tokens, total_tokens, cost_usd, context) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [auth.user.organization_id, auth.user.id, auth.user.email, settings.model, 'openai', usage2.prompt_tokens || 0, usage2.completion_tokens || 0, usage2.total_tokens || 0, 0, context?.prospection_type || 'template']
              );
            } catch (logErr) { console.error('[AI USAGE LOG]', logErr); }
          }

          if (generatedText) {
            return NextResponse.json({
              success: true,
              template: {
                name: 'Template IA personnalisé',
                body: generatedText,
                variables: ['nom', 'prenom', 'nom_societe', 'bien_adresse', 'expediteur_societe'],
                ai_generated: true,
              },
            });
          }
        } catch (aiErr) {
          console.error("[AI TEMPLATE]", aiErr);
          // Fall through to built-in templates
        }
      }

      // No AI configured - return a helpful message
      return NextResponse.json({
        success: false,
        error: "IA non configurée. Configurez OpenRouter dans Admin > Intelligence Artificielle.",
        templates: BUILT_IN_TEMPLATES,
      });
    }

    // Return specific built-in template
    if (type && type !== 'custom') {
      const template = BUILT_IN_TEMPLATES.find(t => t.id === type);
      if (template) {
        return NextResponse.json({ success: true, template });
      }
    }

    // Return all built-in templates
    const settingsResult = await pool.query(
      "SELECT api_key FROM ai_settings WHERE id = '00000000-0000-0000-0000-000000000000'"
    );
    const hasAi = !!(settingsResult.rows[0]?.api_key);

    return NextResponse.json({
      success: true,
      templates: BUILT_IN_TEMPLATES,
      ai_available: hasAi,
    });
  } catch (err: any) {
    console.error("[GENERATE TEMPLATE]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
