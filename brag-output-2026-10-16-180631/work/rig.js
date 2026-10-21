// Preloaded into the game server (node -r) only for the capture: makes the random draws
// land on the storyboard's round. Patches utils before the modes destructure it.
const path = require('path');
const utils = require(path.resolve(__dirname, '../../utils.js'));
const { randomItem, shuffle } = utils;

utils.randomItem = items => {
  if (!Array.isArray(items)) return randomItem(items);
  const titanic = items.find(e => e && e.word === 'Titanic');
  if (titanic) return titanic;
  if (items.includes('Katastrofa')) return 'Katastrofa';
  const shoes = items.find(s => s && Array.isArray(s.questions) && s.questions.some(q => q.includes('par butów')));
  if (shoes) return shoes;
  const tomek = items.find(p => p && p.name === 'Tomek');
  if (tomek) return tomek;
  return randomItem(items);
};

utils.shuffle = items => {
  const ola = items.find(p => p && p.name === 'Ola');
  if (ola) return [ola, ...items.filter(p => p !== ola)];
  const shoes = items.find(q => typeof q === 'string' && q.includes('par butów'));
  const sms = items.find(q => typeof q === 'string' && q.includes('wiadomości tekstowych'));
  if (shoes && sms) return [sms, shoes, ...items.filter(q => q !== sms && q !== shoes)];   // [impostor's, players']
  return shuffle(items);
};
