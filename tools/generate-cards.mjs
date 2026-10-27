#!/usr/bin/env node
// 生成个人主页的数据卡片（SVG），不依赖第三方统计服务。
// 用法：GITHUB_TOKEN=... node tools/generate-cards.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = process.env.PROFILE_USER || 'UcnacDx2';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');
const API = 'https://api.github.com';
const HELPERS = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': `${USER}-profile-cards` };

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: HELPERS });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function contributions() {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { ...HELPERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions}}}}',
      variables: { login: USER },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions ?? null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const number = (n) => n.toLocaleString('en-US');
const today = new Date().toISOString().slice(0, 10);
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif";

const THEMES = {
  light: { ink: '#263442', muted: '#68788B', faint: '#C7D8E8', accent: '#1F4E79', track: '#EEF4F9',
    series: ['#1F4E79', '#4C8DFF', '#8AB4F8', '#68788B', '#C7D8E8', '#DCE6F0'] },
  dark: { ink: '#E6EDF3', muted: '#8B949E', faint: '#30363D', accent: '#8AB4F8', track: '#161B22',
    series: ['#8AB4F8', '#4C8DFF', '#2F5F8F', '#6E7681', '#3A4452', '#4A5563'] },
};

function statsSvg(theme, metrics) {
  const t = THEMES[theme];
  const colX = [24, 128, 232, 336];
  const cells = metrics.map((m, i) => `
    <text x="${colX[i]}" y="60" font-family="${SANS}" font-size="11" letter-spacing="0.6" fill="${t.muted}">${esc(m.label)}</text>
    <text x="${colX[i]}" y="96" font-family="${MONO}" font-size="26" font-weight="700" fill="${t.ink}">${esc(m.value)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="150" viewBox="0 0 440 150" role="img" aria-label="GitHub 统计">
  <title>GitHub 统计</title>
  <rect x="0.5" y="0.5" width="439" height="149" rx="10" fill="none" stroke="${t.faint}"/>
  <rect x="24" y="27" width="18" height="2" fill="${t.accent}"/>
  <text x="50" y="32" font-family="${MONO}" font-size="10.5" letter-spacing="2.2" fill="${t.muted}">GITHUB / 公开数据</text>${cells}
  <text x="24" y="130" font-family="${MONO}" font-size="9.5" letter-spacing="1.2" fill="${t.muted}">UPDATED ${today} · DATA VIA GITHUB API</text>
</svg>
`;
}

function langsSvg(theme, langs) {
  const t = THEMES[theme];
  const total = langs.reduce((sum, l) => sum + l.bytes, 0) || 1;
  const barX = 24, barY = 48, barW = 392, barH = 8;
  let cursor = barX;
  const segments = langs.map((l, i) => {
    const w = (l.bytes / total) * barW;
    const seg = `<rect x="${cursor.toFixed(2)}" y="${barY}" width="${Math.max(w - 1.5, 0.5).toFixed(2)}" height="${barH}" rx="2" fill="${t.series[i]}"/>`;
    cursor += w;
    return seg;
  }).join('');
  const legend = langs.map((l, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 24 + col * 132, y = 88 + row * 26;
    const pct = ((l.bytes / total) * 100).toFixed(1);
    return `<rect x="${x}" y="${y - 8}" width="7" height="7" rx="1.5" fill="${t.series[i]}"/>
    <text x="${x + 13}" y="${y}" font-family="${SANS}" font-size="11.5" fill="${t.ink}">${esc(l.name)}</text>
    <text x="${x + 126}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${t.muted}">${pct}%</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="150" viewBox="0 0 440 150" role="img" aria-label="语言分布">
  <title>语言分布</title>
  <rect x="0.5" y="0.5" width="439" height="149" rx="10" fill="none" stroke="${t.faint}"/>
  <rect x="24" y="27" width="18" height="2" fill="${t.accent}"/>
  <text x="50" y="32" font-family="${MONO}" font-size="10.5" letter-spacing="2.2" fill="${t.muted}">LANGUAGES / 按代码量</text>
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="4" fill="${t.track}"/>
  ${segments}
  ${legend}
  <text x="24" y="130" font-family="${MONO}" font-size="9.5" letter-spacing="1.2" fill="${t.muted}">PUBLIC, NON-FORK REPOSITORIES</text>
</svg>
`;
}

const repos = (await api(`/users/${USER}/repos?per_page=100&type=owner`)).filter((r) => !r.private);
const user = await api(`/users/${USER}`);
const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
const contrib = await contributions();

// 上游代码量的整包再发布仓库会压扁语言分布，不计入统计
const LANGUAGE_EXCLUDE = new Set(['PiliPlus']);

const totals = {};
for (const repo of repos.filter((r) => !r.fork && r.size > 0 && !LANGUAGE_EXCLUDE.has(r.name))) {
  let data = {};
  try {
    data = await api(`/repos/${USER}/${repo.name}/languages`);
  } catch (err) {
    console.warn(`skip ${repo.name}: ${err.message}`);
    continue;
  }
  for (const [name, bytes] of Object.entries(data)) totals[name] = (totals[name] || 0) + bytes;
}
const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
const top = ranked.slice(0, 5).map(([name, bytes]) => ({ name, bytes }));
const rest = ranked.slice(5).reduce((sum, [, bytes]) => sum + bytes, 0);
if (rest > 0) top.push({ name: 'Other', bytes: rest });

const metrics = [
  { label: '公开仓库', value: number(repos.length) },
  { label: '获得 Star', value: number(stars) },
  { label: '关注者', value: number(user.followers) },
  contrib === null
    ? { label: '语言', value: number(ranked.length) }
    : { label: '近一年贡献', value: number(contrib) },
];

mkdirSync(OUT, { recursive: true });
for (const theme of ['light', 'dark']) {
  writeFileSync(join(OUT, `stats-${theme}.svg`), statsSvg(theme, metrics), 'utf8');
  writeFileSync(join(OUT, `langs-${theme}.svg`), langsSvg(theme, top), 'utf8');
}
console.log(`wrote cards: repos=${repos.length} stars=${stars} followers=${user.followers} contributions=${contrib} languages=${ranked.length}`);
console.log('top languages:', ranked.slice(0, 8).map(([name, bytes]) => `${name}:${bytes}`).join(' '));
