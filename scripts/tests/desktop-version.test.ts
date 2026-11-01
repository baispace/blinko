import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 版本体系：git tag 是唯一真相源。
 *
 * 仓库里所有版本字段都存 0.0.0 —— 语义是「开发中」，不代表任何一次发布。
 * 真正发版时由 release-mac.yml 从 tag 把版本号写进 tauri.conf.json，
 * 打包、latest.json、客户端自我判断三边同时对齐。
 *
 * 这套东西最怕的是「字段各写各的」：一处改了另一处没改，症状是
 * 「装完一直提示有新版本」或者「点了更新没反应」——都很难从界面反推根因。
 * 所以这里把关系钉死。
 */

const ROOT = join(import.meta.dir, '../..');
const TAURI_DIR = join(ROOT, 'app/src-tauri');
const WORKFLOWS_DIR = join(ROOT, '.github/workflows');

/** 仓库里提交的版本号：0.0.0 = 开发中，任何正式版本都由 CI 从 tag 覆盖。 */
const DEV_VERSION = '0.0.0';

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

/** 从 Cargo.toml 里抠出 [package] 段的 version。 */
function cargoPackageVersion(): string {
  const manifest = readText(join(TAURI_DIR, 'Cargo.toml'));
  const packageSection = manifest.split(/^\[package\]/m)[1]?.split(/^\[/m)[0] ?? '';
  const matched = packageSection.match(/^version\s*=\s*"([^"]+)"/m);
  expect(matched).not.toBeNull();
  return matched![1];
}

const base = readJson(join(TAURI_DIR, 'tauri.conf.json'));
const macos = readJson(join(TAURI_DIR, 'tauri.macos.conf.json'));
const cuda = readJson(join(TAURI_DIR, 'tauri.cuda.conf.json'));
const rootPackage = readJson(join(ROOT, 'package.json'));

test('every committed version field says 0.0.0', () => {
  // 0.0.0 不是「还没发版」的意思，而是「这里不该有真版本号」的意思。
  // 真版本号由 tag 在 CI 里注入，提交进仓库就意味着有两个真相源。
  expect(base.version).toBe(DEV_VERSION);
  expect(cuda.version).toBe(DEV_VERSION);
  expect(cargoPackageVersion()).toBe(DEV_VERSION);
  expect(rootPackage.version).toBe(DEV_VERSION);
});

test('the macOS config inherits the version instead of carrying its own', () => {
  // 平台配置里的值会盖过基础配置。一旦这里写了自己的 version，
  // CI 改 tauri.conf.json 就改不动 macOS 产物了，而且不报错。
  expect(macos.version).toBeUndefined();
});

/**
 * tauri-cli 打包时取 `PackageSettings.version`：
 * 「tauri.conf.json 的 version 优先，没有才回落到 Cargo.toml」。
 * 客户端判断自己是不是最新时读的是同一份配置。
 *
 * 两边一旦不一致，就会出现「latest.json 说 1.0.0、客户端以为自己是 0.0.0」，
 * 于是装完反复提示更新。这条断言保证它们不会分家。
 */
test('the tauri config and the cargo manifest agree on the version', () => {
  expect(base.version).toBe(cargoPackageVersion());
});

/**
 * updater 公钥全仓库只能有一把。
 *
 * 曾经基础配置里放的是上游 Blinko 的公钥，而我们的私钥不在自己手里 ——
 * 那条配置等于死配置。真发版时哪把公钥生效取决于平台配置有没有被合并，
 * 猜错就是一次「点了更新，验签失败」的静默失败。
 */
test('every tauri config signs updates with the same key and feed', () => {
  const configs = [
    ['tauri.conf.json', base],
    ['tauri.macos.conf.json', macos],
    ['tauri.cuda.conf.json', cuda],
  ] as const;

  const pubkeys = new Set<string>();
  for (const [, config] of configs) {
    const updater = config.plugins?.updater;
    expect(updater).toBeDefined();
    pubkeys.add(updater.pubkey);
    for (const endpoint of updater.endpoints) {
      expect(endpoint).toContain('github.com/baispace/blinko');
    }
  }
  expect(pubkeys.size).toBe(1);
});

test('the release workflow is driven by a git tag', () => {
  const workflow = readText(join(WORKFLOWS_DIR, 'release-mac.yml'));
  // tag 推送触发，不再要求人工填版本号。
  expect(workflow).toMatch(/tags:\s*\n\s*-\s*'v\*'/);
  expect(workflow).toContain('GITHUB_REF_NAME');
  // 版本号从 tag 里剥掉 v 前缀，并且只接受 x.y.z。
  expect(workflow).toContain('V="${TAG#v}"');
  expect(workflow).toContain('^[0-9]+\\.[0-9]+\\.[0-9]+$');
  // 防降级与防重发都要在。
  expect(workflow).toContain('拒绝降级发版');
  expect(workflow).toContain('拒绝重复发布');
  // 正式版只能从 main 发。
  expect(workflow).toContain('正式版只能从 main 发');
});

