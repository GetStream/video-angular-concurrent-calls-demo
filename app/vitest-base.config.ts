import { defineConfig } from 'vitest/config';

/**
 * Loaded by `@angular/build:unit-test` because the test target sets `runnerConfig: true`.
 *
 * `stream-chat-angular` imports dayjs plugins with extensionless specifiers
 * (`dayjs/plugin/calendar`). dayjs 1.11 ships no `exports` map, so esbuild resolves those
 * fine in the app build via legacy Node resolution - but Vite's ESM resolver in the test
 * environment does not add the extension, and the suite fails to import at all. Rewriting
 * the specifier is narrower than inlining the whole package into the transform pipeline.
 */
export default defineConfig({
  test: {
    server: {
      deps: {
        // The alias below only applies to code Vite transforms. Externalised packages have
        // their imports resolved by Node's ESM loader instead, so stream-chat-angular has
        // to be inlined for the rewrite to reach it.
        inline: ['stream-chat-angular'],
      },
    },
  },
  resolve: {
    alias: [
      {
        // don't touch specifiers that already carry an extension
        find: /^dayjs\/plugin\/(?!.*\.js$)(.*)$/,
        replacement: 'dayjs/plugin/$1.js',
      },
    ],
  },
});
