import { playwrightLauncher } from '@web/test-runner-playwright';

const filteredLogs = ['Running in dev mode', 'Lit is in dev mode'];

export default /** @type {import("@web/test-runner").TestRunnerConfig} */ ({
  /** Test files to run */
  files: 'dist/**/*.spec.js',

  /** Resolve bare module imports */
  nodeResolve: {
    exportConditions: ['browser', 'development'],
  },

  /** Filter out lit dev mode logs */
  filterBrowserLogs(log) {
    for (const arg of log.args) {
      if (typeof arg === 'string' && filteredLogs.some(l => arg.includes(l))) {
        return false;
      }
    }
    return true;
  },

  /** Compile JS for older browsers. Requires @web/dev-server-esbuild plugin */
  // esbuildTarget: 'auto',

  /** Amount of browsers to run concurrently */
  // concurrentBrowsers: 2,

  /** Amount of test files per browser to test concurrently */
  // concurrency: 1,

  /** Browsers to run tests on */
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    // playwrightLauncher({ product: 'firefox' }),
    // playwrightLauncher({ product: 'webkit' }),
  ],

  // See documentation for all available options
  // When encountering aync/timeout issues, it can help (your nerves) to set a short timeout
  // so you're not left hanging for a long time.
  testsFinishTimeout: 10000,

  // Fix for the structuredClone error causing timeouts for failing tests it can't clone the error reports for.
  testRunnerHtml: testFramework =>
    `<!DOCTYPE html>
    <html>
      <body>
        <!-- Script to replace window.structuredClone with @ungap/structured-clone (in lossy mode) -->
        <script type="module">       
          import structuredClone from '@ungap/structured-clone';
          window.structuredClone = (value) => structuredClone(value, { lossy: true });
        </script>
        <script type="module" src="${testFramework}"></script>
      </body>
    </html>`,
});
