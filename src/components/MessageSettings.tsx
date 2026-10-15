import { MessageCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, json } from '../lib';
import { ErrorBox } from './UI';
type Templates = { telegram: string; whatsapp: string; customer: string };
const channels = [
  { key: 'telegram', label: 'Telegram — новый заказ' },
  { key: 'whatsapp', label: 'WhatsApp — уведомление магазину' },
  { key: 'customer', label: 'WhatsApp — сообщение клиенту' },
] as const;
const variables = [
  'номер_заказа',
  'имя',
  'телефон',
  'состав_заказа',
  'сумма',
  'получение',
  'магазин',
  'комментарий',
];
export default function MessageSettings() {
  const [data, setData] = useState<Templates | null>(null);
  const [preview, setPreview] = useState<Templates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [channel, setChannel] = useState<keyof Templates>('telegram');
  async function load() {
    try {
      setData(await api<Templates>('/admin/message-templates'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/admin/message-templates', json('PUT', data));
      setNotice('Шаблоны сохранены. Новые заказы будут отправлены с этим текстом.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showPreview() {
    setBusy(true);
    setError('');
    try {
      setPreview(await api<Templates>('/admin/message-templates/preview', json('POST', data)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel message-settings" id="message-templates">
      <div className="settings-title">
        <MessageCircle size={24} />
        <div>
          <h2>Тексты уведомлений</h2>
          <p>Настройте сообщения для магазина и клиента</p>
        </div>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <button className="button outline" onClick={() => void load()}>
          Загрузить шаблоны
        </button>
      ) : (
        <form onSubmit={submit}>
          <div className="settings-channel-tabs" aria-label="Канал сообщения">
            {channels.map((c) => (
              <button
                type="button"
                key={c.key}
                aria-pressed={channel === c.key}
                onClick={() => setChannel(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label>
            {channels.find((c) => c.key === channel)?.label}
            <textarea
              aria-label={channels.find((c) => c.key === channel)?.label}
              rows={9}
              value={data[channel]}
              maxLength={channel === 'customer' ? 600 : 2000}
              required
              disabled={busy}
              onChange={(e) => {
                setData({ ...data, [channel]: e.target.value });
                setPreview(null);
                setNotice('');
              }}
            />
          </label>
          <p className="template-help">
            {channel === 'customer'
              ? 'Текст откроется в WhatsApp при нажатии на контакт клиента. Его можно проверить перед отправкой.'
              : 'Сохраните обязательные переменные: номер заказа, имя, телефон, состав заказа, сумму и получение.'}
          </p>
          <div className="template-variables">
            {variables
              .filter((v) => channel !== 'customer' || v !== 'состав_заказа')
              .map((v) => (
                <code key={v}>{'{' + v + '}'}</code>
              ))}
          </div>
          <p className="template-help">
            Переменные подставляются автоматически. Используйте каждую не более одного раза.
          </p>
          <div className="settings-actions">
            <button className="button primary" disabled={busy}>
              {busy ? 'Подождите…' : 'Сохранить шаблоны'}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => void showPreview()}
            >
              Предпросмотр сообщения
            </button>
          </div>
          {notice && (
            <p role="status" className="settings-success">
              {notice}
            </p>
          )}
          {preview && (
            <div className="message-preview">
              <strong>Пример · сообщение не отправляется</strong>
              <pre>{preview[channel]}</pre>
            </div>
          )}
          <p className="template-help">
            Повторная отправка заказа использует его первоначальный шаблон. Ссылка клиенту в
            админ-панели использует текущий текст. Автоматическая отправка WhatsApp требует
            подключения Business API и одобренного шаблона.
          </p>
        </form>
      )}
    </section>
  );
}
