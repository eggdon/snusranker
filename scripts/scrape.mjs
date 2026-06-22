import * as cheerio from "cheerio";
import { writeFileSync } from "fs";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, ...opts });
      if (res.ok) return res;
      if (res.status === 429) {
        await sleep(5000);
        continue;
      }
      return null;
    } catch (e) {
      if (i < retries - 1) await sleep(2000);
    }
  }
  return null;
}

// ─── Snusbolaget ───

function parseSnusbolagetProduct(html, url) {
  const $ = cheerio.load(html);

  // Parse table as key-value map from structured rows
  const attrs = {};
  $("table")
    .first()
    .find("tr")
    .each((_, tr) => {
      const key = $(tr).find(".p-attr-key").text().trim().toLowerCase();
      const value = $(tr).find(".p-attr-value").text().trim();
      if (key && value) attrs[key] = value;
    });

  if (!attrs["produkttyp"]) return null;

  // Skip caffeine-only products (no nicotine)
  if (/koffein/i.test(attrs["produkttyp"]) && !attrs["nikotinhalt (mg/portion)"]) return null;

  const productType = attrs["produkttyp"];
  const isWhite = /vitt snus|nikotinpåse|tobacco.?free/i.test(productType);
  const isTobacco =
    /original portion|white portion|portionssnus/i.test(productType) && !isWhite;

  // Skip lössnus (no portions) and other non-snus
  if (!isWhite && !isTobacco) return null;

  const nikotinMgPortion = attrs["nikotinhalt (mg/portion)"];
  const nikotinMgG = attrs["nikotinhalt (mg/g)"];
  const portioner = attrs["antal portioner/förpackning"];

  const nicotinePerPortion = nikotinMgPortion
    ? parseFloat(nikotinMgPortion.replace(",", "."))
    : null;
  const nicotineMgG = nikotinMgG
    ? parseFloat(nikotinMgG.replace(",", "."))
    : null;
  const portions = portioner ? parseInt(portioner) : null;

  if (!nicotinePerPortion || !portions) return null;

  // Price: find span.price with actual price (skip basket-price etc)
  let price = null;
  $("span.price").each((_, el) => {
    if (price) return;
    const text = $(el).text().trim();
    const m = text.match(/([\d]+[,.][\d]+)\s*kr/);
    if (m) price = parseFloat(m[1].replace(",", "."));
  });

  // Fallback: unit-price
  if (!price) {
    $("span.unit-price").each((_, el) => {
      if (price) return;
      const text = $(el).text().trim();
      const m = text.match(/([\d]+[,.][\d]+)\s*kr/);
      if (m) price = parseFloat(m[1].replace(",", "."));
    });
  }

  if (!price) return null;

  const name = $("h1").first().text().trim().replace(/\s+/g, " ");

  return {
    name,
    brand: attrs["varumärke"] || "",
    type: isWhite ? "white" : "tobacco",
    nicotine_mg_per_portion: nicotinePerPortion,
    nicotine_mg_per_g: nicotineMgG,
    portions,
    price_sek: price,
    weight_g: attrs["vikt (innehåll)"]
      ? parseFloat(attrs["vikt (innehåll)"].replace(",", "."))
      : null,
    weight_per_portion_g: attrs["vikt per prilla"]
      ? parseFloat(attrs["vikt per prilla"].replace(",", "."))
      : null,
    format: attrs["format"] || "",
    flavor: attrs["smak"] || "",
    strength: attrs["snusbolagets styrka"] || "",
    store: "snusbolaget",
    url,
  };
}

async function scrapeSnusbolaget() {
  console.log("=== Scraping Snusbolaget ===");

  const sitemapRes = await fetchWithRetry(
    "https://snusbolaget.se/sitemap/sitemap-products.xml"
  );
  if (!sitemapRes) return [];

  const xml = await sitemapRes.text();
  const urls = (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map((u) =>
    u.replace(/<\/?loc>/g, "")
  );

  // Filter out accessories, DIY, etc.
  const filtered = urls.filter(
    (u) => !/(snusbox|tillbehor|accessoar|diy|gor-eget|prismaster)/i.test(u)
  );
  console.log(`Found ${filtered.length} product URLs`);

  const products = [];
  const BATCH = 5;

  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (url) => {
        const res = await fetchWithRetry(url);
        if (!res) return null;
        const html = await res.text();
        return parseSnusbolagetProduct(html, url);
      })
    );

    for (const p of results) {
      if (p) products.push(p);
    }

    const done = Math.min(i + BATCH, filtered.length);
    process.stdout.write(
      `\r  ${done}/${filtered.length} scraped, ${products.length} snus found`
    );

    if (i + BATCH < filtered.length) await sleep(300);
  }

  console.log();
  return products;
}

