const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

const buildOptions = {
  entryPoints: ['src/app/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'typescript'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    const result = await esbuild.build(buildOptions);
    console.log('Build completed successfully.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
