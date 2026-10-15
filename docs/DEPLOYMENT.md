# Развёртывание КИП и А на общем сервере

Инструкция для самостоятельного выполнения владельцем сервера. Команды в этом документе не выполнялись на сервере. Примеры рассчитаны на **Ubuntu 24.04 / совместимую систему с systemd, Python 3.12+ и уже работающим Nginx**. Для другой ОС сначала уточните её версию и пути конфигурации.

Исходные условия: 1 CPU, 2 ГБ RAM, несколько существующих проектов без Docker. Перед началом нужно выяснить фактическое потребление ресурсов. Обещать отсутствие влияния на соседние проекты без этих замеров нельзя.

## 1. Схема размещения

| Компонент            | Отдельный ресурс этого магазина                               |
| -------------------- | ------------------------------------------------------------- |
| Исходники            | `/srv/kip-store/app`                                          |
| Пользователь сервиса | `kip-store`, без интерактивного входа                         |
| Python               | Собственное окружение `.venv` внутри проекта                  |
| Процесс              | `kip-store.service`, один Uvicorn worker                      |
| Внутренний порт      | `127.0.0.1:8105`, только если свободен                        |
| Рабочие данные       | `/var/lib/kip-store/store.db` и `/var/lib/kip-store/uploads/` |
| Секреты              | `/etc/kip-store/kip-store.env`                                |
| Nginx                | Только новый файл `sites-available/kip-store` и его ссылка    |
| Frontend             | Готовый `dist/`, собранный на компьютере или в CI             |

Docker для этого варианта не требуется. Не устанавливайте его только ради этой инструкции. Не меняйте глобальные версии Node/Python, используемые другими проектами. Не останавливайте чужие сервисы, не удаляйте их Nginx-конфиги и не используйте `default_server` для нового сайта.

Выберите настоящий домен и замените **все** `shop.example.kz` в шаблонах. `OWNER/REPOSITORY` — ваш новый репозиторий, не репозиторий Hafiz. Команды выполняются по шагам; если проверка не прошла, зависимые команды не выполняйте.

## 2. Подготовить Git на своём компьютере

Для этой рабочей папки репозиторий ещё не инициализирован. Если вы уже сделали это самостоятельно, повторять инициализацию и добавление `origin` не нужно.

```bash
cd /Users/admin/Desktop/Afnan
git init -b main
git add .
git status --short
git diff --cached --stat
git diff --cached --name-only
```

- `git init -b main` создаёт локальный репозиторий и ветку `main`.
- `git add .` формирует индекс, учитывая `.gitignore`; публикации ещё нет.
- Остальные команды позволяют проверить, какие файлы попадут в первый коммит.

В списке должны быть исходники, конфигурации-примеры, `public/`, документация и `artifacts/readme/`. Не должно быть `.env`, `admin-access.txt`, `data/store.db`, `data/uploads/`, резервных копий, `.venv`, `node_modules`, `dist`, `test-results`, trace/video/coverage и необработанных `artifacts/*.png`.

```bash
git check-ignore .env admin-access.txt data/store.db test-results/example/trace.zip artifacts/admin-dashboard.png
git check-ignore artifacts/readme/hero.png
```

Первая команда должна перечислить исключённые файлы. Вторая **не должна вывести ничего** и вернёт код 1 — это ожидаемо: обложка разрешена к публикации.

Если секрет уже добавлен в индекс, уберите **конкретный** файл командой `git rm --cached -- PATH`, не удаляя рабочую копию. Если он уже опубликован, одного `.gitignore` недостаточно: отзовите секрет и отдельно исправьте историю.

После проверки создайте на GitHub пустой репозиторий без автоматически созданного README. Затем **вы самостоятельно** выполняете:

