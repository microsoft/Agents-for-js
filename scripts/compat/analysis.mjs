import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { extractSurface, checkSurfaces, refineFindings } from 'ts-semver-checks-core'
import { refineCallables } from './callables.mjs'

export function reportSource (report) {
  const match = /```(?:ts|typescript)\r?\n([\s\S]*?)\r?\n```/.exec(report)

  if (!match) {
    throw new Error('API report is missing its TypeScript declaration block.')
  }

  return match[1]
}

/** Ignore trivia and quote style, but preserve literal values and token boundaries. */
export function canonicalTokens (source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source
  )
  const tokens = []

  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push([
      kind,
      kind === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText()
    ])
  }

  return JSON.stringify(tokens)
}

function uncertaintyReason (node, localNames) {
  if (ts.isModuleDeclaration(node)) {
    return 'Namespace members changed; nested compatibility is not fully checked.'
  }

  if (ts.isIndexSignatureDeclaration(node)) {
    return 'Index signature changed; accepted keys and values may differ.'
  }

  if (ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node)) {
    return 'Call or construct signature changed; overload compatibility is uncertain.'
  }

  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return 'Accessor changed; readable or writable values may differ.'
  }

  if (ts.isExportDeclaration(node)) {
    const local =
      !node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.every(element =>
        localNames.has(element.propertyName?.text ?? element.name.text)
      )

    if (!local) {
      return 'Export mapping changed; the public names and their targets need comparison.'
    }
  }

  if (ts.isExportAssignment(node)) {
    return 'Export assignment changed; the exported value may have a different contract.'
  }

  if (ts.isHeritageClause(node)) {
    return 'Base type changed; inherited member compatibility is not fully verified.'
  }

  if (ts.isParameter(node) && node.name.getText() === 'this') {
    return 'Receiver constraint changed; existing call contexts may no longer be accepted.'
  }

  if (ts.isParameter(node) && node.dotDotDotToken && node.type && !ts.isArrayTypeNode(node.type)) {
    return 'Rest parameter changed; accepted argument combinations may differ.'
  }

  if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword)) {
    return 'Static member changed; compatibility of existing class-level calls is uncertain.'
  }

  if (ts.isMethodSignature(node) && node.questionToken) {
    return 'Optional method changed; callers or implementations may need adjustment.'
  }
}

function declarations (source) {
  const file = ts.createSourceFile(
    'api.d.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )

  if (file.parseDiagnostics.length) {
    throw new Error(ts.flattenDiagnosticMessageText(file.parseDiagnostics[0].messageText, '\n'))
  }

  const definitions = new Map()
  const unsupported = new Map()
  const reasons = new Map()
  const localNames = new Set(
    file.statements.flatMap(node =>
      node.name
        ? [node.name.text]
        : ts.isVariableStatement(node)
          ? node.declarationList.declarations.map(declaration => declaration.name.getText(file))
          : []
    )
  )
  const add = (map, key, text) => map.set(key, `${map.get(key) ?? ''}${text}\n`)
  const uncertain = (key, node, reason) => {
    add(unsupported, key, node.getText(file))
    reasons.set(key, [...new Set([...(reasons.get(key) ?? []), reason])])
  }
  const visit = (node, owner = '') => {
    const isDeclaration =
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isEnumMember(node)
    const name = ts.isConstructorDeclaration(node)
      ? 'ctor'
      : isDeclaration
        ? node.name?.getText(file)
        : undefined
    const key = name ? (owner ? `${owner}.${name}` : name) : owner

    if (name) {
      add(definitions, key, node.getText(file))
    }

    const reason = uncertaintyReason(node, localNames)

    if (reason) {
      uncertain(key || '<exports>', node, reason)
    }

    if (isDeclaration && node.modifiers) {
      const modifiers = node.modifiers.filter(modifier =>
        [
          ts.SyntaxKind.PrivateKeyword,
          ts.SyntaxKind.ProtectedKeyword,
          ts.SyntaxKind.ReadonlyKeyword,
          ts.SyntaxKind.AbstractKeyword
        ].includes(modifier.kind)
      )

      if (modifiers.length) {
        add(
          unsupported,
          `${key} modifiers`,
          modifiers.map(modifier => modifier.getText(file)).join(' ')
        )
        reasons.set(`${key} modifiers`, [
          'Visibility, readonly, or abstract modifiers changed; access or implementation requirements may differ.'
        ])
      }
    }

    // Inspect declarations, including anonymous object types and inherited contracts.
    ts.forEachChild(node, child => visit(child, key))
  }

  for (const statement of file.statements) {
    visit(statement)
  }

  const aliases = new Map()

  for (const statement of file.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue
    }

    for (const specifier of statement.exportClause.elements) {
      const local = specifier.propertyName?.text ?? specifier.name.text
      const exported = specifier.name.text

      aliases.set(local, [...(aliases.get(local) ?? []), exported])
    }
  }

  // Use the same public names for declaration text, coverage gaps, and their reasons.
  // Read each map before replacing keys so one declaration can have multiple exports.
  for (const map of [definitions, unsupported, reasons]) {
    const original = [...map]

    for (const [local, exportedNames] of aliases) {
      for (const [key, value] of original) {
        if (key !== local && !key.startsWith(`${local}.`) && key !== `${local} modifiers`) {
          continue
        }

        map.delete(key)

        for (const exported of exportedNames) {
          map.set(exported + key.slice(local.length), value)
        }
      }
    }
  }

  return { definitions, unsupported, reasons, file }
}

