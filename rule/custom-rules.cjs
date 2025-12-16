function unwrap(node) {
  let current = node;
  while (current && current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }

  return current || null;
}

function isJSXLike(node) {
  const target = unwrap(node);
  return Boolean(target && (target.type === 'JSXElement' || target.type === 'JSXFragment'));
}

function isForbiddenLogicalExpression(node) {
  return (
    node &&
    node.type === 'LogicalExpression' &&
    (node.operator === '&&' || node.operator === '||') &&
    isJSXLike(node.right)
  );
}

function isForbiddenConditionalExpression(node) {
  if (!node || node.type !== 'ConditionalExpression') {
    return false;
  }

  return isJSXLike(node.consequent) || isJSXLike(node.alternate);
}

function inspectJSXChildren(node, context) {
  const target = unwrap(node);
  if (!target || (target.type !== 'JSXElement' && target.type !== 'JSXFragment')) {
    return;
  }

  for (const child of target.children || []) {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      inspectJSXChildren(child, context);
      continue;
    }

    if (child.type !== 'JSXExpressionContainer') {
      continue;
    }

    const expression = child.expression;
    if (isForbiddenLogicalExpression(expression)) {
      context.report({
        node: child,
        messageId: 'noShortCircuit',
      });
    }

    if (isForbiddenConditionalExpression(expression)) {
      context.report({
        node: child,
        messageId: 'noTernary',
      });
    }

    if (expression && isJSXLike(expression)) {
      context.report({
        node: child,
        messageId: 'noBracedJsx',
      });
    }
  }
}

function getEnclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isInsideJsxAttribute(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'JSXAttribute') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function hasJSXNamespace(typeName) {
  let current = typeName;
  while (current && current.type === 'TSQualifiedName') {
    if (current.left.type === 'Identifier' && current.left.name === 'JSX') {
      return true;
    }
    current = current.left;
  }
  return Boolean(current && current.type === 'Identifier' && current.name === 'JSX');
}

function isInTypeAliasDefinition(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'TSTypeAliasDeclaration') {
      return true;
    }
    if (current.type === 'TSMethodSignature') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