test('the release workflow writes the tag version into the tauri config', () => {
  const workflow = readText(join(WORKFLOWS_DIR, 'release-mac.yml'));
  // 版本要落在 tauri.conf.json —— 它才是打包和客户端判断共用的那份配置。
  expect(workflow).toContain("jq --arg v \"$V\" '.version = $v' app/src-tauri/tauri.conf.json");
  // 平台配置不许自带 version，否则这次注入会被它盖掉。
  expect(workflow).toContain('tauri.macos.conf.json 不该自带 version');
  // 要产出应用内自动更新用的清单。
  expect(workflow).toContain('includeUpdaterJson: true');
  // 清单里每个平台都得有签名，否则客户端验签失败。
  expect(workflow).toContain('缺少签名');
});

/**
 * tauri-action 只认它自己那一批输入项。
 * beforeBuildCommand 不是其中之一 —— 它只从 tauri 配置文件里读。
 * 传了不会报错，但会被忽略，等于以为自己控制着前端构建命令。
 */
test('the release workflow only passes inputs tauri-action understands', () => {
  const workflow = readText(join(WORKFLOWS_DIR, 'release-mac.yml'));
  const actionBlock = workflow.split('uses: tauri-apps/tauri-action@v0')[1] ?? '';
  expect(actionBlock).not.toMatch(/^\s*beforeBuildCommand:/m);
});

/**
 * GitHub 的 format() 不认 \n，正文里会出现字面的反斜杠 n。
 * 发版说明在 shell 里用 printf 生成真正的换行。
 */
test('the release notes are generated in the shell, not by format()', () => {
  const workflow = readText(join(WORKFLOWS_DIR, 'release-mac.yml'));
  expect(workflow).toContain('body<<EOF_JOMIO_RELEASE');
  expect(workflow).toContain('releaseBody: ${{ steps.ver.outputs.body }}');
  // format() 里的 \n 不会被解释，正文不能从那儿来。
  expect(workflow).not.toMatch(/releaseBody:.*format\(/);
  expect(workflow).toContain("printf 'Jomio 桌面端");
});

test('the release workflow verifies the version actually reached the bundle', () => {
  const workflow = readText(join(WORKFLOWS_DIR, 'release-mac.yml'));
  // 「配置里写了」不等于「产物里有了」，所以直接读打包出来的 .app。
  expect(workflow).toContain('CFBundleShortVersionString');
  expect(workflow).toContain('产物版本号');
});

/**
 * dev 通道的版本号会写进 CFBundleShortVersionString，
 * 而 Apple 要求它是三段点分隔的数字。
 * 曾经用的是 0.0.0-dev.<run>.<sha> —— 语义上是合法 semver，但不合 Apple 规范。
 */
test('the dev build version follows the apple three-number format', () => {
  const workflow = readText(join(WORKFLOWS_DIR, 'build-mac.yml'));
  expect(workflow).toContain('V="0.0.${GITHUB_RUN_NUMBER}"');
  // 只看真正赋值的那一行 —— 注释里提到旧格式是解释来由，不算违规。
  expect(workflow).not.toContain('V="0.0.0-dev.');
  // dev 包不进更新通道，所以必须关掉 updater 产物，
  // 否则会因为找不到私钥而让整条构建红掉。
  expect(workflow).toContain('createUpdaterArtifacts = false');
});

/**
 * 一个 tag 只能有一条发版线认领。
 *
 * 两条线同时认领会各自建一个 Release，应用内「检查更新」读的
 * latest.json 就变成「指向谁取决于谁先跑完」——不确定的更新通道比没有更糟。
 */
test('only the release workflow claims pushed version tags', () => {
  const claimants = readdirSync(WORKFLOWS_DIR)
    .filter((file) => file.endsWith('.yml'))
    .filter((file) => /tags:\s*\n\s*-\s*['"]v\*/.test(readText(join(WORKFLOWS_DIR, file))));
  expect(claimants).toEqual(['release-mac.yml']);
});

/**
 * bash 在 UTF-8 locale 下会把紧跟在变量名后面的非 ASCII 字符算进变量名，
 * 于是 `$TAG）` 被当成一个叫「TAG）」的变量 —— 加上 set -u 就是 unbound variable。
 *
 * 之前就踩过：发版脚本里一句 `echo "版本: $V （tag $TAG）"` 直接把整个步骤炸掉。
 * 中文提示语和变量挨在一起是很自然写法，所以这里钉死：插值一律用 ${...}。
 */
test('no workflow interpolates a shell variable right next to a non-ascii character', () => {
  for (const file of ['release-mac.yml', 'build-mac.yml']) {
    const workflow = readText(join(WORKFLOWS_DIR, file));
    const offenders = [...workflow.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/g)].map((m) => m[0]);
    expect(offenders).toEqual([]);
  }
});
