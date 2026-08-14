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

Autenticacao por service account:

```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...
```

Ou autenticacao OAuth:

```env
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
```

## Estrutura no Drive

Quando Drive estiver ativo, as evidencias sao organizadas assim:

```text
Adsnap Cloud/
  Agencia/
    Cliente/
      PI 123456/
        2026-08-14/
          campaignId_formato_device_timestamp.png
```

Se `GOOGLE_DRIVE_ROOT_FOLDER_ID` estiver definido, essa estrutura nasce dentro da pasta informada. Caso contrario, o provider tenta criar a pasta raiz `Adsnap Cloud`.

## Trechos de codigo CORE

### Provider central

Arquivo: `src/lib/captureStorage.ts`

```ts
export async function uploadCaptureImage(imageBuffer: Buffer, input: UploadCaptureInput): Promise<StoredCapture> {
    const provider = getCaptureStorageProvider()
    if (provider === 'google-drive') return uploadToGoogleDrive(imageBuffer, input)
    return uploadToSupabase(imageBuffer, input)
}
```

Esse e o ponto de entrada unico para salvar evidencias. Se algum upload parar de funcionar, a primeira investigacao deve comecar aqui.

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
- Para clientes diferentes, cada instancia deve usar seu proprio Drive, Supabase e Vercel, mantendo isolamento total.
- Antes de ativar em producao, configurar as credenciais do Drive no ambiente e testar uma captura real.

## Rollback

Para voltar imediatamente ao modelo antigo:

```env
NEXUS_CAPTURE_STORAGE_PROVIDER=supabase
```

As capturas ja salvas como `gdrive://...` continuam legiveis enquanto as credenciais do Drive estiverem presentes. Se as credenciais forem removidas, essas imagens nao abrem ate restaurar o acesso ao Drive.