function detail (definitions, location) {
  location = location.replaceAll('()', '')
  const keys = [...definitions.keys()].filter(
    key => location === key || location.startsWith(`${key}.`)
  )
  const key = keys.sort((a, b) => b.length - a.length)[0]

  return key ? definitions.get(key).trim() : ''
}

/** Stable bindings remove internal alias churn without changing public export names. */
function normalizeBindings (source, sharedExports) {
  const file = ts.createSourceFile('api.d.ts', source, ts.ScriptTarget.Latest, true)
  const options = { noLib: true, noResolve: true }
  const host = ts.createCompilerHost(options)

  host.getSourceFile = name => (name === 'api.d.ts' ? file : undefined)
  const checker = ts.createProgram(['api.d.ts'], options, host).getTypeChecker()
  const replacements = new Map()
  const display = new Map()
  const localExports = new Map()
  const directExports = new Map()

  for (const statement of file.statements) {
    if (
      statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      !statement.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      const names = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.map(declaration => declaration.name)
        : statement.name
          ? [statement.name]
          : []

      for (const name of names.filter(ts.isIdentifier)) {
        const symbol = checker.getSymbolAtLocation(name)

        if (!symbol) {
          continue
        }

        directExports.set(symbol, name.text)
        localExports.set(symbol, [...(localExports.get(symbol) ?? []), name.text])
      }
    }

    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue
    }

    for (const specifier of statement.exportClause.elements) {
      const symbol = checker.getExportSpecifierLocalTargetSymbol(specifier)

      if (!symbol || symbol.flags & ts.SymbolFlags.Alias) {
        continue
      }

      localExports.set(symbol, [...(localExports.get(symbol) ?? []), specifier.name.text])
    }
  }

  for (const [symbol, names] of localExports) {
    names.sort()
    // Prefer a name present on both sides so adding/removing another alias does
    // not change self-references in the surviving public contract.
    const exported = names.find(name => sharedExports.has(name)) ?? names[0]
    const name = `__api_local_${createHash('sha256').update(exported).digest('hex').slice(0, 12)}`

    replacements.set(symbol, name)
    display.set(name, exported)
  }

  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue
    }

    const clause = statement.importClause
    const bindings = clause.namedBindings
    const imports = [
      ...(clause.name ? [[clause.name, 'default']] : []),
      ...(bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map(element => [
          element.name,
          element.propertyName?.text ?? element.name.text
        ])
        : []),
      ...(bindings && ts.isNamespaceImport(bindings) ? [[bindings.name, '*']] : [])
    ]

    for (const [node, exported] of imports) {
      const name = `__api_${createHash('sha256').update(`${statement.moduleSpecifier.text}:${exported}`).digest('hex').slice(0, 12)}`

      replacements.set(checker.getSymbolAtLocation(node), name)
      display.set(name, exported === 'default' || exported === '*' ? node.text : exported)
    }
  }

  const transformed = ts.transform(file, [
    context => {
      const visit = node => {
        if (ts.isSourceFile(node)) {
          const statements = node.statements.map(statement => {
            const transformed = ts.visitNode(statement, visit)
            const direct =
              statement.modifiers?.some(
                modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
              ) &&
              !statement.modifiers.some(
                modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword
              ) &&
              (statement.name || ts.isVariableStatement(statement))

            return direct
              ? ts.factory.replaceModifiers(
                transformed,
                transformed.modifiers.filter(
                  modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword
                )
              )
              : transformed
          })

          if (directExports.size) {
            const exports = [...directExports].map(([symbol, name]) =>
              ts.factory.createExportSpecifier(
                false,
                ts.factory.createIdentifier(replacements.get(symbol)),
                ts.factory.createIdentifier(name)
              )
            )

            statements.push(
              ts.factory.createExportDeclaration(
                undefined,
                false,
                ts.factory.createNamedExports(exports)
              )
            )
          }

          return ts.factory.updateSourceFile(node, statements)
        }

        if (ts.isExportSpecifier(node)) {
          const symbol = checker.getExportSpecifierLocalTargetSymbol(node)
          const local = replacements.get(symbol) ?? node.propertyName?.text ?? node.name.text

          return ts.factory.updateExportSpecifier(
            node,
            node.isTypeOnly,
            local === node.name.text ? undefined : ts.factory.createIdentifier(local),
            node.name
          )
        }

        if (ts.isIndexSignatureDeclaration(node)) {
          const parameters = node.parameters.map(parameter =>
            ts.factory.updateParameterDeclaration(
              parameter,
              parameter.modifiers,
              parameter.dotDotDotToken,
              '__key',
              parameter.questionToken,
              parameter.type,
              parameter.initializer
            )
          )

          return ts.visitEachChild(
            ts.factory.updateIndexSignature(node, node.modifiers, parameters, node.type),
            visit,
            context
          )
        }

        if (
          ts.isVariableStatement(node) &&
          node.declarationList.declarations.length === 1 &&
          node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          const declaration = node.declarationList.declarations[0]

          if (
            ts.isIdentifier(declaration.name) &&
            declaration.type &&
            ts.isFunctionTypeNode(declaration.type)
          ) {
            const type = declaration.type

            return ts.visitEachChild(
              ts.factory.createFunctionDeclaration(
                [
                  ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
                  ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)
                ],
                undefined,
                declaration.name,
                type.typeParameters,
                type.parameters,
                type.type,
                undefined
              ),
              visit,
              context
            )
          }
        }

        if (ts.isImportSpecifier(node)) {
          const name = replacements.get(checker.getSymbolAtLocation(node.name))

          return name
            ? ts.factory.updateImportSpecifier(
              node,
              node.isTypeOnly,
              node.propertyName ?? node.name,
              ts.factory.createIdentifier(name)
            )
            : node
        }

        if (ts.isIdentifier(node)) {
          const name = replacements.get(checker.getSymbolAtLocation(node))

          if (name) {
            return ts.factory.createIdentifier(name)
          }
        }

        return ts.visitEachChild(node, visit, context)
      }

      return node => ts.visitNode(node, visit)
    }
  ])
  const text = ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0])

  transformed.dispose()

  return { text, display }
}

