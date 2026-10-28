import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, cp, mkdir, mkdtemp, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Run from any working directory. Source mode uses the existing build without rebuilding it.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs', 'desktop');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'guance-recovery-'));
const executable = process.env.GUANCE_EXECUTABLE ? resolve(process.env.GUANCE_EXECUTABLE) : createRequire(import.meta.url)('electron');
const args = process.env.GUANCE_EXECUTABLE ? [] : ['.'];
const screenshots = ['recovery-corruption-before.png', 'recovery-corruption-restored.png', 'recovery-migration-before.png', 'recovery-migration-restored.png'];
const active = new Set();
const report = {
  at: new Date().toISOString(), platform: process.platform, node: process.version,
  mode: process.env.GUANCE_EXECUTABLE ? 'installed-executable' : 'source-electron-existing-build',
  executable, args, cwd: root, temporaryRoot, status: 'running',
  isolation: { independentGuanceTestData: true, userAppDataRead: false, userCredentialsRead: false, modelRequests: 0, collectionRequests: 0, syncRequests: 0 },
  scope: '可复现的数据库文件头损坏及 SQL 触发器故障注入；不代表真实磁盘故障测试。',
  recoveryGuide: 'docs/DESKTOP-GUIDE.md#备份恢复',
  scenarios: [], screenshots: [],
};
try { report.gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { report.gitHead = 'unavailable'; }

function withinTemporary(path) {
  const part = relative(temporaryRoot, resolve(path));
  assert.ok(part && part !== '..' && !part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(part), `操作必须位于本轮临时目录：${path}`);
  return path;
}
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function fileHash(path) { return hash(await readFile(path)); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function environment(profile) {
  const env = { ...process.env, GUANCE_TEST_DATA: withinTemporary(profile) };
  delete env.GUANCE_DEV_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
function inspectDatabase(filename) {
  withinTemporary(filename);
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check);
    assert.deepEqual(integrity, ['ok'], `备份或数据库完整性检查失败：${filename}`);
    const projects = db.prepare('SELECT * FROM projects ORDER BY id').all();
    const changes = db.prepare('SELECT * FROM changes ORDER BY id').all();
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    return {
      integrity, userVersion: Number(db.prepare('PRAGMA user_version').get().user_version),
      columns: db.prepare('PRAGMA table_info(changes)').all().map((r) => r.name),
      schema, heads: schema.some((row) => row.type === 'table' && row.name === 'project_heads') ? db.prepare('SELECT * FROM project_heads ORDER BY project_id').all() : [],
      projects, changes, applied: db.prepare('SELECT id FROM applied ORDER BY id').all(),
      projectDigest: hash(JSON.stringify(projects)),
      changeDigest: hash(JSON.stringify(changes)),
      summaries: projects.map((p) => { const data = JSON.parse(p.body); return { id: p.id, name: p.name, mode: p.mode, revision: p.revision, budgetCents: data.company.budgetCents, goal: data.company.goal }; }),
    };
  } finally { db.close(); }
}
function summary(snapshot) {
  return { integrity: snapshot.integrity, userVersion: snapshot.userVersion, changesColumns: snapshot.columns, projectDigest: snapshot.projectDigest, changeDigest: snapshot.changeDigest, projectCount: snapshot.projects.length, changeCount: snapshot.changes.length, appliedCount: snapshot.applied.length, projectHeadCount: snapshot.heads.length, projects: snapshot.summaries };
}
function recordHealthySchema(snapshot) {
  assert.ok([2, 3].includes(snapshot.userVersion), `恢复验收支持健康 schema 2/3，实际为 ${snapshot.userVersion}`);
  report.application.databaseSchemaVersion ??= snapshot.userVersion;
  assert.equal(snapshot.userVersion, report.application.databaseSchemaVersion, '同一应用的两个健康测试库版本必须一致');
  report.schemaProfile = snapshot.userVersion === 2 ? 'legacy-schema-2' : 'event-lineage-schema-3';
  return snapshot.userVersion;
}
function verifyMigratedHistory(before, after, healthy) {
  assert.equal(after.userVersion, healthy.userVersion, '恢复后须升级到最初健康库的实际版本');
  assert.deepEqual(after.columns, healthy.columns);
  assert.equal(after.projectDigest, before.projectDigest, '迁移不得改写任何原有业务项目');
  const migratedById = new Map(after.changes.map((row) => [row.id, row]));
  const originalIds = new Set(before.changes.map((row) => row.id));
  const preserved = before.changes.map((original) => {
    const migrated = migratedById.get(original.id);
    assert.ok(migrated, `原有变更不得丢失：${original.id}`);
    assert.equal(migrated.resolves, '[]');
    if (healthy.userVersion === 3) assert.equal(migrated.parent_ids, null, '旧变更应保留为旧审计记录，不推断事件父编号');
    return Object.fromEntries(Object.keys(original).map((key) => [key, migrated[key]]));
  });
  assert.equal(hash(JSON.stringify(preserved)), before.changeDigest, '原有 changes 内容必须逐条保留');
  const checkpoints = after.changes.filter((row) => !originalIds.has(row.id));
  if (healthy.userVersion === 2) {
    assert.equal(checkpoints.length, 0);
    assert.equal(after.heads.length, 0);
  } else {
    assert.equal(after.heads.length, before.projects.length, 'schema 3 须为每个现存项目建立事件头');
    assert.equal(checkpoints.length, before.projects.length, '本验收无未解决冲突，应为各项目补充一个独立检查点');
    for (const checkpoint of checkpoints) {
      const project = before.projects.find((row) => row.id === checkpoint.project_id);
      assert.ok(project);
      assert.equal(checkpoint.parent_revision, '');
      assert.equal(checkpoint.parent_ids, '[]');
      assert.equal(checkpoint.resolves, '[]');
      assert.equal(checkpoint.revision, project.revision);
      assert.deepEqual(JSON.parse(checkpoint.body).data, JSON.parse(project.body));
      assert.ok(after.heads.some((head) => head.project_id === project.id && head.change_id === checkpoint.id));
    }
  }
  assert.deepEqual(after.applied.map((row) => row.id), after.changes.map((row) => row.id));
  return { originalChangesPreserved: preserved.length, preservedChangeDigest: before.changeDigest, addedCheckpoints: checkpoints.map((row) => ({ id: row.id, projectId: row.project_id, revision: row.revision })) };
}
async function launch(profile) {
  const app = await electron.launch({ executablePath: executable, args, cwd: root, env: environment(profile), timeout: 20000 });
  active.add(app);
  try {
    const metadata = await app.evaluate(({ app }) => ({ version: app.getVersion(), isPackaged: app.isPackaged, electron: process.versions.electron, userData: app.getPath('userData') }));
    assert.equal(resolve(metadata.userData), resolve(profile), '应用必须使用本轮临时用户目录');
    report.application ??= { version: metadata.version, isPackaged: metadata.isPackaged, electron: metadata.electron };
    assert.equal(metadata.version, report.application.version, '本轮应用版本必须一致');
    const page = await app.firstWindow({ timeout: 20000 });
    await page.getByRole('button', { name: '设置', exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000));
    return { app, page };
  } catch (error) { await close(app); throw error; }
}
async function close(app) {
  if (!app || !active.has(app)) return;
  const child = app.process();
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((r) => child.once('exit', r));
  try { await app.close(); await exited; } finally { active.delete(app); }
}
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(output, name), fullPage: true });
  report.screenshots.push(`docs/desktop/${name}`);
}
async function waitForProject(page, expected) {
  let project;
  for (let i = 0; i < 100; i++) {
    project = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), expected.id);
    if (project.data.company.budgetCents === expected.budgetCents && project.data.company.goal === expected.goal) return project;
    await delay(100);
  }
  assert.fail(`项目未持久化预期预算和目标：${JSON.stringify(project?.data.company)}`);
}
async function createFixture(page, fixture) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('新项目名称', { exact: true }).fill(fixture.name);
  await page.getByLabel('项目类型', { exact: true }).selectOption('real');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByText('项目已创建并切换', { exact: true }).waitFor();
  const projects = await page.evaluate(() => window.guance.invoke('projects.list', undefined));
  const project = projects.find((p) => p.name === fixture.name && p.mode === 'real');
  assert.ok(project, '必须通过界面创建真实业务项目');
  fixture.id = project.id;
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '编辑当前企业资料', exact: true }).click();
  await page.getByLabel('行业 / 品类', { exact: true }).fill('本机恢复验收');
  await page.getByLabel('产品名称', { exact: true }).fill('恢复测试产品');
  await page.getByLabel('本轮营销目标', { exact: true }).fill(fixture.goal);
  await page.getByLabel('预算上限（元）', { exact: true }).fill((fixture.budgetCents / 100).toFixed(2));
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await page.getByRole('heading', { name: '编辑企业资料', exact: true }).waitFor({ state: 'hidden' });
  return waitForProject(page, fixture);
}
async function verifyRestoredUi(page, fixture, filename) {
  const project = await waitForProject(page, fixture);
  assert.equal(project.name, fixture.name);
  assert.equal(project.mode, 'real');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('当前项目', { exact: true }).selectOption(fixture.id);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '编辑当前企业资料', exact: true }).click();
  assert.equal(await page.getByLabel('企业名称', { exact: true }).inputValue(), fixture.name);
  assert.equal(await page.getByLabel('本轮营销目标', { exact: true }).inputValue(), fixture.goal);
  const displayedBudget = await page.getByLabel('预算上限（元）', { exact: true }).inputValue();
  assert.match(displayedBudget, /^\d+(?:\.\d{1,2})?$/);
  assert.equal(Math.round(Number(displayedBudget) * 100), fixture.budgetCents);
  await screenshot(page, filename);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  return { projectId: project.id, name: project.name, mode: project.mode, budgetCents: project.data.company.budgetCents, budgetYuanDisplayed: displayedBudget, goal: project.data.company.goal };
}
async function expectStartupFailure(profile, expectedError) {
  // Keep the exact ChildProcess handle; never enumerate or terminate other Node/Electron processes.
  const child = spawn(executable, args, { cwd: root, env: environment(profile), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; let timedOut = false;
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-16000); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-16000); });
  const result = await new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 20000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); resolveExit({ pid: child.pid, code, signal, timedOut }); });
  });
  const evidence = { ...result, stdout, stderr, expectedError, cleanup: timedOut ? '仅终止本脚本 spawn 返回的确切进程' : '应用自行退出；未扫描或终止其他进程' };
  assert.equal(timedOut, false, `启动失败必须自行退出：${JSON.stringify(evidence)}`);
  assert.equal(result.code, 1, `故障启动应以1退出：${JSON.stringify(evidence)}`);
  assert.match(stdout + stderr, /Desktop startup failed:/);
  assert.match(stdout + stderr, new RegExp(expectedError, 'i'));
  return evidence;
}
async function restoreBackup(profile, backup, label) {
  assert.equal(active.size, 0, '手动替换前必须关闭应用');
  const data = withinTemporary(join(profile, 'data'));
  const archive = withinTemporary(join(profile, 'recovery-evidence', label));
  await mkdir(archive, { recursive: true });
  await cp(data, join(archive, 'data-directory-copy'), { recursive: true });
  const moved = [];
  for (const filename of ['guance.sqlite', 'guance.sqlite-wal', 'guance.sqlite-shm']) {
    const path = join(data, filename);
    if (await exists(path)) { await rename(path, join(archive, filename)); moved.push(filename); }
  }
  await copyFile(withinTemporary(backup), join(data, 'guance.sqlite'));
  assert.equal(await fileHash(join(data, 'guance.sqlite')), await fileHash(backup));
  return {
    archive, backup, moved,
    steps: ['已退出应用', '复制整个 data 目录留档', '将原 guance.sqlite 及存在的 -wal/-shm 移入现场归档目录', '将有效备份复制为 data/guance.sqlite', '重新启动应用并核对项目、预算及目标'],
  };
}
async function runScenario(id, run) {
  const result = { id, status: 'running', startedAt: new Date().toISOString(), checks: [] };
  report.scenarios.push(result);
  try { await run(result); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = error instanceof Error ? error.stack : String(error); }
  finally {
    for (const app of [...active]) await close(app).catch((error) => { result.cleanupError = String(error); result.status = 'failed'; });
    result.finishedAt = new Date().toISOString();
  }
}

