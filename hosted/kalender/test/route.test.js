import { describe, expect, it } from 'vitest';
import {
  assessLeg,
  dayGroups,
  directionsUrl,
  haversine,
  hoursMinutes,
  kilometres,
  legsOf,
  placeKey,
  placesToLookUp,
  pointOf,
  routePath,
} from '../route.js';

const MUC = { lat: 48.137, lon: 11.575 };
const AUG = { lat: 48.371, lon: 10.898 };
const at = (h, m = 0) => new Date(2026, 9, 5, h, m);
const item = (title, start, end, over = {}) => ({
  title,
  start,
  end,
  allDay: false,
  cancelled: false,
  record: { place_name: title, lat: null, lon: null, ...over.record },
  ...over,
});

describe('points and places', () => {
  it('measures the distance on the globe', () => {
    expect(haversine(MUC, MUC)).toBe(0);
    expect(haversine(MUC, AUG) / 1000).toBeGreaterThan(55);
    expect(haversine(MUC, AUG) / 1000).toBeLessThan(65);
  });

  it('takes the stored point, else the cached one, else none', () => {
    const cache = { [placeKey('Café  Luitpold')]: { lat: 48.14, lon: 11.57 } };
    const stored = item('A', at(9), at(10), { record: { place_name: 'x', lat: 1, lon: 2 } });
    expect(pointOf(stored, cache)).toEqual({ lat: 1, lon: 2 });
    expect(pointOf(item('Café Luitpold', at(9), at(10)), cache)).toEqual({
      lat: 48.14,
      lon: 11.57,
    });
    expect(pointOf(item('Unbekannt', at(9), at(10)), cache)).toBeNull();
    expect(pointOf(item('Unbekannt', at(9), at(10)), { unbekannt: 0 })).toBeNull();
  });

  it('asks only once for each place text that has no point', () => {
    const items = [
      item('Café A', at(9), at(10)),
      item('café  a', at(11), at(12)),
      item('Haus', at(13), at(14), { record: { place_name: 'Haus', lat: 1, lon: 1 } }),
      item('Weg', at(15), at(16), { record: { place_name: '' } }),
      item('Bekannt', at(17), at(18)),
    ];
    const todo = placesToLookUp(items, { bekannt: 0 });
    expect(todo.map((x) => x.key)).toEqual(['café a']);
  });
});

describe('days and legs', () => {
  const stored = (title, s, e, p) => item(title, s, e, { record: { place_name: title, ...p } });

  it('groups by day, in time order, without all-day and cancelled items', () => {
    const groups = dayGroups([
      stored('B', at(14), at(15), MUC),
      stored('A', at(9), at(10), AUG),
      { ...stored('Ganztag', at(0), at(23), MUC), allDay: true },
      { ...stored('Abgesagt', at(12), at(13), MUC), cancelled: true },
      stored('Morgen', new Date(2026, 9, 6, 9), new Date(2026, 9, 6, 10), MUC),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((e) => e.item.title)).toEqual(['A', 'B']);
  });

  it('builds the way out, the legs between and the way home', () => {
    const [{ items }] = dayGroups([
      stored('A', at(9), at(10), AUG),
      stored('B', at(14), at(15), MUC),
    ]);
    const home = { lat: 48.2, lon: 11.6, label: 'Zuhause' };
    expect(legsOf(items, home).map((l) => l.kind)).toEqual(['out', 'between', 'home']);
    expect(legsOf(items, home, { backHome: false }).map((l) => l.kind)).toEqual(['out', 'between']);
    expect(legsOf(items, null).map((l) => l.kind)).toEqual(['between']);
    expect(legsOf([], home)).toEqual([]);
  });

  it('marks neighbours at the same spot', () => {
    const [{ items }] = dayGroups([
      stored('A', at(9), at(10), MUC),
      stored('B', at(11), at(12), MUC),
    ]);
    const [leg] = legsOf(items, null);
    expect(leg.same).toBe(true);
    expect(assessLeg(leg, 0).status).toBe('same');
  });
});

describe('judging a leg', () => {
  const [{ items }] = dayGroups([
    item('A', at(9), at(10), { record: { place_name: 'A', ...MUC } }),
    item('B', at(11), at(12), { record: { place_name: 'B', ...AUG } }),
  ]);
  const home = { lat: 48.2, lon: 11.6, label: 'Zuhause' };
  const [out, between, back] = legsOf(items, home);

  it('says when to leave for the first appointment', () => {
    const r = assessLeg(out, 25 * 60, 10);
    expect(r.travelMin).toBe(25);
    expect(r.leaveAt).toEqual(at(8, 25));
  });

  it('is ok with room, tight without the buffer, late without enough time', () => {
    expect(assessLeg(between, 30 * 60, 10).status).toBe('ok'); // 60 min between
    expect(assessLeg(between, 55 * 60, 10).status).toBe('tight');
    expect(assessLeg(between, 70 * 60, 10).status).toBe('late');
    expect(assessLeg(between, 30 * 60, 10).leaveAt).toEqual(at(10, 20));
    expect(assessLeg(between, 30 * 60, 10).gapMin).toBe(60);
  });

  it('says when you are back home', () => {
    expect(assessLeg(back, 40 * 60).arriveAt).toEqual(new Date(2026, 9, 5, 12, 40));
  });
});

describe('formatting and links', () => {
  it('splits minutes and rounds kilometres', () => {
    expect(hoursMinutes(65)).toEqual({ h: 1, m: 5 });
    expect(hoursMinutes(-3)).toEqual({ h: 0, m: 0 });
    expect(kilometres(1234)).toBe(1.2);
    expect(kilometres(58_400)).toBe(58);
  });

  it('builds the request and the link for each way of travelling', () => {
    expect(routePath(MUC, AUG, 'bike')).toBe(
      '/routed-bike/route/v1/driving/11.575,48.137;10.898,48.371?overview=full&geometries=geojson',
    );
    expect(routePath(MUC, AUG, 'unknown')).toContain('/routed-car/');
    expect(directionsUrl(MUC, AUG, 'foot')).toBe(
      'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=48.137%2C11.575%3B48.371%2C10.898',
    );
  });
});
