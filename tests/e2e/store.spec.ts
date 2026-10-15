import { expect, test } from '@playwright/test';

test('Каталог, варианты, корзина, заказ и обработка администратором', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Надёжное решение для каждой цепи.' }),
  ).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(9);
  await page.screenshot({ path: 'artifacts/storefront-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  await page
    .getByRole('button', { name: 'Добавить: Автоматический выключатель 1P', exact: true })
    .click();
  await page.getByRole('button', { name: '16 А', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Количество товара' }).fill('2');
  await page.getByRole('button', { name: /В корзину · 4/ }).click();
  await page
    .getByRole('button', { name: /Корзина/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Оформить заказ', exact: true }).click();
  await page.getByLabel('Ваше имя').fill('Иван123');
  await expect(page.getByLabel('Ваше имя')).toHaveValue('Иван');
  await page.getByRole('textbox', { name: 'Телефон без +7' }).fill('7000000000');
  await page.getByRole('button', { name: /Доставка По согласованию/ }).click();
  await page.getByLabel('Адрес доставки').fill('Тестовая улица, дом 1');
  await page.getByRole('checkbox', { name: /Согласен на обработку/ }).check();
  await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
  await expect(page.getByRole('heading', { name: 'Спасибо за заказ!' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Отправить заказ в WhatsApp' })).toHaveAttribute(
    'href',
    /https:\/\/wa.me\/77079565657/,
  );
  const resultText = await page.locator('.order-success').innerText();
  const id = resultText.match(/K-[A-F0-9]+/)![0];
  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill('test-password');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор магазина' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Заказы', exact: false })
    .filter({ has: page.locator('svg') })
    .first()
    .click();
  await page.getByRole('button', { name: new RegExp('#' + id) }).click();
  await expect(page.locator('.order-details')).toContainText('Тестовая улица, дом 1');
  await expect(page.locator('.order-client a').first()).toHaveAttribute(
    'href',
    /https:\/\/wa.me\/77000000000\?text=/,
  );
  await page.getByLabel('Статус заказа ' + id).selectOption('confirmed');
  await expect(page.locator('.order-main .status-badge').first()).toHaveText('Подтверждён');
  await page.getByLabel('Статус заказа ' + id).selectOption('completed');
  await expect(page.locator('.order-main .status-badge').first()).toHaveText('Выполнен');
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await expect(page.locator('.metric-card').first()).toContainText('4 080');
  await page.screenshot({ path: 'artifacts/admin-dashboard.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('Администратор создаёт, редактирует и удаляет товар', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill('test-password');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await page.getByRole('button', { name: 'Товары', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить товар', exact: true }).click();
  await page.getByLabel('Название товара', { exact: true }).fill('Тестовый выключатель');
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Описание тестового выключателя для проверки магазина.');
  await page.getByLabel('Артикул товара', { exact: true }).fill('e2e-product');
  await page.getByLabel('Скидка на товар').check();
  await page.getByLabel('Скидка, %').fill('20');
  await page.getByRole('button', { name: 'Сохранить товар' }).click();
  await expect(page.locator('.product-table')).toContainText('Тестовый выключатель');
  await page.getByRole('button', { name: 'Редактировать Тестовый выключатель' }).click();
  await page.getByLabel('Название товара', { exact: true }).fill('Обновлённый выключатель');
  await page.getByRole('button', { name: 'Сохранить товар' }).click();
  await expect(page.locator('.product-table')).toContainText('Обновлённый выключатель');
  await page.getByRole('button', { name: 'Удалить Обновлённый выключатель' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить товар', exact: true })
    .click();
  await expect(page.locator('.product-table')).not.toContainText('Обновлённый выключатель');
  await page.getByRole('button', { name: 'Категории и единицы' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Тестовая категория');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.dictionary-list')).toContainText('Тестовая категория');
  await page.getByRole('button', { name: 'Удалить Тестовая категория' }).click();
  await expect(page.locator('.dictionary-list')).not.toContainText('Тестовая категория');
});

test('Мобильная версия, поиск, избранное и сохранение корзины', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(9);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page
    .locator('img')
    .evaluateAll((images) => images.forEach((img) => (img.loading = 'eager')));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {})));
  });
  await page.screenshot({ path: 'artifacts/storefront-mobile.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Поиск товаров' }).fill('Кабель');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'В избранное: Кабель ВВГнг-LS 3 × 2,5' }).click();
  await page.getByRole('button', { name: 'Добавить: Кабель ВВГнг-LS 3 × 2,5' }).click();
  await page.reload();
  await page
    .getByRole('button', { name: /Корзина/ })
    .first()
    .click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/cart-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
  await page.screenshot({ path: 'artifacts/storefront-dark-mobile.png', fullPage: true });
});