```bash
git commit -m "Подготовить магазин КИП и А"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

`commit` сохраняет проверенную версию локально, `remote add` указывает ваш репозиторий, `push` публикует её. Для приватного репозитория используйте менеджер учётных данных; не включайте токен в URL или команды.

## 3. Собрать frontend вне сервера

Это исключает тяжёлую сборку Node.js на занятом сервере. Исходники сервер получает из Git, готовый frontend — отдельным архивом **того же коммита**.

```bash
npm ci
npm run build
git status --short
KIP_REV=$(git rev-parse --short=12 HEAD)
mkdir -p release
COPYFILE_DISABLE=1 tar -czf "release/kip-frontend-${KIP_REV}.tar.gz" dist
(cd release && shasum -a 256 "kip-frontend-${KIP_REV}.tar.gz" > "kip-frontend-${KIP_REV}.tar.gz.sha256")
```

- `npm ci` ставит точные версии зависимостей.
- `npm run build` проверяет TypeScript и создаёт `dist/`.
- `git status` должен быть пустым: сборка должна соответствовать опубликованному коммиту.
- Архив включает **только `dist/`**. Ни база, ни `.env`, ни тестовые результаты в него не входят.
- SHA-256 нужен для проверки целостности после передачи.

Загрузите архив и `.sha256` через веб-интерфейс GitHub Releases или через файловую панель сервера. Не архивируйте всю папку проекта. В дальнейшем в инструкции предполагается, что эти два файла находятся на сервере в `/srv/kip-store/incoming/`. Для приватного репозитория используйте авторизованную загрузку или файловую панель, а не токен в открытой ссылке.

## 4. Сначала только осмотр сервера

Выполните в уже открытом терминале сервера:

```bash
cat /etc/os-release
free -h
df -h
uptime
ps -eo pid,comm,%cpu,%mem,rss --sort=-rss | head -15
sudo ss -ltnp
systemctl --type=service --state=running --no-pager
python3 --version
command -v python3.12
command -v certbot
sudo nginx -t
```

| Проверка                  | Зачем                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| ОС и Python               | Подтвердить совместимость, не заменяя Python других проектов                      |
| `free -h`, `ps`, `uptime` | Узнать доступную RAM и нагрузку, а не ориентироваться только на 2 ГБ в тарифе     |
| `df -h`                   | Проверить место под зависимости, изображения и резервные копии                    |
| `ss -ltnp`                | Убедиться, что 8105 свободен; при занятости выбрать другой порт в сервисе и Nginx |
| `systemctl …`             | Зафиксировать работающие приложения до изменения                                  |
| `nginx -t`                | Проверить исходную исправность конфигурации                                       |

Сохраните контрольные ответы **каждого существующего сайта**, например `curl -I https://EXISTING_DOMAIN`. Повторите их после reload. Не выполняйте команду с буквальным `EXISTING_DOMAIN` — подставьте реальные домены.

Ориентир перед запуском: запас доступной памяти хотя бы порядка 500–700 МБ и отсутствие постоянного swap/OOM. Это запас для начала проверки, не гарантия ёмкости. Если ресурсов нет, сначала разберите нагрузку. Удаление одного старого проекта — отдельная операция после определения его сервиса, домена и базы; эта инструкция ничего за него не удаляет.

Не запускайте системное обновление, переустановку Nginx или смену firewall вместе с этим deploy. Если Python 3.12, venv или Certbot отсутствует, сначала согласуйте установку под вашу ОС: пакетный менеджер может затронуть общий сервер.

## 5. Отдельные каталог и пользователь

Проверьте, что имена ещё не заняты:

```bash
getent passwd kip-store
sudo test ! -e /srv/kip-store
sudo test ! -e /etc/systemd/system/kip-store.service
sudo test ! -e /etc/nginx/sites-available/kip-store
```

`getent` на первом развёртывании должен ничего не найти; остальные проверки должны завершиться успешно. При существующих ресурсах выясните, кому они принадлежат; не перезаписывайте их автоматически.

```bash
sudo useradd --system --user-group --home-dir /var/lib/kip-store --shell /usr/sbin/nologin kip-store
sudo install -d -o "$USER" -g "$(id -gn)" -m 0755 /srv/kip-store
install -d -m 0700 /srv/kip-store/incoming
sudo install -d -o kip-store -g kip-store -m 0700 /var/lib/kip-store
sudo install -d -o root -g root -m 0700 /etc/kip-store
git clone https://github.com/OWNER/REPOSITORY.git /srv/kip-store/app
cd /srv/kip-store/app
python3.12 -m venv .venv
.venv/bin/pip install --no-cache-dir -r backend/requirements.lock
```

