import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, dateLabel, json, money, price, statusLabels } from '../lib';
import type { Analytics, Catalog, Order, OrderStatus, Product, Settings } from '../types';
import MessageSettings from './MessageSettings';
import ProductForm from './ProductForm';
import SecuritySettings from './SecuritySettings';
import { ErrorBox, Logo, Modal, Spinner, ThemeButton } from './UI';
type Tab = 'dashboard' | 'products' | 'orders' | 'dictionaries' | 'settings';
const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { id: 'products', label: 'Товары', icon: Package },
  { id: 'orders', label: 'Заказы', icon: ShoppingBag },
  { id: 'dictionaries', label: 'Категории и единицы', icon: Grid2X2 },
  { id: 'settings', label: 'Настройки магазина', icon: SettingsIcon },
];
export default function Admin({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard'),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [stats, setStats] = useState<Analytics | null>(null),
    [days, setDays] = useState<7 | 30>(30),
    [integrations, setIntegrations] = useState({ telegram: false, whatsapp: false });
  const [editing, setEditing] = useState<Product | 'new' | null>(null),
    [deleting, setDeleting] = useState<Product | null>(null),
    [search, setSearch] = useState('');
  useEffect(() => {
    api('/auth/me')
      .then(() => setAuthenticated(true))
      .catch(() => setAuthenticated(false));
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [c, o, s, i] = await Promise.all([
        api<Catalog>('/admin/catalog'),
        api<Order[]>('/admin/orders'),
        api<Analytics>('/admin/analytics?days=' + days),
        api<{ telegram: boolean; whatsapp: boolean }>('/admin/integrations'),
      ]);
      setCatalog(c);
      setOrders(o);
      setStats(s);
      setIntegrations(i);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [days]);
  useEffect(() => {
    if (authenticated) void refresh();
  }, [authenticated, refresh]);
  useEffect(() => {
    if (notice && authenticated) {
      const t = setTimeout(() => setNotice(''), 4000);
      return () => clearTimeout(t);
    }
  }, [notice, authenticated]);
  const closeEditor = useCallback(() => setEditing(null), []),
    closeDelete = useCallback(() => setDeleting(null), []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', json('POST', { password }));
      setPassword('');
      setAuthenticated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setAuthenticated(false);
      setCatalog(null);
      setOrders([]);
      setStats(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeProduct() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api('/admin/products/' + deleting.id, { method: 'DELETE' });
      closeDelete();
      await refresh();
      setNotice('Товар удалён');
    } catch (e) {
      setError((e as Error).message);
      closeDelete();
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(id: string, status: OrderStatus) {
    setBusy(true);
    try {
      await api('/admin/orders/' + id, json('PATCH', { status }));
      await refresh();
      setNotice('Статус заказа обновлён');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (authenticated === null) return <Spinner />;
  if (!authenticated)
    return (
      <div className="login-page">
        <div className="login-top">
          <Logo />
          <ThemeButton dark={dark} onToggle={onToggle} />
        </div>
        <div className="login-card">
          <div className="login-icon">
            <ShieldCheck size={30} />
          </div>
          <span className="eyebrow muted">КИП И А · УПРАВЛЕНИЕ</span>
          <h1>С возвращением.</h1>
          <p>
            Войдите, чтобы управлять товарами
            <br />и заказами вашего магазина.
          </p>
          <form onSubmit={login}>
            <label>
              Пароль администратора
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                maxLength={200}
              />
            </label>
            {notice && <p role="status">{notice}</p>}
            <ErrorBox message={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? 'Входим…' : 'Войти в панель'}
              <ArrowRight size={18} />
            </button>
          </form>
          <a className="text-button" href="/">
            Перейти на сайт <ArrowUpRight size={16} />
          </a>
        </div>
        <span className="login-footer">Защищённый доступ · КИП и А</span>
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo />
        <span className="sidebar-label">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => {
                setTab(t.id);
                setSearch('');
                setError('');
              }}
            >
              <t.icon size={19} />
              {t.label}
              {t.id === 'orders' && orders.filter((o) => o.status === 'new').length > 0 && (
                <b>{orders.filter((o) => o.status === 'new').length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-shop">
          <div className="shop-dot">
            <Zap size={18} />
          </div>
          <strong>
            КИП и А<small>Магазин электротоваров</small>
          </strong>
          <span className="green-dot" />
        </div>
        <a className="sidebar-site" href="/" target="_blank" rel="noreferrer">
          <ExternalLink size={17} />
          Открыть сайт <ArrowUpRight size={16} />
        </a>
        <button className="sidebar-logout" onClick={() => void logout()}>
          <LogOut size={17} />
          Выйти
        </button>
      </aside>
      <div className="admin-content">
        <header className="admin-header">
          <span>
            Панель управления <ChevronRight size={13} />{' '}
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
          </span>
          <div>
            <ThemeButton dark={dark} onToggle={onToggle} />
            <span className="admin-avatar">А</span>
            <span className="admin-user">
              Администратор<small>Владелец магазина</small>
            </span>
          </div>
        </header>
        <main className="admin-main">
          <ErrorBox message={error} />
          {!catalog || !stats ? (
            <Spinner />
          ) : (
            <>
              <div className="admin-title">
                <div>
                  <span className="eyebrow muted">ВАШ БИЗНЕС ПОД КОНТРОЛЕМ</span>
                  <h1>
                    {tab === 'dashboard' ? 'Обзор магазина' : tabs.find((t) => t.id === tab)?.label}
                  </h1>
                  <p>
                    {tab === 'dashboard'
                      ? 'Всё, что важно для вашего магазина, в одном месте.'
                      : tab === 'products'
                        ? 'Управляйте ассортиментом, ценами и наличием.'
                        : tab === 'orders'
                          ? 'От первого обращения до выполненного заказа.'
                          : tab === 'dictionaries'
                            ? 'Создавайте категории, единицы продажи и характеристики.'
                            : 'Актуальные контакты и информация для покупателей.'}
                  </p>
                </div>
                {tab === 'dashboard' ? (
                  <div className="period-switch">
                    <button className={days === 7 ? 'selected' : ''} onClick={() => setDays(7)}>
                      7 дней
                    </button>
                    <button className={days === 30 ? 'selected' : ''} onClick={() => setDays(30)}>
                      30 дней
                    </button>
                  </div>
                ) : tab === 'products' ? (
                  <button className="button primary" onClick={() => setEditing('new')}>
                    <Plus size={18} />
                    Добавить товар
                  </button>
                ) : tab === 'orders' ? (
                  <button className="button outline" onClick={() => void refresh()}>
                    Обновить заказы
                  </button>
                ) : null}
              </div>
              {tab === 'dashboard' && (
                <>
                  <div className="metric-grid">
                    <Metric
                      icon={Wallet}
                      label="Выручка"
                      value={money(stats.revenue)}
                      hint="По выполненным заказам"
                    />
                    <Metric
                      icon={ShoppingBag}
                      label="Выполненные заказы"
                      value={String(stats.orders)}
                      hint={'За последние ' + days + ' дней'}
                    />
                    <Metric
                      icon={Package}
                      label="Продано товаров"
                      value={
                        Object.entries(stats.quantities)
                          .map(([unit, q]) => `${q} ${unit}`)
                          .join(' / ') || '0'
                      }
                      hint="Единицы считаются отдельно"
                    />
                    <Metric
                      icon={Users}
                      label="Ждут обработки"
                      value={String(stats.active)}
                      hint="Новые и подтверждённые"
                    />
                  </div>
                  <div className="dashboard-panels">
                    <section className="admin-panel revenue-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Продажи за период</h2>
                          <p>Выручка по дате выполнения · Алматы (UTC+5)</p>
                        </div>
                        <BarChart3 size={20} />
                      </div>
                      <div className="chart-total">
                        {money(stats.revenue)}
                        <small>за {days} дней</small>
                      </div>
                      <div className="bar-chart" aria-label="Выручка по дням">
                        {stats.series.map((point) => (
                          <div key={point.date} title={point.date + ': ' + money(point.value)}>
                            <span
                              style={{
                                height:
                                  Math.max(
                                    2,
                                    (point.value /
                                      Math.max(1, ...stats.series.map((p) => p.value))) *
                                      130,
                                  ) + 'px',
                              }}
                              className={point.value === 0 ? 'zero' : ''}
                            />
                            <small>{new Date(point.date).getDate()}</small>
                          </div>
                        ))}
                      </div>
                      {stats.orders === 0 && (
                        <p className="chart-empty">
                          Здесь появятся реальные продажи после выполнения первого заказа.
                        </p>
                      )}
                    </section>
                    <section className="admin-panel bestseller-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Лидеры продаж</h2>
                          <p>По выручке за выбранный период</p>
                        </div>
                        <TrendingUp size={20} />
                      </div>
                      {stats.top.length ? (
                        stats.top.map((p, i) => (
                          <div className="top-product" key={p.id}>
                            <span className="rank">0{i + 1}</span>
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {p.quantity} {p.unit}
                              </small>
                            </div>
                            <b>{money(p.revenue)}</b>
                          </div>
                        ))
                      ) : (
                        <div className="empty-panel">
                          <Tag size={32} />
                          <strong>Будущий хит — уже в каталоге</strong>
                          <p>Рейтинг появится после первых продаж.</p>
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="admin-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Последние заказы</h2>
                        <p>Новые обращения покупателей</p>
                      </div>
                      <button className="text-button" onClick={() => setTab('orders')}>
                        Все заказы <ArrowRight size={16} />
                      </button>
                    </div>
                    <OrderList
                      orders={orders.slice(0, 5)}
                      busy={busy}
                      onStatus={changeStatus}
                      onRetry={async (id) => {
                        await api('/admin/orders/' + id + '/retry', { method: 'POST' });
                        await refresh();
                      }}
                    />
                  </section>
                  <div className="integration-strip">
                    <MessageCircle size={22} />
                    <div>
                      <strong>Уведомления о заказах</strong>
                      <p>
                        Telegram: {integrations.telegram ? 'настроен' : 'не подключён'} · WhatsApp
                        API: {integrations.whatsapp ? 'настроен' : 'не подключён'}
                      </p>
                    </div>
                    <button className="text-button" onClick={() => setTab('settings')}>
                      Настройки <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}
              {tab === 'products' && (
                <section className="admin-panel">
                  <div className="table-toolbar">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        placeholder="Название, бренд или артикул"
                        aria-label="Поиск в товарах"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <span>{catalog.products.length} товаров и услуг в каталоге</span>
                  </div>
                  <div className="table-scroll">
                    <table className="product-table">
                      <thead>
                        <tr>
                          <th>Товар</th>
                          <th>Категория</th>
                          <th>Цена от</th>
                          <th>Варианты / остаток</th>
                          <th>Статус</th>
                          <th aria-label="Действия" />
                        </tr>
                      </thead>
                      <tbody>
                        {catalog.products
                          .filter((p) =>
                            `${p.name} ${p.brand} ${p.id}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((p) => (
                            <tr key={p.id}>
                              <td>
                                <div className="table-product">
                                  <img src={p.image} alt="" />
                                  <div>
                                    <strong>{p.name}</strong>
                                    <small>
                                      {p.kind === 'service' ? 'Услуга' : p.brand} · {p.id}
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td>{catalog.categories.find((c) => c.id === p.category)?.name}</td>
                              <td>
                                <strong>
                                  {money(Math.min(...p.variants.map((v) => price(p, v))))}
                                </strong>
                                {p.discount_enabled && (
                                  <span className="table-discount">−{p.discount_percent}%</span>
                                )}
                              </td>
                              <td>
                                {p.variants.length} вариантов
                                <small>
                                  {p.kind === 'service'
                                    ? 'По согласованию'
                                    : `${Math.round(p.variants.reduce((s, v) => s + v.stock, 0) * 1000) / 1000} ${p.unit}`}
                                </small>
                              </td>
                              <td>
                                <span
                                  className={
                                    'status-badge ' + (p.active ? 'completed' : 'cancelled')
                                  }
                                >
                                  {p.active ? 'Опубликован' : 'Скрыт'}
                                </span>
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="icon-button"
                                    aria-label={'Редактировать ' + p.name}
                                    onClick={() => setEditing(p)}
                                  >
                                    <Pencil size={17} />
                                  </button>
                                  <button
                                    className="icon-button danger"
                                    aria-label={'Удалить ' + p.name}
                                    onClick={() => setDeleting(p)}
                                  >
                                    <Trash2 size={17} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {catalog.products.length === 0 && (
                    <div className="empty-state">
                      <Package size={35} />
                      <h3>Добавьте первый товар</h3>
                    </div>
                  )}
                </section>
              )}
              {tab === 'orders' && (
                <OrdersPanel
                  orders={orders}
                  busy={busy}
                  onStatus={changeStatus}
                  onRetry={async (id) => {
                    try {
                      await api('/admin/orders/' + id + '/retry', { method: 'POST' });
                      await refresh();
                      setNotice('Повторная отправка запланирована');
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              )}
              {tab === 'dictionaries' && (
                <Dictionaries
                  catalog={catalog}
                  onSaved={async () => {
                    await refresh();
                    setNotice('Справочник обновлён');
                  }}
                />
              )}
              {tab === 'settings' && (
                <SettingsForm
                  onPasswordChanged={() => {
                    setAuthenticated(false);
                    setCatalog(null);
                    setOrders([]);
                    setStats(null);
                    setPassword('');
                    setError('');
                    setNotice('Пароль изменён. Войдите с новым паролем.');
                  }}
                  shop={catalog.settings}
                  integrations={integrations}
                  onSaved={async () => {
                    await refresh();
                    setNotice('Настройки сохранены');
                  }}
                />
              )}
            </>
          )}
        </main>
        <footer className="admin-footer">
          <span>КИП и А · Панель управления</span>
          <a href="/" target="_blank" rel="noreferrer">
            Открыть магазин <ArrowUpRight size={13} />
          </a>
        </footer>
      </div>
      {editing && catalog && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          catalog={catalog}
          onClose={closeEditor}
          onSaved={async () => {
            closeEditor();
            await refresh();
            setNotice('Товар сохранён');
          }}
        />
      )}
      {deleting && (
        <Modal title="Удалить товар?" onClose={closeDelete}>
          <div className="prose">
            <p>
              Товар «{deleting.name}» будет удалён из каталога. История выполненных заказов
              сохранится.
            </p>
            <div className="form-actions">
              <button className="button outline" onClick={closeDelete}>
                Отмена
              </button>
              <button
                className="button danger-button"
                disabled={busy}
                onClick={() => void removeProduct()}
              >
                Удалить товар
              </button>
            </div>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="metric-card">
      <div>
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function OrdersPanel(props: {
  orders: Order[];
  busy: boolean;
  onStatus: (id: string, s: OrderStatus) => void;
  onRetry: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('');
  return (
    <section className="admin-panel">
      <div className="table-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label="Поиск заказа"
            placeholder="Номер заказа, имя или телефон"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Статус заказа"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Все статусы</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <OrderList
        {...props}
        orders={props.orders.filter(
          (o) =>
            (filter === 'all' || o.status === filter) &&
            `${o.id} ${o.name} ${o.phone}`.toLowerCase().includes(search.toLowerCase()),
        )}
      />
    </section>
  );
}
function OrderList({
  orders,
  busy,
  onStatus,
  onRetry,
}: {
  orders: Order[];
  busy: boolean;
  onStatus: (id: string, s: OrderStatus) => void;
  onRetry: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null),
    [retrying, setRetrying] = useState(false),
    [error, setError] = useState('');
  if (!orders.length)
    return (
      <div className="empty-panel">
        <ShoppingBag size={34} />
        <strong>Пока нет заказов</strong>
        <p>Заказы покупателей появятся здесь автоматически.</p>
      </div>
    );
  return (
    <div className="orders-list">
      <ErrorBox message={error} />
      {orders.map((o) => (
        <div key={o.id} className="order-row">
          <div className="order-main">
            <button
              className="order-expand"
              onClick={() => setExpanded(expanded === o.id ? null : o.id)}
              aria-expanded={expanded === o.id}
            >
              <ChevronDown size={17} className={expanded === o.id ? 'rotated' : ''} />
              <span>
                <strong>#{o.id}</strong>
                <small>{dateLabel(o.created_at)}</small>
              </span>
            </button>
            <div className="order-client">
              <strong>{o.name}</strong>
              <a href={o.whatsapp_url} target="_blank" rel="noreferrer">
                <MessageCircle size={13} />
                {o.phone}
              </a>
            </div>
            <span className={'status-badge ' + o.status}>{statusLabels[o.status]}</span>
            <strong>{money(o.total)}</strong>
            <a
              className="order-whatsapp"
              href={o.whatsapp_url}
              target="_blank"
              rel="noreferrer"
              aria-label={'Написать ' + o.name + ' в WhatsApp'}
            >
              <MessageCircle size={18} />
              <span>WhatsApp</span>
            </a>
          </div>
          {expanded === o.id && (
            <div className="order-details">
              <div className="order-items">
                {o.items.map((i) => (
                  <div key={i.product_id + i.variant_id}>
                    <span>
                      <strong>{i.name}</strong>
                      <small>
                        {i.variant_label} · {money(i.unit_price)} × {i.quantity} {i.unit}
                      </small>
                    </span>
                    <b>{money(i.total)}</b>
                  </div>
                ))}
              </div>
              <p>
                <strong>Получение:</strong>{' '}
                {o.delivery === 'pickup' ? 'Самовывоз' : o.city + ', ' + o.address}
              </p>
              {o.comment && (
                <p>
                  <strong>Комментарий:</strong> {o.comment}
                </p>
              )}
              <div className="order-actions">
                <label>
                  Статус заказа
                  <select
                    aria-label={'Статус заказа ' + o.id}
                    disabled={busy || ['completed', 'cancelled'].includes(o.status)}
                    value={o.status}
                    onChange={(e) => onStatus(o.id, e.target.value as OrderStatus)}
                  >
                    <option value={o.status}>{statusLabels[o.status]}</option>
                    {o.status === 'new' && <option value="confirmed">Подтверждён</option>}
                    {o.status === 'confirmed' && <option value="completed">Выполнен</option>}
                    {['new', 'confirmed'].includes(o.status) && (
                      <option value="cancelled">Отменён</option>
                    )}
                  </select>
                </label>
                <div className="notification-state">
                  {o.notifications.map((n) => (
                    <span key={n.channel}>
                      {n.channel === 'telegram' ? 'Telegram' : 'WhatsApp'}:{' '}
                      {{
                        pending: 'в очереди',
                        sending: 'отправляется',
                        sent: 'принято сервисом',
                        failed: 'ошибка',
                        unconfigured: 'не настроен',
                      }[n.status] || n.status}
                      {n.error && <small>{n.error}</small>}
                    </span>
                  ))}
                </div>
                {o.notifications.some((n) => ['failed', 'unconfigured'].includes(n.status)) && (
                  <button
                    className="button outline small-button"
                    disabled={retrying}
                    onClick={async () => {
                      setRetrying(true);
                      try {
                        await onRetry(o.id);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setRetrying(false);
                      }
                    }}
                  >
                    Повторить уведомления
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function Dictionaries({ catalog, onSaved }: { catalog: Catalog; onSaved: () => Promise<void> }) {
  const [kind, setKind] = useState<'categories' | 'units'>('categories'),
    [name, setName] = useState(''),
    [symbol, setSymbol] = useState(''),
    [unitKind, setUnitKind] = useState('sale'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(
        '/admin/dictionaries/' + kind,
        json('POST', {
          id: crypto.randomUUID(),
          name,
          symbol: kind === 'units' ? symbol : '',
          kind: unitKind,
        }),
      );
      setName('');
      setSymbol('');
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await api('/admin/dictionaries/' + kind + '/' + id, { method: 'DELETE' });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dictionary-layout">
      <section className="admin-panel">
        <div className="table-toolbar">
          <div className="period-switch">
            <button
              className={kind === 'categories' ? 'selected' : ''}
              onClick={() => setKind('categories')}
            >
              Категории
            </button>
            <button className={kind === 'units' ? 'selected' : ''} onClick={() => setKind('units')}>
              Единицы измерения
            </button>
          </div>
        </div>
        <div className="dictionary-list">
          {catalog[kind].map((item) => (
            <div key={item.id}>
              <span className="dictionary-icon">
                {kind === 'categories' ? <Grid2X2 size={19} /> : item.symbol}
              </span>
              <div>
                <strong>{item.name}</strong>
                {kind === 'units' && (
                  <small>
                    {item.kind === 'sale' ? 'Единица продажи' : 'Характеристика товара'}
                  </small>
                )}
              </div>
              <button
                className="icon-button danger"
                disabled={busy}
                aria-label={'Удалить ' + item.name}
                onClick={() => void remove(item.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-panel dictionary-form">
        <h2>{kind === 'categories' ? 'Новая категория' : 'Новая единица'}</h2>
        <p>Используемые в товарах записи защищены от удаления.</p>
        <form onSubmit={submit}>
          <label>
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder={
                kind === 'categories' ? 'Например, Розетки и выключатели' : 'Например, Ампер'
              }
            />
          </label>
          {kind === 'units' && (
            <>
              <label>
                Обозначение
                <input
                  required
                  maxLength={20}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="А"
                />
              </label>
              <label>
                Назначение
                <select value={unitKind} onChange={(e) => setUnitKind(e.target.value)}>
                  <option value="sale">Продажа (шт, м, упаковка)</option>
                  <option value="spec">Характеристика (А, В, Вт)</option>
                </select>
              </label>
            </>
          )}
          <ErrorBox message={error} />
          <button className="button primary full" disabled={busy}>
            <Plus size={17} />
            Добавить
          </button>
        </form>
      </section>
    </div>
  );
}
function SettingsForm({
  onPasswordChanged,
  shop,
  integrations,
  onSaved,
}: {
  onPasswordChanged: () => void;
  shop: Settings;
  integrations: { telegram: boolean; whatsapp: boolean };
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState({
      phone: shop.phone,
      address: shop.address,
      hours: shop.hours,
      about: shop.about,
      delivery_note: shop.delivery_note,
      demo: shop.demo,
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/settings', json('PUT', data));
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-stack">
      <div className="settings-layout">
        <form className="admin-panel settings-form" onSubmit={submit}>
          <h2>Информация о магазине</h2>
          <p>Название и ссылка 2ГИС закреплены за магазином «КИП и А».</p>
          <div className="form-grid">
            <label>
              Название
              <input value={shop.name} disabled />
            </label>
            <label>
              Телефон / WhatsApp
              <input
                required
                pattern="\+7[67][0-9]{9}"
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                placeholder="+77071234567"
              />
            </label>
          </div>
          <label>
            Адрес
            <input
              required
              minLength={5}
              maxLength={250}
              value={data.address}
              onChange={(e) => setData({ ...data, address: e.target.value })}
            />
          </label>
          <label>
            Время работы
            <input
              required
              minLength={3}
              maxLength={120}
              value={data.hours}
              onChange={(e) => setData({ ...data, hours: e.target.value })}
            />
          </label>
          <label>
            О магазине
            <textarea
              required
              minLength={20}
              maxLength={2000}
              rows={5}
              value={data.about}
              onChange={(e) => setData({ ...data, about: e.target.value })}
            />
          </label>
          <label>
            Условия получения
            <textarea
              required
              minLength={10}
              maxLength={500}
              rows={3}
              value={data.delivery_note}
              onChange={(e) => setData({ ...data, delivery_note: e.target.value })}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={data.demo}
              onChange={(e) => setData({ ...data, demo: e.target.checked })}
            />
            Показывать отметку о демонстрационном ассортименте
          </label>
          <ErrorBox message={error} />
          <button className="button primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить изменения'}
          </button>
        </form>
        <div>
          <section className="admin-panel integration-card">
            <MessageCircle size={25} />
            <h2>Каналы уведомлений</h2>
            <a className="text-button" href="#message-templates">
              Настроить тексты сообщений <ArrowRight size={16} />
            </a>
            <div>
              <strong>Telegram</strong>
              <span className={'status-badge ' + (integrations.telegram ? 'completed' : 'new')}>
                {integrations.telegram ? 'Настроен' : 'Не подключён'}
              </span>
            </div>
            <div>
              <strong>WhatsApp Business API</strong>
              <span className={'status-badge ' + (integrations.whatsapp ? 'completed' : 'new')}>
                {integrations.whatsapp ? 'Настроен' : 'Не подключён'}
              </span>
            </div>
            <p>
              Ключи подключения хранятся на сервере. После настройки интеграции перезапустите
              backend и повторите отправку в нужном заказе.
            </p>
            <p>
              Ссылки «Написать в WhatsApp» работают без API. Автоматическая отправка требует
              подключения WhatsApp Business и одобренного шаблона.
            </p>
          </section>
          <section className="admin-panel integration-card">
            <ShieldCheck size={25} />
            <h2>Статусы и аналитика</h2>
            <p>
              В статистику продаж попадают только выполненные заказы. Отмена возвращает товар на
              склад. Выручка не включает доставку.
            </p>
            <a className="text-button" href={shop.map_url} target="_blank" rel="noreferrer">
              Карточка магазина в 2ГИС <ArrowUpRight size={16} />
            </a>
          </section>
        </div>
      </div>
      <MessageSettings />
      <SecuritySettings onChanged={onPasswordChanged} />
    </div>
  );
}
