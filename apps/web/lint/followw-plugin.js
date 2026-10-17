const isConcat = (node) =>
    (node.type === 'TemplateLiteral' && node.expressions.length > 0) ||
    (node.type === 'BinaryExpression' && node.operator === '+');

const noClassNameConcat = {
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

export default {
    meta: { name: 'followw' },
    rules: { 'no-classname-concat': noClassNameConcat }
};
