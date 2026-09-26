import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const input = process.env.OPENAPI_URL || process.argv[2] || 'http://localhost:8000/openapi.json';
const target =
    input.startsWith('http://') || input.startsWith('https://')
        ? input
        : pathToFileURL(path.resolve(process.cwd(), input));

const outputPath = path.resolve(import.meta.dirname, '../src/queries/schema.gen.ts');

console.log(`Generating types from: ${input}`);

try {
    const ast = await openapiTS(target);
    const contents = astToString(ast);
    fs.writeFileSync(outputPath, contents);
    console.log(`Successfully generated types in: ${outputPath}`);
} catch (error) {
    console.error(`Error generating API types from ${input}:`, error);
    process.exit(1);
}
