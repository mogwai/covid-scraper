const cheerio = require("cheerio");
const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");

const { SCRAPER_SAVE_LOCATION = "./" } = process.env;

function getText(node) {
  return node.children[0].data;
}

function save(p, file) {
  console.log(path.join(SCRAPER_SAVE_LOCATION, p))
  fs.writeFileSync(path.join(SCRAPER_SAVE_LOCATION, p), file);
}

const URL = "https://coronavirus.1point3acres.com/en/#stat";
async function main() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const userAgent =
    "Mozilla/5.0 (X11; Linux x86_64)" +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36";
  await page.setUserAgent(userAgent);
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.resourceType() === "image") request.abort();
    else request.continue();
  });
  await page.goto(URL);
  await page.waitForSelector(".state-table");
  await page.evaluate(() => {
    for (const node of document
      .querySelector(".state-table")
      .querySelectorAll(".row.stat")) {
      node.click();
    }
  });

  const html = await page.evaluate(el => el.innerHTML, await page.$("body"));
  await browser.close();
  const $ = cheerio.load(html);
  const tablehtml = $(".state-table");
  const rows = tablehtml.children();
  const stateMap = {};

  for (let i = 2; i < rows.length - 1; i++) {
    try {
      const row = rows[i].children[0].children;
      const stateName = getText(row[0]);
      const counties = rows[i].children[1].children;
      const countyCols = [];
      for (let j = 0; j < counties.length; j++) {
        const domCol = counties[j].children;
        const innerCol = [];
        for (let k = 0; k < domCol.length; k++) {
          innerCol.push(domCol[k].children[0].data);
        }
        countyCols.push(innerCol);
      }
      stateMap[stateName] = countyCols;
    } catch (e) {
      console.log("Failed for state", i);
    }
  }
  let csv = "";
  for (const k in stateMap) {
    for (const county of stateMap[k]) {
      const csvCounty = county.slice(0, county.length - 1).join(",");
      csv += `${k},${csvCounty}\n`;
    }
  }
  save("./data.csv", csv);
  for (const k in stateMap) {
    stateMap[k] = stateMap[k].reduce((p, c) => {
      return {
        ...p,
        ...{ [c[0]]: { deaths: c[2], confirmed: c[1] } }
      };
    }, {});
  }

  save("./data.json", JSON.stringify(stateMap));
}

main();
