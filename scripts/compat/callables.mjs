import ts from 'typescript'

// Resolve exported names through aliases before inspecting methods and function properties.
function collect (program, entry) {
  const checker = program.getTypeChecker()
  const file = program.getSourceFile(entry)
  const module = checker.getSymbolAtLocation(file)
  const callables = new Map()

  for (const exported of module ? checker.getExportsOfModule(module) : []) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported

    if (!(symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface))) {
      continue
    }

    const typeParameters = new Set(
      symbol.declarations?.flatMap(
        node => node.typeParameters?.map(parameter => parameter.name.text) ?? []
      )
    )
    const dependsOnOwner = node =>
      !!node &&
      (node.kind === ts.SyntaxKind.ThisType ||
        (ts.isIdentifier(node) && typeParameters.has(node.text)) ||
        !!ts.forEachChild(node, dependsOnOwner))
    const name = exported.getName()
    const add = (key, signatures, property = false) => {
      if (signatures.length !== 1 || signatures[0].typeParameters?.length) {
        return
      }

      const signature = signatures[0]

      if (signature.declaration?.parameters.some(parameter => dependsOnOwner(parameter.type))) {
        return
      }

      const parameters = signature.getParameters().map(parameter => {
        const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0]

        return {
          name: parameter.getName(),
          type: checker.getTypeOfSymbolAtLocation(parameter, declaration),
          optional: checker.isOptionalParameter(declaration),
          rest: !!declaration.dotDotDotToken
        }
      })

      if (parameters.some(parameter => parameter.rest)) {
        return
      }

      callables.set(key, { parameters, property })
    }

    if (symbol.flags & ts.SymbolFlags.Class) {
      add(
        `${name}.ctor`,
        checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration).getConstructSignatures()
      )
    }

    for (const member of checker.getDeclaredTypeOfSymbol(symbol).getProperties()) {
      const declaration = member.valueDeclaration ?? member.declarations?.[0]

      if (!declaration) {
        continue
      }

      const type = checker.getTypeOfSymbolAtLocation(member, declaration)

      add(
        `${name}.${member.getName()}`,
        type.getCallSignatures(),
        !(member.flags & ts.SymbolFlags.Method)
      )
    }
  }

  return callables
}

/** Refine simple callable inputs; preserve uncertainty for generics and overloads. */
export function refineCallables (program, before, after, findings, detail) {
  const checker = program.getTypeChecker()
  const previous = collect(program, before)
  const current = collect(program, after)
  const uncertain = type =>
    !!(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) ||
    (type.isUnionOrIntersection() && type.types.some(uncertain))
  const result = findings.filter(finding => {
    if (finding.code !== 'param.typeChanged') {
      return true
    }

    const match = /^(.*)\.params\[(\d+)\]$/.exec(finding.symbol)

    if (!match) {
      return true
    }

    const oldType = previous.get(match[1])?.parameters[Number(match[2])]?.type
    const newType = current.get(match[1])?.parameters[Number(match[2])]?.type

    if (!oldType || !newType || uncertain(oldType) || uncertain(newType)) {
      return true
    }

    if (!checker.isTypeAssignableTo(oldType, newType)) {
      return true
    }

    if (checker.isTypeAssignableTo(newType, oldType)) {
      return false
    }

    finding.kind = 'compatible'
    finding.code = 'param.typeWidened'
    finding.message =
      finding.message.replace('type changed', 'type widened') + ' Existing inputs remain accepted.'

    return true
  })

  for (const [name, oldCallable] of previous) {
    const newCallable = current.get(name)

    if (!newCallable || !oldCallable.property || !newCallable.property) {
      continue
    }

    // Function assignment allows fewer parameters, but existing calls may still pass them.
    const oldCount = oldCallable.parameters.length
    const newCount = newCallable.parameters.length
    const append = (index, code, message) => {
      const symbol = `${name}.params[${index}]`

      if (result.some(finding => finding.symbol === symbol && finding.code === code)) {
        return
      }

      result.push({ kind: 'breaking', code, symbol, message, ...detail(name) })
    }

    for (let index = newCount; index < oldCount; index++) {
      append(
        index,
        'param.removed',
        `Parameter '${oldCallable.parameters[index].name}' was removed. Existing calls passing it no longer compile.`
      )
    }

    for (let index = oldCount; index < newCount; index++) {
      if (!newCallable.parameters[index].optional) {
        append(
          index,
          'param.addedRequired',
          `Required parameter '${newCallable.parameters[index].name}' was added. Existing calls omit it.`
        )
      }
    }
  }

  return result
}
