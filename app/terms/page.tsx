import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Омут",
  description: "Условия использования игры «Омут — тихая заводь».",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link className="legal-back" href="/">
          ← Вернуться в игру
        </Link>
        <p className="legal-kicker">Омут — тихая заводь</p>
        <h1>Пользовательское соглашение</h1>
        <p className="legal-updated">Редакция от 26 июля 2026 года</p>
        <section>
          <h2>1. Принятие условий</h2>
          <p>
            Запуская «Омут — тихая заводь», пользователь принимает условия
            соглашения и правила платформы ВКонтакте.
          </p>
        </section>
        <section>
          <h2>2. Виртуальные ценности</h2>
          <p>
            Монеты, жемчуг, наживка, улов и улучшения являются виртуальными
            элементами Игры и не подлежат обмену на деньги вне механик Игры.
          </p>
        </section>
        <section>
          <h2>3. Реклама</h2>
          <p>
            Реклама за вознаграждение запускается только по действию пользователя;
            награда начисляется после подтверждённого просмотра.
          </p>
        </section>
        <section>
          <h2>4. Ответственность</h2>
          <p>
            Игра предоставляется «как есть». Разработчик не гарантирует
            непрерывный доступ и сохранность прогресса при сбоях устройства или
            платформы.
          </p>
        </section>
        <footer className="legal-footer">
          <Link href="/privacy/">Политика конфиденциальности</Link>
          <a href="https://vk.com/app54694439">Страница приложения ВКонтакте</a>
        </footer>
      </article>
    </main>
  );
}