// ─── Minprilla ───

function parseMinprillaProduct(html, url) {
  const $ = cheerio.load(html);

  const name = $("h1").first().text().trim();
  const summary = $(".summary").first().text();
  const detail =
    $('[class*="detail"]').first().text() +
    " " +
    $(".woocommerce-product-details__short-description").first().text();
  const additionalInfo =
    $("#tab-additional_information, .woocommerce-product-attributes").text();
  const wooTabs = $(".woocommerce-Tabs-panel").text();
  const allText = (summary + " " + detail + " " + additionalInfo + " " + wooTabs).normalize("NFC");

  // Skip discontinued
  if (/utg.ngen produkt/i.test(summary)) return null;

  // Skip vapes, IQOS, nicotine-free, caffeine-only, accessories, etc.
  if (/vape|e-cigg|iqos|terea|heets|engångsvape|pod|e-juice|liquid|coil|snusbox|tillbehör/i.test(allText))
    return null;
  if (/nikotinfri/i.test(summary)) return null;
  if (/koffein\s*(?:mg|snus|påse|pouch)|caffeine\s*pouch/i.test(allText) && !/nikotin\s*mg/i.test(allText))
    return null;

  // ─ Nicotine: structured field in summary is most reliable
  const structuredNikotin = summary.match(
    /Nikotin\s*mg\/prilla\s*(\d+[\.,]?\d*)/i
  );

  let nicotinePerPortion = null;
  if (structuredNikotin) {
    nicotinePerPortion = parseFloat(structuredNikotin[1].replace(",", "."));
  } else {
    const nikMatch =
      allText.match(/(\d+[\.,]?\d*)\s*mg\s*nikotin/i) ||
      allText.match(/(\d+[\.,]?\d*)\s*mg\s*per\s*(?:prilla|portion)/i) ||
      allText.match(/nikotin[:\s]*(\d+[\.,]?\d*)\s*mg/i) ||
      allText.match(/(\d+[\.,]?\d*)\s*mg\/portion/i) ||
      allText.match(/inneh.ller\s*(\d+[\.,]?\d*)\s*mg/i);
    if (nikMatch) {
      nicotinePerPortion = parseFloat(nikMatch[1].replace(",", "."));
    }
  }

  // No nicotine data → not a snus product we can rank
  if (!nicotinePerPortion) return null;

  // ─ Portions
  const portionMatch =
    allText.match(/(\d+)\s*(?:prillor|portioner)\s*per\s*dosa/i) ||
    allText.match(/dosa\s*(?:med|inneh.ller|rymmer)\s*(\d+)/i) ||
    allText.match(/med\s*(\d+)\s*(?:prillor|portioner)/i) ||
    allText.match(/(\d+)\s*st\s*per/i) ||
    allText.match(/(\d+)\s*(?:prillor|portioner)/i);
  const portions = portionMatch ? parseInt(portionMatch[1]) : null;

  if (!portions || portions < 5 || portions > 50) return null;

  // ─ Price: first reasonable price in kr
  const priceMatch = summary.match(/(\d+[\.,]?\d*)\s*kr/);
  const price = priceMatch
    ? parseFloat(priceMatch[1].replace(",", "."))
    : null;

  if (!price || price < 10 || price > 200) return null;

  // Skip lössnus (no fixed portions)
  if (/l.ssnus|\bl.s$/i.test(name) || /format\s*l.s\b/i.test(allText)) return null;

  // ─ Type detection
  // Ingredients mentioning tobacco is the strongest signal
  const hasTobaccoIngredient = /tobak\s*\(inneh.ller|tobak,\s*vatten|mald\s*tobak|inneh.ller\s*tobak/i.test(allText);
  const hasWhiteSignal =
    /tobaksfri|tobacco.?free|nicotine\s*pouch|nikotinp.se|utan\s*tobak|inneh.ller inte tobak|fri fr.n tobak/i.test(allText);

  // Known tobacco brands (when text detection fails)
  const TOBACCO_BRANDS = /^(General|Kapten|Knox|Catch|Kaliber|Ettan|Grovsnus|Grov|Granit|Kronan|Mustang|R.da Lacket|G.teborgs Rap.|LD |Sm.lands|XR G.teborgs)\b/i;
  const isLundgrensTobacco = /^Lundgrens\b/i.test(name) && !/Aros/i.test(name);
  const isTobaccoBrand = TOBACCO_BRANDS.test(name) || isLundgrensTobacco;

  let type;
  if (hasWhiteSignal && !hasTobaccoIngredient) {
    type = "white";
  } else if (hasTobaccoIngredient || isTobaccoBrand) {
    type = "tobacco";
  } else if (/all\s*white|superwhite|super\s*white/i.test(allText)) {
    type = "white";
  } else {
    type = "white";
  }

  const formatMatch = allText.match(/Format\s*(\w+)/i);
  const flavorMatch = allText.match(/Smak\s*([A-Za-zÅÄÖåäö\s,\/]+)/i);
  const strengthMatch = summary.match(/Styrka\s*([^\n]+)/i);
  const mgGMatch = allText.match(/(\d+[\.,]?\d*)\s*mg\/g/i);

  let brand = "";
  const brandEl = $(".pwb-single-product-brands a").first();
  if (brandEl.length) {
    brand = brandEl.text().trim();
  } else {
    const nameWords = name.split(/\s+/);
    brand = nameWords[0] || "";
  }

  return {
    name,
    brand,
    type,
    nicotine_mg_per_portion: nicotinePerPortion,
    nicotine_mg_per_g: mgGMatch
      ? parseFloat(mgGMatch[1].replace(",", "."))
      : null,
    portions,
    price_sek: price,
    weight_g: null,
    weight_per_portion_g: null,
    format: formatMatch ? formatMatch[1].trim() : "",
    flavor: flavorMatch ? flavorMatch[1].trim().replace(/\s+/g, " ") : "",
    strength: strengthMatch ? strengthMatch[1].trim() : "",
    store: "minprilla",
    url,
  };
}

async function scrapeMinprilla() {
  console.log("=== Scraping Minprilla ===");

  const allUrls = [];
  for (const file of ["product-sitemap.xml", "product-sitemap2.xml"]) {
    const res = await fetchWithRetry(`https://minprilla.se/${file}`);
    if (!res) continue;
    const xml = await res.text();
    const urls = (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
      .map((u) => u.replace(/<\/?loc>/g, ""))
      .filter((u) => u.includes("/produkt/"));
    allUrls.push(...urls);
  }

  // Filter out obvious non-snus by URL
  const filtered = allUrls.filter(
    (u) =>
      !/(vape|e-cigg|iqos|terea|heets|blu-bar|lost-mary|geek-bar|elfbar|pod|engångs|vuse|tank|coil|liquid|e-juice|mix-pack-vape|disposable|puff|bar-|drag-|crystal-|watermelon-vape|strawberry-vape|blueberry-vape|mango-vape)/i.test(u)
  );

  console.log(`Found ${allUrls.length} URLs, ${filtered.length} after filtering`);

  const products = [];
  const BATCH = 5;

  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (url) => {
        const res = await fetchWithRetry(url);
        if (!res) return null;
        const html = await res.text();
        return parseMinprillaProduct(html, url);
      })
    );

    for (const p of results) {
      if (p) products.push(p);
    }

    const done = Math.min(i + BATCH, filtered.length);
    process.stdout.write(
      `\r  ${done}/${filtered.length} scraped, ${products.length} snus found`
    );

    if (i + BATCH < filtered.length) await sleep(300);
  }

  console.log();
  return products;
}

