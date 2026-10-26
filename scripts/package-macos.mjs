import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
if (process.platform !== 'darwin') throw new Error('macOS安装包必须在macOS构建机生成');
const arch = process.argv[2] ?? process.arch; if (!['arm64', 'x64'].includes(arch)) throw new Error('不支持此CPU架构');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
execFileSync(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--mac', 'dir', `--${arch}`, '--publish', 'never'], { stdio: 'inherit' });
const app = resolve(`release/${arch === 'arm64' ? 'mac-arm64' : 'mac'}/观策AI.app`);
const stage = mkdtempSync(join(tmpdir(), 'guance-dmg-')); const image = resolve(`release/GuanceAI-mac-${arch}-${pkg.version}.dmg`); let mount;
try {
  execFileSync('/usr/bin/ditto', [app, join(stage, '观策AI.app')]); symlinkSync('/Applications', join(stage, 'Applications'));
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', '观策AI', '-srcfolder', stage, '-ov', '-format', 'UDZO', image], { stdio: 'inherit' });
  execFileSync('/usr/bin/hdiutil', ['verify', image], { stdio: 'inherit' });
  const xml = execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-plist', image]);
  const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: xml, encoding: 'utf8' }));
  mount = info['system-entities'].find((e) => e['mount-point'])?.['mount-point']; if (!mount) throw new Error('未找到DMG挂载路径');
  const installed = resolve(`release/installed-${arch}/观策AI.app`); mkdirSync(resolve(`release/installed-${arch}`), { recursive: true });
  execFileSync('/usr/bin/ditto', [join(mount, '观策AI.app'), installed]);
  mkdirSync('docs/desktop', { recursive: true }); writeFileSync('docs/desktop/macos-install.json', JSON.stringify({ at: new Date().toISOString(), arch, image, verified: true, mountedAndCopied: true, manualInstall: false, signed: false, note: 'CI挂载DMG并复制应用，随后由desktop-verify实际运行；无签名公证与人工安装证明' }, null, 2));
} finally {
  if (mount) { try { execFileSync('/usr/bin/hdiutil', ['detach', '-quiet', mount]); } catch { execFileSync('/usr/bin/hdiutil', ['detach', '-force', mount]); } }
  if (resolve(stage).startsWith(resolve(tmpdir())) && stage.includes('guance-dmg-')) rmSync(stage, { recursive: true, force: true });
}
