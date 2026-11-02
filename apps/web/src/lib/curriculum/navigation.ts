import { useQueryStates } from 'nuqs';
import { createParser, createStandardSchemaV1 } from 'nuqs/server';

const SUBJECT_CODE = /^[a-zA-Z0-9_-]{1,32}$/;

export const flowSearchParsers = {
    subject: createParser({
        parse: (value) => (SUBJECT_CODE.test(value) ? value : null),
        serialize: String
    })
};

export const validateFlowSearch = createStandardSchemaV1(flowSearchParsers, {
    partialOutput: true
});

export const useFlowSearch = () => useQueryStates(flowSearchParsers);
