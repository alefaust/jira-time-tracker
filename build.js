// Gera dist/JiraTimeTracker.exe usando Node Single Executable Applications (SEA)
// Uso: npm run build
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const seaConfig = {
  main: 'server.js',
  output: 'dist/sea-prep.blob',
  disableExperimentalSEAWarning: true,
  assets: Object.fromEntries(fs.readdirSync(path.join(root, 'public')).map((f) => [f, `public/${f}`])),
};
fs.writeFileSync(path.join(dist, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));

const run = (cmd) => { console.log('> ' + cmd); execSync(cmd, { stdio: 'inherit', cwd: root }); };

run(`node --experimental-sea-config dist/sea-config.json`);
const exe = path.join(dist, 'JiraTimeTracker.exe');
fs.copyFileSync(process.execPath, exe);
run(`npx -y postject "${exe}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`);

fs.rmSync(path.join(dist, 'sea-prep.blob'));
fs.rmSync(path.join(dist, 'sea-config.json'));
console.log(`\n✓ Gerado: ${exe}`);