await mkdir(output, { recursive: true });
for (const name of screenshots) await unlink(join(output, name)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
try {
  await access(executable);
  if (!process.env.GUANCE_EXECUTABLE) for (const filename of ['desktop-dist/main.cjs', 'desktop-dist/worker.cjs', 'desktop-dist/preload.cjs', 'dist/index.html']) await access(join(root, filename));
  await runScenario('corrupt-header-manual-backup-recovery', async (result) => {
    const profile = withinTemporary(join(temporaryRoot, 'corruption'));
    result.profile = profile;
    const fixture = { name: '数据库损坏恢复验收', budgetCents: 765400, goal: '恢复后保留预算和获客目标' };
    let { app, page } = await launch(profile);
    await createFixture(page, fixture);
    await screenshot(page, 'recovery-corruption-before.png');
    const backup = await page.evaluate(() => window.guance.invoke('projects.backup', undefined));
    assert.equal(basename(backup.filename), backup.filename);
    const backupPath = join(profile, 'data', 'backups', backup.filename);
    const backedUp = inspectDatabase(backupPath);
    result.expectedSchemaVersion = recordHealthySchema(backedUp);
    assert.equal(backedUp.summaries.find((p) => p.id === fixture.id)?.budgetCents, fixture.budgetCents);
    assert.equal(backedUp.summaries.find((p) => p.id === fixture.id)?.goal, fixture.goal);
    result.manualBackup = { filename: backup.filename, sha256: await fileHash(backupPath), ...summary(backedUp) };
    await close(app);
    const database = join(profile, 'data', 'guance.sqlite');
    // A killed utility worker can leave committed pages in WAL. Checkpoint them after
    // the owning app has exited, so restarting cannot repair our injected header from WAL.
    const checkpoint = new DatabaseSync(withinTemporary(database));
    try {
      const state = checkpoint.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      assert.equal(Number(state.busy), 0);
      result.preparation = { applicationProcessExited: true, walCheckpoint: state, reason: '先将已提交 WAL 完整落盘，保证注入的是独立主库文件头损坏，而非可被现存 WAL 自动修复的头' };
    } finally { checkpoint.close(); }
    const wal = await readFile(join(profile, 'data', 'guance.sqlite-wal')).catch((error) => { if (error.code === 'ENOENT') return Buffer.alloc(0); throw error; });
    assert.equal(wal.length, 0, '损坏注入前不得残留可重放的 WAL');
    const before = inspectDatabase(database);
    const pristineHash = await fileHash(database);
    const handle = await open(withinTemporary(database), 'r+');
    try { await handle.write(Buffer.from('GUANCE_BAD_HEADER'), 0, 16, 0); } finally { await handle.close(); }
    const damagedHash = await fileHash(database);
    assert.notEqual(damagedHash, pristineHash);
    result.injection = { method: '关闭应用后覆盖临时 guance.sqlite 的前16字节', actualDiskFailure: false, pristineSha256: pristineHash, corruptedSha256: damagedHash };
    result.failedStartup = await expectStartupFailure(profile, 'not a database|file is encrypted|malformed');
    assert.equal(await fileHash(database), damagedHash, '启动失败不得用演示数据库覆盖损坏文件');
    assert.equal(await fileHash(backupPath), result.manualBackup.sha256, '有效备份不得被启动失败改写');
    result.checks.push('损坏文件启动自行非零退出，并明确报告本地启动失败', '损坏数据库字节未变；未静默创建演示数据库覆盖现场', 'projects.backup 生成的完整备份可读且预算和目标正确');
    result.recovery = await restoreBackup(profile, backupPath, 'corrupt-original');
    assert.equal(await fileHash(join(result.recovery.archive, 'guance.sqlite')), damagedHash);
    ({ app, page } = await launch(profile));
    result.restoredUi = await verifyRestoredUi(page, fixture, 'recovery-corruption-restored.png');
    await close(app);
    const restored = inspectDatabase(database);
    assert.equal(restored.userVersion, result.expectedSchemaVersion);
    assert.equal(restored.projectDigest, before.projectDigest);
    result.restoredDatabase = summary(restored);
    result.checks.push('按教程保留整个数据目录及故障数据库后恢复备份', '恢复后真实项目、金额和营销目标通过界面逐项核对；所有项目业务数据摘要一致');
  });
  await runScenario('v1-migration-transaction-rollback-and-recovery', async (result) => {
    const profile = withinTemporary(join(temporaryRoot, 'migration'));
    result.profile = profile;
    const fixture = { name: '迁移回滚恢复验收', budgetCents: 432100, goal: '升级恢复后继续本轮获客计划' };
    let { app, page } = await launch(profile);
    await createFixture(page, fixture);
    await screenshot(page, 'recovery-migration-before.png');
    await close(app);
    const database = join(profile, 'data', 'guance.sqlite');
    const healthy = inspectDatabase(database);
    result.expectedSchemaVersion = recordHealthySchema(healthy);
    const trigger = 'recovery_test_fail_migration';
    const triggerSql = `CREATE TRIGGER ${trigger} BEFORE INSERT ON applied WHEN (SELECT count(*) FROM applied) >= 1 BEGIN SELECT RAISE(ABORT, 'GUANCE_TEST_MIGRATION_ABORT_AFTER_FIRST_INSERT'); END`;
    const db = new DatabaseSync(withinTemporary(database));
    try {
      db.exec('BEGIN');
      if (healthy.columns.includes('parent_ids')) db.exec('ALTER TABLE changes DROP COLUMN parent_ids; DROP TABLE project_heads');
      db.exec(`ALTER TABLE changes DROP COLUMN resolves; DELETE FROM applied; PRAGMA user_version=1; ${triggerSql}; COMMIT;`);
    } finally { db.close(); }
    const version1 = inspectDatabase(database);
    assert.equal(version1.userVersion, 1);
    assert.deepEqual(version1.columns, ['id', 'project_id', 'parent_revision', 'revision', 'body', 'created_at']);
    assert.equal(version1.projectDigest, healthy.projectDigest);
    assert.equal(version1.heads.length, 0, 'v1 布局不得残留 schema 3 的项目事件头');
    assert.ok(version1.changes.length >= 2, '注入必须在迁移已有至少一条 applied 写入之后失败');
    assert.equal(version1.applied.length, 0);
    result.injection = { method: '合法 v1 表布局上安装仅测试用 BEFORE INSERT 触发器，第二条 applied 写入时 RAISE(ABORT)', actualDiskFailure: false, triggerSql, version1: summary(version1) };
    const backups = join(profile, 'data', 'backups');
    const beforeNames = await readdir(backups).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
    result.failedStartup = await expectStartupFailure(profile, 'GUANCE_TEST_MIGRATION_ABORT_AFTER_FIRST_INSERT');
    const afterFailure = inspectDatabase(database);
    assert.equal(afterFailure.userVersion, 1);
    assert.deepEqual(afterFailure.columns, version1.columns, 'ALTER TABLE 必须回滚，不得留下 resolves');
    assert.deepEqual(afterFailure.schema, version1.schema);
    assert.deepEqual(afterFailure.applied, version1.applied, '已执行的第一条 applied 写入必须回滚');
    assert.equal(afterFailure.projectDigest, version1.projectDigest);
    assert.equal(afterFailure.changeDigest, version1.changeDigest);
    const created = (await readdir(backups)).filter((name) => name.endsWith('.sqlite') && !beforeNames.includes(name));
    assert.equal(created.length, 1, '失败迁移之前必须生成一份自动备份');
    const backupPath = join(backups, created[0]);
    const automatic = inspectDatabase(backupPath);
    assert.equal(automatic.userVersion, 1);
    assert.deepEqual(automatic.schema, version1.schema);
    assert.deepEqual(automatic.applied, version1.applied);
    assert.equal(automatic.projectDigest, version1.projectDigest);
    assert.equal(automatic.changeDigest, version1.changeDigest);
    result.automaticBackup = { filename: created[0], sha256: await fileHash(backupPath), ...summary(automatic) };
    result.rolledBackDatabase = summary(afterFailure);
    result.checks.push('构造的 v1 数据库通过 integrity_check，完整业务项目保留', '故障发生于 ALTER TABLE 及第一条 applied 写入之后；错误由测试触发器明确抛出', '失败后 schema/user_version/applied/项目/变更记录均与迁移前一致，无半迁移', '迁移前自动备份可读且保留完整 v1 schema、业务与故障触发器');
    result.recovery = await restoreBackup(profile, backupPath, 'failed-migration-original');
    const repaired = new DatabaseSync(withinTemporary(database));
    try { repaired.exec(`DROP TRIGGER ${trigger}`); } finally { repaired.close(); }
    const ready = inspectDatabase(database);
    assert.equal(ready.userVersion, 1);
    assert.equal(ready.projectDigest, version1.projectDigest);
    result.recovery.steps.splice(4, 0, `在还原副本中移除仅测试用触发器 ${trigger}；保留原始自动备份不改动`);
    ({ app, page } = await launch(profile));
    result.restoredUi = await verifyRestoredUi(page, fixture, 'recovery-migration-restored.png');
    await close(app);
    const upgraded = inspectDatabase(database);
    result.migrationHistory = verifyMigratedHistory(version1, upgraded, healthy);
    const retryBackups = (await readdir(backups)).filter((name) => name.endsWith('.sqlite') && !beforeNames.includes(name) && !created.includes(name));
    assert.equal(retryBackups.length, 1);
    const retryBackup = inspectDatabase(join(backups, retryBackups[0]));
    assert.equal(retryBackup.userVersion, 1);
    assert.equal(retryBackup.projectDigest, version1.projectDigest);
    assert.equal(await fileHash(backupPath), result.automaticBackup.sha256);
    result.retryAutomaticBackup = { filename: retryBackups[0], ...summary(retryBackup) };
    result.upgradedDatabase = summary(upgraded);
    result.checks.push('从失败迁移的自动备份还原，移除测试故障触发器后正常启动', `重试前再次自动备份；成功迁移至健康库 schema ${healthy.userVersion}，所有 change 已进入 applied，新增检查点 ${result.migrationHistory.addedCheckpoints.length} 条`, '真实项目、预算和目标在界面正确；所有项目业务摘要及原有变更保留');
  });
  report.status = report.scenarios.every((s) => s.status === 'passed') ? 'passed' : 'failed';
} catch (error) { report.status = 'failed'; report.error = error instanceof Error ? error.stack : String(error); }
finally {
  for (const app of [...active]) await close(app).catch((error) => { report.cleanupError = String(error); report.status = 'failed'; });
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'recovery-results.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, mode: report.mode, version: report.application?.version, results: report.scenarios.map(({ id, status, error }) => ({ id, status, error })), evidence: join(output, 'recovery-results.json') }, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
