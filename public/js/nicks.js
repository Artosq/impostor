// GENERATOR LOSOWYCH NICKÓW: przymiotnik + rzeczownik sklejone bez spacji ("ŁysyKret", "SweatyGoose").
// Plik działa i w przeglądarce (window.Nicks), i na serwerze (require) - serwer losuje nowy nick,
// gdy wylosowany już jest w pokoju.
//
// Wersję językową wybiera NICK_LANGUAGE ('pl' albo 'en').
// Polskie przymiotniki mają formę męską i żeńską, a rzeczowniki rodzaj (m/f), żeby wszystko się zgadzało.
// Grupa "spicy" to słowa ostrzejsze - wystarczy ją wyczyścić, żeby generator był łagodniejszy.

(function (root) {
    'use strict';

    const NICK_LANGUAGE = 'pl';
    const MAX_NICK_LENGTH = 12;     // tyle samo co pole nicku i serwer

    // [męski, żeński]
    const PL_ADJECTIVES = {
        absurd: [
            ['Łysy', 'Łysa'], ['Mokry', 'Mokra'], ['Gruby', 'Gruba'], ['Krzywy', 'Krzywa'], ['Spocony', 'Spocona'],
            ['Śliski', 'Śliska'], ['Tłusty', 'Tłusta'], ['Głupi', 'Głupia'], ['Dziki', 'Dzika'], ['Lepki', 'Lepka'],
            ['Kiszony', 'Kiszona'], ['Smutny', 'Smutna'], ['Wściekły', 'Wściekła'], ['Chory', 'Chora'], ['Goły', 'Goła'],
            ['Zgniły', 'Zgniła'], ['Brudny', 'Brudna'], ['Wredny', 'Wredna'], ['Leniwy', 'Leniwa'], ['Nerwowy', 'Nerwowa'],
            ['Zaspany', 'Zaspana'], ['Cuchnący', 'Cuchnąca'], ['Zezowaty', 'Zezowata'], ['Bezzębny', 'Bezzębna'], ['Kulawy', 'Kulawa'],
            ['Wkurzony', 'Wkurzona'], ['Zmięty', 'Zmięta'], ['Spalony', 'Spalona'], ['Sflaczały', 'Sflaczała']
        ],
        impostor: [
            ['Fałszywy', 'Fałszywa'], ['Tajny', 'Tajna'], ['Niewinny', 'Niewinna'], ['Cichy', 'Cicha'], ['Chytry', 'Chytra'],
            ['Sprytny', 'Sprytna'], ['Kłamliwy', 'Kłamliwa'], ['Lewy', 'Lewa'], ['Ukryty', 'Ukryta'], ['Podstępny', 'Podstępna'],
            ['Udawany', 'Udawana'], ['Zdradliwy', 'Zdradliwa'], ['Śliczny', 'Śliczna'], ['Święty', 'Święta']
        ],
        spicy: [
            ['Pijany', 'Pijana'], ['Zjarany', 'Zjarana'], ['Nawalony', 'Nawalona'], ['Napalony', 'Napalona'], ['Zesrany', 'Zesrana'],
            ['Wilgotny', 'Wilgotna'], ['Gorący', 'Gorąca'], ['Zjebany', 'Zjebana'], ['Najebany', 'Najebana'], ['Skacowany', 'Skacowana'],
            ['Wyjebany', 'Wyjebana'], ['Pojebany', 'Pojebana'], ['Schlany', 'Schlana'], ['Zapity', 'Zapita'], ['Zrzygany', 'Zrzygana'],
            ['Obsrany', 'Obsrana'], ['Zryty', 'Zryta'], ['Uwalony', 'Uwalona'], ['Rozjebany', 'Rozjebana']
        ]
    };

    // [słowo, rodzaj]
    const PL_NOUNS = {
        animals: [
            ['Kret', 'm'], ['Jeż', 'm'], ['Bóbr', 'm'], ['Szop', 'm'], ['Lis', 'm'], ['Dzik', 'm'], ['Kot', 'm'], ['Bocian', 'm'],
            ['Gołąb', 'm'], ['Żuk', 'm'], ['Ślimak', 'm'], ['Karp', 'm'], ['Śledź', 'm'], ['Chomik', 'm'], ['Borsuk', 'm'], ['Indyk', 'm'],
            ['Osioł', 'm'], ['Baran', 'm'], ['Żaba', 'f'], ['Mewa', 'f'], ['Kaczka', 'f'], ['Koza', 'f'], ['Krowa', 'f'], ['Foka', 'f'],
            ['Świnia', 'f'], ['Kura', 'f'], ['Pchła', 'f'], ['Mysz', 'f'], ['Wydra', 'f'], ['Sowa', 'f'], ['Gęś', 'f'], ['Ropucha', 'f']
        ],
        food: [
            ['Pieróg', 'm'], ['Ogór', 'm'], ['Kabanos', 'm'], ['Bigos', 'm'], ['Kapeć', 'm'], ['Mop', 'm'], ['Tost', 'm'], ['Kebab', 'm'],
            ['Pączek', 'm'], ['Kotlet', 'm'], ['Kalosz', 'm'], ['Kibel', 'm'], ['Wafel', 'm'], ['Grzyb', 'm'], ['Majonez', 'm'], ['Ziemniak', 'm'],
            ['Kiełbasa', 'f'], ['Parówka', 'f'], ['Pyza', 'f'], ['Bułka', 'f'], ['Fasola', 'f'], ['Skarpeta', 'f'], ['Kapusta', 'f'], ['Rzodkiew', 'f'],
            ['Kalafior', 'm'], ['Pasztet', 'm'], ['Smalec', 'm'], ['Kisiel', 'm'], ['Budyń', 'm'], ['Rosół', 'm'], ['Żurek', 'm'], ['Salceson', 'm'],
            ['Pierniczek', 'm'], ['Galareta', 'f'], ['Mortadela', 'f'], ['Kaszanka', 'f'], ['Kalarepa', 'f'], ['Brukselka', 'f'], ['Oliwka', 'f'], ['Sałatka', 'f']
        ],
        things: [
            ['But', 'm'], ['Kran', 'm'], ['Pilot', 'm'], ['Kubek', 'm'], ['Gwóźdź', 'm'], ['Klucz', 'm'], ['Dywan', 'm'], ['Taboret', 'm'],
            ['Widelec', 'm'], ['Zegar', 'm'], ['Grzebień', 'm'], ['Pędzel', 'm'], ['Słoik', 'm'], ['Garnek', 'm'], ['Kosz', 'm'], ['Klapek', 'm'],
            ['Bojler', 'm'], ['Czajnik', 'm'], ['Toster', 'm'], ['Pager', 'm'], ['Faks', 'm'], ['Kombajn', 'm'], ['Tapczan', 'm'], ['Sedes', 'm'],
            ['Spinacz', 'm'], ['Długopis', 'm'], ['Zszywacz', 'm'], ['Korek', 'm'], ['Parasol', 'm'], ['Odkurzacz', 'm'], ['Cegła', 'f'], ['Szczotka', 'f'],
            ['Łyżka', 'f'], ['Patelnia', 'f'], ['Gąbka', 'f'], ['Kanapa', 'f'], ['Wanna', 'f'], ['Pralka', 'f'], ['Lodówka', 'f'], ['Doniczka', 'f'],
            ['Miotła', 'f'], ['Gumka', 'f'], ['Szuflada', 'f'], ['Rura', 'f'], ['Taczka', 'f'], ['Torba', 'f'], ['Sznurówka', 'f'], ['Klamka', 'f'],
            ['Deska', 'f'], ['Puszka', 'f'], ['Śruba', 'f'], ['Kłódka', 'f'], ['Wycieraczka', 'f'], ['Koparka', 'f']
        ],
        impostor: [
            ['Agent', 'm'], ['Szpieg', 'm'], ['Kapuś', 'm'], ['Zdrajca', 'm'], ['Kłamca', 'm'], ['Oszust', 'm'], ['Judasz', 'm'],
            ['Impostor', 'm'], ['Wtyka', 'f'], ['Podróba', 'f'], ['Ściema', 'f'], ['Lipa', 'f'], ['Kapusia', 'f']
        ]
    };

    const EN_ADJECTIVES = {
        absurd: [
            'Sweaty', 'Moist', 'Salty', 'Crusty', 'Feral', 'Cursed', 'Soggy', 'Smelly', 'Greasy', 'Angry', 'Sad', 'Lazy', 'Bald',
            'Stinky', 'Chunky', 'Sticky', 'Sleepy', 'Petty', 'Wonky', 'Goofy', 'Clumsy', 'Grumpy', 'Funky', 'Janky', 'Unhinged',
            'Spicy', 'Toxic', 'Damp', 'Wobbly', 'Haunted'
        ],
        impostor: ['Sus', 'Sussy', 'Sneaky', 'Shady', 'Fake', 'Lying', 'Guilty', 'Innocent', 'Secret', 'Dodgy', 'Hidden', 'Totally', 'Legit'],
        spicy: ['Drunk', 'Horny', 'Baked', 'Wasted', 'Naughty', 'Hungover', 'Thirsty', 'Freaky', 'Shitty']
    };

    const EN_NOUNS = {
        animals: ['Goose', 'Weasel', 'Raccoon', 'Possum', 'Pigeon', 'Seagull', 'Llama', 'Moose', 'Ferret', 'Badger', 'Shrimp',
            'Toad', 'Walrus', 'Hamster', 'Duck', 'Gecko', 'Sloth', 'Hippo', 'Snail', 'Crab', 'Pug'],
        people: ['Gamer', 'Intern', 'Grandpa', 'Nephew', 'Landlord', 'Goblin', 'Gremlin'],
        food: ['Pickle', 'Nugget', 'Burrito', 'Taco', 'Potato', 'Waffle', 'Muffin', 'Meatball', 'Noodle', 'Bagel', 'Crouton',
            'Sock', 'Toaster', 'Spoon', 'Mop', 'Brick', 'Toilet', 'Sausage', 'Bean', 'Cabbage'],
        impostor: ['Snitch', 'Spy', 'Liar', 'Traitor', 'Impostor', 'Mole', 'Fraud', 'Clown', 'Agent', 'Rat', 'Faker']
    };

    const flat = groups => Object.values(groups).flat();
    const pick = items => items[Math.floor(Math.random() * items.length)];

    // Jedna próba: zwraca nick albo null, gdy wyszedł za długi
    const BUILDERS = {
        pl() {
            const [noun, gender] = pick(flat(PL_NOUNS));
            const [male, female] = pick(flat(PL_ADJECTIVES));
            return (gender === 'f' ? female : male) + noun;
        },
        en() {
            return pick(flat(EN_ADJECTIVES)) + pick(flat(EN_NOUNS));
        }
    };

    // taken - nicki zajęte w pokoju (bez względu na wielkość liter)
    function randomNick(language = NICK_LANGUAGE, taken = []) {
        const build = BUILDERS[language] || BUILDERS.pl;
        const takenLower = new Set(taken.map(name => String(name).toLowerCase()));
        let nick = null;

        for (let attempt = 0; attempt < 200; attempt++) {
            const candidate = build();
            if (candidate.length > MAX_NICK_LENGTH) continue;
            nick = candidate;
            if (!takenLower.has(candidate.toLowerCase())) return candidate;
        }
        // Prawie niemożliwe przy takiej puli, ale nick musi być zawsze
        return (nick || 'Gracz').slice(0, MAX_NICK_LENGTH - 2) + Math.floor(10 + Math.random() * 90);
    }

    const api = { NICK_LANGUAGE, MAX_NICK_LENGTH, randomNick, words: { PL_ADJECTIVES, PL_NOUNS, EN_ADJECTIVES, EN_NOUNS } };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Nicks = api;
})(typeof window !== 'undefined' ? window : globalThis);