Код принадлежит пользователю развёртывания; сервис работает от отдельного пользователя. `venv` не меняет зависимости чужих приложений. База и загрузки живут вне checkout, поэтому обновление Git их не заменит. Создание каталогов и установка Python-зависимостей выполняются только для этого магазина.

Если политика вашего пользователя создаёт закрытые файлы, дайте сервису доступ к чтению **только этого checkout**:

```bash
chmod -R a+rX /srv/kip-store/app
```

На этом шаге в checkout нет секретов. Никогда не применяйте эту команду к `/etc/kip-store` или `/var/lib/kip-store`.

## 6. Установить сборку того же коммита

После загрузки двух файлов в `incoming/`:

```bash
cd /srv/kip-store/app
KIP_REV=$(git rev-parse --short=12 HEAD)
(cd /srv/kip-store/incoming && sha256sum -c "kip-frontend-${KIP_REV}.tar.gz.sha256")
tar -tzf "/srv/kip-store/incoming/kip-frontend-${KIP_REV}.tar.gz"
tar -xzf "/srv/kip-store/incoming/kip-frontend-${KIP_REV}.tar.gz" -C /srv/kip-store/app
test -f dist/index.html
chmod -R a+rX dist
```

Проверьте, что список архива содержит только `dist/` и его содержимое, без абсолютных путей и `..`. Не распаковывайте непроверенный чужой архив. При ошибке хеша или несовпадении коммита остановитесь и загрузите верную сборку.

## 7. Настройки и первоначальный пароль

```bash
sudo install -m 0600 deploy/production.env.example /etc/kip-store/kip-store.env
sudoedit /etc/kip-store/kip-store.env
```

Редактор открывает файл только нового проекта. Укажите настоящий домен в `ALLOWED_ORIGINS`, оставьте `COOKIE_SECURE=true`, `SEED_DEMO_DATA=false` и абсолютный `DATABASE_PATH=/var/lib/kip-store/store.db`.

Для **первого пароля** выполните эту команду на сервере. Пароль вводится скрыто, в историю команд не попадает. Выводится только хеш; вставьте его после `ADMIN_PASSWORD_HASH=` в закрытом файле настроек.

```bash
.venv/bin/python - <<'PY'
import getpass
import hashlib
import secrets
from backend.app.schemas import PasswordChange
password = getpass.getpass('Новый пароль администратора: ')
confirmation = getpass.getpass('Повторите пароль: ')
try:
    PasswordChange(old_password='initial', new_password=password, confirm_password=confirmation)
except ValueError:
    raise SystemExit('Пароли должны совпадать: 8–200 символов, заглавная буква, цифра и специальный символ.')
salt = secrets.token_hex(32)
digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 600_000).hex()
print(salt + ':' + digest)
PY
```

Не присылайте пароль или полный файл настроек в переписку. `EnvironmentFile` читает systemd; API не раскрывает токены. После первой смены пароля через админ-панель актуальный хеш находится в SQLite, а начальный из env больше не используется.

**Новая production-база пустая:** без демонстрационных товаров, услуг, заказов и клиентов. Создаются только таблицы, контакты магазина, категории и единицы. Заполните реальные товары и услуги через админ-панель. Не переносите локальную `data/`, даже если там уже создан удобный каталог: перенос реальных данных требует отдельной проверенной миграции.

## 8. Запустить только сервис магазина

```bash
sudo install -m 0644 deploy/kip-store.service /etc/systemd/system/kip-store.service
sudoedit /etc/systemd/system/kip-store.service
sudo systemd-analyze verify /etc/systemd/system/kip-store.service
sudo systemctl daemon-reload
sudo systemctl enable --now kip-store.service
sudo systemctl status kip-store.service --no-pager
curl --fail http://127.0.0.1:8105/api/health
curl --fail http://127.0.0.1:8105/api/catalog
sudo journalctl -u kip-store.service -n 50 --no-pager
```

- `sudoedit` позволяет проверить пути и заменить 8105, если вы выбрали другой свободный порт.
- `verify` проверяет unit-файл до запуска.
- `daemon-reload` перечитывает описания systemd; сам по себе не перезапускает другие приложения.
- `enable --now` включает автозапуск и запускает только `kip-store.service`.
- Health должен вернуть `{"status":"ok"}`, каталог — `products: []`.
- `journalctl -u` показывает журнал только магазина.

