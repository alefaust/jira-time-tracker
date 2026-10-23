// Gera o executável usando Node Single Executable Applications (SEA)
// Suporta Windows (.exe), Linux e macOS
// Uso: npm run build
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");
if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

const seaConfig = {
  main: "server.js",
  output: "dist/sea-prep.blob",
  disableExperimentalSEAWarning: true,
  assets: Object.fromEntries(
    fs.readdirSync(path.join(root, "public")).map((f) => [f, `public/${f}`]),
  ),
};
fs.writeFileSync(
  path.join(dist, "sea-config.json"),
  JSON.stringify(seaConfig, null, 2),
);

const run = (cmd) => {
  console.log("> " + cmd);
  execSync(cmd, { stdio: "inherit", cwd: root });
};

run(`node --experimental-sea-config dist/sea-config.json`);

const platform = process.platform;
const arch = process.arch;

let binaryName = "JiraTimeTracker";
if (platform === "win32") {
  binaryName = "JiraTimeTracker.exe";
} else if (platform === "darwin") {
  binaryName = `JiraTimeTracker-macos-${arch}`;
} else {
  binaryName = `JiraTimeTracker-linux-${arch}`;
}

const exe = path.join(dist, binaryName);
if (platform === "win32") {
  try {
    execSync(`taskkill /f /im "${binaryName}"`, { stdio: "ignore" });
  } catch {}
}
fs.copyFileSync(process.execPath, exe);

if (platform === "darwin") {
  // macOS requer remoção de assinatura antes do postject
  run(`codesign --remove-signature "${exe}"`);
  run(
    `npx -y postject "${exe}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`,
  );
  // Re-assina o binário (ad-hoc) para execução no macOS
  run(`codesign --sign - "${exe}"`);
  try { fs.chmodSync(exe, 0o755); } catch {}
} else if (platform === "win32") {
  run(
    `npx -y postject "${exe}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  );
  // Injeta o ícone personalizado no .exe
  const iconPath = path.join(root, "public", "favicon.ico");
  if (fs.existsSync(iconPath)) {
    run(
      `npx -y resedit-cli --ignore-signed --in "${exe}" --out "${exe}" --icon "1,${iconPath}"`,
    );
  }
  // Cria cópia com indicação explícita de arquitetura
  const archExe = path.join(dist, `JiraTimeTracker-win-${arch}.exe`);
  fs.copyFileSync(exe, archExe);
} else {
  // Linux
  run(
    `npx -y postject "${exe}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  );
  try { fs.chmodSync(exe, 0o755); } catch {}
}

fs.rmSync(path.join(dist, "sea-prep.blob"), { force: true });
fs.rmSync(path.join(dist, "sea-config.json"), { force: true });
console.log(`\n✓ Gerado: ${exe}`);
