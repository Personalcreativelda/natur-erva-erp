# Natur Erva — app Android (Capacitor)

A app é uma "casca" nativa que abre o site de produção **https://www.natur-erva.co.mz**
dentro de uma WebView. O código da loja/ERP não foi alterado.

## Live update
Não há nada a fazer: **cada deploy do site (Vercel) aparece na app na hora**, porque a app
carrega sempre a versão publicada. Só é preciso gerar um APK novo quando mudar algo nativo
(ícone, nome, permissões, versão do Capacitor).

## Gerar o APK
Requisitos (já instalados nesta máquina): Android Studio (usa o Java dele) e Android SDK.

```powershell
cd mobile
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run apk          # APK assinado em android/app/build/outputs/apk/release/app-release.apk
npm run apk:debug    # APK de teste em android/app/build/outputs/apk/debug/app-debug.apk
npm run open         # abrir no Android Studio
```

Antes de cada nova versão, aumente `versionCode` (e `versionName`) em `android/app/build.gradle`.

## Assinatura — IMPORTANTE
`android/keystore/naturerva-release.jks` + `android/keystore.properties` são a identidade da app.
**Faça cópia de segurança dos dois.** Sem eles, um APK novo não instala por cima do antigo
(o Android exige a mesma assinatura) e não é possível publicar actualizações na Play Store.
Estes ficheiros estão no `.gitignore` — não os envie para o GitHub.

## Configuração
- `capacitor.config.json` — URL do site, cores, splash, barras do sistema.
- `www/offline.html` — ecrã mostrado sem internet (volta ao site quando a ligação regressa).
- `assets/` — imagens-fonte do ícone e splash (`npm run icons` regenera).
- Permissões (AndroidManifest): internet, câmara (scanner/fotos), localização (mapa de entrega).

Para mudar o domínio, edite `server.url` em `capacitor.config.json` e corra `npm run apk`.
