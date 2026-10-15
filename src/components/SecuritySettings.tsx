import { Check, Circle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, json } from '../lib';
import { ErrorBox } from './UI';
export default function SecuritySettings({ onChanged }: { onChanged: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requirements = [
    { text: 'Не менее 8 символов', valid: Array.from(password).length >= 8 },
    { text: 'Хотя бы одна заглавная буква', valid: /\p{Lu}/u.test(password) },
    { text: 'Хотя бы одна цифра', valid: /[0-9]/.test(password) },
    { text: 'Хотя бы один специальный символ', valid: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
  const valid = requirements.every((x) => x.valid) && password === confirm && !!oldPassword;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(
        '/admin/password',
        json('POST', {
          old_password: oldPassword,
          new_password: password,
          confirm_password: confirm,
        }),
      );
      setOldPassword('');
      setPassword('');
      setConfirm('');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel security-settings">
      <div className="settings-title">
        <ShieldCheck size={24} />
        <div>
          <h2>Безопасность</h2>
          <p>Изменение пароля администратора</p>
        </div>
      </div>
      <p>После смены пароля все сеансы завершатся. Войдите заново с новым паролем.</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Старый пароль
            <input
              type="password"
              required
              maxLength={200}
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </label>
          <label>
            Новый пароль
            <input
              type={visible ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
              aria-describedby="password-requirements"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-button password-visibility"
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}{' '}
            {visible ? 'Скрыть новый пароль' : 'Показать новый пароль'}
          </button>
          <ul className="password-requirements" id="password-requirements" aria-live="polite">
            {requirements.map((x) => (
              <li key={x.text} className={x.valid ? 'met' : ''}>
                {x.valid ? <Check size={16} /> : <Circle size={14} />}
                <span>{x.text}</span>
                <span className="sr-only">{x.valid ? ' — выполнено' : ' — не выполнено'}</span>
              </li>
            ))}
          </ul>
          <label>
            Повторите новый пароль
            <input
              type={visible ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {confirm && confirm !== password && <p className="field-error">Пароли не совпадают</p>}
        </fieldset>
        <ErrorBox message={error} />
        <button className="button primary" disabled={busy || !valid}>
          {busy ? 'Сохраняем…' : 'Изменить пароль'}
        </button>
      </form>
      <p className="security-note">
        Попытки входа и проверки старого пароля ограничены. Для доступа к панели требуется
        авторизация.
      </p>
    </section>
  );
}
