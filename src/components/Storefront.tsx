import {
  ArrowRight,
  ArrowUpRight,
  Cable,
  Check,
  ChevronRight,
  CircuitBoard,
  Grid2X2,
  Heart,
  Lightbulb,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, lineTotal, money, price, readStorage } from '../lib';
import type { CartItem, Catalog, Product, Variant } from '../types';
import Cart from './Cart';
import SortSelect from './SortSelect';
import { ErrorBox, Logo, Modal, Spinner, ThemeButton } from './UI';
const icons = [CircuitBoard, Cable, Zap, Grid2X2, Lightbulb, Package];
export default function Storefront({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [error, setError] = useState('');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('all'),
    [sort, setSort] = useState('featured'),
    [discountOnly, setDiscountOnly] = useState(false),
    [inStock, setInStock] = useState(false),
    [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStorage('kip-favorites', []));
  const [cart, setCart] = useState<CartItem[]>(() => {
    const data = readStorage<unknown>('kip-cart', []);
    return Array.isArray(data)
      ? data
          .filter(
            (x) =>
              x &&
              typeof x.product_id === 'string' &&
              typeof x.variant_id === 'string' &&
              typeof x.quantity === 'number' &&
              x.quantity > 0,
          )
          .slice(0, 50)
      : [];
  });
  const [cartOpen, setCartOpen] = useState(false),
    [selected, setSelected] = useState<Product | null>(null),
    [info, setInfo] = useState(''),
    [toast, setToast] = useState('');
  const load = useCallback(
    () =>
      api<Catalog>('/catalog')
        .then(setCatalog)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem('kip-cart', JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    localStorage.setItem('kip-favorites', JSON.stringify(favorites));
  }, [favorites]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  const closeProduct = useCallback(() => setSelected(null), []),
    closeCart = useCallback(() => setCartOpen(false), []),
    closeInfo = useCallback(() => setInfo(''), []);
  const toggleFavorite = (id: string) =>
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  function add(p: Product, v: Variant, quantity = 1) {
    const existing = cart.find((i) => i.product_id === p.id && i.variant_id === v.id);
    if ((existing?.quantity || 0) + quantity > (p.kind === 'service' ? 100000 : v.stock)) {
      setToast('Достигнут доступный остаток товара');
      return;
    }
    setCart((items) =>
      existing
        ? items.map((i) =>
            i === existing
              ? { ...i, quantity: Math.round((i.quantity + quantity) * 1000) / 1000 }
              : i,
          )
        : [...items, { product_id: p.id, variant_id: v.id, quantity }],
    );
    setToast('Товар добавлен в корзину');
  }
  const filtered = useMemo(() => {
    if (!catalog) return [];
    let list = catalog.products.filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (!discountOnly || p.discount_enabled) &&
        (!inStock || p.kind === 'service' || p.variants.some((v) => v.stock > 0)) &&
        (!favoriteOnly || favorites.includes(p.id)) &&
        `${p.name} ${p.brand} ${Object.values(p.specs).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    if (sort === 'featured') list.sort((a, b) => Number(b.featured) - Number(a.featured));
    if (sort === 'price-up') list.sort((a, b) => price(a) - price(b));
    if (sort === 'price-down') list.sort((a, b) => price(b) - price(a));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return list;
  }, [catalog, category, discountOnly, inStock, favoriteOnly, favorites, search, sort]);
  function goCatalog(id = 'all') {
    setCategory(id);
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
  }
  if (error)
    return (
      <main className="fatal">
        <h1>Магазин временно недоступен</h1>
        <ErrorBox message={error} />
        <button
          className="button primary"
          onClick={() => {
            setError('');
            void load();
          }}
        >
          Повторить
        </button>
      </main>
    );
  if (!catalog) return <Spinner />;
  const shop = catalog.settings;
  const cartTotal = cart.reduce((sum, item) => {
    const p = catalog.products.find((p) => p.id === item.product_id),
      v = p?.variants.find((v) => v.id === item.variant_id);
    return sum + (p && v ? lineTotal(price(p, v), item.quantity) : 0);
  }, 0);
  return (
    <>
      <div className="topbar">
        <div className="container topbar-inner">
          <a href={shop.map_url} target="_blank" rel="noreferrer">
            <MapPin size={13} />
            <span className="top-address">{shop.address}</span>
            <ArrowUpRight size={12} />
          </a>
          <span>Электротехника для ваших задач</span>
          <a href={'tel:' + shop.phone}>
            {shop.phone.replace(/\+7(\d{3})(\d{3})(\d{2})(\d{2})/, '+7 ($1) $2-$3-$4')}
          </a>
        </div>
      </div>
      <header className="site-header">
        <div className="container header-main">
          <Logo />
          <button className="button navy catalog-button" onClick={() => goCatalog()}>
            <Grid2X2 size={18} />
            Каталог
          </button>
          <div className="search-box">
            <Search size={19} />
            <input
              aria-label="Поиск товаров"
              placeholder="Поиск среди электротоваров"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                goCatalog();
              }}
            />
            <span className="search-key">⌕</span>
          </div>
          <div className="header-actions">
            <ThemeButton dark={dark} onToggle={onToggle} />
            <button
              className={'icon-button ' + (favoriteOnly ? 'active' : '')}
              aria-label="Избранное"
              onClick={() => {
                setFavoriteOnly(!favoriteOnly);
                goCatalog();
              }}
            >
              <Heart size={21} fill={favoriteOnly ? 'currentColor' : 'none'} />
              {favorites.length > 0 && <b className="small-count">{favorites.length}</b>}
            </button>
            <button className="cart-trigger" aria-label="Корзина" onClick={() => setCartOpen(true)}>
              <span className="cart-icon">
                <ShoppingBag size={23} />
                {cart.length > 0 && <b>{cart.length}</b>}
              </span>
              <span>
                Корзина<strong>{money(cartTotal)}</strong>
              </span>
            </button>
          </div>
        </div>
        <nav className="container subnav" aria-label="Основная навигация">
          <div>
            <button onClick={() => goCatalog('breakers')}>Автоматы и УЗО</button>
            <button onClick={() => goCatalog('cables')}>Кабель и провод</button>
            <button onClick={() => goCatalog('automation')}>Автоматика</button>
            <button
              onClick={() => {
                setDiscountOnly(true);
                goCatalog();
              }}
              className="sale-nav"
            >
              <Zap size={14} /> Скидки
            </button>
          </div>
          <div>
            <a href="#services">Услуги</a>
            <a href="#about">О магазине</a>
            <button onClick={() => setInfo('Доставка и оплата')}>Доставка и оплата</button>
            <a href="#contacts">Контакты</a>
          </div>
        </nav>
      </header>
      <main>
        <section className="container hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> ВАШ МАГАЗИН ЭЛЕКТРОТЕХНИКИ
            </div>
            <h1>
              Надёжное решение
              <br />
              для каждой <span>цепи.</span>
            </h1>
            <p>
              От кабеля до автоматики — всё для вашего
              <br className="desktop-br" /> дома, объекта и профессионального монтажа.
            </p>
            <div className="hero-buttons">
              <button className="button primary" onClick={() => goCatalog()}>
                Перейти в каталог <ArrowRight size={18} />
              </button>
              <a
                className="text-button"
                href={'https://wa.me/' + shop.phone.slice(1)}
                target="_blank"
                rel="noreferrer"
              >
                Помочь с выбором <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="hero-bottom">
              <span>
                <span className="tiny-lightning">
                  <Zap size={15} />
                </span>{' '}
                Для дома и бизнеса
              </span>
              <span className="hero-divider" />
              <span>Розница и опт</span>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-grid" />
            <span className="art-overline">ТОЧНОСТЬ. ЗАЩИТА. КОНТРОЛЬ.</span>
            <span className="art-large">
              220<span>V</span>
            </span>
            <div className="hero-product-back">
              <img src="/products/rcd.svg" alt="Двухполюсное УЗО" />
            </div>
            <div className="hero-product-front">
              <img src="/products/breaker.svg" alt="Автоматический выключатель" />
            </div>
            <div className="art-caption">
              <span className="art-dot" />
              <div>
                Под контролем.<small>Автоматика для уверенной работы</small>
              </div>
              <ArrowUpRight size={21} />
            </div>
            <span className="art-mark">
              КИП <Zap size={16} />
            </span>
          </div>
        </section>
        <section className="container advantages" aria-label="Преимущества">
          <div>
            <ShieldCheck />
            <span>
              <strong>Подберём по характеристикам</strong>
              <small>Амперы, полюса, сечение и мощность</small>
            </span>
          </div>
          <div>
            <Package />
            <span>
              <strong>Розница и опт</strong>
              <small>Для небольшого ремонта и больших задач</small>
            </span>
          </div>
          <div>
            <Truck />
            <span>
              <strong>Удобное получение</strong>
              <small>Самовывоз и согласование доставки</small>
            </span>
          </div>
          <div>
            <MessageCircle />
            <span>
              <strong>Всегда на связи</strong>
              <small>Поможем с заказом в WhatsApp</small>
            </span>
          </div>
        </section>
        <section className="container categories-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow muted">НАЧНИТЕ С НУЖНОГО</span>
              <h2>Категории товаров</h2>
            </div>
            <button className="text-button" onClick={() => goCatalog()}>
              Весь каталог <ArrowRight size={17} />
            </button>
          </div>
          <div className="categories-grid">
            {catalog.categories.map((c, i) => {
              const Icon = icons[i % icons.length];
              return (
                <button
                  key={c.id}
                  className={'category-card ' + (category === c.id ? 'selected' : '')}
                  onClick={() => goCatalog(c.id)}
                >
                  <span className={'category-icon tone-' + (i % 6)}>
                    <Icon size={30} strokeWidth={1.35} />
                  </span>
                  <strong>{c.name}</strong>
                  <span>
                    {catalog.products.filter((p) => p.category === c.id).length} товаров{' '}
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="container catalog-section" id="catalog">
          <div className="section-heading">
            <div>
              <span className="eyebrow muted">ПРОВЕРЕННЫЕ РЕШЕНИЯ</span>
              <h2>
                {favoriteOnly
                  ? 'Избранные товары'
                  : category !== 'all'
                    ? catalog.categories.find((c) => c.id === category)?.name
                    : 'Популярные товары'}{' '}
                <span className="count-pill">{filtered.length}</span>
              </h2>
            </div>
            <SortSelect value={sort} onChange={setSort} />
          </div>
          <div className="filter-row">
            <div className="filter-pills">
              <button
                className={category === 'all' ? 'selected' : ''}
                onClick={() => {
                  setCategory('all');
                  setFavoriteOnly(false);
                }}
              >
                Все товары
              </button>
              {catalog.categories.slice(0, 3).map((c) => (
                <button
                  key={c.id}
                  className={category === c.id ? 'selected' : ''}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
              <button
                className={discountOnly ? 'selected sale-filter' : 'sale-filter'}
                onClick={() => setDiscountOnly(!discountOnly)}
              >
                <Zap size={14} />
                Со скидкой
              </button>
            </div>
            <label className="stock-filter">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
              />{' '}
              В наличии
            </label>
          </div>
          {search && (
            <p className="search-result">
              Результаты поиска: «{search}» <button onClick={() => setSearch('')}>Сбросить</button>
            </p>
          )}
          {catalog.settings.demo && (
            <p className="demo-note">
              Демонстрационный ассортимент. Цены и наличие требуют подтверждения магазина.
            </p>
          )}
          <div className="product-grid">
            {filtered.map((p) => (
              <article key={p.id} className="product-card">
                <div className="product-visual">
                  <button
                    className="product-image-button"
                    aria-label={'Открыть ' + p.name}
                    onClick={() => setSelected(p)}
                  >
                    <img src={p.image} alt={p.name} loading="lazy" />
                  </button>
                  <div className="product-badges">
                    {p.discount_enabled ? (
                      <span className="badge-discount">−{p.discount_percent}%</span>
                    ) : p.featured ? (
                      <span className="badge-featured">Рекомендуем</span>
                    ) : null}
                  </div>
                  <button
                    className={'favorite-button ' + (favorites.includes(p.id) ? 'is-favorite' : '')}
                    aria-label={
                      (favorites.includes(p.id) ? 'Убрать из избранного: ' : 'В избранное: ') +
                      p.name
                    }
                    onClick={() => toggleFavorite(p.id)}
                  >
                    <Heart size={18} fill={favorites.includes(p.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="product-content">
                  <div className="product-brand">
                    {p.brand}
                    <span
                      className={
                        p.kind === 'service' || p.variants.some((v) => v.stock > 0)
                          ? 'availability'
                          : 'availability unavailable'
                      }
                    >
                      <i />
                      {p.kind === 'service' || p.variants.some((v) => v.stock > 0)
                        ? p.kind === 'service'
                          ? 'Услуга'
                          : 'В наличии'
                        : 'Под заказ'}
                    </span>
                  </div>
                  <button className="product-name" onClick={() => setSelected(p)}>
                    {p.name}
                  </button>
                  <p className="product-spec">{Object.values(p.specs).slice(0, 3).join(' · ')}</p>
                  <div className="product-variants">
                    {p.variants.length > 1 ? (
                      <>
                        <span>{p.variants.length} вариантов</span>
                        <ChevronRight size={12} />
                      </>
                    ) : (
                      <span>
                        {p.kind === 'service'
                          ? 'Стоимость работ'
                          : p.unit === 'м'
                            ? 'На отрез · от 0,1 м'
                            : `Цена за 1 ${p.unit}`}
                      </span>
                    )}
                  </div>
                  <div className="product-bottom">
                    <div>
                      {p.discount_enabled && <del>{money(p.variants[0].price)}</del>}
                      <strong>
                        {p.variants.length > 1 && <small>от </small>}
                        {money(price(p))}
                        <small> / {p.unit}</small>
                      </strong>
                    </div>
                    <button
                      className="add-button"
                      aria-label={'Добавить: ' + p.name}
                      disabled={!(p.kind === 'service' || p.variants.some((v) => v.stock > 0))}
                      onClick={() =>
                        p.variants.length > 1
                          ? setSelected(p)
                          : add(p, p.variants[0], p.unit === 'м' ? 1 : p.step)
                      }
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="empty-state">
              <Search size={36} />
              <h3>Товары не найдены</h3>
              <p>Попробуйте другой запрос или измените фильтры.</p>
              <button
                className="button navy"
                onClick={() => {
                  setSearch('');
                  setCategory('all');
                  setFavoriteOnly(false);
                  setDiscountOnly(false);
                  setInStock(false);
                }}
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </section>
        <section className="container help-banner">
          <div className="help-icon">
            <CircuitBoard size={46} strokeWidth={1} />
          </div>
          <div>
            <h2>Сложная задача? Подберём решение.</h2>
            <p>Расскажите, что нужно подключить — поможем выбрать оборудование.</p>
          </div>
          <a
            className="button light"
            href={
              'https://wa.me/' +
              shop.phone.slice(1) +
              '?text=' +
              encodeURIComponent('Здравствуйте! Помогите, пожалуйста, подобрать электротовары.')
            }
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={19} />
            Написать в WhatsApp <ArrowUpRight size={17} />
          </a>
        </section>
        {catalog.products.some((p) => p.kind === 'service') && (
          <section className="container services-section" id="services">
            <div className="services-intro">
              <span className="eyebrow muted">УСЛУГИ МАГАЗИНА</span>
              <h2>
                Соберём электрощит
                <br />
                под вашу задачу.
              </h2>
              <p>
                От выбора автоматики до сборки по согласованной схеме. Условия и комплектующие
                обсудим перед началом работ.
              </p>
            </div>
            <div className="service-list">
              {catalog.products
                .filter((p) => p.kind === 'service')
                .map((p) => (
                  <article className="service-card" key={p.id}>
                    <img src={p.image} alt="" loading="lazy" />
                    <div>
                      <span className="eyebrow muted">УСЛУГА</span>
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div className="service-card-bottom">
                        <strong>
                          {p.variants.length > 1 ? 'от ' : ''}
                          {money(Math.min(...p.variants.map((v) => price(p, v))))}
                        </strong>
                        <button className="button primary" onClick={() => setSelected(p)}>
                          Выбрать услугу <ArrowRight size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        )}
        <section className="container about-section" id="about">
          <div className="store-photo">
            <img
              src="/storefront.png"
              alt="Фасад магазина КИП: товары электроавтоматики"
              loading="lazy"
            />
            <span>
              <MapPin size={16} />
              Ваш магазин в Шымкенте
            </span>
          </div>
          <div className="about-copy">
            <span className="eyebrow muted">ЗНАКОМЫ ЛИЧНО. РЯДОМ ВСЕГДА.</span>
            <h2>
              Электротехника начинается
              <br />с правильного выбора.
            </h2>
            <p>{shop.about}</p>
            <a className="text-button" href={shop.map_url} target="_blank" rel="noreferrer">
              Мы на карте 2ГИС <ArrowUpRight size={18} />
            </a>
            <div className="about-details">
              <div>
                <strong>Розница + опт</strong>
                <small>Под ваш объём работ</small>
              </div>
              <div>
                <strong>Самовывоз из магазина</strong>
                <small>{shop.address}</small>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer" id="contacts">
        <div className="container footer-main">
          <div>
            <Logo light />
            <p>Энергия правильных решений.</p>
          </div>
          <div>
            <h3>Каталог</h3>
            {catalog.categories.slice(0, 4).map((c) => (
              <button key={c.id} onClick={() => goCatalog(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <div>
            <h3>Покупателям</h3>
            <a href="#services">Услуги</a>
            <a href="#about">О магазине</a>
            <button onClick={() => setInfo('Доставка и оплата')}>Доставка и оплата</button>
            <button onClick={() => setInfo('Обработка персональных данных')}>
              Персональные данные
            </button>
            <a href="/admin">
              Панель управления <ArrowUpRight size={12} />
            </a>
          </div>
          <div>
            <h3>Будем рады видеть вас</h3>
            <a href={'tel:' + shop.phone}>
              <Phone size={15} />
              {shop.phone}
            </a>
            <a href={shop.map_url} target="_blank" rel="noreferrer">
              <MapPin size={15} />
              {shop.address}
            </a>
            <span>{shop.hours}</span>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} КИП и А. Электротовары и автоматика.</span>
          <span>
            Сделано для надёжных соединений <Zap size={13} />
          </span>
        </div>
      </footer>
      {selected && (
        <ProductModal
          product={selected}
          onClose={closeProduct}
          onAdd={(v, q) => {
            add(selected, v, q);
            closeProduct();
          }}
        />
      )}
      {cartOpen && (
        <Cart
          catalog={catalog}
          cart={cart}
          onChange={setCart}
          onClose={closeCart}
          onComplete={() => void load()}
        />
      )}
      {info && (
        <Modal title={info} onClose={closeInfo}>
          <div className="prose">
            {info === 'Доставка и оплата' ? (
              <>
                <h3>Получение заказа</h3>
                <p>{shop.delivery_note}</p>
                <h3>Оплата</h3>
                <p>
                  Наличными, переводом с карты или по QR-коду. Менеджер уточнит удобный способ после
                  оформления. Онлайн-списания средств на сайте нет.
                </p>
                <h3>Наш адрес</h3>
                <p>{shop.address}</p>
                <a href={shop.map_url} target="_blank" rel="noreferrer">
                  Построить маршрут в 2ГИС ↗
                </a>
              </>
            ) : (
              <>
                <p>
                  Имя, телефон и адрес используются магазином «КИП и А» для обработки заказа, связи
                  с вами и организации доставки.
                </p>
                <p>
                  Информация о заказе передаётся сотрудникам магазина через настроенные каналы
                  Telegram и WhatsApp. Не указывайте в комментарии платёжные реквизиты или другие
                  чувствительные данные.
                </p>
                <p>
                  Для исправления или удаления данных свяжитесь с магазином:{' '}
                  <a href={'tel:' + shop.phone}>{shop.phone}</a>.
                </p>
                <p>Корзина, избранное и выбранная тема сохраняются в вашем браузере.</p>
              </>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            onClick={() => {
              setToast('');
              setCartOpen(true);
            }}
          >
            В корзину <ArrowRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
function ProductModal({
  product: p,
  onClose,
  onAdd,
}: {
  product: Product;
  onClose: () => void;
  onAdd: (v: Variant, q: number) => void;
}) {
  const [variantId, setVariantId] = useState(
      p.variants.find((v) => v.stock > 0)?.id || p.variants[0].id,
    ),
    [quantity, setQuantity] = useState(p.step === 0.1 ? 1 : p.step);
  const variant = p.variants.find((v) => v.id === variantId)!;
  const valid =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    quantity <= (p.kind === 'service' ? 100000 : variant.stock) &&
    Math.abs(quantity / p.step - Math.round(quantity / p.step)) < 0.0001;
  return (
    <Modal title={p.kind === 'service' ? 'Об услуге' : 'О товаре'} onClose={onClose} wide>
      <div className="product-detail">
        <div className="detail-image">
          <img src={p.image} alt={p.name} />
          <span>Изображение товара носит иллюстративный характер</span>
        </div>
        <div>
          <span className="eyebrow muted">
            {p.brand} · {p.id}
          </span>
          <h2>{p.name}</h2>
          <p className="detail-description">{p.description}</p>
          <dl className="spec-list">
            {Object.entries(p.specs).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <label className="field-label">Исполнение / номинал</label>
          <div className="variant-selector">
            {p.variants.map((v) => (
              <button
                key={v.id}
                disabled={p.kind !== 'service' && v.stock === 0}
                className={v.id === variantId ? 'selected' : ''}
                onClick={() => setVariantId(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="stock-note">
            {p.kind === 'service'
              ? 'Состав работ и срок выполнения согласуем с вами.'
              : `Доступно: ${variant.stock} ${p.unit} · шаг ${p.step} ${p.unit}`}
          </p>
          <div className="detail-price">
            <strong>
              {money(price(p, variant))}
              <small> / {p.unit}</small>
            </strong>
            {p.discount_enabled && <del>{money(variant.price)}</del>}
          </div>
          <div className="detail-buy">
            <div className="quantity">
              <button
                aria-label="Уменьшить количество"
                onClick={() =>
                  setQuantity(Math.max(p.step, Math.round((quantity - p.step) * 1000) / 1000))
                }
              >
                <Minus size={15} />
              </button>
              <input
                aria-label="Количество товара"
                type="number"
                min={p.step}
                max={p.kind === 'service' ? 100000 : variant.stock}
                step={p.step}
                value={quantity || ''}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
              <button
                aria-label="Увеличить количество"
                onClick={() =>
                  setQuantity(
                    Math.min(
                      p.kind === 'service' ? 100000 : variant.stock,
                      Math.round((quantity + p.step) * 1000) / 1000,
                    ),
                  )
                }
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="button primary"
              disabled={!valid}
              onClick={() => onAdd(variant, quantity)}
            >
              <ShoppingCart size={18} /> В корзину · {money(lineTotal(price(p, variant), quantity))}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
