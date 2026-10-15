import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, json, money, price } from '../lib';
import type { Catalog, Product, Variant } from '../types';
import { ErrorBox, Modal } from './UI';
const illustrations = [
  ['breaker', 'Автомат'],
  ['rcd', 'УЗО'],
  ['cable', 'Кабель'],
  ['contactor', 'Контактор'],
  ['panel', 'Щит'],
  ['light', 'Прожектор'],
  ['terminal', 'Клемма'],
  ['relay', 'Реле'],
];
export default function ProductForm({
  product,
  catalog,
  onClose,
  onSaved,
}: {
  product: Product | null;
  catalog: Catalog;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<Product>(() =>
    product
      ? structuredClone(product)
      : {
          kind: 'product',
          id: crypto.randomUUID(),
          name: '',
          category: catalog.categories[0]?.id || '',
          brand: '',
          description: '',
          unit: 'шт',
          step: 1,
          image: '/products/breaker.svg',
          discount_enabled: false,
          discount_percent: 15,
          featured: false,
          active: true,
          specs: {},
          variants: [{ id: crypto.randomUUID(), label: 'Стандарт', price: 1000, stock: 10 }],
        },
  );
  const [specs, setSpecs] = useState(() =>
      Object.entries(data.specs).map(([name, value]) => ({ name, value })),
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  function set<K extends keyof Product>(key: K, value: Product[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  function variant(index: number, key: keyof Variant, value: string | number) {
    setData((d) => ({
      ...d,
      variants: d.variants.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (
      specs.some((s) => !s.name.trim() || !s.value.trim()) ||
      new Set(specs.map((s) => s.name.trim())).size !== specs.length
    ) {
      setError('Заполните характеристики. Названия не должны повторяться.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...data,
        specs: Object.fromEntries(specs.map((s) => [s.name.trim(), s.value.trim()])),
      };
      await api(
        '/admin/products' + (product ? '/' + product.id : ''),
        json(product ? 'PUT' : 'POST', payload),
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 4_000_000) {
      setError('Максимальный размер изображения — 4 МБ');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/images', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Не удалось загрузить изображение');
      set('image', body.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <Modal
      title={
        data.kind === 'service'
          ? product
            ? 'Редактировать услугу'
            : 'Новая услуга'
          : product
            ? 'Редактировать товар'
            : 'Новый товар'
      }
      onClose={busy ? () => {} : onClose}
      wide
    >
      <form className="product-form" onSubmit={save}>
        <fieldset disabled={busy || uploading}>
          <div className="product-form-layout">
            <div>
              <h3>Основная информация</h3>
              <label>
                Тип позиции
                <select
                  value={data.kind}
                  onChange={(e) => {
                    const kind = e.target.value as Product['kind'];
                    setData((d) => ({
                      ...d,
                      kind,
                      unit: kind === 'service' ? 'усл' : 'шт',
                      step: 1,
                      category:
                        kind === 'service'
                          ? catalog.categories.find((c) => c.id === 'services')?.id || d.category
                          : d.category,
                      image: kind === 'service' ? '/products/panel.svg' : d.image,
                      variants: d.variants.map((v) => ({
                        ...v,
                        stock: kind === 'service' ? 0 : Math.floor(v.stock),
                      })),
                    }));
                  }}
                >
                  <option value="product">Товар</option>
                  <option value="service">Услуга</option>
                </select>
              </label>
              {data.kind === 'service' && (
                <p className="template-help">
                  Услуга продаётся без складского остатка. Укажите состав работ и условия в
                  описании.
                </p>
              )}
              <label>
                {data.kind === 'service' ? 'Название услуги' : 'Название товара'}
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={data.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Автоматический выключатель 1P"
                />
              </label>
              <div className="form-grid">
                <label>
                  Бренд
                  <input
                    maxLength={60}
                    value={data.brand}
                    onChange={(e) => set('brand', e.target.value)}
                    placeholder="Название производителя"
                  />
                </label>
                <label>
                  Категория
                  <select
                    required
                    value={data.category}
                    onChange={(e) => set('category', e.target.value)}
                  >
                    {catalog.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Описание
                <textarea
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={4}
                  value={data.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Назначение, особенности и условия использования"
                />
              </label>
              <div className="form-grid">
                <label>
                  Единица продажи
                  <select
                    disabled={data.kind === 'service'}
                    value={data.unit}
                    onChange={(e) => {
                      set('unit', e.target.value);
                      set('step', e.target.value === 'м' ? 0.1 : 1);
                    }}
                  >
                    {catalog.units
                      .filter((u) => u.kind === 'sale')
                      .map((u) => (
                        <option value={u.symbol} key={u.id}>
                          {u.name} ({u.symbol})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Шаг продажи
                  <input
                    type="number"
                    required
                    min="0.001"
                    max="1000"
                    step="0.001"
                    readOnly={data.unit === 'шт' || data.kind === 'service'}
                    value={data.step}
                    onChange={(e) => set('step', Number(e.target.value))}
                  />
                </label>
              </div>
              <label>
                Артикул товара
                <input
                  required
                  pattern="[a-zA-Z0-9_-]+"
                  maxLength={80}
                  readOnly={!!product}
                  value={data.id}
                  onChange={(e) => set('id', e.target.value)}
                />
              </label>
            </div>
            <div className="product-form-media">
              <div className="product-preview">
                <img src={data.image} alt="Предпросмотр товара" />
              </div>
              <label className="upload-button">
                <ImagePlus size={17} />
                {uploading ? 'Загрузка…' : 'Загрузить фото'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              <small>PNG, JPEG, WebP · до 4 МБ</small>
              <label>
                Или выберите иллюстрацию
                <select
                  value={data.image.startsWith('/products/') ? data.image : ''}
                  onChange={(e) => set('image', e.target.value)}
                >
                  {!data.image.startsWith('/products/') && (
                    <option value="">Загруженное фото</option>
                  )}
                  {illustrations.map(([id, label]) => (
                    <option value={'/products/' + id + '.svg'} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={data.active}
                  onChange={(e) => set('active', e.target.checked)}
                />
                Опубликовать на сайте
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={data.featured}
                  onChange={(e) => set('featured', e.target.checked)}
                />
                Рекомендуемый товар
              </label>
            </div>
          </div>
          <div className="form-section">
            <div className="panel-heading">
              <div>
                <h3>{data.kind === 'service' ? 'Варианты услуги' : 'Варианты товара'}</h3>
                <p>Например: 3 А, 6 А, 16 А — в одной карточке автомата.</p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  set('variants', [
                    ...data.variants,
                    { id: crypto.randomUUID(), label: '', price: 1000, stock: 0 },
                  ])
                }
              >
                <Plus size={17} />
                Вариант
              </button>
            </div>
            <div className="variant-editor-header">
              <span>Название / номинал</span>
              <span>Цена, ₸ / {data.unit}</span>
              <span>{data.kind === 'service' ? 'Учёт' : `Остаток, ${data.unit}`}</span>
              <span />
            </div>
            {data.variants.map((v, i) => (
              <div className="variant-editor" key={v.id}>
                <input
                  required
                  maxLength={100}
                  aria-label={'Название варианта ' + (i + 1)}
                  value={v.label}
                  onChange={(e) => variant(i, 'label', e.target.value)}
                  placeholder="16 А"
                />
                <input
                  type="number"
                  required
                  min={1}
                  max={100000000}
                  step={1}
                  aria-label={'Цена варианта ' + (i + 1)}
                  value={v.price}
                  onChange={(e) => variant(i, 'price', Number(e.target.value))}
                />
                {data.kind === 'service' ? (
                  <span className="service-stock-label">Без склада</span>
                ) : (
                  <input
                    type="number"
                    required
                    min={0}
                    max={1000000}
                    step={data.step}
                    aria-label={'Остаток варианта ' + (i + 1)}
                    value={v.stock}
                    onChange={(e) => variant(i, 'stock', Number(e.target.value))}
                  />
                )}
                <button
                  type="button"
                  className="icon-button danger"
                  disabled={data.variants.length === 1}
                  aria-label={'Удалить вариант ' + (i + 1)}
                  onClick={() =>
                    set(
                      'variants',
                      data.variants.filter((_, n) => n !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="discount-editor">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={data.discount_enabled}
                onChange={(e) => set('discount_enabled', e.target.checked)}
              />
              <span>
                <strong>Скидка на товар</strong>
                <small>Применяется ко всем вариантам</small>
              </span>
            </label>
            {data.discount_enabled && (
              <div>
                <label>
                  Скидка, %
                  <input
                    required
                    type="number"
                    min={1}
                    max={90}
                    step={1}
                    value={data.discount_percent}
                    onChange={(e) => set('discount_percent', Number(e.target.value))}
                  />
                </label>
                <span>
                  Цена первого варианта: <strong>{money(price(data))}</strong>
                </span>
              </div>
            )}
          </div>
          <div className="form-section">
            <div className="panel-heading">
              <div>
                <h3>Характеристики</h3>
                <p>Вольт — В, ватт — Вт, ампер — А.</p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setSpecs([...specs, { name: '', value: '' }])}
              >
                <Plus size={17} />
                Характеристика
              </button>
            </div>
            {specs.map((s, i) => (
              <div className="spec-editor" key={i}>
                <input
                  list="spec-names"
                  required
                  maxLength={80}
                  value={s.name}
                  aria-label={'Название характеристики ' + (i + 1)}
                  onChange={(e) =>
                    setSpecs(specs.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Напряжение"
                />
                <input
                  required
                  maxLength={200}
                  value={s.value}
                  aria-label={'Значение характеристики ' + (i + 1)}
                  onChange={(e) =>
                    setSpecs(specs.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)))
                  }
                  placeholder="230 В"
                />
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Удалить характеристику"
                  onClick={() => setSpecs(specs.filter((_, n) => n !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <datalist id="spec-names">
              {catalog.units
                .filter((u) => u.kind === 'spec')
                .map((u) => (
                  <option key={u.id} value={u.name + ' (' + u.symbol + ')'} />
                ))}
            </datalist>
          </div>
        </fieldset>
        <ErrorBox message={error} />
        <div className="form-actions">
          <button className="button outline" type="button" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {busy ? 'Сохраняем…' : data.kind === 'service' ? 'Сохранить услугу' : 'Сохранить товар'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
