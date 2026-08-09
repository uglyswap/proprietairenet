'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CadastreResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getAuthHeaders } from '@/lib/auth-client'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Building2, User, MapPin, Hash, Download, Eye, EyeOff,
  Users, Briefcase, Home, Ruler, Euro, Layers, CalendarDays,
  ChevronDown, ChevronUp, ExternalLink, Mail, Plus, Star
} from 'lucide-react'

function mapFormeJuridique(code: string | null | undefined): string {
  if (!code) return '';
  if (/[a-zA-Z]/.test(code)) return code;
  const mapping: Record<string, string> = {
    '1000': 'Entrepreneur individuel',
    '5191': 'Société de fait',
    '5192': 'Société en participation',
    '5193': 'Société en participation (commerciale)',
    '5195': 'SEP',
    '5196': 'SEP (commerciale)',
    '5202': 'Société en nom collectif (SNC)',
    '5203': 'SNC',
    '5306': 'SARL',
    '5307': 'SARL',
    '5308': 'SARL',
    '5309': 'SARL unipersonnelle (EURL)',
    '5310': 'SARL',
    '5370': 'SARL (divers)',
    '5385': 'SARL',
    '5410': 'SA à conseil d\'administration',
    '5415': 'SA à directoire',
    '5422': 'SA (divers)',
    '5426': 'SA à conseil d\'administration',
    '5430': 'SA',
    '5431': 'SA à conseil d\'administration',
    '5432': 'SA à directoire',
    '5442': 'SA mixte',
    '5443': 'SA à participation ouvrière',
    '5451': 'SA de HLM',
    '5460': 'SA',
    '5470': 'SA (divers)',
    '5498': 'SA européenne',
    '5499': 'SA (autre)',
    '5505': 'SAS',
    '5510': 'SAS',
    '5515': 'SAS (divers)',
    '5520': 'SAS',
    '5522': 'SAS',
    '5525': 'SAS (holding)',
    '5530': 'SAS',
    '5532': 'SAS',
    '5535': 'SAS',
    '5538': 'SAS',
    '5539': 'SAS',
    '5540': 'SAS',
    '5542': 'SAS',
    '5545': 'SAS',
    '5547': 'SAS',
    '5548': 'SAS',
    '5549': 'SAS',
    '5551': 'SAS',
    '5559': 'SAS',
    '5560': 'SAS (autre)',
    '5570': 'SAS (divers)',
    '5585': 'SAS (autre)',
    '5599': 'SAS',
    '5610': 'SCA',
    '5699': 'SCA (autre)',
    '5710': 'SAS',
    '5720': 'SAS à associé unique (SASU)',
    '5785': 'SASU',
    '5800': 'Société européenne',
    '6100': 'Caisse d\'épargne',
    '6210': 'GEIE',
    '6220': 'GIE',
    '6316': 'CUMA',
    '6317': 'Coopérative',
    '6411': 'Mutuelle',
    '6521': 'SCI',
    '6532': 'SCI de construction-vente',
    '6533': 'SCI d\'attribution',
    '6534': 'SCI (accession)',
    '6540': 'SCI',
    '6541': 'SCI',
    '6542': 'SCI',
    '6543': 'SCI',
    '6544': 'SCI',
    '6551': 'SCI de location',
    '6554': 'SCI d\'attribution',
    '6558': 'SCI (autre)',
    '6560': 'SCI (autre)',
    '6570': 'SCI (divers)',
    '6585': 'SCI (autre)',
    '6589': 'SCI',
    '6595': 'SCCV',
    '6596': 'SCI (autre)',
    '6599': 'SCI',
    '7111': 'État',
    '7112': 'État',
    '7113': 'Ministère',
    '7120': 'Service déconcentré État',
    '7150': 'Établissement public national',
    '7160': 'Chambre de commerce',
    '7210': 'Commune',
    '7220': 'Département',
    '7225': 'Territoire outre-mer',
    '7229': 'Collectivité territoriale',
    '7230': 'Région',
    '7312': 'Commune associée',
    '7313': 'Section de commune',
    '7321': 'Établissement public communal',
    '7331': 'Établissement public départemental',
    '7340': 'Établissement public régional',
    '7341': 'Syndicat mixte',
    '7342': 'Pôle métropolitain',
    '7343': 'Commune nouvelle',
    '7344': 'Métropole',
    '7345': 'Communauté de communes',
    '7346': 'Communauté d\'agglomération',
    '7347': 'Communauté urbaine',
    '7348': 'Métropole de Lyon',
    '7349': 'EPCI (autre)',
    '7351': 'Établissement public hospitalier',
    '7361': 'Office public HLM',
    '7362': 'OPAC',
    '7363': 'Régie',
    '8110': 'Régime général Sécu',
    '8210': 'Mutualité sociale agricole',
    '8310': 'Régime maladie (mines)',
    '8410': 'Régime complémentaire',
    '9110': 'Syndicat de propriétaires',
    '9150': 'Association syndicale libre',
    '9210': 'Association (loi 1901)',
    '9220': 'Association (autre)',
    '9221': 'Association (Alsace-Moselle)',
    '9222': 'Association (inscrits)',
    '9223': 'Association (droit local)',
    '9224': 'Association (mission création)',
    '9230': 'Association déclarée (utilité publique)',
    '9240': 'Congrégation',
    '9260': 'Association de droit local',
    '9300': 'Fondation',
    '9900': 'Groupement de droit privé (autre)',
  };
  return mapping[code] || code;
}