module.exports = {
  rules: {
    'no-jsx-return-conditionals': {
      meta: {
        type: 'problem',
        docs: {
          description: '禁止在 JSX 返回值中直接使用短路或三元表达式渲染内容，必须在 return 之前处理逻辑。',
          recommended: false,
        },
        schema: [],
        messages: {
          noShortCircuit: '禁止在 JSX 中使用短路语法 (condition && <Component />)，请改为 if/else 逻辑。',
          noTernary: '禁止在 JSX 中使用三元表达式，请改为 if/else 逻辑。',
          noBracedJsx: '禁止直接用花括号包裹 JSX 块，请提前组装 JSX。',
        },
      },
      create(context) {
        return {
          ReturnStatement(node) {
            if (!node.argument) {
              return;
            }

            const argument = unwrap(node.argument);
            if (!argument) {
              return;
            }

            if (isForbiddenLogicalExpression(argument)) {
              context.report({
                node: argument,
                messageId: 'noShortCircuit',
              });
              return;
            }

            if (isForbiddenConditionalExpression(argument)) {
              context.report({
                node: argument,
                messageId: 'noTernary',
              });
              return;
            }

            if (isJSXLike(argument)) {
              inspectJSXChildren(argument, context);
            }
          },
          VariableDeclarator(node) {
            if (isJSXLike(node.init)) {
              inspectJSXChildren(node.init, context);
            }
          },
          AssignmentExpression(node) {
            if (isJSXLike(node.right)) {
              inspectJSXChildren(node.right, context);
            }
          },
        };
      },
    },
    'no-nested-function-definitions': {
      meta: {
        type: 'problem',
        docs: {
          description: '禁止在函数内部再次声明函数或箭头函数，请提取到模块顶层或封装为对象/类 method。',
          recommended: false,
        },
        schema: [],
        messages: {
          noNestedFunctions: '禁止在函数内部声明函数，请将逻辑抽离到外层或封装为对象/类的 method。',
        },
      },
      create(context) {
        return {
          FunctionDeclaration(node) {
            if (getEnclosingFunction(node)) {
              context.report({
                node,
                messageId: 'noNestedFunctions',
              });
            }
          },
          VariableDeclarator(node) {
            if (
              node.init &&
              (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression') &&
              getEnclosingFunction(node)
            ) {
              context.report({
                node,
                messageId: 'noNestedFunctions',
              });
            }
          },
          'CallExpression, NewExpression'(node) {
            const enclosingFunction = getEnclosingFunction(node);
            if (!enclosingFunction) {
              return;
            }

            for (const arg of node.arguments) {
              if (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression') {
                context.report({
                  node: arg,
                  messageId: 'noNestedFunctions',
                });
              }
            }
          },
          Property(node) {
            const enclosingFunction = getEnclosingFunction(node);
            if (!enclosingFunction) {
              return;
            }

            if (
              node.value &&
              (node.value.type === 'FunctionExpression' || node.value.type === 'ArrowFunctionExpression')
            ) {
              context.report({
                node: node.value,
                messageId: 'noNestedFunctions',
              });
            }
          },
          PropertyDefinition(node) {
            if (!node.value || node.value.type !== 'ArrowFunctionExpression') {
              return;
            }
            const arrow = node.value;
            if (arrow.body && arrow.body.type === 'BlockStatement' && arrow.loc) {
              if (arrow.loc.start.line !== arrow.loc.end.line) {
                context.report({
                  node: arrow,
                  messageId: 'noNestedFunctions',
                });
              }
            }
          },
        };
      },
    },
    'single-line-arrow-body': {
      meta: {
        type: 'suggestion',
        docs: {
          description: '禁止无花括号箭头函数使用多行表达式体。',
          recommended: false,
        },
        schema: [],
        messages: {
          multilineBody: '箭头函数的表达式体必须保持在同一行内，如需多行请使用花括号。',
        },
      },
      create(context) {
        return {
          ArrowFunctionExpression(node) {
            if (!node.loc) {
              return;
            }

            const isJsxArrow = isInsideJsxAttribute(node);
            if (isJsxArrow && node.loc.start.line !== node.loc.end.line) {
              context.report({
                node,
                messageId: 'multilineBody',
              });
              return;
            }

            if (!node.body || node.body.type === 'BlockStatement' || !node.body.loc) {
              return;
            }
            if (node.body.loc.start.line !== node.body.loc.end.line) {
              context.report({
                node: node.body,
                messageId: 'multilineBody',
              });
            }
          },
        };
      },
    },
    'no-jsx-namespace': {
      meta: {
        type: 'problem',
        docs: {
          description: '禁止直接引用全局 JSX 命名空间，统一使用 React 类型（如 ReactNode）。',
          recommended: false,
        },
        schema: [],
        messages: {
          noJsxNamespace: '不要使用全局 JSX 命名空间，请改用 ReactNode 等 React 类型定义。',
        },
      },
      create(context) {
        return {
          TSTypeReference(node) {
            if (!node.typeName) {
              return;
            }
            if (node.typeName.type === 'TSQualifiedName' && hasJSXNamespace(node.typeName)) {
              context.report({
                node,
                messageId: 'noJsxNamespace',
              });
            }
          },
        };
      },
    },
    'no-inline-function-types': {
      meta: {
        type: 'suggestion',
        docs: {
          description: '禁止在类型注解中直接使用箭头函数类型，必须先用 type 定义类型别名。',
          recommended: false,
        },
        schema: [],
        messages: {
          noInlineFunctionType:
            '禁止在类型注解中直接使用箭头函数类型 `(args) => ReturnType`，请先使用 `type` 定义类型别名。',
        },
      },
      create(context) {
        return {
          TSFunctionType(node) {
            if (isInTypeAliasDefinition(node)) {
              return;
            }
            context.report({
              node,
              messageId: 'noInlineFunctionType',
            });
          },
        };
      },
    },
  },
};
