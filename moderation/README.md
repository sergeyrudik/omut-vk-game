# Пакет для модерации VK

Приложение: `app54694439`

## Информация

**Название:** Омут — тихая заводь

**Слоган:** Закинь удочку!

**Категория:** Игры → Казуальные · **Возраст:** 6+

## Оформление

| Поле VK | Файл | Размер |
|---|---|---:|
| Универсальная иконка | `icon-universal-576.png` | 576×576 |
| Иконка каталога | `icon-catalog-278.png` | 278×278 |
| Маленькая иконка | `icon-small-150.png` | 150×150 |
| Большой сниппет | `big-snippet-1120x630.png` | 1120×630 |
| Скриншот 1 | `screenshot-start-600x1200.jpg` | 600×1200 |
| Скриншот 2 | `screenshot-campaign-600x1200.jpg` | 600×1200 |
| Скриншот 3 | `screenshot-camp-600x1200.jpg` | 600×1200 |
| Скриншот 4 | `screenshot-quests-600x1200.jpg` | 600×1200 |

```bash
pnpm run moderation:assets
pnpm run moderation:validate
```

## URL

- Web / Mobile: `https://sergeyrudik-omut-vk-game-308d.twc1.net/`
- Privacy: `https://sergeyrudik-omut-vk-game-308d.twc1.net/privacy/`
- Terms: `https://sergeyrudik-omut-vk-game-308d.twc1.net/terms/`

## Реальные скриншоты

`moderation:assets` обновляет иконки, сниппет и тексты, сохраняя существующие скриншоты. Скриншоты снимаются отдельно с финального игрового интерфейса в мобильном размере 600×1200 и сохраняются в `moderation/assets/`. Промокарточки не заменяют снимки игры.

Проектная проверка `moderation:validate` ожидает четыре JPG:
- `screenshot-start-600x1200.jpg`
- `screenshot-campaign-600x1200.jpg`
- `screenshot-camp-600x1200.jpg`
- `screenshot-quests-600x1200.jpg`

После замены снимков выполните `moderation:validate`.
