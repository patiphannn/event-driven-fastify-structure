module.exports = {
  'enforce-standard-error-codes': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Enforce use of standardized error codes (common.invalid_request, etc.)',
        category: 'Best Practices',
        recommended: true
      },
      fixable: null,
      schema: []
    },
    create: function(context) {
      const standardErrorCodes = [
        'common.invalid_request',
        'common.unauthorized', 
        'common.forbidden',
        'common.not_found',
        'common.conflict',
        'common.unprocessable_entity',
        'common.internal_server_error',
        'common.bad_gateway',
        'common.service_unavailable',
        'common.gateway_timeout'
      ];

      return {
        NewExpression(node) {
          // Check for error class instantiation
          if (node.callee && node.callee.name && node.callee.name.endsWith('Error')) {
            const errorClassName = node.callee.name;
            
            // Check if it's using old error codes
            if (node.arguments && node.arguments.length > 0) {
              const firstArg = node.arguments[0];
              if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
                // This is checking message, which is fine
                return;
              }
              
              // Check if there's an explicit errorCode property being set incorrectly
              if (firstArg.type === 'ObjectExpression') {
                const errorCodeProp = firstArg.properties.find(prop => 
                  prop.key && prop.key.name === 'errorCode'
                );
                
                if (errorCodeProp && errorCodeProp.value && errorCodeProp.value.type === 'Literal') {
                  const errorCode = errorCodeProp.value.value;
                  if (!standardErrorCodes.includes(errorCode)) {
                    context.report({
                      node: errorCodeProp,
                      message: `Use standardized error code. Expected one of: ${standardErrorCodes.join(', ')}`
                    });
                  }
                }
              }
            }
          }
        }
      };
    }
  },

  'no-direct-error-response': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow direct error responses, use ErrorHandler instead',
        category: 'Best Practices',
        recommended: true
      },
      fixable: null,
      schema: []
    },
    create: function(context) {
      return {
        CallExpression(node) {
          // Check for reply.status().send() with error objects
          if (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            node.callee.property.name === 'send' &&
            node.callee.object &&
            node.callee.object.type === 'CallExpression' &&
            node.callee.object.callee &&
            node.callee.object.callee.type === 'MemberExpression' &&
            node.callee.object.callee.property &&
            node.callee.object.callee.property.name === 'status'
          ) {
            // Check if the status code is an error code (4xx or 5xx)
            const statusArg = node.callee.object.arguments[0];
            if (statusArg && statusArg.type === 'Literal' && typeof statusArg.value === 'number') {
              if (statusArg.value >= 400) {
                context.report({
                  node,
                  message: 'Use ErrorHandler.handle() instead of direct error responses'
                });
              }
            }
          }
        }
      };
    }
  },

  'no-direct-success-response': {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Encourage use of BaseController response methods',
        category: 'Best Practices',
        recommended: true
      },
      fixable: null,
      schema: []
    },
    create: function(context) {
      return {
        CallExpression(node) {
          // Check for reply.status().send() or reply.send() in controller files
          const filename = context.getFilename();
          if (!filename.includes('Controller.ts')) {
            return;
          }

          if (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            (node.callee.property.name === 'send')
          ) {
            // Check if it's a direct reply.send() or reply.status().send()
            let isDirectResponse = false;
            
            if (node.callee.object && node.callee.object.name === 'reply') {
              isDirectResponse = true;
            } else if (
              node.callee.object &&
              node.callee.object.type === 'CallExpression' &&
              node.callee.object.callee &&
              node.callee.object.callee.type === 'MemberExpression' &&
              node.callee.object.callee.property &&
              node.callee.object.callee.property.name === 'status'
            ) {
              isDirectResponse = true;
            }

            if (isDirectResponse) {
              context.report({
                node,
                message: 'Use BaseController response methods (successResponse, createdResponse, etc.) instead of direct reply.send()'
              });
            }
          }
        }
      };
    }
  },

  'require-tracing-span': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Require tracing spans for public controller methods',
        category: 'Best Practices',
        recommended: true
      },
      fixable: null,
      schema: []
    },
    create: function(context) {
      return {
        MethodDefinition(node) {
          const filename = context.getFilename();
          if (!filename.includes('Controller.ts')) {
            return;
          }

          // Check if it's a public async method
          if (
            node.accessibility !== 'private' &&
            node.accessibility !== 'protected' &&
            node.value &&
            node.value.async === true &&
            node.key &&
            node.key.name
          ) {
            // Check if the method body contains span creation
            const methodBody = node.value.body;
            if (methodBody && methodBody.body) {
              const hasSpan = methodBody.body.some(statement => {
                return context.getSourceCode().getText(statement).includes('startSpan');
              });

              if (!hasSpan) {
                context.report({
                  node: node.key,
                  message: `Public async method '${node.key.name}' should include tracing span`
                });
              }
            }
          }
        }
      };
    }
  },

  'consistent-import-order': {
    meta: {
      type: 'layout',
      docs: {
        description: 'Enforce consistent import order',
        category: 'Stylistic Issues',
        recommended: true
      },
      fixable: 'code',
      schema: []
    },
    create: function(context) {
      const sourceCode = context.getSourceCode();
      
      return {
        Program(node) {
          const imports = node.body.filter(n => n.type === 'ImportDeclaration');
          
          if (imports.length <= 1) return;

          const categories = {
            builtin: [],
            external: [],
            internal: [],
            type: []
          };

          imports.forEach(importNode => {
            const source = importNode.source.value;
            
            if (importNode.importKind === 'type' || 
                (importNode.specifiers.length > 0 && 
                 importNode.specifiers.every(spec => spec.importKind === 'type'))) {
              categories.type.push(importNode);
            } else if (source.startsWith('.')) {
              categories.internal.push(importNode);
            } else if (source.startsWith('node:') || ['crypto', 'fs', 'path', 'url'].includes(source)) {
              categories.builtin.push(importNode);
            } else {
              categories.external.push(importNode);
            }
          });

          // Check order: builtin, external, internal, type
          const expectedOrder = [
            ...categories.builtin,
            ...categories.external,
            ...categories.internal,
            ...categories.type
          ];

          for (let i = 0; i < imports.length; i++) {
            if (imports[i] !== expectedOrder[i]) {
              context.report({
                node: imports[i],
                message: 'Imports should be ordered: Node.js built-ins, external libraries, internal modules, type-only imports'
              });
              break;
            }
          }
        }
      };
    }
  },

  'naming-convention': {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Enforce naming conventions',
        category: 'Stylistic Issues',
        recommended: true
      },
      fixable: null,
      schema: []
    },
    create: function(context) {
      function isPascalCase(name) {
        return /^[A-Z][a-zA-Z0-9]*$/.test(name);
      }

      function isCamelCase(name) {
        return /^[a-z][a-zA-Z0-9]*$/.test(name);
      }

      function isScreamingSnakeCase(name) {
        return /^[A-Z][A-Z0-9_]*$/.test(name);
      }

      return {
        // Class declarations should be PascalCase
        ClassDeclaration(node) {
          if (node.id && !isPascalCase(node.id.name)) {
            context.report({
              node: node.id,
              message: `Class name '${node.id.name}' should be PascalCase`
            });
          }
        },

        // Interface declarations should be PascalCase
        TSInterfaceDeclaration(node) {
          if (node.id && !isPascalCase(node.id.name)) {
            context.report({
              node: node.id,
              message: `Interface name '${node.id.name}' should be PascalCase`
            });
          }
        },

        // Function declarations should be camelCase
        FunctionDeclaration(node) {
          if (node.id && !isCamelCase(node.id.name)) {
            context.report({
              node: node.id,
              message: `Function name '${node.id.name}' should be camelCase`
            });
          }
        },

        // Variable declarations
        VariableDeclarator(node) {
          if (node.id && node.id.type === 'Identifier') {
            const parent = node.parent;
            
            // Constants should be SCREAMING_SNAKE_CASE
            if (parent && parent.kind === 'const' && node.init) {
              // Check if it's a top-level constant or object with constant values
              if (
                (node.init.type === 'Literal' && typeof node.init.value !== 'function') ||
                (node.init.type === 'ObjectExpression') ||
                (node.init.type === 'ArrayExpression')
              ) {
                if (node.id.name === node.id.name.toUpperCase() && !isScreamingSnakeCase(node.id.name)) {
                  context.report({
                    node: node.id,
                    message: `Constant '${node.id.name}' should use SCREAMING_SNAKE_CASE`
                  });
                }
              } else if (!isCamelCase(node.id.name)) {
                context.report({
                  node: node.id,
                  message: `Variable '${node.id.name}' should be camelCase`
                });
              }
            }
            // Other variables should be camelCase
            else if (!isCamelCase(node.id.name)) {
              context.report({
                node: node.id,
                message: `Variable '${node.id.name}' should be camelCase`
              });
            }
          }
        }
      };
    }
  }
};