test('Мобильная админ-панель и форма товара не выходят за экран', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill('test-password');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор магазина' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'artifacts/admin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Товары', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить товар', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'artifacts/product-form-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки магазина', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Информация о магазине' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('Округление цены и метража совпадает с серверными правилами', async () => {
  const { price, lineTotal } = await import('../../src/lib');
  const product = {
    discount_enabled: true,
    discount_percent: 15,
    variants: [{ price: 590 }],
  } as import('../../src/types').Product;
  expect(price(product)).toBe(502);
  expect(lineTotal(100, 1.005)).toBe(101);
  expect(lineTotal(890, 2.5)).toBe(2225);
});

test('Тёмное меню, услуги и адаптивность на телефоне, планшете и компьютере', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
  const sort = page.getByRole('combobox', { name: 'Сортировка товаров' });
  await sort.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  const colors = await page.getByRole('listbox').evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
  }));
  expect(colors.bg).not.toBe('rgb(255, 255, 255)');
  expect(colors.bg).not.toBe(colors.color);
  await page.getByRole('option', { name: 'Сначала дешевле' }).click();
  await expect(sort).toContainText('Сначала дешевле');
  await sort.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(sort).toContainText('По названию');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Витрина ${width}: ${await page.evaluate(() =>
        Array.from(document.querySelectorAll('body *'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > innerWidth + 1;
          })
          .slice(0, 20)
          .map(
            (el) =>
              el.tagName + '.' + el.className + ':' + Math.round(el.getBoundingClientRect().right),
          )
          .join(', '),
      )}`,
    ).toBeTruthy();
    await sort.click();
    const box = await page.getByRole('listbox').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (width === 390) await page.screenshot({ path: 'artifacts/dark-sort-fixed.png' });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Выбрать услугу' }).click();
  await expect(page.getByRole('dialog', { name: 'Об услуге' })).toBeVisible();
  await expect(page.getByRole('button', { name: /В корзину ·/ })).toBeEnabled();
  await page.getByRole('button', { name: /В корзину ·/ }).click();
  await page.getByRole('button', { name: 'Корзина', exact: true }).click();
  await expect(page.locator('.cart-line')).toContainText('Сборка электрощита');
  await expect(page.getByRole('button', { name: 'Оформить заказ', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/service-cart-mobile.png', fullPage: true });
  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill('test-password');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await page.getByRole('button', { name: 'Настройки магазина', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Безопасность', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Настройки ${width}`,
    ).toBeTruthy();
  }
  const template = page.getByLabel('Telegram — новый заказ', { exact: true });
  await template.fill('Заявка с сайта!\n' + (await template.inputValue()));
  await page.getByRole('button', { name: 'Предпросмотр сообщения' }).click();
  await expect(page.locator('.message-preview')).toContainText('Заявка с сайта!');
  await expect(page.locator('.message-preview')).toContainText('Сборка электрощита');
  await page.getByRole('button', { name: 'Сохранить шаблоны' }).click();
  await expect(page.getByRole('status')).toContainText('Шаблоны сохранены');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.message-settings')
    .screenshot({ path: 'artifacts/message-settings-dark.png' });
  await page
    .locator('.security-settings')
    .screenshot({ path: 'artifacts/security-settings-dark.png' });
  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Товары', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать Сборка электрощита', exact: true }).click();
  await expect(page.getByLabel('Тип позиции')).toHaveValue('service');
  await expect(page.getByLabel('Остаток варианта 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Без склада', { exact: true })).toBeVisible();
  expect(
    await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Смена пароля: требования, старый пароль, повторный вход и закрытие сессии', async ({
  page,
  browser,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill('test-password');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await page.getByRole('button', { name: 'Настройки магазина', exact: true }).click();
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  const tab = await other.newPage();
  await tab.goto('http://127.0.0.1:8001/admin');
  await expect(tab.getByRole('heading', { name: 'Обзор магазина' })).toBeVisible();
  await page.getByLabel('Старый пароль', { exact: true }).fill('wrong');
  await page.getByLabel('Новый пароль', { exact: true }).fill('weak');
  await expect(page.getByRole('button', { name: 'Изменить пароль', exact: true })).toBeDisabled();
  await page.getByLabel('Новый пароль', { exact: true }).fill('UpdatedSecure9!');
  await expect(page.locator('.password-requirements .met')).toHaveCount(4);
  await page.getByLabel('Повторите новый пароль', { exact: true }).fill('UpdatedSecure9!');
  await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Старый пароль указан неверно');
  await page.getByLabel('Старый пароль', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
  await expect(page.getByLabel('Пароль администратора')).toBeVisible();
  await tab.reload();
  await expect(tab.getByLabel('Пароль администратора')).toBeVisible();
  await page.getByLabel('Пароль администратора').fill('test-password');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await expect(page.getByRole('alert')).toContainText('Неверный пароль');
  await page.getByLabel('Пароль администратора').fill('UpdatedSecure9!');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  await expect(page.getByRole('heading', { name: 'Информация о магазине' })).toBeVisible();
  await other.close();
});
