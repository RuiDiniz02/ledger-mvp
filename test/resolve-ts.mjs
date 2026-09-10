// Lets `node --test` load the app's source, which uses Next's extensionless
// imports ("./types") that Node's ESM resolver does not accept on its own.
// Node 24 strips the TypeScript types itself, so no compiler is needed.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const hasExtension = /\.[cm]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !hasExtension.test(specifier) && context.parentURL) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        try {
          if (existsSync(fileURLToPath(new URL(specifier + ext, context.parentURL)))) {
            return next(specifier + ext, context);
          }
        } catch {}
      }
    }
    return next(specifier, context);
  },
});