В шаблоне: один worker, лимит 32 одновременно обрабатываемых соединений, `MemoryHigh=256M`, `MemoryMax=384M`, `CPUQuota=50%`, `Nice=10`. Это начальные ограничения для общего сервера: при превышении памяти процесс может завершиться и перезапуститься, при высокой нагрузке будут задержки или 503. Не повышайте лимиты, не проверив запас ресурсов остальных проектов. Эффективность лимитов зависит от systemd/cgroup на сервере.

## 9. Отдельный Nginx-конфиг и TLS

Убедитесь, что Nginx действительно включает `/etc/nginx/sites-enabled/*`. На системах с `conf.d` путь будет другой — не создавайте новый глобальный include без проверки существующей конфигурации.

```bash
sudo nginx -T 2>&1 | grep -E 'include.*sites-enabled|server_name|listen '
sudo cp -a /etc/nginx "/root/nginx-before-kip-$(date +%Y%m%d-%H%M%S)"
```

Первая команда помогает увидеть подключение сайтов, домены и порты. Выбранный домен не должен повторяться в чужом server block. Вторая делает резервную копию конфигурации до изменения.

В установленных ниже копиях конфигов замените `shop.example.kz` на свой домен через `sudoedit`. Если меняли 8105, замените его и в установленном HTTPS-конфиге. Исходные шаблоны внутри Git оставьте неизменными. Проверьте A/AAAA DNS: они должны вести на этот сервер. Не добавляйте неработающий AAAA.

Начните с HTTP-конфига, который открывает только проверку сертификата, а приложению возвращает 503:

```bash
sudo install -d -m 0755 /var/www/kip-store-acme
sudo install -m 0644 deploy/nginx-http.conf.example /etc/nginx/sites-available/kip-store
sudoedit /etc/nginx/sites-available/kip-store
sudo ln -s /etc/nginx/sites-available/kip-store /etc/nginx/sites-enabled/kip-store
sudo nginx -t
```

Только если последняя проверка прошла без ошибок и конфликтующих имён:

```bash
sudo systemctl reload nginx
```

