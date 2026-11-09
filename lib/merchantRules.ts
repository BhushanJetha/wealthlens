// Common UAE and India merchants → the sub-category they belong to
// (lib/categories). The SMS reader and the statement readers try these
// first; anything they don't match falls through to the wider rules (Food,
// Shopping, Travel & transport…). Your own rules and past choices still win
// over both (lib/rules, lib/categoryMemory). Local, no AI.
export const SUB_RULES: [RegExp, string][] = [
  [/talabat|deliveroo|swiggy|zomato|uber\s*eats?|noon\s*food|careem\s*food|\bkeet\b|hunger\s*station|eatclub|\bbox8\b|faasos/i, 'Delivery'],
  [/carrefour|(?<!international\s)lulu\b(?!\s+(?:international\s+)?exchange)|spinneys|waitrose|union\s*coop|choithram|grandiose|nesto\b|al\s*maya|west\s*zone|kibsons|instashop|el\s*grocer|bigbasket|big\s*basket|blinkit|zepto|dunzo|grofers|jiomart|d[\s-]?mart|reliance\s*fresh|nature'?s\s*basket|supermarket|hypermarket|grocer|mini\s*mart|baqala|vegetables?|fruits?\b/i, 'Groceries'],
  [/restaurant|restaur[ae]?nt|caf[eé]\b|coffee|starbucks|costa\b|tim\s*hortons|caribou|mcdonald|\bkfc\b|pizza|domino|burger|subway|shawarma|falafel|biryani|bakery|bistro|\bgrill\b|eatery|diner\b|dunkin|sushi|steakhouse|noodle|\bbbq\b/i, 'Eating out'],
  [/adnoc|\benoc\b|eppco|emarat|petrol|\bfuel\b|indian\s*oil|\biocl\b|\bhpcl\b|\bbpcl\b|bharat\s*petro|\bshell\b/i, 'Fuel'],
  [/salik|\bdarb\b|fastag|\btoll\b/i, 'Salik'],
  [/parking|mawaqif|\bparkin\b|traffic\s*fine|challan/i, 'Parking & fines'],
  [/careem(?!\s*food)|uber(?!\s*eat)|\bola\b|rapido|taxi|\bcab\b|\brta\b|\bmetro\b|\bnol\b|yango|\bhala\b/i, 'Taxi & metro'],
  [/air\s*arabia|flydubai|emirates\s*air|etihad|indigo|air\s*india|spicejet|akasa|vistara|airline|airways|\bflight/i, 'Flights'],
  [/\bhotel\b|resort|airbnb|booking\.com|agoda|\boyo\b|makemytrip|goibibo|cleartrip|easemytrip|yatra|holiday|vacation/i, 'Holidays'],
  [/\bdu\b|etisalat|virgin\s*mobile|\bjio\b|airtel|vodafone|\bvi\b|bsnl|broadband|fib(?:re|er)\b|internet|wifi|postpaid|recharge/i, 'Mobile & internet'],
  [/pharmacy|chemist|\bboots\b|medplus|\b1mg\b|pharmeasy|netmeds/i, 'Medicines'],
  [/\bgym\b|fitness|cult\.?fit|gold'?s\s*gym|badminton|table\s*tennis|tennis|padel|squash|swimming|\byoga\b|decathlon|sports?\s*club|playo|hudle/i, 'Sports & fitness'],
  [/\bicp\b|gdrfa|\bamer\b|tasheel|emirates\s*id|visa\s*(?:fee|renewal|stamping)|passport|\boci\b|\bvfs\b|bls\s*international/i, 'Visa & ID fees'],
  [/bank\s*charges?|service\s*charge|annual\s*fee|late\s*(?:payment\s*)?fee|finance\s*charge|over\s*limit\s*fee/i, 'Bank charges'],
  [/zakat|donation|charity|red\s*crescent/i, 'Donations & zakat'],
]
