'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DashboardLink {
    url: string
    type: 'PAGO' | 'BONIFICADO'
}

export interface AdOpsDashboard {
    id: string
    client: string
    campaignName: string
    pi: string
    agency?: string
    mediaType?: string // PORTAL, RADIO, PAINEL
    adOpsStatus?: string // CONCLUIDA, PAUSADA, PROGRAMADA, ATIVA
    flightStart: Date | null
    flightEnd: Date | null
    manualDashboardUrl: string | null
    createdAt: Date
    links?: DashboardLink[]
}

// ---------------------------------------------------------------------------
// Tab Mapping (GIDs da planilha)
// ---------------------------------------------------------------------------
const SPREADSHEET_ID = '1qVJeURbjU-RotNJho4QX2OsoKLrhxmi4hcffoM5ZddE'
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`

const TAB_MAP: Record<string, string> = {
    '07/25': '452617621',
    '08/25': '1966519621',
    '09/25': '2078129358',
    '10/25': '2104598902',
    '11/25': '453044165',
    '12/25': '1440222170',
    '01/26': '154849430',
    '02/26': '1454293673',
    '03/26': '577504412',
    '04/26': '1073679449',
    '05/26': '1300116486',
}

// ---------------------------------------------------------------------------
// CSV Parser (lida com campos entre aspas)
// ---------------------------------------------------------------------------
function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
            else { inQuotes = !inQuotes }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim()); current = ''
        } else { current += char }
    }
    result.push(current.trim())
    return result
}

function parseDateSafe(d: string): Date | null {
    if (!d || d.trim() === '') return null
    const clean = d.trim().replace(/"/g, '')
    const parts = clean.split('/')
    if (parts.length === 3) {
        const [day, month, year] = parts
        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`)
        if (!isNaN(date.getTime())) return date
    }
    return null
}

function parseMediaType(raw: string): string {
    const upper = (raw || '').toUpperCase()
    if (upper.includes('RÁDIO') || upper.includes('RADIO')) return 'RADIO'
    if (upper.includes('PAINEL')) return 'PAINEL'
    return 'PORTAL'
}

// ---------------------------------------------------------------------------
// Actions — Leitura (DB-First)
// ---------------------------------------------------------------------------

