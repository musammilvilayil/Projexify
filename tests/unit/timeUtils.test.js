const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimeToMinutes, toHHMM, isWithinWindow } = require('../../backend/utils/timeUtils');

test('parseTimeToMinutes handles 24h and 12h formats (instant sessions used to store "05:35 PM")', () => {
  assert.equal(parseTimeToMinutes('09:30'), 570);
  assert.equal(parseTimeToMinutes('05:35 PM'), 17 * 60 + 35);
  assert.equal(parseTimeToMinutes('12:00 AM'), 0);
  assert.equal(parseTimeToMinutes('12:15 PM'), 12 * 60 + 15);
  for (const bad of ['', '25:00', '9', '10:75', null, undefined, 'noon']) assert.equal(parseTimeToMinutes(bad), null);
});
test('toHHMM zero pads', () => {
  assert.equal(toHHMM(new Date(2026, 0, 1, 5, 7)), '05:07');
});
test('isWithinWindow supports midnight crossing and missing values', () => {
  assert.equal(isWithinWindow(600, 660, 630), true);
  assert.equal(isWithinWindow(600, 660, 700), false);
  assert.equal(isWithinWindow(23 * 60, 60, 30), true);   // 23:00-01:00 at 00:30
  assert.equal(isWithinWindow(23 * 60, 60, 12 * 60), false);
  assert.equal(isWithinWindow(null, 60, 30), false);
});
