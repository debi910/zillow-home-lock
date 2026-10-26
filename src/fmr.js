// HUD FY2027 Small Area Fair Market Rents (effective Oct 1, 2026),
// Austin-Round Rock-San Marcos, TX MSA. Monthly rent by bedroom count [0..4].
// Full rows were read from HUD SAFMR figures as republished per ZIP by
// fairmarketrentmap.com; "2BR only" ZIPs scale the other sizes by 78704's ratios.

export const FMR_SOURCE = {
  name: "HUD Small Area Fair Market Rents, FY2027",
  url: "https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html",
};

const FULL = {
  "78702": [1940, 2050, 2440, 3080, 3610],
  "78704": [1630, 1730, 2050, 2590, 3030],
  "78705": [1490, 1570, 1870, 2360, 2770],
  "78751": [1750, 1850, 2200, 2770, 3260],
};

const TWO_BED_ONLY = {
  "78701": 2730, "78703": 2440, "78725": 2460, "78727": 2080, "78733": 2730,
  "78734": 2110, "78735": 2130, "78737": 2370, "78738": 2120, "78739": 2730,
  "78746": 2240, "78749": 2060,
};

const RATIOS = FULL["78704"].map((v) => v / FULL["78704"][2]);

export function fmrFor(zip, beds) {
  const b = Math.max(0, Math.min(4, Math.round(Number(beds) || 0)));
  if (FULL[zip]) return { rent: FULL[zip][b], source: FMR_SOURCE };
  if (TWO_BED_ONLY[zip]) {
    return { rent: Math.round((TWO_BED_ONLY[zip] * RATIOS[b]) / 10) * 10, source: FMR_SOURCE };
  }
  return null;
}