/** Get all AdOps dashboards from the database */
export async function getAdOpsDashboards(): Promise<AdOpsDashboard[]> {
    try {
        const dashboards = await prisma.campaign.findMany({
            where: {
                segmentation: 'AD_OPS_HUB',
                isArchived: false
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return dashboards.map(d => ({
            id: d.id,
            client: d.client,
            campaignName: d.campaignName,
            pi: d.pi,
            agency: d.agency,
            mediaType: d.mediaType || 'PORTAL',
            adOpsStatus: d.adOpsStatus || 'ATIVA',
            flightStart: d.flightStart,
            flightEnd: d.flightEnd,
            manualDashboardUrl: d.manualDashboardUrl,
            createdAt: d.createdAt,
            links: (d.compositionBox as Record<string, unknown>)?.links as DashboardLink[] || []
        }))
    } catch (error) {
        console.error('Failed to get AdOps dashboards:', error)
        return []
    }
}

/** Aggregated metrics for the page component */
export async function getAggregatedAdOpsMetrics() {
    const dashboards = await getAdOpsDashboards()
    return {
        total: dashboards.length,
        campaigns: dashboards
    }
}

// ---------------------------------------------------------------------------
// Actions — CRUD
// ---------------------------------------------------------------------------

/** Bulk Save Dashboards (from Spreadsheet) */
export async function bulkSaveAdOpsDashboards(dashboards: Partial<AdOpsDashboard>[]) {
    try {
        let count = 0
        for (const dash of dashboards) {
            const existing = await prisma.campaign.findFirst({
                where: { pi: dash.pi, segmentation: 'AD_OPS_HUB' }
            })
            if (existing) {
                await saveAdOpsDashboard({ ...dash, id: existing.id })
            } else {
                await saveAdOpsDashboard(dash)
            }
            count++
        }
        revalidatePath('/adops')
        return { success: true, count }
    } catch (error) {
        console.error('Failed to bulk save AdOps dashboards:', error)
        return { success: false, error: 'Erro ao importar dashboards' }
    }
}

/** Create or Update a dashboard in the hub */
export async function saveAdOpsDashboard(data: Partial<AdOpsDashboard>) {
    try {
        if (!data.pi || !data.client || !data.campaignName) {
            return { success: false, error: 'Dados obrigatórios faltando (PI, Cliente, Campanha)' }
        }

        const payload = {
            client: data.client,
            campaignName: data.campaignName,
            pi: data.pi,
            agency: data.agency || 'Interno',
            flightStart: data.flightStart,
            flightEnd: data.flightEnd,
            mediaType: data.mediaType || 'PORTAL',
            adOpsStatus: data.adOpsStatus || 'ATIVA',
            manualDashboardUrl: data.links?.[0]?.url || data.manualDashboardUrl,
            compositionBox: { links: data.links || [] } as any,
            updatedAt: new Date()
        }

        if (data.id) {
            await prisma.campaign.update({
                where: { id: data.id },
                data: payload
            })
        } else {
            await prisma.campaign.create({
                data: {
                    ...payload,
                    segmentation: 'AD_OPS_HUB',
                    format: 'Link',
                    url: data.links?.[0]?.url || data.manualDashboardUrl || 'https://',
                    status: 'ACTIVE'
                }
            })
        }
        revalidatePath('/adops')
        return { success: true }
    } catch (error) {
        console.error('Failed to save AdOps dashboard:', error)
        return { success: false, error: 'Erro ao salvar dashboard' }
    }
}

/** Delete a dashboard from the hub */
export async function deleteAdOpsDashboard(id: string) {
    try {
        await prisma.campaign.delete({
            where: { id }
        })
        revalidatePath('/adops')
        return { success: true }
    } catch (error) {
        console.error('Failed to delete AdOps dashboard:', error)
        return { success: false, error: 'Erro ao deletar dashboard' }
    }
}

// ---------------------------------------------------------------------------
// Sync Incremental — busca apenas 1 aba por vez e compara com o banco
// ---------------------------------------------------------------------------

export interface SyncResult {
    success: boolean
    inserted: number
    updated: number
    unchanged: number
    errors: number
    tabName: string
    error?: string
}

/** Sincronização incremental: busca UMA aba da planilha e atualiza apenas o que mudou */
export async function syncIncrementalFromSheet(period: string): Promise<SyncResult> {
    const gid = TAB_MAP[period]
    if (!gid) {
        return { success: false, inserted: 0, updated: 0, unchanged: 0, errors: 0, tabName: period, error: `Período "${period}" não encontrado no mapa de abas.` }
    }

    try {
        console.log(`[SYNC] Buscando dados do Pro Hub...`)

        const response = await fetch(`${BASE_URL}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(15000)
        })

        if (!response.ok) {
            return { success: false, inserted: 0, updated: 0, unchanged: 0, errors: 0, tabName: period, error: `HTTP ${response.status} ao buscar planilha` }
        }

        const csvText = await response.text()
        const lines = csvText.trim().split(/\r?\n/)

        let inserted = 0
        let updated = 0
        let unchanged = 0
        let errors = 0

        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i])
            const pi = cols[0]?.trim()
            const client = cols[2]?.trim()
            if (!pi || !client) continue

            const incomingData = {
                pi,
                mediaType: parseMediaType(cols[1] || ''),
                client: cols[2]?.trim(),
                agency: cols[3]?.trim() || 'Interno',
                campaignName: cols[4]?.trim() || `Campanha ${pi}`,
                flightStart: parseDateSafe(cols[7] || ''), // Adaptar se a nova planilha tiver colunas diferentes
                flightEnd: parseDateSafe(cols[8] || ''),
                adOpsStatus: cols[10]?.trim().toUpperCase() || 'ATIVA',
            }

            try {
                const existing = await prisma.campaign.findFirst({
                    where: { pi, segmentation: 'AD_OPS_HUB' }
                })

                if (existing) {
                    // Verifica se algo realmente mudou
                    const hasChanges =
                        existing.client !== incomingData.client ||
                        existing.campaignName !== incomingData.campaignName ||
                        existing.agency !== incomingData.agency ||
                        existing.mediaType !== incomingData.mediaType ||
                        existing.adOpsStatus !== incomingData.adOpsStatus ||
                        existing.flightStart?.toISOString() !== incomingData.flightStart?.toISOString() ||
                        existing.flightEnd?.toISOString() !== incomingData.flightEnd?.toISOString()

                    if (hasChanges) {
                        await prisma.campaign.update({
                            where: { id: existing.id },
                            data: {
                                ...incomingData,
                                updatedAt: new Date()
                            }
                        })
                        updated++
                    } else {
                        unchanged++
                    }
                } else {
                    // Registro novo — inserir
                    await prisma.campaign.create({
                        data: {
                            ...incomingData,
                            segmentation: 'AD_OPS_HUB',
                            format: 'Link',
                            url: 'https://',
                            status: 'ACTIVE',
                        }
                    })
                    inserted++
                }
            } catch (err) {
                console.error(`[SYNC] Erro ao processar PI ${pi}:`, (err as Error).message)
                errors++
            }
        }

        revalidatePath('/adops')

        console.log(`[SYNC] Aba ${period}: +${inserted} novos, ~${updated} atualizados, =${unchanged} sem mudança, x${errors} erros`)

        return { success: true, inserted, updated, unchanged, errors, tabName: period }
    } catch (error) {
        console.error('[SYNC] Erro na sincronização:', error)
        return { success: false, inserted: 0, updated: 0, unchanged: 0, errors: 0, tabName: period, error: (error as Error).message }
    }
}
