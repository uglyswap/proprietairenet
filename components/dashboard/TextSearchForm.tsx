'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Search, MapPin, Building2, Hash, Map, SlidersHorizontal, Home, Euro, Ruler, Layers, X } from 'lucide-react'

interface SearchParams {
  adresse?: string
  siren?: string
  denomination?: string
  code_postal?: string
  departement?: string
  limit?: number
  // Filtres enrichissement
  type_bien?: string[]
  surface_min?: number
  surface_max?: number
  prix_m2_min?: number
  prix_m2_max?: number
  copropriete?: string
}

interface TextSearchFormProps {
  onSearch: (params: SearchParams) => void
  loading: boolean
}

export default function TextSearchForm({ onSearch, loading }: TextSearchFormProps) {
  const [adresse, setAdresse] = useState('')
  const [siren, setSiren] = useState('')
  const [denomination, setDenomination] = useState('')
  const [codePostal, setCodePostal] = useState('')
  const [departement, setDepartement] = useState('')
  const [limit, setLimit] = useState(200)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Filtres enrichissement
  const [typeBien, setTypeBien] = useState<string[]>([])
  const [surfaceRange, setSurfaceRange] = useState<[number, number]>([0, 5000])
  const [prixM2Range, setPrixM2Range] = useState<[number, number]>([0, 20000])
  const [copropriete, setCopropriete] = useState<string>('tous')

  const activeFilterCount = [
    typeBien.length > 0,
    surfaceRange[0] > 0 || surfaceRange[1] < 5000,
    prixM2Range[0] > 0 || prixM2Range[1] < 20000,
    copropriete !== 'tous',
  ].filter(Boolean).length

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params: SearchParams = { limit }
    if (adresse.trim()) params.adresse = adresse.trim()
    if (siren.trim()) params.siren = siren.trim()
    if (denomination.trim()) params.denomination = denomination.trim()
    if (codePostal.trim()) params.code_postal = codePostal.trim()
    if (departement.trim()) params.departement = departement.trim()
    if (typeBien.length > 0) params.type_bien = typeBien
    if (surfaceRange[0] > 0) params.surface_min = surfaceRange[0]
    if (surfaceRange[1] < 5000) params.surface_max = surfaceRange[1]
    if (prixM2Range[0] > 0) params.prix_m2_min = prixM2Range[0]
    if (prixM2Range[1] < 20000) params.prix_m2_max = prixM2Range[1]
    if (copropriete !== 'tous') params.copropriete = copropriete
    onSearch(params)
  }

  const handleReset = () => {
    setAdresse('')
    setSiren('')
    setDenomination('')
    setCodePostal('')
    setDepartement('')
    setLimit(50)
    setTypeBien([])
    setSurfaceRange([0, 5000])
    setPrixM2Range([0, 20000])
    setCopropriete('tous')
  }

  const toggleTypeBien = (type: string) => {
    setTypeBien(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  const departements = [
    {value:'01',label:'01 - Ain'},{value:'02',label:'02 - Aisne'},{value:'03',label:'03 - Allier'},
    {value:'04',label:'04 - Alpes-de-Hte-Provence'},{value:'05',label:'05 - Hautes-Alpes'},{value:'06',label:'06 - Alpes-Maritimes'},
    {value:'07',label:'07 - Ardèche'},{value:'08',label:'08 - Ardennes'},{value:'09',label:'09 - Ariège'},
    {value:'10',label:'10 - Aube'},{value:'11',label:'11 - Aude'},{value:'12',label:'12 - Aveyron'},
    {value:'13',label:'13 - Bouches-du-Rhône'},{value:'14',label:'14 - Calvados'},{value:'15',label:'15 - Cantal'},
    {value:'16',label:'16 - Charente'},{value:'17',label:'17 - Charente-Maritime'},{value:'18',label:'18 - Cher'},
    {value:'19',label:'19 - Corrèze'},{value:'2A',label:'2A - Corse-du-Sud'},{value:'2B',label:'2B - Haute-Corse'},
    {value:'21',label:'21 - Côte-d\'Or'},{value:'22',label:'22 - Côtes-d\'Armor'},{value:'23',label:'23 - Creuse'},
    {value:'24',label:'24 - Dordogne'},{value:'25',label:'25 - Doubs'},{value:'26',label:'26 - Drôme'},
    {value:'27',label:'27 - Eure'},{value:'28',label:'28 - Eure-et-Loir'},{value:'29',label:'29 - Finistère'},
    {value:'30',label:'30 - Gard'},{value:'31',label:'31 - Haute-Garonne'},{value:'32',label:'32 - Gers'},
    {value:'33',label:'33 - Gironde'},{value:'34',label:'34 - Hérault'},{value:'35',label:'35 - Ille-et-Vilaine'},
    {value:'36',label:'36 - Indre'},{value:'37',label:'37 - Indre-et-Loire'},{value:'38',label:'38 - Isère'},
    {value:'39',label:'39 - Jura'},{value:'40',label:'40 - Landes'},{value:'41',label:'41 - Loir-et-Cher'},
    {value:'42',label:'42 - Loire'},{value:'43',label:'43 - Haute-Loire'},{value:'44',label:'44 - Loire-Atlantique'},
    {value:'45',label:'45 - Loiret'},{value:'46',label:'46 - Lot'},{value:'47',label:'47 - Lot-et-Garonne'},
    {value:'48',label:'48 - Lozère'},{value:'49',label:'49 - Maine-et-Loire'},{value:'50',label:'50 - Manche'},
    {value:'51',label:'51 - Marne'},{value:'52',label:'52 - Haute-Marne'},{value:'53',label:'53 - Mayenne'},
    {value:'54',label:'54 - Meurthe-et-Moselle'},{value:'55',label:'55 - Meuse'},{value:'56',label:'56 - Morbihan'},
    {value:'57',label:'57 - Moselle'},{value:'58',label:'58 - Nièvre'},{value:'59',label:'59 - Nord'},
    {value:'60',label:'60 - Oise'},{value:'61',label:'61 - Orne'},{value:'62',label:'62 - Pas-de-Calais'},
    {value:'63',label:'63 - Puy-de-Dôme'},{value:'64',label:'64 - Pyrénées-Atlantiques'},{value:'65',label:'65 - Hautes-Pyrénées'},
    {value:'66',label:'66 - Pyrénées-Orientales'},{value:'67',label:'67 - Bas-Rhin'},{value:'68',label:'68 - Haut-Rhin'},
    {value:'69',label:'69 - Rhône'},{value:'70',label:'70 - Haute-Saône'},{value:'71',label:'71 - Saône-et-Loire'},
    {value:'72',label:'72 - Sarthe'},{value:'73',label:'73 - Savoie'},{value:'74',label:'74 - Haute-Savoie'},
    {value:'75',label:'75 - Paris'},{value:'76',label:'76 - Seine-Maritime'},{value:'77',label:'77 - Seine-et-Marne'},
    {value:'78',label:'78 - Yvelines'},{value:'79',label:'79 - Deux-Sèvres'},{value:'80',label:'80 - Somme'},
    {value:'81',label:'81 - Tarn'},{value:'82',label:'82 - Tarn-et-Garonne'},{value:'83',label:'83 - Var'},
    {value:'84',label:'84 - Vaucluse'},{value:'85',label:'85 - Vendée'},{value:'86',label:'86 - Vienne'},
    {value:'87',label:'87 - Haute-Vienne'},{value:'88',label:'88 - Vosges'},{value:'89',label:'89 - Yonne'},
    {value:'90',label:'90 - Territoire de Belfort'},{value:'91',label:'91 - Essonne'},{value:'92',label:'92 - Hauts-de-Seine'},
    {value:'93',label:'93 - Seine-Saint-Denis'},{value:'94',label:'94 - Val-de-Marne'},{value:'95',label:'95 - Val-d\'Oise'},
    {value:'971',label:'971 - Guadeloupe'},{value:'972',label:'972 - Martinique'},{value:'973',label:'973 - Guyane'},
    {value:'974',label:'974 - La Réunion'},{value:'976',label:'976 - Mayotte'},
  ]

  const typesBien = [
    { value: 'Résidentiel individuel', label: 'Maison', icon: '🏠' },
    { value: 'Résidentiel collectif', label: 'Appartement', icon: '🏢' },
    { value: 'Tertiaire & Autres', label: 'Tertiaire (bureau/commerce)', icon: '🏬' },
    { value: 'Dépendance', label: 'Dépendance', icon: '🏗️' },
    { value: 'Secondaire', label: 'Résidence secondaire', icon: '🏡' },
  ]

  return (
    <div className="w-full space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Champ principal */}
        <div className="space-y-1.5">
          <Label htmlFor="adresse" className="flex items-center gap-1.5 text-sm font-medium">
            <MapPin className="h-3.5 w-3.5" /> Adresse
          </Label>
          <Input
            id="adresse"
            placeholder="1 rue de la Paix, Paris..."
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Filtres enrichissement */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full text-xs flex items-center gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtres immobiliers
          {activeFilterCount > 0 && (
            <Badge variant="default" className="ml-1 h-4 px-1.5 text-[10px]">{activeFilterCount}</Badge>
          )}
        </Button>

        {showFilters && (
          <div className="space-y-4 border rounded-lg p-3 bg-muted/30">
            {/* Type de bien */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Home className="h-3 w-3" /> Type de bien
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {typesBien.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => toggleTypeBien(type.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      typeBien.includes(type.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {type.icon} {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Surface parcelle */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5"><Ruler className="h-3 w-3" /> Surface parcelle</span>
                <span className="text-muted-foreground font-normal">
                  {surfaceRange[0].toLocaleString()} — {surfaceRange[1] >= 5000 ? '5000+' : surfaceRange[1].toLocaleString()} m²
                </span>
              </Label>
              <Slider
                value={surfaceRange}
                onValueChange={(v) => setSurfaceRange(v as [number, number])}
                min={0}
                max={5000}
                step={50}
                className="py-1"
              />
            </div>

            {/* Prix au m² */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5"><Euro className="h-3 w-3" /> Prix au m²</span>
                <span className="text-muted-foreground font-normal">
                  {prixM2Range[0].toLocaleString()} — {prixM2Range[1] >= 20000 ? '20 000+' : prixM2Range[1].toLocaleString()} €/m²
                </span>
              </Label>
              <Slider
                value={prixM2Range}
                onValueChange={(v) => setPrixM2Range(v as [number, number])}
                min={0}
                max={20000}
                step={500}
                className="py-1"
              />
            </div>

            {/* Copropriété */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Layers className="h-3 w-3" /> Régime de propriété
              </Label>
              <div className="flex gap-1.5">
                {[
                  { value: 'tous', label: 'Tous' },
                  { value: 'copro', label: 'Copropriété' },
                  { value: 'pleine', label: 'Pleine propriété' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCopropriete(opt.value)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      copropriete === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setTypeBien([]); setSurfaceRange([0,5000]); setPrixM2Range([0,20000]); setCopropriete('tous') }}
                className="text-xs text-muted-foreground w-full"
              >
                <X className="h-3 w-3 mr-1" /> Réinitialiser les filtres
              </Button>
            )}
          </div>
        )}

        {/* Champs de recherche complémentaires (toujours visibles) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="denomination" className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Dénomination</Label>
            <Input id="denomination" placeholder="Nom entreprise / propriétaire" value={denomination} onChange={(e) => setDenomination(e.target.value)} className="text-xs h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="siren" className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> SIREN</Label>
            <Input id="siren" placeholder="123456789" value={siren} onChange={(e) => setSiren(e.target.value)} className="text-xs h-8" maxLength={9} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="codePostal" className="text-xs flex items-center gap-1">Code postal</Label>
            <Input id="codePostal" placeholder="75001" value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className="text-xs h-8" maxLength={5} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Map className="h-3 w-3" /> Département</Label>
            <Select value={departement} onValueChange={setDepartement}>
              <SelectTrigger className="text-xs h-8 [&>span]:leading-none"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                {departements.map(d => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Options avancées (limite résultats) */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
        >
          {showAdvanced ? '▲ Masquer options' : '▼ Plus d\'options'}
        </button>

        {showAdvanced && (
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-2">
              <Label className="text-xs">Nombre de résultats : {limit}</Label>
              <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10" className="text-xs">10</SelectItem>
                  <SelectItem value="25" className="text-xs">25</SelectItem>
                  <SelectItem value="50" className="text-xs">50</SelectItem>
                  <SelectItem value="100" className="text-xs">100</SelectItem>
                  <SelectItem value="200" className="text-xs">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Boutons */}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || (!adresse.trim() && !siren.trim() && !denomination.trim())} className="flex-1 text-sm">
            {loading ? (
              <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-1.5"></div>Recherche...</>
            ) : (
              <><Search className="h-3.5 w-3.5 mr-1.5" />Rechercher</>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={loading} className="text-sm">
            Réinitialiser
          </Button>
        </div>
      </form>
    </div>
  )
}
