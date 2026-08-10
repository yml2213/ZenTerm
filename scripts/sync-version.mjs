import fs from 'node:fs';

const version = process.argv[2] ?? JSON.parse(fs.readFileSync('wails.json', 'utf8')).info.productVersion;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`版本号必须使用 x.y.z 格式，当前为: ${version}`);
}

const wailsPath = 'wails.json';
const wails = JSON.parse(fs.readFileSync(wailsPath, 'utf8'));
wails.info ??= {};
wails.info.productVersion = version;
fs.writeFileSync(wailsPath, `${JSON.stringify(wails, null, 2)}\n`);

for (const file of ['frontend/package.json', 'frontend/package-lock.json']) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = version;
  if (file.endsWith('package-lock.json') && pkg.packages?.['']) {
    pkg.packages[''].version = version;
  }
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`项目版本已同步为 ${version}`);