/** Reuse the engine's parameter/overload rules for existing methods and constructors. */
function exposeCallables (before, after) {
  const exposed = new Set()

  for (const [name, oldSymbol] of Object.entries(before.exports)) {
    const newSymbol = after.exports[name]

    if (
      !newSymbol ||
      oldSymbol.kind !== newSymbol.kind ||
      !['class', 'interface'].includes(oldSymbol.kind)
    ) {
      continue
    }

    for (const method of Object.keys(oldSymbol.methods)) {
      if (!newSymbol.methods[method]) {
        continue
      }

      const key = `${name}.${method}`

      exposed.add(key)
      before.exports[key] = { kind: 'function', name: key, signatures: oldSymbol.methods[method] }
      after.exports[key] = { kind: 'function', name: key, signatures: newSymbol.methods[method] }
      delete oldSymbol.methods[method]
      delete newSymbol.methods[method]
    }
  }

  return exposed
}

/** Compare real declarations, with explicit guards around gaps in the external checker. */
export function compareDeclarations (before, after, directory, currentEntry) {
  const oldOriginal = declarations(before)
  const newOriginal = declarations(after)

  if (canonicalTokens(before) === canonicalTokens(after)) {
    return []
  }

  const sharedExports = new Set(
    [...oldOriginal.definitions.keys()].filter(name => newOriginal.definitions.has(name))
  )
  const oldNormalized = normalizeBindings(before, sharedExports)
  const newNormalized = normalizeBindings(after, sharedExports)
  const oldDeclarations = declarations(oldNormalized.text)
  const newDeclarations = declarations(newNormalized.text)

  if (canonicalTokens(oldNormalized.text) === canonicalTokens(newNormalized.text)) {
    return []
  }

  fs.mkdirSync(directory, { recursive: true })
  const oldFile = path.join(directory, 'before.d.ts')
  const newFile = path.join(directory, 'after.d.ts')

  fs.writeFileSync(oldFile, oldNormalized.text)
  fs.writeFileSync(newFile, newNormalized.text)
  const compilerOptions = {
    strict: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext
  }
  // Both sides share one checker, stabilizing compiler-generated IDs for Symbol members.
  const program = ts.createProgram(
    [oldFile, newFile, ...(currentEntry ? [currentEntry] : [])],
    compilerOptions
  )
  const oldSurface = extractSurface({ entryPoint: oldFile, program })
  const newSurface = extractSurface({ entryPoint: newFile, program })
  const currentSurface = currentEntry
    ? extractSurface({ entryPoint: currentEntry, program })
    : newSurface
  const inherited = new Set()
  const resolvedConstructors = new Set()
  const checker = program.getTypeChecker()
  const historicalGaps = new Set()
  const oldModule = checker.getSymbolAtLocation(program.getSourceFile(oldFile))

  for (const exported of oldModule ? checker.getExportsOfModule(oldModule) : []) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const node = symbol.declarations?.find(ts.isClassDeclaration)

    if (!node || node.members.some(ts.isConstructorDeclaration)) {
      continue
    }

    const bases =
      node.heritageClauses
        ?.filter(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
        .flatMap(clause => clause.types) ?? []

    if (bases.some(base => checker.getTypeAtLocation(base.expression).flags & ts.TypeFlags.Any)) {
      historicalGaps.add(exported.getName())
    }
  }

  const module = checker.getSymbolAtLocation(program.getSourceFile(newFile))

  for (const exported of module ? checker.getExportsOfModule(module) : []) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const node = symbol.declarations?.find(ts.isClassDeclaration)

    if (
      !node?.heritageClauses?.some(clause => clause.token === ts.SyntaxKind.ExtendsKeyword) ||
      node.members.some(ts.isConstructorDeclaration)
    ) {
      continue
    }

    const name = exported.getName()

    inherited.add(name)

    if (
      currentEntry &&
      newSurface.exports[name]?.kind === 'class' &&
      currentSurface.exports[name]?.kind === 'class'
    ) {
      newSurface.exports[name].constructors = currentSurface.exports[name].constructors
      resolvedConstructors.add(name)
    }
  }

  const exposed = exposeCallables(oldSurface, newSurface)
  const rawFindings = checkSurfaces(oldSurface, newSurface).findings
  // A class constructor's return name is its class, already compared through members.
  const findings = refineFindings(rawFindings, oldFile, newFile, compilerOptions).filter(
    finding => {
      if (finding.code !== 'returnType.changed') {
        return true
      }

      const owner = finding.path.replace(/(?:\.ctor)?\.returnType$/, '')

      return (
        oldSurface.exports[owner]?.kind !== 'class' || newSurface.exports[owner]?.kind !== 'class'
      )
    }
  )
  const display = new Map([...oldNormalized.display, ...newNormalized.display])
  const readable = text =>
    [...display].reduce((value, [alias, name]) => value.replaceAll(alias, name), text)
  let result = findings.map(finding => ({
    kind:
      finding.code === 'property.madeOptional'
        ? 'possible'
        : finding.level === 'major'
          ? /typeChanged|returnType.changed/.test(finding.code) &&
            (finding.path.includes('.ctor.') ||
              [...exposed].some(key => finding.path.startsWith(`${key}.`)))
            ? 'possible'
            : 'breaking'
          : 'compatible',
    code: finding.code,
    symbol: finding.path,
    message:
      readable(finding.message) +
      (finding.code === 'property.madeOptional'
        ? ' Consumers reading this property may now receive undefined.'
        : ''),
    before: detail(oldOriginal.definitions, finding.path),
    after: detail(newOriginal.definitions, finding.path)
  }))

  result = refineCallables(program, oldFile, newFile, result, name => ({
    before: detail(oldOriginal.definitions, name),
    after: detail(newOriginal.definitions, name)
  }))

  for (const finding of result) {
    if ([...historicalGaps].some(name => finding.symbol.startsWith(`${name}.ctor.`))) {
      finding.kind = 'possible'
      finding.message =
        'The historical report omits the inherited constructor; its previous accepted arguments cannot be verified.'
    } else if (
      [...inherited].some(
        name => !resolvedConstructors.has(name) && finding.symbol.startsWith(`${name}.ctor.`)
      )
    ) {
      finding.kind = 'possible'
      finding.message =
        'Constructor is inherited; the report alone cannot establish which arguments it accepts.'
    }
  }

  const addedExports = findings
    .filter(finding => finding.code === 'export.added')
    .map(finding => finding.path)
  const insideNewExport = key =>
    addedExports.some(
      name => key === name || key.startsWith(`${name}.`) || key === `${name} modifiers`
    )
  const review = (symbol, message) => {
    if (result.some(finding => finding.kind === 'possible' && finding.symbol === symbol)) {
      return
    }

    result.push({
      kind: 'possible',
      code: 'coverage.possible',
      symbol,
      message,
      before:
        detail(oldOriginal.definitions, symbol) || oldDeclarations.unsupported.get(symbol) || '',
      after:
        detail(newOriginal.definitions, symbol) || newDeclarations.unsupported.get(symbol) || ''
    })
  }

  for (const key of new Set([
    ...oldDeclarations.unsupported.keys(),
    ...newDeclarations.unsupported.keys()
  ])) {
    if (insideNewExport(key)) {
      continue
    }

    const oldShape = oldDeclarations.unsupported.get(key) ?? ''
    const newShape = newDeclarations.unsupported.get(key) ?? ''

    if (canonicalTokens(oldShape) !== canonicalTokens(newShape)) {
      review(key, (newDeclarations.reasons.get(key) ?? oldDeclarations.reasons.get(key)).join(' '))
    }
  }

  // Changes not represented in the checker's model must never disappear as a false pass.
  for (const key of new Set([
    ...oldDeclarations.definitions.keys(),
    ...newDeclarations.definitions.keys()
  ])) {
    if (key.includes('.')) {
      continue
    }

    const oldText = oldDeclarations.definitions.get(key) ?? ''
    const newText = newDeclarations.definitions.get(key) ?? ''
    const covered =
      result.some(finding => finding.symbol === key || finding.symbol.startsWith(`${key}.`)) ||
      rawFindings.some(finding => finding.path === key || finding.path.startsWith(`${key}.`))

    if (!covered && canonicalTokens(oldText) !== canonicalTokens(newText)) {
      review(
        key,
        'Declaration shape changed; compatibility of existing consumers could not be established.'
      )
    }
  }

  return result
}
