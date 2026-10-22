import type { ESTree, Node, Plugin, Rule } from '@oxlint/plugins';

const isConcat = (node: ESTree.Expression | ESTree.JSXEmptyExpression) =>
    (node.type === 'TemplateLiteral' && node.expressions.length > 0) ||
    (node.type === 'BinaryExpression' && node.operator === '+');

const noClassNameConcat: Rule = {
    meta: {
        type: 'suggestion',
        messages: { concat: 'Use cn(...) em vez de concatenar classes.' }
    },
    create(context) {
        return {
            JSXAttribute(node) {
                if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'className') return;
                const value = node.value;
                if (value?.type === 'JSXExpressionContainer' && isConcat(value.expression)) {
                    context.report({ node: value.expression, messageId: 'concat' });
                }
            }
        };
    }
};

const EMAIL_PATTERN = /mailto:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

const noHardcodedEmail: Rule = {
    meta: {
        type: 'suggestion',
        messages: { email: 'Use EMAILS e mailto de #/lib/contact.' }
    },
    create(context) {
        const check = (node: Node, text: string) => {
            if (EMAIL_PATTERN.test(text)) context.report({ node, messageId: 'email' });
        };
        return {
            Literal(node) {
                if (typeof node.value === 'string') check(node, node.value);
            },
            TemplateElement(node) {
                check(node, node.value.cooked ?? node.value.raw);
            },
            JSXText(node) {
                check(node, node.value);
            }
        };
    }
};

export default {
    meta: { name: 'followw' },
    rules: {
        'no-classname-concat': noClassNameConcat,
        'no-hardcoded-email': noHardcodedEmail
    }
} satisfies Plugin;
