'use client';

import { useState } from 'react';
import Link from 'next/link';
import HeroParticles from '@/components/HeroParticles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Search,
  Map,
  Check,
  Zap,
  TrendingUp,
  Shield,
  ArrowRight,
  MapPin,
  Users,
  Mail,
  Star,
  Menu,
  X,
  Heart,
  Download,
  Bot,
  BarChart3,
  FileText,
  Layers,
  ShieldCheck,
  Calendar,
  Target,
  Building,
  Briefcase,
  Scale,
  Compass,
  CreditCard
} from 'lucide-react';

function getDiscountedPrice(credits: number): number {
  const base = credits / 100;
  if (credits >= 200000) return Math.round(base * 0.85);
  if (credits >= 60000) return Math.round(base * 0.90);
  return base;
}
function getDiscountLabel(credits: number): string {
  if (credits >= 200000) return 'Megapack -15%';
  if (credits >= 60000) return '-10%';
  return 'tarif normal';
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(20000);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">Proprietaire.net</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Fonctionnalit&eacute;s</Link>
            <Link href="#pricing" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Tarifs</Link>
            <Link href="/login"><Button variant="ghost" className="font-medium">Connexion</Button></Link>
            <Link href="/register"><Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-medium">Commencer gratuitement</Button></Link>
          </nav>
          <button className="md:hidden p-2 rounded-md hover:bg-gray-100" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t bg-white/95 backdrop-blur-md animate-in slide-in-from-top duration-200">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-1">
              <Link href="#features" className="block text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors px-3 py-3 rounded-lg hover:bg-gray-50" onClick={() => setMenuOpen(false)}>Fonctionnalit&eacute;s</Link>
              <Link href="#pricing" className="block text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors px-3 py-3 rounded-lg hover:bg-gray-50" onClick={() => setMenuOpen(false)}>Tarifs</Link>
              <Link href="/login" className="block text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors px-3 py-3 rounded-lg hover:bg-gray-50" onClick={() => setMenuOpen(false)}>Connexion</Link>
              <Link href="/register" onClick={() => setMenuOpen(false)}><Button className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600">Commencer gratuitement</Button></Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative py-24 bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden">
        <div className="absolute inset-0 bg-grid-blue-500/[0.05] bg-[size:40px_40px]" />
        <HeroParticles />
        <div className="absolute top-20 -left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse" style={{animationDuration: '4s'}} />
        <div className="absolute bottom-20 -right-10 w-96 h-96 bg-indigo-400/15 rounded-full blur-3xl animate-pulse" style={{animationDuration: '6s', animationDelay: '1s'}} />
        <div className="absolute top-40 right-1/4 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl animate-pulse" style={{animationDuration: '5s', animationDelay: '2s'}} />
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-100">
            <Badge className="mb-6 bg-gradient-to-r from-blue-100 to-indigo-100 border-blue-200 text-blue-700 hover:shadow-lg transition-all duration-300">
              <Zap className="h-3 w-3 mr-1" />22,5 millions de propri&eacute;t&eacute;s dans notre base
            </Badge>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-200">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 bg-clip-text text-transparent">Trouvez le propri&eacute;taire.</span>
              <br /><span className="text-gray-900">Contactez-le.</span>
            </h1>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-300">
            <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-4xl mx-auto leading-relaxed">
              <strong>La base cadastrale compl&egrave;te de la France</strong> dans vos mains. Identifiez instantan&eacute;ment n&apos;importe quel propri&eacute;taire par adresse ou zone g&eacute;ographique.
              <br /><span className="text-blue-600 font-semibold">CRM int&eacute;gr&eacute; + envoi de courriers postaux automatis&eacute;.</span>
            </p>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-400">
            <div className="flex gap-4 justify-center flex-wrap mb-4">
              <Link href="/register">
                <Button size="lg" className="h-12 px-6 text-base md:h-16 md:px-8 md:text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                  Commencer gratuitement<ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
            <p className="text-sm text-gray-500">10 recherches gratuites &bull; Pas de carte bancaire &bull; Setup instantan&eacute;</p>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 max-w-4xl mx-auto">
              {[
                { value: '22,5M', label: 'Propriétés', icon: Building2 },
                { value: '98%', label: 'Couverture France', icon: Map },
                { value: '<2s', label: 'Vitesse recherche', icon: Zap },
                { value: '4,10€', label: 'À partir de / courrier', icon: Mail },
              ].map((stat, i) => (
                <div key={i} className="text-center p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/20 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <stat.icon className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                  <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-1">{stat.value}</div>
                  <div className="text-sm text-gray-600 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comment ca marche */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-blue-100 text-blue-700">Comment &ccedil;a marche</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              Propri&eacute;taires trouv&eacute;s en <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">3 clics</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">Notre technologie r&eacute;volutionne la prospection immobili&egrave;re</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {[
              { step: '01', icon: Search, title: 'Cherchez', desc: 'Entrez une adresse ou dessinez une zone sur la carte. Recherches illimitées avec le plan Pro.', color: 'from-blue-500 to-blue-600' },
              { step: '02', icon: Target, title: 'Identifiez', desc: 'Obtenez le nom, la forme juridique et l’adresse postale complète de chaque propriétaire.', color: 'from-indigo-500 to-indigo-600' },
              { step: '03', icon: Mail, title: 'Contactez', desc: 'Envoyez un courrier postal personnalisé directement depuis la plateforme. Tout est inclus.', color: 'from-purple-500 to-purple-600' },
            ].map((item, i) => (
              <div key={i} className="relative group">
                <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-6xl font-bold text-gray-100 absolute top-4 right-6">{item.step}</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fonctionnalites */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-green-100 text-green-700">Fonctionnalit&eacute;s</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              La suite compl&egrave;te pour <span className="bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">dominer votre march&eacute;</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {[
              { icon: Search, title: 'Recherche par adresse', desc: 'Trouvez le propriétaire de n’importe quel bien en France.' },
              { icon: Map, title: 'Recherche par zone', desc: 'Dessinez un périmètre sur la carte et obtenez tous les propriétaires.' },
              { icon: Mail, title: 'Courrier postal', desc: '22 templates professionnels. Envoi automatisé, tout inclus.' },
              { icon: Bot, title: 'IA intégrée', desc: 'Générez des courriers personnalisés avec l’intelligence artificielle.' },
              { icon: BarChart3, title: 'CRM & Analytics', desc: 'Suivez vos prospects, mesurez vos retours, optimisez vos campagnes.' },
              { icon: Users, title: 'Multi-utilisateurs', desc: 'Invitez votre équipe et collaborez en temps réel.' },
              { icon: Star, title: 'Favoris & Listes', desc: 'Organisez vos prospects par quartier, type de bien ou priorité.' },
              { icon: Download, title: 'Export CSV', desc: 'Exportez vos résultats pour les intégrer dans vos outils.' },
              { icon: ShieldCheck, title: 'Sécurité', desc: 'Données chiffrées, authentification JWT, rate limiting.' },
            ].map((f, i) => (
              <Card key={i} className="border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br from-white to-gray-50">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
                    <f.icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-600">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Cibles */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Pour qui ?</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">Quel que soit votre m&eacute;tier</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Building, label: 'Agences immobilières' },
              { icon: TrendingUp, label: 'Marchands de biens' },
              { icon: Layers, label: 'Promoteurs' },
              { icon: Building2, label: 'Diagnostiqueurs' },
              { icon: Briefcase, label: 'Chasseurs immobiliers' },
              { icon: Scale, label: 'Administrateurs de biens' },
              { icon: Compass, label: 'Géomètres' },
              { icon: Heart, label: 'Investisseurs' },
            ].map((c, i) => (
              <div key={i} className="text-center p-6 rounded-2xl bg-white shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-gray-100">
                <c.icon className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-900">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Temoignages */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-purple-100 text-purple-700"><Star className="h-3 w-3 mr-1" />T&eacute;moignages</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">Ils utilisent Proprietaire.net au quotidien</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {[
              { quote: "Depuis que j’utilise Proprietaire.net, ma prospection a complètement changé. Je cible les propriétaires par zone, j’envoie un courrier personnalisé, et je reçois des appels dans la semaine. Mon taux de retour est passé de 0,5% à 8%.", name: "Sophie M.", role: "Agent immobilier", location: "Île-de-France", stars: 5 },
              { quote: "L’outil est indispensable pour identifier les propriétaires de parcelles à potentiel. On dessine la zone sur la carte, on a tous les noms en quelques secondes. Le courrier postal fait le reste. Trois acquisitions en deux mois.", name: "Marc D.", role: "Marchand de biens", location: "Lyon", stars: 4 },
              { quote: "En tant que diagnostiqueur, trouver des propriétaires à démarcher était un cauchemar. Avec Proprietaire.net, je cible une zone, j’envoie un courrier professionnel, et les propriétaires m’appellent pour planifier leurs diagnostics. Mon carnet de commandes est plein à 3 semaines.", name: "Laurent P.", role: "Diagnostiqueur immobilier", location: "Bordeaux", stars: 5 },
            ].map((t, i) => (
              <Card key={i} className="border shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="pt-6">
                  <div className="flex mb-3">{Array.from({ length: 5 }).map((_, j) => (<Star key={j} className={`h-4 w-4 ${j < t.stars ? "text-amber-400 fill-amber-400" : "text-gray-300"}`} />))}</div>
                  <p className="text-gray-700 text-sm leading-relaxed mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
                  <div className="border-t pt-4">
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <p className="text-sm text-blue-600">{t.role}</p>
                    <p className="text-xs text-gray-500">{t.location}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="pricing" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-blue-100 text-blue-700"><Zap className="h-3 w-3 mr-1" />Tarifs</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">Des tarifs simples et transparents</h2>
            <p className="text-lg text-gray-600">10 r&eacute;sultats par mois en gratuit, illimit&eacute;s en Pro. Cr&eacute;dits courrier vendus s&eacute;par&eacute;ment.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                name: 'Gratuit', price: '0', period: '/mois', desc: 'Pour tester', popular: false,
                features: ['10 résultats de recherche par mois', 'Comptabilisés uniquement si résultats', 'Recherche par adresse', 'Recherche par zone', 'Export CSV basique'],
                note: 'Crédits courrier vendus séparément'
              },
              {
                name: 'Pro', price: '97', period: '/mois HT', desc: 'Pour les professionnels', popular: true,
                features: ['Résultats illimités (200 max par recherche)', 'CRM intégré complet', 'Templates courrier + IA', 'Envoi courriers postaux', 'Multi-utilisateurs (+20€/user)', 'Dashboard analytique', 'Support prioritaire'],
                note: 'Crédits courrier vendus séparément'
              },
            ].map((plan, i) => (
              <Card key={i} className={`relative ${plan.popular ? 'border-2 border-blue-500 shadow-2xl md:scale-105' : 'border shadow-lg'}`}>
                {plan.popular && (<div className="absolute -top-4 left-1/2 transform -translate-x-1/2"><Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1">Plus populaire</Badge></div>)}
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.desc}</CardDescription>
                  <div className="mt-4"><span className="text-5xl font-bold">{plan.price}&euro;</span><span className="text-gray-600 ml-1">{plan.period}</span></div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((f, j) => (<li key={j} className="flex items-start gap-3"><Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" /><span className="text-sm text-gray-700">{f}</span></li>))}
                  </ul>
                  <Link href="/register"><Button className={`w-full h-12 font-semibold ${plan.popular ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : ''}`} variant={plan.popular ? 'default' : 'outline'}>{plan.popular ? 'Choisir Pro' : 'Commencer'}<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
                  <p className="text-xs text-gray-500 mt-3 text-center">{plan.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
      </section>

      {/* Tarification explication */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-4 bg-amber-100 text-amber-700"><CreditCard className="h-3 w-3 mr-1" />Tarification simple</Badge>
            <h3 className="text-3xl font-bold mb-4 text-gray-900">Comment fonctionne la tarification ?</h3>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                  <Search className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Recherches = Gratuites</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Avec le plan Pro, recherchez autant de propri&eacute;taires que vous voulez.
                    Vous obtenez le nom, la forme juridique et l&apos;adresse postale compl&egrave;te.
                    <strong> Aucun cr&eacute;dit n&eacute;cessaire pour chercher.</strong>
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Courriers = Cr&eacute;dits</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Les cr&eacute;dits servent uniquement &agrave; envoyer des courriers postaux.
                    Impression, mise sous pli, affranchissement et envoi : tout est inclus.
                    <strong> &Agrave; partir de 4,10&euro; par courrier.</strong>
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">100 cr&eacute;dits = 1&euro; &bull; Les cr&eacute;dits n&apos;expirent jamais &bull; Achetez uniquement ce dont vous avez besoin</p>
            </div>
          </div>
        </div>
      </section>

      {/* Credits Slider */}
      <section className="py-16 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-4 bg-amber-100 text-amber-700"><CreditCard className="h-3 w-3 mr-1" />Cr&eacute;dits courrier</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">Envoyez vos courriers en un clic</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Impression, mise sous pli, affranchissement, envoi &mdash; tout est inclus.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <div className="px-4 py-2 rounded-full border bg-gray-50 border-gray-200 text-sm text-gray-600">100 cr&eacute;dits = 1&euro;</div>
            <div className="px-4 py-2 rounded-full border bg-green-50 border-green-200 text-sm text-green-700 font-medium">60 000+ = -10%</div>
            <div className="px-4 py-2 rounded-full border bg-amber-50 border-amber-200 text-sm text-amber-700 font-medium">200 000+ = -15%</div>
          </div>
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-3"><label className="text-sm text-gray-500 font-medium">Choisissez votre montant</label><div className="flex items-center gap-2"><input type="number" min={100} step={100} value={creditAmount} onChange={(e) => { const v = parseInt(e.target.value) || 0; setCreditAmount(Math.max(100, v)); }} className="w-28 px-3 py-1.5 border rounded-lg text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" /><span className="text-xs text-gray-400">crédits</span></div></div>
                <input type="range" min={1000} max={300000} step={1000} value={creditAmount} onChange={(e) => setCreditAmount(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1 000</span><span>60 000</span><span>200 000</span><span>300 000</span></div>
              </div>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                  <div><div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600">{creditAmount.toLocaleString('fr-FR')}</div><div className="text-sm text-gray-500">cr&eacute;dits</div></div>
                  <div><div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-600">~{Math.floor(creditAmount / 410)}</div><div className="text-sm text-gray-500">lettres vertes</div></div>
                  <div><div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">{getDiscountedPrice(creditAmount).toLocaleString('fr-FR')}&euro;</div><div className="text-sm text-gray-500">{getDiscountLabel(creditAmount)}</div>{creditAmount >= 60000 && (<div className="text-xs text-green-600 mt-1">Au lieu de {(creditAmount / 100).toLocaleString('fr-FR')}&euro;</div>)}</div>
                </div>
              </div>
              <div className="text-center">
                <Link href="/pricing#credits"><Button size="lg" className="h-12 px-4 text-sm md:h-14 md:px-8 md:text-lg">Voir les packs et acheter<ArrowRight className="ml-2 h-5 w-5" /></Button></Link>
                <p className="text-xs text-gray-500 mt-3">Packs &agrave; partir de 50&euro; &middot; Montant personnalis&eacute; &middot; Les cr&eacute;dits n&apos;expirent jamais</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lien vers pricing */}
      <div className="text-center py-8 bg-gradient-to-b from-gray-50 to-white">
        <Link href="/pricing" className="text-blue-600 hover:text-blue-800 font-semibold text-base hover:underline">Voir tous les détails et packs de crédits →</Link>
      </div>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Pr&ecirc;t &agrave; commencer ?</h2>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">Inscription gratuite en 30 secondes. R&eacute;sultats en quelques clics.</p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="h-16 px-10 text-lg font-semibold shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
              Cr&eacute;er mon compte gratuitement<ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold text-primary">Proprietaire.net</span>
              </div>
              <p className="text-sm text-gray-600">Prospection immobili&egrave;re intelligente. Trouvez n&apos;importe quel propri&eacute;taire en France.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-gray-900">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="#features" className="hover:text-blue-600 transition-colors">Fonctionnalit&eacute;s</Link></li>
                <li><Link href="/pricing" className="hover:text-blue-600 transition-colors">Tarifs</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-gray-900">L&eacute;gal</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="/mentions-legales" className="hover:text-blue-600 transition-colors">Mentions l&eacute;gales</Link></li>
                <li><Link href="/cgv" className="hover:text-blue-600 transition-colors">CGV</Link></li>
                <li><Link href="/confidentialite" className="hover:text-blue-600 transition-colors">Confidentialit&eacute;</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-gray-900">Contact</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>contact@proprietaire.net</li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 text-center text-sm text-gray-500">&copy; 2026 Proprietaire.net. Tous droits r&eacute;serv&eacute;s.</div>
        </div>
      </footer>
    </div>
  );
}
