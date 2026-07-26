import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "moderation", "assets");
await mkdir(output, { recursive: true });

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a8d0df"/>
      <stop offset=".5" stop-color="#2a6f8a"/>
      <stop offset="1" stop-color="#13252e"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <circle cx="720" cy="280" r="90" fill="#f0b35a"/>
  <path d="M120 620c120-160 240-160 360 0s240 160 360 0" stroke="#a8d0df" stroke-width="28" fill="none"/>
  <rect x="220" y="700" width="580" height="48" rx="10" fill="#8b5a2b"/>
  <text x="512" y="520" text-anchor="middle" fill="#eef6f8" font-family="Georgia, serif" font-size="220" font-weight="700">О</text>
</svg>`;

const iconBase = sharp(Buffer.from(iconSvg));
for (const [filename, size] of [
  ["icon-universal-576.png", 576],
  ["icon-catalog-278.png", 278],
  ["icon-small-150.png", 150],
  ["favicon-32.png", 32],
]) {
  await iconBase.clone().resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(output, filename));
}

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a8d0df"/>
      <stop offset=".5" stop-color="#2a6f8a"/>
      <stop offset="1" stop-color="#13252e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="980" cy="140" r="70" fill="#f0b35a"/>
  <rect x="180" y="360" width="520" height="36" rx="8" fill="#8b5a2b"/>
  <text x="160" y="230" fill="#eef6f8" font-family="Georgia, serif" font-size="96" font-weight="700">Омут</text>
  <text x="160" y="300" fill="#13252e" font-family="Trebuchet MS, sans-serif" font-size="36" font-weight="700">Тихая заводь</text>
  <text x="160" y="470" fill="#eef6f8" font-family="Trebuchet MS, sans-serif" font-size="28">Закинь удочку!</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toFile(resolve(root, "public", "og.png"));
await sharp(Buffer.from(ogSvg))
  .resize(1120, 630, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9 })
  .toFile(resolve(output, "big-snippet-1120x630.png"));

const shots = {
  start: { title: "Омут", subtitle: "Тихая заводь — закинь удочку!" },
  campaign: { title: "Заводь", subtitle: "Заброс, поклёвка и вываживание" },
  camp: { title: "Снасти", subtitle: "Удочка, леска и садок" },
  quests: { title: "Задания", subtitle: "Ежедневный улов" },
};

for (const [name, copy] of Object.entries(shots)) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a8d0df"/>
        <stop offset=".5" stop-color="#2a6f8a"/>
        <stop offset="1" stop-color="#13252e"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="600" fill="url(#bg)"/>
    <rect x="90" y="70" width="1020" height="460" rx="28" fill="#eef6f8" stroke="#8b5a2b" stroke-width="6"/>
    <circle cx="210" cy="190" r="70" fill="#f0b35a"/>
    <text x="340" y="170" fill="#13252e" font-family="Georgia, serif" font-size="64" font-weight="700">${copy.title}</text>
    <text x="340" y="230" fill="#2a6f8a" font-family="Trebuchet MS, sans-serif" font-size="28" font-weight="700">${copy.subtitle}</text>
    <text x="340" y="290" fill="#5a6d5f" font-family="Trebuchet MS, sans-serif" font-size="22">Омут — тихая заводь · VK Mini App</text>
    <rect x="120" y="360" width="960" height="120" rx="20" fill="#dceef3" stroke="#7aa3b2" stroke-width="3"/>
    <text x="160" y="430" fill="#13252e" font-family="Trebuchet MS, sans-serif" font-size="26" font-weight="700">Рыбалка · альбом · снасти · задания</text>
  </svg>`;
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(resolve(output, `screenshot-${name}-1200x600.jpg`));
}

await writeFile(
  resolve(root, "moderation", "texts.txt"),
  `НАЗВАНИЕ
Омут — тихая заводь

ОПИСАНИЕ
«Омут — тихая заводь» — казуальная рыбалка для VK Mini Apps. Игрок забрасывает удочку, ждёт поклёвку, вываживает рыбу, собирает альбом видов и улучшает снасти. Доступны несколько локаций, ежедневные задания и награды за рекламу. Прогресс сохраняется локально и в VK Storage.

КРАТКОЕ ОПИСАНИЕ
Закинь удочку, собери альбом рыб и улучшай снасти.

СЛОГАН
Закинь удочку!

КАТЕГОРИЯ
Игры → Казуальные

ВОЗРАСТНОЕ ОГРАНИЧЕНИЕ
6+

КОММЕНТАРИЙ МОДЕРАТОРУ
Игра не требует специальных прав. Новый пользователь проходит короткое обучение: заброс в зелёной зоне, вываживание удержанием кнопки, продажа улова. Rewarded-реклама только по инициативе пользователя. Interstitial ограничен по частоте.

Проверка:
1. Нажать «На мостки».
2. Сделать заброс и поймать рыбу.
3. Открыть вкладки «Снасти», «Альбом», «Задания», «Итоги».
`,
);

console.log(`VK moderation assets generated in ${output}`);
