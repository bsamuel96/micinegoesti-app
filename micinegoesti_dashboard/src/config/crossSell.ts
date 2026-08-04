export const CROSS_SELL_CONFIG = {
  fries: {
    title: "Vrei și o porție de cartofi prăjiți?",
    match: {
      nameKeywords: ["cartofi"],
      categoryKeywords: ["garnituri"]
    }
  },
  drinks: {
    title: "Poate merge și ceva de băut",
    match: {
      nameKeywords: ["cola", "pepsi", "fanta", "apa", "energizant", "limonada", "fresh", "bere", "cafea", "vin", "whisky", "vodka"],
      categoryKeywords: ["racoritoare", "bauturi", "băuturi", "bere", "vin", "cafea"]
    },
    maxItems: 10
  },
  desserts: {
    title: "Și un desert?",
    match: {
      nameKeywords: ["papana", "clatite", "clătite", "desert"],
      categoryKeywords: ["desert"]
    },
    maxItems: 2
  }
} as const;
