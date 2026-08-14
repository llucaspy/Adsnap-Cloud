# Storage de Evidencias - Supabase e Google Drive

## Objetivo

O Adsnap agora tem uma camada central para armazenamento de evidencias. O banco continua sendo a fonte de verdade para campanhas, PIs, formatos, datas e status. O arquivo pesado da evidencia pode continuar no Supabase Storage ou ser salvo no Google Drive, dependendo da configuracao do ambiente.

Essa abordagem evita migracao brusca e reduz risco operacional: capturas antigas continuam abrindo, e novas capturas podem ir para o Drive quando as credenciais estiverem configuradas.

## Como funciona

1. O worker captura a evidencia e gera um PNG final.
2. `saveCapture` chama o provider central em `src/lib/captureStorage.ts`.
3. Se `NEXUS_CAPTURE_STORAGE_PROVIDER=google-drive`, o arquivo e enviado ao Google Drive.
4. O banco salva apenas o identificador privado no campo `Capture.screenshotPath`, no formato `gdrive://FILE_ID`.
5. A interface, os books, o ZIP, o e-mail e o Telegram continuam lendo a imagem por `/api/captures/[id]`.
6. A rota `/api/captures/[id]` baixa o arquivo no storage correto e entrega a imagem para o sistema.

## Por que nao salvar link publico do Drive

O Drive deve funcionar como storage privado. O usuario final nao precisa receber permissao direta no arquivo. O Adsnap faz a leitura usando credenciais do servidor e entrega a imagem pela API interna. Assim evitamos links publicos e mantemos rastreabilidade no banco.

## Variaveis de ambiente

Provider padrao:

```env
NEXUS_CAPTURE_STORAGE_PROVIDER=supabase
```

Para ativar Drive:

```env
NEXUS_CAPTURE_STORAGE_PROVIDER=google-drive
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
```

Autenticacao OAuth recomendada:

```env
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
```

O OAuth usa a conta Google autorizada para gravar no Drive e evita a limitacao de cota propria das service accounts.

Autenticacao alternativa por service account:

```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...
```

Quando OAuth e service account existem juntos, o sistema usa OAuth primeiro. Service account deve ser usada preferencialmente com Shared Drive/Workspace; em "Meu Drive" pode falhar por falta de cota propria.

## Estrutura no Drive

Quando Drive estiver ativo, as evidencias sao organizadas assim:

```text
Adsnap Cloud/
  2026/
    08 - Agosto/
      Cliente/
        PI 123456 - Nome da campanha/
          Nome da campanha - PI 123456 - Formato real - device - 2026-08-14 17h50m30s.png
```

Se `GOOGLE_DRIVE_ROOT_FOLDER_ID` estiver definido, essa estrutura nasce dentro da pasta informada. Caso contrario, o provider tenta criar a pasta raiz `Adsnap Cloud`.

A estrutura foi desenhada para auditoria operacional: primeiro o periodo, depois o cliente, depois o PI. Todos os formatos da campanha ficam juntos dentro da pasta do PI, e o nome do arquivo usa campanha, PI, formato legivel e dispositivo. O ID interno do banco fica apenas no app/banco, nao no nome visual do print no Drive.

## Trechos de codigo CORE

### Provider central

Arquivo: `src/lib/captureStorage.ts`

```ts
export async function uploadCaptureImage(imageBuffer: Buffer, input: UploadCaptureInput): Promise<StoredCapture> {
    const provider = getCaptureStorageProvider()
    if (provider === 'google-drive') {
        try {
            return await uploadToGoogleDrive(imageBuffer, input)
        } catch (error) {
            if (!shouldFallbackToSupabase()) throw error

            const fallback = await uploadToSupabase(imageBuffer, input)
            return {
                ...fallback,
                requestedProvider: 'google-drive',
                fallbackReason: error instanceof Error ? error.message : String(error),
            }
        }
    }
    return uploadToSupabase(imageBuffer, input)
}
```

Esse e o ponto de entrada unico para salvar evidencias. Se algum upload parar de funcionar, a primeira investigacao deve comecar aqui.

### Padrao de caminho e nome

Arquivo: `src/lib/captureStorage.ts`

```ts
function captureFolderSegments(campaign: CampaignStorageInfo) {
    const { year } = getBrazilDateParts()

    return [
        year,
        monthFolder(),
        sanitizeSegment(campaign.client, 'Sem cliente'),
        piFolderName(campaign),
    ]
}

function defaultCaptureFileName(input: UploadCaptureInput) {
    const campaignName = sanitizeSegment(input.campaign.campaignName || input.campaign.client, 'Campanha')
    const pi = sanitizeSegment(input.campaign.pi, 'sem-pi')
    const format = readableFormatName(input.campaign)
    const device = sanitizeSegment(input.campaign.device, 'device')
    return `${campaignName} - PI ${pi} - ${format} - ${device} - ${captureTimestamp()}.png`
}
```

Esse trecho define a organizacao visual do Drive. Se um cliente pedir outro padrao de pastas, alterar aqui primeiro.

O fallback para Supabase e proposital: se o Drive estiver sem permissao, cota ou responder erro temporario, a captura nao deve ser perdida. O log do Nexus informa que o Google Drive ficou indisponivel e registra o motivo em `fallbackReason`.

### Contrato de leitura

Arquivo: `src/app/api/captures/[id]/route.ts`

```ts
const fileBuffer = await loadCaptureFile(capture.screenshotPath)
```

Essa rota e o proxy oficial de imagem. Books, cards e futuras integracoes devem preferir `/api/captures/[id]` em vez de acessar Supabase ou Drive diretamente.

### Persistencia da captura

Arquivo: `src/lib/captureService.ts`

```ts
const storedCapture = await uploadCaptureImage(imageBuffer, { campaign, campaignId })
const publicUrl = storedCapture.uri
```

Apesar do nome legado `publicUrl`, quando o provider e Google Drive o valor salvo fica como `gdrive://FILE_ID`. Esse nome pode ser renomeado futuramente, mas foi mantido para reduzir risco de refatoracao.

## Pontos de atencao

- O Google Drive nao deve ser tratado como infinito. Ele remove o problema do limite pequeno do Supabase, mas ainda depende do plano de armazenamento da conta.
- A API do Drive pode retornar limite temporario. O provider implementa retry com backoff para erros 403, 429 e 5xx.
- Se aparecer `File not found: <folder_id>`, a service account nao consegue enxergar a pasta raiz. Validar se a pasta foi compartilhada como Editor com o `client_email` do JSON.
- Se aparecer `Service Accounts do not have storage quota`, usar OAuth da conta dona do Drive ou Shared Drive corporativo.
- Para clientes diferentes, cada instancia deve usar seu proprio Drive, Supabase e Vercel, mantendo isolamento total.
- Antes de ativar em producao, configurar as credenciais do Drive no ambiente e testar uma captura real.

## Rollback

Para voltar imediatamente ao modelo antigo:

```env
NEXUS_CAPTURE_STORAGE_PROVIDER=supabase
```

As capturas ja salvas como `gdrive://...` continuam legiveis enquanto as credenciais do Drive estiverem presentes. Se as credenciais forem removidas, essas imagens nao abrem ate restaurar o acesso ao Drive.
