export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow TypeScript casts in a test callback\'s final executable statement'
    },
    schema: [],
    messages: {
      terminalCast: 'Move this TypeScript cast into a typed local before the final test statement. The VS Code node:test extension can misparse a terminal cast and display later tests as children.'
    }
  },
  create (context) {
    const sourceCode = context.sourceCode
    const testFunctionNames = new Set(['it', 'test'])
    const nonExecutableStatements = new Set([
      'ClassDeclaration',
      'EmptyStatement',
      'FunctionDeclaration'
    ])

    const isTestCall = (node) => {
      if (node.callee.type === 'Identifier') return testFunctionNames.has(node.callee.name)
      return node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object.type === 'Identifier' &&
        testFunctionNames.has(node.callee.object.name) &&
        node.callee.property.type === 'Identifier' &&
        ['only', 'skip', 'todo'].includes(node.callee.property.name)
    }

    const isAstNode = (value) => value != null &&
      typeof value === 'object' &&
      typeof value.type === 'string'

    const containsCast = (node, root) => {
      if (!isAstNode(node)) return false
      if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') return true
      if (node !== root && [
        'ArrowFunctionExpression',
        'ClassDeclaration',
        'ClassExpression',
        'FunctionDeclaration',
        'FunctionExpression'
      ].includes(node.type)) return false
      return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
        const value = node[key]
        return Array.isArray(value)
          ? value.some(child => containsCast(child, root))
          : containsCast(value, root)
      })
    }

    const findTerminalNode = (body) => {
      if (body.type !== 'BlockStatement') return body
      return body.body.findLast(statement => !nonExecutableStatements.has(statement.type))
    }

    return {
      CallExpression (node) {
        if (!isTestCall(node)) return
        const callback = [...node.arguments].reverse().find((argument) =>
          argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression'
        )
        if (!callback) return

        const terminalNode = findTerminalNode(callback.body)
        if (terminalNode && containsCast(terminalNode, terminalNode)) {
          context.report({ node: terminalNode, messageId: 'terminalCast' })
        }
      }
    }
  }
}
