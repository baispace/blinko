import { test, expect } from 'bun:test';
import { isSaveShortcut } from '../../app/src/components/BlinkoEditor/saveShortcut';
test('recognizes browser save shortcuts on both platforms', () => {
  expect(isSaveShortcut({key:'s',ctrlKey:true,metaKey:false,altKey:false})).toBe(true);
  expect(isSaveShortcut({key:'S',ctrlKey:false,metaKey:true,altKey:false})).toBe(true);
  expect(isSaveShortcut({key:'s',ctrlKey:false,metaKey:false,altKey:false})).toBe(false);
  expect(isSaveShortcut({key:'s',ctrlKey:true,metaKey:false,altKey:true})).toBe(false);
});