`reload` перечитывает конфигурацию с плавной сменой worker-процессов. Не используйте restart/stop Nginx для этой операции. После reload проверьте все существующие сайты по сохранённым адресам. [Как Nginx применяет reload](https://nginx.org/en/docs/beginners_guide.html#control).

Если Certbot уже установлен и порт 80 доступен для этого домена:

```bash
sudo certbot certonly --webroot -w /var/www/kip-store-acme -d shop.example.kz
```

`certonly --webroot` получает сертификат через выделенный каталог, не редактируя чужие Nginx-конфиги. Ответьте на запросы контакта и условий. Используйте реальный домен. Если сертификат обслуживается другим средством, используйте его существующий порядок выдачи и корректные пути, не запускайте параллельную схему вслепую.

После получения сертификата:

```bash
sudo install -m 0644 deploy/nginx-https.conf.example /etc/nginx/sites-available/kip-store
sudoedit /etc/nginx/sites-available/kip-store
sudo nginx -t
```

При успешной проверке:

```bash
sudo systemctl reload nginx
curl --fail https://shop.example.kz/api/health
curl -I https://shop.example.kz/admin
```

Админ-панель открывается только через HTTPS: secure-cookie по HTTP не сохранится. Uvicorn доверяет proxy-заголовкам лишь от `127.0.0.1`; Nginx передаёт свой `$remote_addr`, не доверяя произвольному входящему X-Forwarded-For. Шаблон предполагает прямой доступ к Nginx; если перед ним CDN, настройка реального IP требует отдельной проверки доверенных адресов. [Параметры Uvicorn](https://www.uvicorn.org/settings/#http).

Для продления сертификата проверьте существующий timer/cron Certbot. Само продление не гарантирует перечитывание сертификата Nginx. Добавьте в уже используемый механизм deploy-hook `nginx -t && systemctl reload nginx`, если эквивалентного hook ещё нет; не создавайте дубликаты. Проверку обновления ограничьте новым сертификатом: `sudo certbot renew --cert-name shop.example.kz --dry-run`. [Документация Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

## 10. Проверка после запуска

1. Откройте существующие сайты и сравните ответы с состоянием до deploy.
2. Проверьте `free -h`, загрузку и `systemctl status kip-store.service`.
3. Войдите в магазин по новому HTTPS-домену, смените первоначальный пароль в админ-панели.
4. Убедитесь, что каталог пуст; добавьте реальные товары и услуги, условия получения и контакты.
5. Настройте Telegram/WhatsApp по [руководству](OPERATIONS.md). Не делайте пробные заказы с настоящими персональными данными без необходимости.
6. Проверьте логи только нового сервиса. Не запускайте E2E и нагрузочные тесты на общем production-сервере.

## 11. Обновления из Git

Сначала на компьютере: завершите изменения, тесты, коммит и публикацию; соберите и передайте frontend для опубликованного коммита. Новую сборку и зависимости подготовьте заранее, чтобы сократить простой **этого** магазина.

На сервере, из `/srv/kip-store/app`:

```bash
git status --short
git rev-parse HEAD
sudo -u kip-store .venv/bin/python scripts/backup.py --database /var/lib/kip-store/store.db --output /var/lib/kip-store/backups
```

Запишите старый commit hash. Если checkout содержит ручные изменения, остановитесь и разберитесь с ними: `pull` не должен перезаписывать конфиги, изменённые прямо в репозитории. Поэтому в шагах настройки лучше редактировать копии конфигов вне checkout либо вернуть локальные изменения в Git до следующего обновления.

Короткое окно обслуживания затронет только магазин:

```bash
sudo systemctl stop kip-store.service
git pull --ff-only
.venv/bin/pip install --no-cache-dir -r backend/requirements.lock
KIP_REV=$(git rev-parse --short=12 HEAD)
(cd /srv/kip-store/incoming && sha256sum -c "kip-frontend-${KIP_REV}.tar.gz.sha256")
tar -tzf "/srv/kip-store/incoming/kip-frontend-${KIP_REV}.tar.gz"
tar -xzf "/srv/kip-store/incoming/kip-frontend-${KIP_REV}.tar.gz" -C /srv/kip-store/app
chmod -R a+rX dist
sudo systemctl start kip-store.service
curl --fail http://127.0.0.1:8105/api/health
```

`--ff-only` разрешает только прямое продвижение ветки: при расхождении история автоматически не объединяется. Не продолжайте при ошибке pull, установки, проверки архива или запуска. Перенесите новую сборку **до** остановки и убедитесь, что ожидаемый коммит уже опубликован.

При обычном обновлении приложения **Nginx трогать не нужно**. База и загрузки остаются вне Git. Не добавляйте `--reload` и не увеличивайте число worker-процессов: очередь уведомлений встроена в приложение.

### Если новое приложение не запустилось

Сохраните журнал `journalctl -u kip-store.service`, остановите только этот сервис. Верните код к записанному старому коммиту через `git switch --detach OLD_COMMIT`, установите его зависимости и распакуйте соответствующий сохранённый frontend. Сверьте совместимость схемы БД перед запуском старого кода. Восстановление базы из backup может потерять заказы после момента копирования; не делайте его автоматически.

Если ошиблись в Nginx-конфиге нового сайта, удалите только добавленную ссылку `/etc/nginx/sites-enabled/kip-store` (после проверки, что она ваша), выполните `nginx -t`, затем reload. Не восстанавливайте всю `/etc/nginx` поверх чужих последующих изменений.

## 12. Резервные копии

```bash
cd /srv/kip-store/app
sudo -u kip-store .venv/bin/python scripts/backup.py --database /var/lib/kip-store/store.db --output /var/lib/kip-store/backups
```

Это согласованная SQLite-копия, подходящая и для работающего приложения. Не копируйте только `store.db` обычным `cp` при активном WAL. Отдельно сохраняйте `/var/lib/kip-store/uploads/` и `/etc/kip-store/kip-store.env` в закрытом месте. Выберите расписание, срок хранения и внешнее хранилище: backup на том же диске не защищает от его потери.

Ни backup, ни настройки, ни изображения клиентов не коммитятся. Перед восстановлением остановите **только** `kip-store.service` и сверяйте инструкцию с конкретной резервной копией.