// ─── Main ───

console.log("Starting snus scraper...\n");
const startTime = Date.now();

const [snusbolaget, minprilla] = await Promise.all([
  scrapeSnusbolaget(),
  scrapeMinprilla(),
]);

const allProducts = [...snusbolaget, ...minprilla].map((p) => ({
  ...p,
  npk: (p.nicotine_mg_per_portion * p.portions) / p.price_sek,
  total_nicotine_mg: p.nicotine_mg_per_portion * p.portions,
}));

allProducts.sort((a, b) => b.npk - a.npk);

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s`);
console.log(`Snusbolaget: ${snusbolaget.length} | Minprilla: ${minprilla.length} | Total: ${allProducts.length}`);

const white = allProducts.filter((p) => p.type === "white");
const tobacco = allProducts.filter((p) => p.type === "tobacco");
console.log(`White: ${white.length} | Tobacco: ${tobacco.length}`);

if (allProducts.length > 0) {
  console.log(`\nTop 15 NPK:`);
  allProducts.slice(0, 15).forEach((p, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${p.name.slice(0, 45).padEnd(45)} NPK ${p.npk.toFixed(2).padStart(6)} | ${p.nicotine_mg_per_portion}mg x ${p.portions}st / ${p.price_sek}kr [${p.store}]`
    );
  });
}

const outPath = new URL("../src/data/products.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
writeFileSync(outPath, JSON.stringify(allProducts, null, 2), "utf-8");
console.log(`\nSaved to ${outPath}`);
