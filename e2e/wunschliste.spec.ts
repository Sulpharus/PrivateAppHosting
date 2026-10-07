import { deflateSync } from 'node:zlib';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/wunschliste behind its local gate: Lena keeps a list, Tom reserves a wish, Mia sees it
// as given, and Lena never learns who gives what.
const run = `e2ew${Date.now().toString(36)}`;
const APP = 'http://localhost:8796';
const shots = process.env.SCREENSHOT_DIR;
const people = {
  lena: { email: `${run}-lena@example.com`, name: `Lena ${run}` },
  tom: { email: `${run}-tom@example.com`, name: `Tom ${run}` },
  mia: { email: `${run}-mia@example.com`, name: `Mia ${run}` },
};

// A real 64 x 48 PNG (two colours), enough for a photo.
function makePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 255] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([8, 2, 0, 0, 0], 8); // 8 bit, RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      rows.set(x < width / 2 ? [47, 111, 143] : [242, 193, 78], at);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PHOTO = makePng(64, 48);

test.beforeAll(async () => {
  for (const p of Object.values(people)) await createUser(p.email, 'user', p.name);
});

test.afterAll(async () => {
  await cleanup(run);
});

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(`${APP}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Meine Liste' })).toBeVisible();
  return page;
}

async function openList(page: Page, name: string) {
  await page.getByRole('button', { name: 'Andere' }).first().click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('wishlists: reserve for others, hidden from the owner', async ({ browser }) => {
  test.setTimeout(120_000);
  const lena = await signedIn(browser, people.lena.email);
  await expect(lena.getByText('Noch keine Wünsche')).toBeVisible();

  // An Amazon link fills the title and is cleaned of tracking parameters.
  await lena.getByRole('button', { name: 'Wunsch hinzufügen' }).first().click();
  const dialog = lena.getByRole('dialog', { name: 'Neuer Wunsch' });
  await dialog
    .getByLabel('Link zum Artikel (optional)')
    .fill(
      'https://www.amazon.de/Sony-WH-1000XM5-Kopfh%C3%B6rer-Noise-Cancelling/dp/B09Y2MYL5C/ref=sr_1_1?keywords=sony',
    );
  await dialog.getByLabel('Link zum Artikel (optional)').blur();
  await expect(dialog.getByLabel('Was wünschst du dir?')).toHaveValue(
    'Sony WH 1000XM5 Kopfhörer Noise Cancelling',
  );
  await expect(dialog.getByLabel('Link zum Artikel (optional)')).toHaveValue(
    'https://www.amazon.de/dp/B09Y2MYL5C',
  );
  await dialog.getByLabel('Preis in € (ungefähr)').fill('299,00');
  await dialog.getByRole('button', { name: 'Sehr gern' }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  // A manual wish without a link.
  await lena.getByRole('button', { name: 'Wunsch hinzufügen' }).first().click();
  await lena.getByLabel('Was wünschst du dir?').fill('Kochkurs für zwei');
  await lena.getByRole('button', { name: 'Speichern' }).click();
  await expect(lena.getByText('Kochkurs für zwei')).toBeVisible();
  await expect(lena.getByRole('heading', { level: 1, name: 'Meine Liste' })).toBeVisible();
  await expect(lena.locator('#subtitle')).toHaveText('2 Wünsche');
  if (shots) await lena.screenshot({ path: `${shots}/wunschliste-meine.png`, fullPage: true });

  // Tom reserves the headphones; they go onto his shopping list.
  const tom = await signedIn(browser, people.tom.email);
  await openList(tom, people.lena.name);
  await tom.getByRole('button', { name: /Sony WH 1000XM5.* schenken/ }).click();
  await expect(tom.getByText('Du schenkst das')).toBeVisible();
  if (shots) await tom.screenshot({ path: `${shots}/wunschliste-andere.png`, fullPage: true });
  await tom.getByRole('button', { name: 'Einkaufsliste' }).first().click();
  await expect(tom.getByRole('heading', { name: `Für ${people.lena.name}` })).toBeVisible();

  // Mia sees it as given and cannot pick it.
  const mia = await signedIn(browser, people.mia.email);
  await openList(mia, people.lena.name);
  await expect(mia.getByText('Geschenkt', { exact: true })).toBeVisible();
  await expect(mia.getByRole('button', { name: /Sony WH 1000XM5.* schenken/ })).toHaveCount(0);
  await expect(mia.getByRole('button', { name: /Kochkurs für zwei schenken/ })).toBeVisible();

  // Lena sees her list unchanged, with no hint of the reservation.
  await lena.reload();
  await expect(lena.getByText('Sony WH 1000XM5 Kopfhörer Noise Cancelling')).toBeVisible();
  await expect(lena.getByText(/Geschenkt|schenkst|reserviert/)).toHaveCount(0);

  // Lena deletes the wish: Tom keeps it until he ticks it off.
  await lena.getByRole('button', { name: /Sony WH 1000XM5.* bearbeiten/ }).click();
  await lena.getByRole('button', { name: 'Löschen' }).click();
  await lena.getByRole('button', { name: 'Zum Löschen erneut tippen' }).click();
  await expect(lena.getByText('Sony WH 1000XM5 Kopfhörer Noise Cancelling')).toHaveCount(0);
  await tom.reload();
  await tom.getByRole('button', { name: 'Einkaufsliste' }).first().click();
  await expect(tom.getByText(`Nicht mehr auf der Liste von ${people.lena.name}`)).toBeVisible();
  if (shots) await tom.screenshot({ path: `${shots}/wunschliste-einkauf.png`, fullPage: true });
  await tom.getByRole('button', { name: /Noise Cancelling gekauft/ }).click();
  await expect(tom.getByRole('heading', { name: /Gekauft/ })).toBeVisible();
  await expect(tom.locator('#subtitle')).toHaveText('Alles besorgt');
  if (shots) {
    await mia.setViewportSize({ width: 390, height: 844 });
    await mia.emulateMedia({ colorScheme: 'dark' });
    await mia.screenshot({ path: `${shots}/wunschliste-mobil-dunkel.png`, fullPage: true });
  }
});

test('a wish with an uploaded photo: others see it, and the list exports as a PDF with it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const lena = await signedIn(browser, people.lena.email);
  await lena.getByRole('button', { name: 'Wunsch hinzufügen' }).first().click();
  const dialog = lena.getByRole('dialog', { name: 'Neuer Wunsch' });
  await dialog.getByLabel('Was wünschst du dir?').fill('Rennrad mit Foto');
  await dialog.getByLabel('Preis in € (ungefähr)').fill('1299,50');
  // The photo comes from the device: a PNG here, saved as a shrunk JPEG.
  await dialog.getByText('Bild und Notiz').click();
  await dialog
    .getByLabel('Foto aus Galerie oder Kamera wählen')
    .setInputFiles({ name: 'rad.png', mimeType: 'image/png', buffer: PHOTO });
  await expect(dialog.locator('.photo-preview img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  // The picture is on her list (a signed address into the shared files).
  const own = lena.locator('.wish', { hasText: 'Rennrad mit Foto' }).locator('img.mn-thumb');
  await expect(own).toHaveAttribute(
    'src',
    /\/storage\/v1\/object\/sign\/app-files\/wunschliste\/shared\/wishes\//,
  );
  await expect
    .poll(() => own.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // Tom sees the photo on her list: shared files are readable by everyone with the app.
  const tom = await signedIn(browser, people.tom.email);
  await openList(tom, people.lena.name);
  const seen = tom.locator('img.mn-thumb').first();
  await expect(seen).toHaveAttribute('src', /wunschliste\/shared\/wishes\//);
  await expect
    .poll(() => seen.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // The PDF: a real file with the title, the price and the picture inside.
  const download = lena.waitForEvent('download');
  await lena.getByRole('button', { name: 'Als PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^wunschliste-.*\.pdf$/);
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  const pdf = readFileSync(path).toString('latin1');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf).toContain('(Rennrad mit Foto)');
  expect(pdf).toContain('1.299,50');
  expect(pdf).toContain('/Filter /DCTDecode');
  expect(pdf).toContain('/Im1 Do');
  if (shots) await lena.screenshot({ path: `${shots}/wunschliste-foto.png`, fullPage: true });

  // Changing the wish and removing the photo: the list shows the initials again.
  await lena.getByRole('button', { name: /Rennrad mit Foto.* bearbeiten/ }).click();
  await lena.getByRole('button', { name: 'Foto entfernen' }).click();
  await lena.getByRole('button', { name: 'Speichern' }).click();
  await expect(lena.locator('.wish', { hasText: 'Rennrad mit Foto' }).locator('img')).toHaveCount(
    0,
  );
});

test('birthdays: shared ones of other people, own entries, gift ideas', async ({ browser }) => {
  test.setTimeout(120_000);
  // Tom shares his birthday, Mia has one that stays private.
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const profiles = admin.schema('platform').from('profiles');
  const byName = async (name: string) =>
    (await profiles.select('user_id').eq('display_name', name).single()).data?.user_id as string;
  const [tomId, miaId, lenaId] = await Promise.all([
    byName(people.tom.name),
    byName(people.mia.name),
    byName(people.lena.name),
  ]);
  await profiles
    .update({
      birthday_month: soon.getMonth() + 1,
      birthday_day: soon.getDate(),
      birthday_year: 1990,
      birthday_shared: true,
    })
    .eq('user_id', tomId);
  await profiles
    .update({ birthday_month: 1, birthday_day: 2, birthday_shared: false })
    .eq('user_id', miaId);

  const lena = await signedIn(browser, people.lena.email);
  await lena.getByRole('button', { name: 'Geburtstage' }).first().click();
  await expect(lena.getByRole('heading', { level: 1, name: 'Geburtstage' })).toBeVisible();
  const tom = lena.getByRole('button', { name: new RegExp(people.tom.name) });
  await expect(tom).toBeVisible();
  await expect(tom).toContainText('in 3 Tagen');
  await expect(tom).toContainText('wird 36');
  await expect(lena.getByText(people.mia.name)).toHaveCount(0);
  // The contacts of Aether Notes come through the suite, which the admin has to approve.
  await expect(lena.getByText(/Geburtstage deiner Kontakte erscheinen hier/)).toBeVisible();

  // A person typed in: the day after tomorrow's date shows as "morgen", a bad date is refused.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await lena.getByRole('button', { name: 'Person hinzufügen' }).click();
  const dialog = lena.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Oma Lotte');
  await dialog.getByLabel('Tag').fill('30');
  await dialog.getByLabel('Monat').fill('2');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByText('Dieses Datum gibt es nicht')).toBeVisible();
  await dialog.getByLabel('Tag').fill(String(tomorrow.getDate()));
  await dialog.getByLabel('Monat').fill(String(tomorrow.getMonth() + 1));
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  const oma = lena.getByRole('button', { name: /Oma Lotte/ });
  await expect(oma).toContainText('morgen');
  await expect(oma).toContainText('selbst eingetragen');

  // A gift idea for Oma, kept in the app's own table.
  await oma.click();
  await lena.getByRole('button', { name: 'Geschenkidee hinzufügen' }).click();
  await lena.getByLabel('Was könnte passen?').fill('Wollschal');
  await lena.getByLabel('Preis in € (ungefähr)').fill('29,90');
  await lena.getByRole('button', { name: 'Speichern' }).last().click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .schema('app_wunschliste')
            .from('gift_ideas')
            .select('title, price_cents, status')
            .eq('owner_id', lenaId)
        ).data,
    )
    .toEqual([{ title: 'Wollschal', price_cents: 2990, status: 'idea' }]);
  const people_ = await admin
    .schema('app_wunschliste')
    .from('birthday_people')
    .select('name, month, day')
    .eq('owner_id', lenaId);
  expect(people_.data).toEqual([
    { name: 'Oma Lotte', month: tomorrow.getMonth() + 1, day: tomorrow.getDate() },
  ]);

  // Tom, a person on MiniNode, leads to his list.
  await lena.reload();
  await lena.getByRole('button', { name: 'Geburtstage' }).first().click();
  await lena.getByRole('button', { name: new RegExp(people.tom.name) }).click();
  await lena.getByRole('button', { name: /Wunschliste von .* ansehen/ }).click();
  await expect(lena.getByRole('heading', { level: 1, name: people.tom.name })).toBeVisible();
});
