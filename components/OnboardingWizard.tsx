"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthHeaders } from "@/lib/auth-client";
import {
  Building2, Search, Mail, Users, CheckCircle2, ArrowRight, ArrowLeft, X,
  Sparkles, Settings, ChevronRight,
} from "lucide-react";

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: Sparkles,
    title: "Bienvenue sur Proprietaire.net ! 🏠",
    description: "Proprietaire.net vous permet de trouver n'importe quel propriétaire immobilier en France en quelques secondes.",
    details: [
      "🔍 Recherche par adresse, zone géographique, SIREN ou nom",
      "📨 Envoi de courriers postaux directement depuis la plateforme",
      "👥 Suivi CRM de tous vos contacts propriétaires",
      "📊 Analytics et statistiques de vos activités",
    ],
    color: "bg-blue-600",
  },
  {
    icon: Settings,
    title: "Configurez votre profil expéditeur ✉️",
    description: "Pour envoyer des courriers, vous avez besoin d'un profil expéditeur avec votre adresse.",
    details: [
      "Allez dans Paramètres pour renseigner votre adresse",
      "Indiquez votre société et vos coordonnées",
      "Cette étape est nécessaire avant d'envoyer un courrier",
    ],
    cta: { label: "Configurer maintenant", href: "/dashboard/settings" },
    color: "bg-purple-600",
  },
  {
    icon: Search,
    title: "Faites votre première recherche 🔍",
    description: "Utilisez la barre de recherche pour trouver des propriétaires par adresse, ou dessinez une zone sur la carte.",
    details: [
      "Recherche par adresse : tapez une rue, un code postal",
      "Recherche par zone : dessinez sur la carte",
      "Résultats instantanés avec données cadastrales",
    ],
    color: "bg-green-600",
  },
  {
    icon: Mail,
    title: "Envoyez un courrier postal 📬",
    description: "Contactez les propriétaires trouvés directement par courrier postal.",
    details: [
      "Templates personnalisables avec variables",
      "Aperçu avant envoi",
      "Suivi du statut de chaque courrier",
      "Envoi en masse possible",
    ],
    color: "bg-amber-600",
  },
  {
    icon: Users,
    title: "Suivez vos contacts dans le CRM 👥",
    description: "Chaque destinataire est automatiquement ajouté au CRM.",
    details: [
      "Contacts créés automatiquement après chaque courrier",
      "Statuts personnalisables",
      "Notes et historique de chaque contact",
      "Export en CSV/JSON",
    ],
    color: "bg-indigo-600",
  },
  {
    icon: CheckCircle2,
    title: "Vous êtes prêt ! 🎉",
    description: "Votre espace est configuré. Lancez votre première recherche !",
    details: [
      "✅ 10 crédits offerts pour démarrer",
      "✅ 10 recherches gratuites par mois",
      "✅ Accès au CRM et aux analytics",
      "💡 Passez au plan Starter pour des recherches illimitées",
    ],
    color: "bg-emerald-600",
  },
];

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    fetch("/api/user/onboarding", {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
    }).catch(() => {});
  }, [step]);

  const handleComplete = async () => {
    try {
      await fetch("/api/user/onboarding", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
    } catch {}
    onComplete();
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleComplete(); }}
    >
      <Card className="w-full max-w-lg shadow-2xl relative overflow-hidden">
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div className="h-1 bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <button
          onClick={handleComplete}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <CardContent className="pt-8 pb-6 px-8">
          <div className={`w-14 h-14 rounded-2xl ${current.color} flex items-center justify-center mb-6`}>
            <Icon className="h-7 w-7 text-white" />
          </div>

          <h2 className="text-xl font-bold mb-2">{current.title}</h2>
          <p className="text-muted-foreground text-sm mb-4">{current.description}</p>

          <div className="space-y-2 mb-6">
            {current.details.map((detail, i) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{detail}</span>
              </div>
            ))}
          </div>

          {current.cta && (
            <a
              href={current.cta.href}
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium mb-4"
              onClick={() => handleComplete()}
            >
              {current.cta.label}
              <ArrowRight className="h-4 w-4" />
            </a>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-blue-600" : i < step ? "bg-blue-300 dark:bg-blue-600" : "bg-gray-200 dark:bg-gray-700"}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
              )}
              {isLast ? (
                <Button size="sm" onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  C&apos;est parti !
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep(s => s + 1)}>
                  Suivant
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>

          <div className="text-center mt-3">
            <button onClick={handleComplete} className="text-xs text-muted-foreground hover:text-gray-600">
              Passer l&apos;introduction
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
