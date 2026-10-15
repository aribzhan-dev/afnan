import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, json, lineTotal, money, price, readStorage } from '../lib';
import type { CartItem, Catalog, OrderResult } from '../types';
import { ErrorBox, Modal } from './UI';
export default function Cart({
  catalog,
  cart,
  onChange,
  onClose,
  onComplete,
}: {
  catalog: Catalog;
  cart: CartItem[];
  onChange: (items: CartItem[]) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [checkout, setCheckout] = useState(false),
    [delivery, setDelivery] = useState('pickup'),
    [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [city, setCity] = useState('Шымкент'),
    [address, setAddress] = useState(''),
    [comment, setComment] = useState(''),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<OrderResult | null>(null);
  const lines = cart.map((item) => {
    const p = catalog.products.find((p) => p.id === item.product_id),
      v = p?.variants.find((v) => v.id === item.variant_id);
    return { item, p, v };
  });
  const total = lines.reduce(
    (sum, { item, p, v }) => sum + (p && v ? lineTotal(price(p, v), item.quantity) : 0),
    0,
  );
  const unavailable = lines.some(
    ({ item, p, v }) =>
      !p ||
      !v ||
      item.quantity > (p.kind === 'service' ? 100000 : v.stock) ||
      Math.abs(item.quantity / p.step - Math.round(item.quantity / p.step)) > 0.0001,
  );
  const update = (index: number, quantity: number) =>
    onChange(
      cart.map((x, i) =>
        i === index ? { ...x, quantity: Math.round(quantity * 1000) / 1000 } : x,
      ),
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        name,
        phone: '+7' + phone,
        delivery,
        city,
        address: delivery === 'delivery' ? address : '',
        comment,
        consent,
        items: cart,
      };
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      const pending = readStorage<{ hash: string; id: string } | null>('kip-pending', null);
      const requestId = pending?.hash === hash ? pending.id : crypto.randomUUID();
      localStorage.setItem('kip-pending', JSON.stringify({ hash, id: requestId }));
      const response = await api<OrderResult>(
        '/orders',
        json('POST', { ...payload, request_id: requestId }),
      );
      setResult(response);
      onChange([]);
      localStorage.removeItem('kip-pending');
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        result ? 'Заказ оформлен' : checkout ? 'Оформление заказа' : `Корзина · ${cart.length}`
      }
      onClose={busy ? () => {} : onClose}
      drawer
    >
      {result ? (
        <div className="order-success">
          <span className="success-icon">
            <CheckCircle2 size={42} />
          </span>
          <h2>Спасибо за заказ!</h2>
          <p>
            Ваш заказ <strong>№{result.id}</strong> сохранён. Магазин свяжется с вами для
            подтверждения наличия, доставки и оплаты.
          </p>
          <div className="success-total">
            <span>Стоимость товаров</span>
            <strong>{money(result.total)}</strong>
          </div>
          <a
            className="button whatsapp"
            href={result.whatsapp_url}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} />
            Отправить заказ в WhatsApp
          </a>
          <p className="fine-print">
            Откроется WhatsApp с готовым сообщением. Нажмите «Отправить», чтобы передать его
            магазину.
          </p>
          <button className="button outline" onClick={onClose}>
            Продолжить покупки
          </button>
        </div>
      ) : cart.length === 0 ? (
        <div className="empty-state cart-empty">
          <ShoppingBag size={45} />
          <h3>Ваша корзина пока пуста</h3>
          <p>Добавьте всё необходимое для вашего проекта.</p>
          <button className="button primary" onClick={onClose}>
            Перейти к покупкам <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <>
          {checkout && (
            <button className="back-link" onClick={() => setCheckout(false)} disabled={busy}>
              <ArrowLeft size={16} />
              Вернуться в корзину
            </button>
          )}
          {!checkout ? (
            <div className="cart-items">
              {lines.map(({ item, p, v }, i) => (
                <div className="cart-line" key={item.product_id + item.variant_id}>
                  <div className="cart-image">
                    <img src={p?.image || '/products/breaker.svg'} alt={p?.name || 'Товар'} />
                  </div>
                  <div className="cart-line-content">
                    <strong>{p?.name || 'Товар удалён из каталога'}</strong>
                    <span>
                      {v?.label || 'Вариант недоступен'} · {p?.unit}
                    </span>
                    <div className="cart-line-bottom">
                      <div className="quantity small">
                        <button
                          aria-label="Уменьшить"
                          disabled={!p || item.quantity <= (p?.step || 1)}
                          onClick={() => update(i, item.quantity - (p?.step || 1))}
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          aria-label={'Количество ' + p?.name}
                          type="number"
                          min={p?.step || 1}
                          max={p?.kind === 'service' ? 100000 : v?.stock || 0}
                          step={p?.step || 1}
                          value={item.quantity}
                          onChange={(e) => {
                            const q = Number(e.target.value);
                            if (Number.isFinite(q) && q > 0) update(i, q);
                          }}
                        />
                        <button
                          aria-label="Увеличить"
                          disabled={
                            !v ||
                            item.quantity + (p?.step || 1) >
                              (p?.kind === 'service' ? 100000 : v.stock)
                          }
                          onClick={() => update(i, item.quantity + (p?.step || 1))}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <b>{p && v ? money(lineTotal(price(p, v), item.quantity)) : '—'}</b>
                    </div>
                    {p && v && (
                      <small>
                        {money(price(p, v))} / {p.unit}
                      </small>
                    )}
                  </div>
                  <button
                    className="icon-button remove-item"
                    aria-label={'Удалить ' + p?.name}
                    onClick={() => onChange(cart.filter((_, index) => index !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {!checkout ? (
            <div className="cart-summary">
              <ErrorBox
                message={
                  unavailable
                    ? 'Проверьте корзину: один из товаров недоступен или количество не соответствует остатку / шагу продажи.'
                    : ''
                }
              />
              <div className="summary-row">
                <span>Товары ({cart.length})</span>
                <strong>{money(total)}</strong>
              </div>
              <p>Доставка рассчитывается отдельно и согласуется с менеджером.</p>
              <button
                className="button primary full"
                disabled={unavailable}
                onClick={() => setCheckout(true)}
              >
                Оформить заказ <ArrowRight size={18} />
              </button>
              <span className="secure-note">
                <ShieldCheck size={15} />
                Оплата после подтверждения менеджером
              </span>
            </div>
          ) : (
            <form className="checkout-form" onSubmit={submit}>
              <fieldset disabled={busy}>
                <legend>
                  <span>1</span>Ваши контакты
                </legend>
                <label>
                  Ваше имя
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^\p{L}\s'’\-]/gu, ''))}
                    autoComplete="name"
                    placeholder="Как к вам обращаться"
                  />
                </label>
                <label>
                  Телефон
                  <span className="phone-input">
                    <span>
                      🇰🇿 <b>+7</b>
                    </span>
                    <input
                      required
                      inputMode="numeric"
                      pattern="[67][0-9]{9}"
                      maxLength={10}
                      minLength={10}
                      value={phone}
                      onChange={(e) => {
                        let digits = e.target.value.replace(/\D/g, '');
                        if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
                        setPhone(digits.slice(0, 10));
                      }}
                      autoComplete="tel-national"
                      placeholder="707 123 45 67"
                      aria-label="Телефон без +7"
                    />
                  </span>
                  <small>10 цифр после +7. Номер Казахстана начинается с 6 или 7.</small>
                </label>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>
                  <span>2</span>Как получить заказ
                </legend>
                <div className="delivery-options">
                  <button
                    type="button"
                    className={delivery === 'pickup' ? 'selected' : ''}
                    onClick={() => setDelivery('pickup')}
                  >
                    <MapPin size={20} />
                    <strong>Самовывоз</strong>
                    <small>Из нашего магазина</small>
                    {delivery === 'pickup' && <Check size={15} />}
                  </button>
                  <button
                    type="button"
                    className={delivery === 'delivery' ? 'selected' : ''}
                    onClick={() => setDelivery('delivery')}
                  >
                    <Truck size={20} />
                    <strong>Доставка</strong>
                    <small>По согласованию</small>
                    {delivery === 'delivery' && <Check size={15} />}
                  </button>
                </div>
                {delivery === 'pickup' ? (
                  <p className="pickup-address">
                    <MapPin size={17} />
                    {catalog.settings.address}
                  </p>
                ) : (
                  <>
                    <label>
                      Город / населённый пункт
                      <input
                        required
                        list="cities"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        maxLength={80}
                        autoComplete="address-level2"
                      />
                      <datalist id="cities">
                        <option>Шымкент</option>
                        <option>Туркестан</option>
                        <option>Астана</option>
                        <option>Алматы</option>
                        <option>Тараз</option>
                      </datalist>
                    </label>
                    <label>
                      Адрес доставки
                      <textarea
                        required
                        minLength={5}
                        maxLength={300}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Улица, дом, квартира или офис"
                        autoComplete="street-address"
                      />
                    </label>
                  </>
                )}
                <label>
                  Комментарий к заказу <span className="optional">необязательно</span>
                  <textarea
                    maxLength={500}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Что нам нужно учесть?"
                  />
                </label>
              </fieldset>
              <div className="order-mini-summary">
                {lines.map(({ item, p, v }) => (
                  <div key={item.product_id + item.variant_id}>
                    <span>
                      {p?.name} · {v?.label}
                      <small>
                        {item.quantity} {p?.unit} × {p && v ? money(price(p, v)) : ''}
                      </small>
                    </span>
                    <b>{p && v ? money(lineTotal(price(p, v), item.quantity)) : ''}</b>
                  </div>
                ))}
              </div>
              <div className="summary-row">
                <span>Итого за товары и услуги</span>
                <strong>{money(total)}</strong>
              </div>
              <p className="fine-print">
                Доставка оплачивается отдельно. Способ оплаты согласует менеджер.
              </p>
              <label className="consent">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Согласен на обработку имени, телефона и адреса для выполнения заказа и передачу
                  данных сотрудникам магазина через Telegram и WhatsApp.
                </span>
              </label>
              <ErrorBox message={error} />
              <button className="button primary full" type="submit" disabled={busy || unavailable}>
                {busy ? 'Сохраняем заказ…' : 'Подтвердить заказ'}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
