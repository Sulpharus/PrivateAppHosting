import { describe, expect, it } from 'vitest';
import { parseLink, parsePrice, titleFromPath } from '../amazon.js';

describe('parseLink', () => {
  it('cleans Amazon product links and reads the title from the link', () => {
    const link = parseLink(
      'https://www.amazon.de/Sony-WH-1000XM5-Kopfh%C3%B6rer-Noise-Cancelling/dp/B09Y2MYL5C/ref=sr_1_1?crid=X&keywords=sony',
    );
    expect(link).toEqual({
      url: 'https://www.amazon.de/dp/B09Y2MYL5C',
      amazon: true,
      asin: 'B09Y2MYL5C',
      title: 'Sony WH 1000XM5 Kopfhörer Noise Cancelling',
    });
  });

  it('handles links without a readable part, gp/product and short links', () => {
    expect(parseLink('https://amazon.de/dp/B0CHX1W1XY?th=1')?.url).toBe(
      'https://www.amazon.de/dp/B0CHX1W1XY',
    );
    expect(parseLink('https://www.amazon.com/gp/product/B0CHX1W1XY')?.asin).toBe('B0CHX1W1XY');
    expect(parseLink('https://amzn.eu/d/abc123')).toMatchObject({ amazon: true, asin: null });
  });

  it('keeps other shops and refuses non-links', () => {
    expect(parseLink('https://www.thalia.de/shop/artikel/123')).toMatchObject({
      amazon: false,
      url: 'https://www.thalia.de/shop/artikel/123',
    });
    expect(parseLink('http://example.com/x')?.url).toBe('https://example.com/x');
    expect(parseLink('javascript:alert(1)')).toBeNull();
    expect(parseLink('ein Buch')).toBeNull();
  });
});

describe('titleFromPath', () => {
  it('turns the link words into a title', () => {
    expect(titleFromPath('/LEGO-10497-Galaxy-Explorer')).toBe('LEGO 10497 Galaxy Explorer');
    expect(titleFromPath('/')).toBe('');
  });
});

describe('parsePrice', () => {
  it('reads German prices', () => {
    expect(parsePrice('12,99')).toBe(1299);
    expect(parsePrice('1.234,50 €')).toBe(123450);
    expect(parsePrice('20')).toBe(2000);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('zwölf')).toBeNaN();
  });
});
