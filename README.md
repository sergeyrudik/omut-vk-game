# Омут — тихая заводь

Казуальная рыбалка для VK Mini Apps. Забрасывай удочку на заводи, вываживай
рыбу, собирай альбом видов и улучшай снасти.

- VK Mini App: _создайте приложение в кабинете VK и подставьте ID_
- production: _URL Timeweb после деплоя_
- репозиторий: [sergeyrudik/omut-vk-game](https://github.com/sergeyrudik/omut-vk-game)
- политика конфиденциальности: `/privacy/`
- пользовательское соглашение: `/terms/`

## Стек

- Next.js 16 и React 19;
- TypeScript;
- VK Bridge;
- статический экспорт Next.js в `out/`;
- Timeweb Cloud App Platform.

## Локальный запуск

Требуется Node.js `>=22.13.0` и pnpm.

```bash
pnpm install
pnpm run dev
```

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:all
pnpm run timeweb:build
pnpm start
```

## Настройка Timeweb Cloud

| Поле | Значение |
| --- | --- |
| Репозиторий | `sergeyrudik/omut-vk-game` |
| Ветка | `main` |
| Окружение | Node.js 22 |
| Корень проекта | `/` |
| Команда сборки | `pnpm run timeweb:build` |
| Директория сборки | `out` |
| Команда запуска | `pnpm run timeweb:start` |
| Автодеплой | включён для `main` |

## Геймплей

- заброс с тайминг-метром;
- ожидание поклёвки и вываживание удержанием;
- садок, продажа, альбом из 24 видов;
- локации: Заводь → Озеро → Ночной плёс;
- улучшения удочки/лески/садка, ежедневки, rewarded ads.
