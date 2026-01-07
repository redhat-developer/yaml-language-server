## YAML Language Server – Copilot Guide

### Architecture & Bootstrapping
- **Entry point**: [src/server.ts](src/server.ts) creates LSP connection (stdio mode via `--stdio` flag), redirects console to connection, wraps schema requests, instantiates `YAMLServerInit`, and sets up telemetry
- **Initialization flow**: [src/yamlServerInit.ts](src/yamlServerInit.ts) → captures client capabilities into `SettingsState` → constructs language service → registers handlers ([src/languageserver/handlers/](src/languageserver/handlers/)) → loads l10n bundles → `listen()`
- **Language service**: [src/languageservice/yamlLanguageService.ts](src/languageservice/yamlLanguageService.ts) composes features (completion, hover, validation, formatting, code actions, etc.). Uses `JSONSchemaSelection` for schema priority and `SettingsState` for capability gating
- **YAML parsing**: [src/languageservice/parser/yamlParser07.ts](src/languageservice/parser/yamlParser07.ts) uses [eemeli/yaml](https://github.com/eemeli/yaml) parser (v2.7.1). Defaults to YAML 1.2 spec, configurable via `yaml.yamlVersion` setting. Custom tags via `getCustomTags()` pattern

### Schema System (Critical)
- **Schema resolution**: [src/languageservice/services/schemaRequestHandler.ts](src/languageservice/services/schemaRequestHandler.ts) handles: relative paths → workspace-aware absolute paths, Windows paths (e.g., `C:\...`), HTTP(S) via VS Code content requests (VPN-aware) or `request-light`, file:// via FileSystem, custom via `CustomSchemaContentRequest`
- **Priority order**: `SchemaStore (1) < SchemaAssociation (2) < Settings (3)` – see `SchemaPriority` enum in yamlLanguageService.ts
- **Schema service API**: Use `schemaService.registerCustomSchemaProvider()`, `addSchema()`, `modifySchemaContent()`, `deleteSchemasWhole()`. Never bypass via direct fs/http access

### Handler Pattern (Extend, Don't Replace)
- All LSP handlers live in [src/languageserver/handlers/](src/languageserver/handlers/) (languageHandlers.ts, validationHandlers.ts, etc.)
- Add features by extending handler classes, not attaching raw connection listeners. This preserves validation scheduling, debouncing, capability checks
- Handlers respect `SettingsState` flags (e.g., `hasWsChangeWatchedFileDynamicRegistration`) before advertising capabilities

### Localization
- **Required**: Wrap all user-facing strings with `l10n.t()` from `@vscode/l10n`
- Bundles: `l10n/bundle.l10n.json` (fallback), `bundle.l10n.<locale>.json` (locale-specific)
- Initialize via `setupl10nBundle()` using `initializationOptions.l10nPath` or default `l10n/` path
- Examples: `l10n.t('flowStyleMapForbidden', 'Flow style mapping is forbidden')`, `l10n.t('jumpToSchema', path.basename(schemaUri))`

### Code Quality & Style
- **Linting**: ESLint with TypeScript, Prettier (enforced via pre-commit). Config: `.eslintrc.js`
- **Prettier**: 130 char width, single quotes, ES5 trailing commas, auto EOL. Config: `.prettierrc.json`
- **Type safety**: `explicit-function-return-type` enforced (allow expressions). Use `ErrorCode` from vscode-json-languageservice for diagnostic codes
- **Testing**: Mocha + ts-node, 5s timeout. Use `setupLanguageService()` and `setupTextDocument()` from `test/utils/testHelper.ts`. Clear `yamlDocumentsCache` between tests

### Development Workflow
```bash
npm run build              # Full build: clean → lint → compile → bundle
npm run watch              # Incremental TypeScript compilation
npm run compile            # CommonJS only (out/server/src)
npm run compile:umd        # UMD bundle (lib/)
npm run compile:esm        # ESM bundle (lib/)
npm test                   # Mocha tests (5s timeout)
npm run coverage           # Tests with nyc coverage
npm run lint               # ESLint check
npm run prettier-fix       # Auto-format code
node ./out/server/src/server.js --stdio  # Launch server
```

### Build Outputs & Entry Points
- **Published main**: `out/server/src/index.js` (CommonJS)
- **Bundles**: `lib/` for UMD/ESM (browser consumption)
- **CLI**: [bin/yaml-language-server](bin/yaml-language-server) → passes `--stdio`
- **Browser worker**: [src/webworker/yamlServerMain.ts](src/webworker/yamlServerMain.ts)

### Key Defaults & Conventions
- YAML version: 1.2 (configurable to 1.1)
- File extensions: `.yml`, `.yaml`
- Formatter: 80 char width, bracket spacing, trailing commas (overridden by Prettier config)
- Validation: debounced via `SettingsState`, respects `yaml.validate` setting
- Custom tags: defined as `["!TagName scalar|sequence|mapping"]` in settings

### Adding New Features Checklist
1. Check client capabilities in `SettingsState` before advertising provider
2. Wire handler through [src/languageserver/handlers/](src/languageserver/handlers/), not raw connection listeners
3. Add l10n strings to `l10n/bundle.l10n.json` with keys matching code
4. Update telemetry via injected `telemetry` instance if user-impacting
5. Add tests to `test/*.test.ts` using fixtures from `test/fixtures/`
6. Keep schema fetches centralized via `schemaRequestService`

### Dependencies to Know
- `vscode-languageserver` (LSP protocol)
- `yaml` 2.7.1 (eemeli/yaml parser – strictly enforces YAML spec version)
- `vscode-json-languageservice` (JSON schema validation, ErrorCode enum)
- `ajv` 8.x + `ajv-draft-04` (schema validation)
- `prettier` 3.x (formatting)
- `request-light` (HTTP schema fetching)