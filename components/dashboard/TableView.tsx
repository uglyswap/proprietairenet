'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CadastreResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getAuthHeaders } from '@/lib/auth-client'
import { 
  Download, 
  Eye, 
  EyeOff, 
  Building2, 
  User, 
  Hash,
  FileSpreadsheet,
  FileText,
  Mail,
  Plus
} from 'lucide-react'

interface TableViewProps {
  results: CadastreResult[]
  selectedResults: Set<number>
  onSelectionChange: (selection: Set<number>) => void
  onExport: (format: string) => void
  onReveal: (id: string) => Promise<void>
}

export default function TableView({ 
  results, 
  selectedResults, 
  onSelectionChange, 
  onExport, 
  onReveal 
}: TableViewProps) {
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set())
  const [showAddToList, setShowAddToList] = useState(false)
  const [lists, setLists] = useState<any[]>([])
  const [newListName, setNewListName] = useState('')
  const [listsLoading, setListsLoading] = useState(false)
  const router = useRouter()

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(new Set(results.map((_, index) => index)))
    } else {
      onSelectionChange(new Set())
    }
  }

  const handleSelectRow = (index: number, checked: boolean) => {
    const newSelection = new Set(selectedResults)
    if (checked) {
      newSelection.add(index)
    } else {
      newSelection.delete(index)
    }
    onSelectionChange(newSelection)
  }

  const handleReveal = async (result: CadastreResult) => {
    if (!result.id || result.revealed || revealingIds.has(result.id)) return

    setRevealingIds(prev => new Set([...prev, result.id!]))
    
    try {
      await onReveal(result.id)
    } catch (error) {
      console.error('Erreur lors de la révélation:', error)
    } finally {
      setRevealingIds(prev => {
        const next = new Set(prev)
        next.delete(result.id!)
        return next
      })
    }
  }

  const formatAddress = (proprietes: any[]) => {
    if (proprietes.length === 0) return 'N/A'
    const first = proprietes[0]
    const additional = proprietes.length > 1 ? ` (+${proprietes.length - 1})` : ''
    return `${first.adresse}, ${first.code_postal} ${first.ville}${additional}`
  }

  const formatCadastral = (proprietes: any[]) => {
    if (proprietes.length === 0) return 'N/A'
    const first = proprietes[0]
    const additional = proprietes.length > 1 ? ` (+${proprietes.length - 1})` : ''
    
    let result = ''
    if (first.section && first.numero_parcelle) {
      result = `${first.section}-${first.numero_parcelle}`
    } else if (first.reference_cadastrale) {
      result = first.reference_cadastrale
    } else {
      result = 'N/A'
    }
    
    return result + additional
  }

  const formatSurface = (proprietes: any[]) => {
    const totalSurface = proprietes.reduce((sum, prop) => sum + (prop.surface || 0), 0)
    if (totalSurface === 0) return 'N/A'
    return `${totalSurface.toLocaleString()} m²`
  }

  const handleBulkCourrier = () => {
    const selected = results.filter((_, idx) => selectedResults.has(idx))
    // Store in sessionStorage for bulk courrier
    sessionStorage.setItem('bulk_courrier_results', JSON.stringify(selected))
    const ids = selected.map(r => r.id).filter(Boolean).join(',')
    router.push(`/dashboard/courrier?bulk=true&count=${selected.length}&ids=${ids}`)
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

  // Construit le payload attendu par POST /api/lists/items pour un resultat
  const buildListItemPayload = (listId: string, result: CadastreResult) => {
    const firstProp = result.proprietes[0]
    return {
      list_id: listId,
      company_name: result.proprietaire.denomination,
      director_name: result.proprietaire.dirigeant ?? null,
      property_address: firstProp?.adresse ?? null,
      property_postal_code: firstProp?.code_postal ?? null,
      property_city: firstProp?.ville ?? null,
      siren: result.proprietaire.siren ?? null,
      data: result,
    }
  }

  // Ajoute les resultats selectionnes a une liste via POST /api/lists/items (un item par requete)
  const addItemsToList = async (listId: string, items: CadastreResult[]): Promise<number> => {
    const responses = await Promise.all(
      items.map((result) =>
        fetch('/api/lists/items', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(buildListItemPayload(listId, result)),
        })
      )
    )
    return responses.filter((r) => r.ok).length
  }

  const handleBulkAddToList = async (listId: string) => {
    const selected = results.filter((_, idx) => selectedResults.has(idx))
    try {
      const added = await addItemsToList(listId, selected)
      if (added === selected.length) {
        toast.success(`${added} résultat(s) ajouté(s) à la liste !`)
        setShowAddToList(false)
      } else if (added > 0) {
        toast.warning(`${added}/${selected.length} résultat(s) ajouté(s). Certains ont échoué.`)
        setShowAddToList(false)
      } else {
        toast.error("Erreur lors de l'ajout")
      }
    } catch { toast.error('Erreur réseau') }
  }

  const handleBulkCreateListAndAdd = async () => {
    if (!newListName.trim()) return
    const selected = results.filter((_, idx) => selectedResults.has(idx))
    try {
      // 1. Creer la liste (POST /api/lists n'accepte que name/description/color, ignore les items)
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName })
      })
      if (!res.ok) {
        toast.error('Erreur lors de la création')
        return
      }
      // 2. Recuperer l'id de la liste creee et y ajouter les items
      const created = await res.json()
      const listId: string | undefined = created?.list?.id
      if (!listId) {
        toast.error('Erreur lors de la création')
        return
      }
      const added = await addItemsToList(listId, selected)
      if (added === selected.length) {
        toast.success(`Liste "${newListName}" créée avec ${added} résultat(s) !`)
      } else {
        toast.warning(`Liste "${newListName}" créée. ${added}/${selected.length} résultat(s) ajouté(s).`)
      }
      setShowAddToList(false)
      setNewListName('')
    } catch { toast.error('Erreur réseau') }
  }

  const allSelected = results.length > 0 && selectedResults.size === results.length
  const someSelected = selectedResults.size > 0 && selectedResults.size < results.length

  if (results.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun résultat à afficher</h3>
          <p className="text-muted-foreground">
            Effectuez une recherche pour voir les résultats dans cette vue tableau.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Vue tableau ({results.length} résultats)
            </CardTitle>
            
            <div className="flex items-center gap-2">
              {selectedResults.size > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedResults.size} sélectionné{selectedResults.size > 1 ? 's' : ''}
                </span>
              )}
              
              <Button 
                onClick={() => onExport('csv')} 
                variant="outline" 
                size="sm"
                disabled={results.length === 0}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                CSV
              </Button>
              
              <Button 
                onClick={() => onExport('excel')} 
                variant="outline" 
                size="sm"
                disabled={results.length === 0}
                className="flex items-center gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Bulk actions bar */}
        {selectedResults.size > 0 && (
          <div className="mx-6 mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                {selectedResults.size} propriétaire{selectedResults.size > 1 ? 's' : ''} sélectionné{selectedResults.size > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="default" className="text-xs h-7" onClick={handleBulkCourrier}>
                  <Mail className="h-3 w-3 mr-1" />
                  Envoyer un courrier à {selectedResults.size} propriétaire{selectedResults.size > 1 ? 's' : ''}
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onExport('csv')}>
                  <Download className="h-3 w-3 mr-1" />
                  Exporter la sélection
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowAddToList(true); fetchLists() }}>
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter {selectedResults.size} à une liste
                </Button>
                <Button 
                  onClick={() => onSelectionChange(new Set())} 
                  variant="ghost" 
                  size="sm"
                  className="text-xs h-7"
                >
                  Désélectionner
                </Button>
              </div>
            </div>
          </div>
        )}

        <CardContent>
          <div className="w-full overflow-x-auto">
            <div className="min-w-full">
              <Table className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={someSelected ? 'indeterminate' : allSelected}
                        onCheckedChange={(checked) => handleSelectAll(checked === true)}
                        aria-label="Sélectionner tout"
                      />
                    </TableHead>
                    <TableHead className="min-w-[140px]">Propriétaire</TableHead>
                    <TableHead className="min-w-[80px]">Type</TableHead>
                    <TableHead className="min-w-[90px]">SIREN</TableHead>
                    <TableHead className="min-w-[180px]">Adresse principale</TableHead>
                    <TableHead className="min-w-[90px]">Section-Parcelle</TableHead>
                    <TableHead className="min-w-[80px]">Surface totale</TableHead>
                    <TableHead className="min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow 
                      key={result.id || index}
                      className={selectedResults.has(index) ? 'bg-muted/50' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedResults.has(index)}
                          onCheckedChange={(checked) => handleSelectRow(index, checked as boolean)}
                          aria-label={`Sélectionner ${result.proprietaire.denomination}`}
                        />
                      </TableCell>
                      
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium flex items-center gap-2">
                            {result.proprietaire.type === 'personne_morale' ? (
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="truncate" title={result.proprietaire.denomination}>
                              {result.proprietaire.denomination}
                            </span>
                          </div>
                          {result.proprietaire.forme_juridique && (
                            <div className="text-xs text-muted-foreground">
                              {result.proprietaire.forme_juridique}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge 
                          variant={result.proprietaire.type === 'personne_morale' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {result.proprietaire.type === 'personne_morale' ? 'Morale' : 'Physique'}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        {result.proprietaire.siren ? (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs w-fit">
                            <Hash className="h-3 w-3" />
                            {result.proprietaire.siren}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm" title={formatAddress(result.proprietes)}>
                            {formatAddress(result.proprietes)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {result.nombre_adresses} adresse{result.nombre_adresses > 1 ? 's' : ''} • {result.nombre_lots} lot{result.nombre_lots > 1 ? 's' : ''}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <span className="text-sm font-mono">
                          {formatCadastral(result.proprietes)}
                        </span>
                      </TableCell>
                      
                      <TableCell>
                        <span className="text-sm font-medium">
                          {formatSurface(result.proprietes)}
                        </span>
                      </TableCell>
                      
                      <TableCell>
                        {result.id && (
                          <Button
                            onClick={() => handleReveal(result)}
                            disabled={result.revealed || revealingIds.has(result.id!)}
                            size="sm"
                            variant={result.revealed ? "outline" : "default"}
                            className="flex items-center gap-1"
                          >
                            {revealingIds.has(result.id!) ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                <span className="hidden sm:inline">Révélation...</span>
                              </>
                            ) : result.revealed ? (
                              <>
                                <Eye className="h-3 w-3" />
                                <span className="hidden sm:inline">Révélé</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3 w-3" />
                                <span className="hidden sm:inline">
                                  Révéler{result.reveal_cost && ` (${result.reveal_cost})`}
                                </span>
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Footer avec informations de sélection */}
          {selectedResults.size > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {selectedResults.size} élément{selectedResults.size > 1 ? 's' : ''} sélectionné{selectedResults.size > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => onSelectionChange(new Set())} 
                    variant="ghost" 
                    size="sm"
                  >
                    Désélectionner tout
                  </Button>
                  <Button 
                    onClick={() => onExport('csv')} 
                    variant="outline" 
                    size="sm"
                    className="flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Exporter la sélection
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Ajouter à une liste (bulk) */}
      <Dialog open={showAddToList} onOpenChange={setShowAddToList}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>📋 Ajouter {selectedResults.size} résultat{selectedResults.size > 1 ? 's' : ''} à une liste</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                      onClick={() => handleBulkAddToList(list.id)}
                    >
                      {list.name} {list.count !== undefined && <span className="ml-auto text-muted-foreground">({list.count})</span>}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune liste existante.</p>
            )}

            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Ou créer une nouvelle liste :</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Nom de la liste..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleBulkCreateListAndAdd()}
                />
                <Button size="sm" onClick={handleBulkCreateListAndAdd} disabled={!newListName.trim()}>
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