interface ResultsListProps {
  results: CadastreResult[]
  onExport: () => void
  onReveal: (id: string) => Promise<void>
  onCreditsUpdate: () => void
  selectedResults?: Set<number>
  onSelectionChange?: (selected: Set<number>) => void
  highlightedIndex?: number
}

function formatDirigeant(dirigeants: any[]): string {
  if (!dirigeants || dirigeants.length === 0) return ''
  const d = dirigeants[0]
  if (d.type === 'personne_physique') {
    const prenoms = (d.prenoms || '').split(' ').map((p: string) => 
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(' ')
    const nom = (d.nom || '').charAt(0).toUpperCase() + (d.nom || '').slice(1).toLowerCase()
    return `${prenoms} ${nom}`.trim()
  }
  return d.denomination || d.nom || ''
}

function formatDirigeantName(d: any): string {
  if (d.type === 'personne_physique') {
    const prenoms = (d.prenoms || '').split(' ').map((p: string) => 
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(' ')
    const nom = (d.nom || '').charAt(0).toUpperCase() + (d.nom || '').slice(1).toLowerCase()
    return `${prenoms} ${nom}`.trim()
  }
  return d.denomination || d.nom || ''
}

function TypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null
  const config: Record<string, { color: string; label: string }> = {
    'Résidentiel individuel': { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: '🏠 Habitation' },
    'Résidentiel collectif': { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: '🏢 Collectif' },
    'Tertiaire': { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', label: '🏬 Tertiaire' },
    'Tertiaire & Autres': { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', label: '🏬 Tertiaire' },
    'Dépendance': { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', label: '🏗️ Dépendance' },
    'Secondaire': { color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', label: '🏡 Secondaire' },
  }
  const c = config[type] || { color: 'bg-gray-100 text-gray-800', label: type }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>{c.label}</span>
}

/**
 * Corps attendu par POST /api/lists/items, seul endpoint d'ajout reellement
 * implemente.
 */
function buildListItemPayload(listId: string, result: CadastreResult) {
  const firstProp = result.proprietes?.[0]
  return {
    list_id: listId,
    company_name: result.proprietaire.denomination,
    director_name: (result.proprietaire as any).dirigeant ?? null,
    property_address: firstProp?.adresse ?? null,
    property_postal_code: firstProp?.code_postal ?? null,
    property_city: firstProp?.ville ?? null,
    siren: result.proprietaire.siren ?? null,
    data: result,
  }
}

async function addResultToList(listId: string, result: CadastreResult): Promise<boolean> {
  const res = await fetch('/api/lists/items', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(buildListItemPayload(listId, result)),
  })
  return res.ok
}

/** Retrouve l'item correspondant a un resultat dans une liste, puis le supprime. */
async function removeResultFromList(listId: string, result: CadastreResult): Promise<boolean> {
  const detail = await fetch(`/api/lists/detail?id=${encodeURIComponent(listId)}`, {
    headers: getAuthHeaders(),
  })
  if (!detail.ok) return false

  const data = await detail.json()
  const siren = result.proprietaire.siren || null
  const denomination = result.proprietaire.denomination

  const item = (data.items || []).find(
    (i: any) => (siren && i.siren === siren) || (!siren && i.company_name === denomination)
  )
  if (!item) return false

  const del = await fetch(
    `/api/lists/items?list_id=${encodeURIComponent(listId)}&item_id=${encodeURIComponent(item.id)}`,
    { method: 'DELETE', headers: getAuthHeaders() }
  )
  return del.ok
}

/** Identifiant de la liste "Favoris", creee au besoin. */
async function ensureFavorisList(): Promise<string | null> {
  const res = await fetch('/api/lists', { headers: getAuthHeaders() })
  if (res.ok) {
    const data = await res.json()
    const existante = (data.lists || []).find((l: any) => l.name === 'Favoris')
    if (existante?.id) return existante.id
  }

  const creation = await fetch('/api/lists', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Favoris', color: '#F59E0B' }),
  })
  if (!creation.ok) return null

  const data = await creation.json()
  return data.list?.id ?? null
}

export default function ResultsList({ results, onExport, onReveal, onCreditsUpdate, selectedResults, onSelectionChange, highlightedIndex }: ResultsListProps) {
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // FIX 3: Scroll to highlighted result and auto-expand it
  useEffect(() => {
    if (highlightedIndex !== undefined && highlightedIndex >= 0) {
      const el = document.getElementById(`result-${highlightedIndex}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // Auto-expand the highlighted result
      setExpandedIds(prev => {
        const next = new Set(prev)
        next.add(highlightedIndex)
        return next
      })
    }
  }, [highlightedIndex])
  const [addToListResult, setAddToListResult] = useState<CadastreResult | null>(null)
  const [lists, setLists] = useState<any[]>([])
  const [newListName, setNewListName] = useState('')
  const [listsLoading, setListsLoading] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [togglingFavorite, setTogglingFavorite] = useState<Set<string>>(new Set())
  const router = useRouter()

  // Toggle favorite for a result
  const toggleFavorite = async (result: CadastreResult) => {
    const resultKey = result.id || result.proprietaire.denomination
    if (!resultKey || togglingFavorite.has(resultKey)) return
    
    setTogglingFavorite(prev => new Set([...prev, resultKey]))
    const isFav = favoriteIds.has(resultKey)
    
    try {
      // /api/lists/add et /api/lists/remove n'existent pas : seules /api/lists,
      // /api/lists/detail et /api/lists/items sont implementees. Ces deux appels
      // renvoyaient donc un 404 sur l'ecran principal du produit. La branche
      // "creer la liste et ajouter" perdait de surcroit le resultat en silence,
      // POST /api/lists ne lisant que `name`.
      const favListId = await ensureFavorisList()
      if (!favListId) {
        toast.error('Liste Favoris indisponible')
        return
      }

      if (isFav) {
        const retire = await removeResultFromList(favListId, result)
        if (retire) {
          setFavoriteIds(prev => { const n = new Set(prev); n.delete(resultKey); return n })
          toast.success('Retiré des favoris')
        } else {
          // L'ancienne version basculait l'affichage meme quand l'appel echouait,
          // ce qui faisait diverger l'ecran de la base.
          toast.error('Impossible de retirer des favoris')
        }
      } else {
        const ajoute = await addResultToList(favListId, result)
        if (ajoute) {
          setFavoriteIds(prev => new Set([...prev, resultKey]))
          toast.success('Ajouté aux favoris ⭐')
        } else {
          toast.error("Erreur lors de l'ajout aux favoris")
        }
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setTogglingFavorite(prev => { const n = new Set(prev); n.delete(resultKey); return n })
    }
  }

  const allSelected = selectedResults && onSelectionChange && results.length > 0 && selectedResults.size === results.length
  const someSelected = selectedResults && onSelectionChange && selectedResults.size > 0 && selectedResults.size < results.length

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return
    if (checked) {
      onSelectionChange(new Set(results.map((_, i) => i)))
    } else {
      onSelectionChange(new Set())
    }
  }

  const handleSelectRow = (index: number, checked: boolean) => {
    if (!onSelectionChange || !selectedResults) return
    const newSel = new Set(selectedResults)
    if (checked) { newSel.add(index) } else { newSel.delete(index) }
    onSelectionChange(newSel)
  }

  const toggleExpand = (idx: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const handleReveal = async (result: CadastreResult) => {
    if (!result.id || result.revealed || revealingIds.has(result.id)) return
    setRevealingIds(prev => new Set([...prev, result.id!]))
    try {
      await onReveal(result.id)
      onCreditsUpdate()
    } catch (e) { console.error(e) }
    finally {
      setRevealingIds(prev => { const n = new Set(prev); n.delete(result.id!); return n })
    }
  }

  const fetchLists = async () => {
    setListsLoading(true)
    try {
      const res = await fetch('/api/lists', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLists(data.lists || [])
      }
    } catch {} finally { setListsLoading(false) }
  }

  const handleAddToList = async (listId: string) => {
    if (!addToListResult) return
    try {
      const res = { ok: await addResultToList(listId, addToListResult) }
      if (res.ok) {
        toast.success('Ajouté à la liste !')
        setAddToListResult(null)
      } else {
        toast.error("Erreur lors de l'ajout")
      }
    } catch { toast.error('Erreur réseau') }
  }

  const handleCreateListAndAdd = async () => {
    if (!newListName.trim() || !addToListResult) return
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName, results: [addToListResult] })
      })
      if (res.ok) {
        toast.success(`Liste "${newListName}" créée et résultat ajouté !`)
        setAddToListResult(null)
        setNewListName('')
      } else {
        toast.error('Erreur lors de la création')
      }
    } catch { toast.error('Erreur réseau') }
  }

  const exportSingleResult = (result: CadastreResult) => {
    const e = (result as any).enrichissement || {}
    const prop = result.proprietes?.[0]
    const sep = ';'
    // Neutralise l'injection de formule CSV (Excel/Sheets) : prefixe ' si la
    // valeur commence par un caractere declencheur de formule.
    const sanitizeCsvCell = (value: unknown): string => {
      const s = value === null || value === undefined ? '' : String(value)
      return s.length > 0 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    }
    const esc = (s: unknown) => `"${sanitizeCsvCell(s).replace(/"/g, '""')}"`
    const headers = [
      'Dénomination','Forme Juridique','SIREN','Type',
      'Adresse','Code Postal','Ville',
      'Réf Cadastrale','IDU','Surface Parcelle (m²)',
      'Dernière vente (date)','Dernière vente (€)','Nature mutation','Prix/m²',
      'Nb transactions','Type Bien','Surface Bâtie','Année Construction','Copropriété'
    ].join(sep)
    const row = [
      esc(result.proprietaire.denomination),
      esc(result.proprietaire.forme_juridique || ''),
      sanitizeCsvCell(result.proprietaire.siren || ''),
      result.proprietaire.type === 'personne_morale' ? 'Personne morale' : 'Personne physique',
      esc(prop?.adresse || ''),
      sanitizeCsvCell(prop?.code_postal || ''),
      esc(prop?.ville || ''),
      sanitizeCsvCell(prop?.reference_cadastrale || ''),
      sanitizeCsvCell((prop as any)?.idu || ''),
      sanitizeCsvCell(e.surface_parcelle || ''),
      sanitizeCsvCell(e.derniere_vente?.date || e.date_derniere_transaction || ''),
      sanitizeCsvCell(e.derniere_vente?.prix ?? e.prix_derniere_vente ?? ''),
      esc(e.derniere_vente?.nature || ''),
      sanitizeCsvCell(e.prix_m2 || ''),
      sanitizeCsvCell(e.nb_transactions ?? ''),
      esc(e.type_bien || ''),
      sanitizeCsvCell(e.surface_batie || ''),
      sanitizeCsvCell(e.annee_construction || ''),
      e.est_copropriete ? 'Oui' : 'Non'
    ].join(sep)
    const bom = '\uFEFF'
    const blob = new Blob([bom + headers + '\n' + row], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(result.proprietaire.denomination || 'proprietaire').replace(/[^a-zA-Z0-9]/g, '_')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('Fiche exportée !')
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Building2 className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Aucun résultat. Modifiez vos critères de recherche.</p>
      </div>
    )
  }

  return (
    <>
      {/* Select all header */}
      {selectedResults && onSelectionChange && (
        <div className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-muted/30 mb-2">
          <Checkbox
            checked={allSelected || false}
            onCheckedChange={handleSelectAll}
            aria-label="Tout sélectionner"
          />
          <span className="text-xs font-medium text-muted-foreground">
            {selectedResults.size > 0
              ? `${selectedResults.size} sélectionné${selectedResults.size > 1 ? 's' : ''}`
              : 'Tout sélectionner'}
          </span>
          {selectedResults.size > 0 && (
            <button
              onClick={() => onSelectionChange(new Set())}
              className="text-xs text-blue-600 hover:underline ml-auto"
            >
              Désélectionner
            </button>
          )}
        </div>
      )}
      <div className="space-y-2">
        {results.map((result, index) => {
          const enrichissement = (result as any).enrichissement
          const expanded = expandedIds.has(index)
          const dirigeant = result.entreprise?.dirigeants ? formatDirigeant(result.entreprise.dirigeants) : result.proprietaire.dirigeant || ''
          
          return (
            <div key={result.id || index} id={`result-${index}`} className={`border rounded-lg bg-background overflow-hidden transition-all duration-500 ${highlightedIndex === index ? 'border-blue-500 ring-2 ring-blue-300' : ''}`}>
              {/* Header compact */}
              <div className="flex items-start gap-2 p-3">
                {selectedResults && onSelectionChange && (
                  <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedResults.has(index)}
                      onCheckedChange={(checked) => handleSelectRow(index, checked as boolean)}
                      aria-label={`Sélectionner ${result.proprietaire.denomination}`}
                    />
                  </div>
                )}
                <button
                  onClick={() => toggleExpand(index)}
                  className="w-full text-left hover:bg-muted/50 transition-colors rounded flex-1 min-w-0"
                >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Ligne 1 : Nom + badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {result.proprietaire.type === 'personne_morale' ? (
                        <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                      )}
                      <span className="font-semibold text-sm truncate">{result.proprietaire.denomination}</span>
                      {enrichissement?.type_bien && <TypeBadge type={enrichissement.type_bien} />}
                      {enrichissement?.est_copropriete && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                          Copro {enrichissement.nb_lots_total ? `(${enrichissement.nb_lots_total} lots)` : ''}
                        </span>
                      )}
                    </div>
                    
                    {/* Ligne 2 : Infos clés */}
                    <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {result.proprietaire.forme_juridique && (
                        <span className="truncate max-w-[120px] sm:max-w-none">{mapFormeJuridique(result.proprietaire.forme_juridique)}</span>
                      )}
                      {result.proprietaire.siren && (
                        <span className="font-mono">{result.proprietaire.siren}</span>
                      )}
                      {dirigeant && (
                        <span className="flex items-center gap-0.5 truncate max-w-[150px] sm:max-w-none">
                          <Users className="h-3 w-3 shrink-0" /> {dirigeant}
                        </span>
                      )}
                    </div>

                    {/* Ligne 3 : Données enrichies — Transaction + Immeuble */}
                    {enrichissement && (
                      <div className="mt-1.5 text-xs space-y-0.5">
                        {/* Groupe 1 : Dernière transaction */}
                        {(enrichissement.surface_lots_carrez || enrichissement.surface_batie || enrichissement.prix_m2) && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wide">Transaction :</span>
                            {(enrichissement.surface_lots_carrez || enrichissement.surface_batie) && (
                              <span className="text-muted-foreground">
                                {(enrichissement.surface_lots_carrez || enrichissement.surface_batie).toLocaleString()}m² {enrichissement.surface_lots_carrez ? 'Carrez' : 'bâti'}
                              </span>
                            )}
                            {(enrichissement.surface_lots_carrez || enrichissement.surface_batie) && enrichissement.prix_m2 && (
                              <span className="text-muted-foreground">·</span>
                            )}
                            {enrichissement.prix_m2 && (
                              <span className="font-medium text-green-700 dark:text-green-400">
                                {enrichissement.prix_m2.toLocaleString()}€/m²{enrichissement.type_transaction ? ` (${enrichissement.type_transaction === 'Maison' ? 'maison' : enrichissement.type_transaction === 'Appartement' ? 'appt' : 'local comm.'})` : ''}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Groupe 2 : Immeuble */}
                        {(enrichissement.surface_parcelle || enrichissement.annee_construction || enrichissement.nb_logements) && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wide">Immeuble :</span>
                            {enrichissement.surface_parcelle && (
                              <span className="text-muted-foreground">{enrichissement.surface_parcelle.toLocaleString()}m² parcelle</span>
                            )}
                            {enrichissement.surface_parcelle && enrichissement.annee_construction && (
                              <span className="text-muted-foreground">·</span>
                            )}
                            {enrichissement.annee_construction && (
                              <span className="text-muted-foreground">{enrichissement.annee_construction}</span>
                            )}
                            {(enrichissement.surface_parcelle || enrichissement.annee_construction) && enrichissement.nb_logements && (
                              <span className="text-muted-foreground">·</span>
                            )}
                            {enrichissement.nb_logements && (
                              <span className="text-muted-foreground">{enrichissement.nb_logements} logements</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ligne 4 : Première adresse */}
                    {result.proprietes[0] && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{result.proprietes[0].adresse} {result.proprietes[0].code_postal} {result.proprietes[0].ville}</span>
                        {result.nombre_adresses > 1 && (
                          <span className="text-blue-600 shrink-0">+{result.nombre_adresses - 1}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Chevron */}
                  <div className="shrink-0 mt-1">
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              </button>
              {/* Favorite star button */}
              <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => toggleFavorite(result)}
                  disabled={togglingFavorite.has(result.id || result.proprietaire.denomination)}
                  className="p-1 rounded-md hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                  title={favoriteIds.has(result.id || result.proprietaire.denomination) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Star
                    className={`h-4 w-4 transition-colors ${
                      favoriteIds.has(result.id || result.proprietaire.denomination)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300 hover:text-yellow-400'
                    } ${togglingFavorite.has(result.id || result.proprietaire.denomination) ? 'animate-pulse' : ''}`}
                  />
                </button>
              </div>
              </div>

              {/* Détails expandés */}
              {expanded && (
                <div className="border-t px-3 pb-3 space-y-3">
                  {/* Bloc 1 : Immeuble */}
                  {enrichissement && (enrichissement.type_bien || enrichissement.annee_construction || enrichissement.nb_niveaux || enrichissement.nb_logements || enrichissement.surface_parcelle || enrichissement.surface_batie) && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
                      <div className="col-span-2 font-medium text-blue-900 dark:text-blue-200 flex items-center gap-1 text-xs mb-1">
                        <Building2 className="h-3 w-3" /> 🏢 Immeuble
                      </div>
                      {enrichissement.type_bien && (
                        <div className="col-span-2"><span className="text-muted-foreground">Type :</span> <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{enrichissement.type_bien}</Badge></div>
                      )}
                      {enrichissement.annee_construction && <div><span className="text-muted-foreground">Construction :</span> {enrichissement.annee_construction}</div>}
                      {enrichissement.nb_niveaux && <div><span className="text-muted-foreground">Niveaux :</span> {enrichissement.nb_niveaux}</div>}
                      {enrichissement.nb_logements && <div><span className="text-muted-foreground">Logements :</span> {enrichissement.nb_logements}</div>}
                      {enrichissement.surface_parcelle && <div><span className="text-muted-foreground">Surface parcelle :</span> {enrichissement.surface_parcelle.toLocaleString()} m²</div>}
                      {enrichissement.surface_batie && <div><span className="text-muted-foreground">Surface bâtie :</span> {enrichissement.surface_batie.toLocaleString()} m²</div>}
                    </div>
                  )}

                  {/* Bloc 2 : Copropriété (seulement si est_copropriete) */}
                  {enrichissement && enrichissement.est_copropriete && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs bg-orange-50 dark:bg-orange-950/30 p-3 rounded-lg">
                      <div className="col-span-2 font-medium text-orange-900 dark:text-orange-200 flex items-center gap-1 text-xs mb-1">
                        <Layers className="h-3 w-3" /> 📋 Copropriété
                      </div>
                      {enrichissement.nom_copropriete && (
                        <div className="col-span-2"><span className="text-muted-foreground">Nom :</span> {enrichissement.nom_copropriete.replace(/[{}\"]/g, '')}</div>
                      )}
                      {enrichissement.nb_lots_total && (
                        <div className="col-span-2"><span className="text-muted-foreground">Lots total :</span> {enrichissement.nb_lots_total}</div>
                      )}
                      {(enrichissement.nb_lots_habitation || enrichissement.nb_lots_tertiaire) && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Ventilation :</span>
                          {enrichissement.nb_lots_habitation ? ` ${enrichissement.nb_lots_habitation} habitation` : ''}
                          {enrichissement.nb_lots_habitation && enrichissement.nb_lots_tertiaire ? ',' : ''}
                          {enrichissement.nb_lots_tertiaire ? ` ${enrichissement.nb_lots_tertiaire} tertiaire/commerce` : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bloc 3 : Lots du propriétaire (uniquement nombre de lots) */}
                  {result.nombre_lots && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs bg-green-50 dark:bg-green-950/30 p-3 rounded-lg">
                      <div className="col-span-2 font-medium text-green-900 dark:text-green-200 flex items-center gap-1 text-xs mb-1">
                        <Home className="h-3 w-3" /> 🏠 Lots du propriétaire
                      </div>
                      <div><span className="text-muted-foreground">Lots possédés :</span> <span className="font-semibold">{result.nombre_lots}</span></div>
                    </div>
                  )}

                  {/* Bloc 4 : Parcelle cadastrale */}
                  {(() => {
                    const parcelles = (result.proprietes || []).filter((p: any) => p.idu || p.reference_cadastrale)
                    if (parcelles.length === 0) return null
                    return (
                      <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg">
                        <div className="font-medium text-slate-900 dark:text-slate-200 flex items-center gap-1 text-xs mb-2">
                          <MapPin className="h-3 w-3" /> 📐 Parcelle{parcelles.length > 1 ? 's' : ''} cadastrale{parcelles.length > 1 ? 's' : ''}
                        </div>
                        <div className="space-y-1.5">
                          {parcelles.slice(0, 5).map((p: any, i: number) => (
                            <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                              <span className="font-mono text-[11px] font-semibold">
                                {p.reference_cadastrale || p.idu}
                              </span>
                              {p.idu && (
                                <span className="text-muted-foreground text-[10px] font-mono">IDU {p.idu}</span>
                              )}
                              {p.surface_parcelle_m2 ? (
                                <span className="text-muted-foreground">
                                  {p.surface_parcelle_m2.toLocaleString()} m²
                                </span>
                              ) : null}
                              {p.code_postal && (
                                <span className="text-muted-foreground">{p.code_postal} {p.ville}</span>
                              )}
                            </div>
                          ))}
                          {parcelles.length > 5 && (
                            <div className="text-muted-foreground">
                              et {parcelles.length - 5} autre{parcelles.length - 5 > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Bloc 5 : Dernière vente enregistrée (DVF) */}
                  {enrichissement && (enrichissement.derniere_vente || enrichissement.prix_m2 || enrichissement.nb_transactions > 0) && (
                    <div className="mt-2 text-xs bg-indigo-50 dark:bg-indigo-950/30 p-3 rounded-lg">
                      <div className="font-medium text-indigo-900 dark:text-indigo-200 flex items-center gap-1 text-xs mb-2">
                        <Euro className="h-3 w-3" /> 📈 Valeurs foncières (DVF)
                      </div>

                      {enrichissement.derniere_vente ? (
                        <div className="mb-2">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-muted-foreground">Dernière vente :</span>
                            <span className="text-base font-bold text-indigo-700 dark:text-indigo-300">
                              {Number(enrichissement.derniere_vente.prix).toLocaleString('fr-FR')} €
                            </span>
                            {enrichissement.derniere_vente.date && (
                              <span className="text-muted-foreground">
                                le {new Date(enrichissement.derniere_vente.date).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {enrichissement.derniere_vente.nature && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {enrichissement.derniere_vente.nature}
                              </Badge>
                            )}
                            {enrichissement.derniere_vente.type_local && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {enrichissement.derniere_vente.type_local}
                              </Badge>
                            )}
                            {enrichissement.derniere_vente.foncier_nu && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Terrain nu
                              </Badge>
                            )}
                            {enrichissement.derniere_vente.prix_partage && (
                              // Le prix DVF couvre la mutation entiere : quand elle
                              // porte sur plusieurs parcelles, il n'est pas imputable
                              // a celle-ci seule. Le dire plutot que d'induire en erreur.
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-700 dark:text-amber-400">
                                Prix portant sur plusieurs parcelles
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        {enrichissement.prix_m2 ? (
                          <div>
                            <span className="text-muted-foreground">Prix au m² :</span>{' '}
                            <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                              {Number(enrichissement.prix_m2).toLocaleString('fr-FR')} €
                            </span>
                          </div>
                        ) : null}
                        {enrichissement.derniere_vente?.surface_bati ? (
                          <div>
                            <span className="text-muted-foreground">Surface bâtie vendue :</span>{' '}
                            {Number(enrichissement.derniere_vente.surface_bati).toLocaleString('fr-FR')} m²
                          </div>
                        ) : null}
                        {enrichissement.derniere_vente?.surface_terrain ? (
                          <div>
                            <span className="text-muted-foreground">Terrain :</span>{' '}
                            {Number(enrichissement.derniere_vente.surface_terrain).toLocaleString('fr-FR')} m²
                          </div>
                        ) : null}
                        {enrichissement.derniere_vente?.nombre_pieces ? (
                          <div>
                            <span className="text-muted-foreground">Pièces :</span>{' '}
                            {enrichissement.derniere_vente.nombre_pieces}
                          </div>
                        ) : null}
                        {enrichissement.nb_transactions > 0 && (
                          <div>
                            <span className="text-muted-foreground">Transactions connues :</span>{' '}
                            {enrichissement.nb_transactions}
                            {enrichissement.premiere_transaction
                              ? ` depuis ${String(enrichissement.premiere_transaction).slice(0, 4)}`
                              : ''}
                          </div>
                        )}
                      </div>

                      {/* Historique */}
                      {Array.isArray(enrichissement.historique_ventes) &&
                        enrichissement.historique_ventes.length > 1 && (
                          <div className="mt-2 border-t border-indigo-200 dark:border-indigo-900 pt-2">
                            <div className="text-muted-foreground mb-1">Historique des ventes</div>
                            <div className="space-y-0.5">
                              {enrichissement.historique_ventes
                                .slice(0, 6)
                                .map((v: any, i: number) => (
                                  <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="font-mono text-[11px]">
                                      {v.date ? new Date(v.date).toLocaleDateString('fr-FR') : '—'}
                                    </span>
                                    <span className="font-semibold">
                                      {Number(v.prix).toLocaleString('fr-FR')} €
                                    </span>
                                    {v.prix_m2 ? (
                                      <span className="text-muted-foreground">
                                        {Number(v.prix_m2).toLocaleString('fr-FR')} €/m²
                                      </span>
                                    ) : null}
                                    {v.nature && (
                                      <span className="text-muted-foreground text-[10px]">{v.nature}</span>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                      {/* Une source indisponible n'est pas une absence de donnee. */}
                      {enrichissement.sources && enrichissement.sources.dvf === false && (
                        <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                          Données de ventes temporairement indisponibles.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Entreprise */}
                  {result.entreprise && (
                    <div className="text-xs space-y-1.5 bg-muted/50 p-3 rounded-lg">
                      <div className="font-medium flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entreprise</div>
                      {result.entreprise.dirigeants && result.entreprise.dirigeants.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Dirigeant{result.entreprise.dirigeants.length > 1 ? 's' : ''} :</span>
                          <ul className="mt-1 space-y-0.5 ml-3">
                            {result.entreprise.dirigeants.map((d: any, i: number) => {
                              const name = formatDirigeantName(d)
                              const role = d.qualite || d.fonction || ''
                              return (
                                <li key={i} className="flex items-baseline gap-1">
                                  <span className="font-medium">{name}</span>
                                  {role && <span className="text-muted-foreground">— {role}</span>}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                      {result.entreprise.siege?.adresse && (
                        <div><span className="text-muted-foreground">Siège :</span> {result.entreprise.siege.adresse} {result.entreprise.siege.code_postal} {result.entreprise.siege.commune}</div>
                      )}
                      <div className="flex gap-3 flex-wrap">
                        {result.entreprise.categorie_entreprise && <span><span className="text-muted-foreground">Cat :</span> {result.entreprise.categorie_entreprise}</span>}
                        {result.entreprise.tranche_effectif && <span><span className="text-muted-foreground">Effectifs :</span> {result.entreprise.tranche_effectif}</span>}
                        {result.entreprise.forme_juridique && <span><span className="text-muted-foreground">Forme :</span> {result.entreprise.forme_juridique}</span>}
                      </div>
                    </div>
                  )}

                  {/* Propriétés */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {result.proprietes.length} propriété{result.proprietes.length > 1 ? 's' : ''} • {result.nombre_lots} lot{result.nombre_lots > 1 ? 's' : ''}
                    </div>
                    <ScrollArea className="max-h-40">
                      <div className="space-y-1">
                        {result.proprietes.map((prop, j) => (
                          <div key={j} className="text-xs border rounded p-2 bg-muted/20 flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="truncate">{prop.adresse}</div>
                              <div className="text-muted-foreground">{prop.code_postal} {prop.ville}</div>
                            </div>
                            {prop.reference_cadastrale && (
                              <Badge variant="outline" className="text-[10px] shrink-0">{prop.reference_cadastrale}</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {result.id && !result.revealed && (
                      <Button size="sm" className="text-xs h-7" onClick={() => handleReveal(result)} disabled={revealingIds.has(result.id!)}>
                        {revealingIds.has(result.id!) ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1" />Révélation...</> : <><Eye className="h-3 w-3 mr-1" />Révéler</>}
                      </Button>
                    )}
                    <Link href={(() => {
                        const d = result.entreprise?.dirigeants?.[0];
                        const prenom = d?.type === 'personne_physique' ? (d.prenoms || '').split(' ')[0] : '';
                        const nom = d?.type === 'personne_physique' ? (d.nom || '') : '';
                        const params = new URLSearchParams({
                          dest_societe: result.proprietaire.denomination || '',
                          dest_prenom: prenom,
                          dest_nom: nom,
                          dest_adresse: result.proprietaire.adresse || result.proprietes[0]?.adresse || '',
                          dest_cp: result.proprietaire.code_postal || result.proprietes[0]?.code_postal || '',
                          dest_ville: result.proprietaire.ville || result.proprietes[0]?.ville || '',
                          bien_adresse: result.proprietes[0]?.adresse || '',
                          bien_cp: result.proprietes[0]?.code_postal || '',
                          bien_ville: result.proprietes[0]?.ville || '',
                        });
                        return `/dashboard/courrier?${params.toString()}`;
                      })()}>
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <Mail className="h-3 w-3 mr-1" />Courrier
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setAddToListResult(result); fetchLists() }}>
                      <Plus className="h-3 w-3 mr-1" />Liste
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => exportSingleResult(result)}>
                      <Download className="h-3 w-3 mr-1" />Exporter
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Dialog Ajouter à une liste */}
      <Dialog open={!!addToListResult} onOpenChange={(open) => { if (!open) setAddToListResult(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>📋 Ajouter à une liste</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {addToListResult && (
              <p className="text-sm text-muted-foreground">
                Ajouter <strong>{addToListResult.proprietaire.denomination}</strong> à une liste
              </p>
            )}

            {/* Listes existantes */}
            {listsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement des listes...</p>
            ) : lists.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Listes existantes :</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {lists.map((list: any) => (
                    <Button
                      key={list.id}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => handleAddToList(list.id)}
                    >
                      {list.name} {list.count !== undefined && <span className="ml-auto text-muted-foreground">({list.count})</span>}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune liste existante.</p>
            )}

            {/* Créer nouvelle liste */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Ou créer une nouvelle liste :</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Nom de la liste..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateListAndAdd()}
                />
                <Button size="sm" onClick={handleCreateListAndAdd} disabled={!newListName.trim()}>
                  Créer
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
