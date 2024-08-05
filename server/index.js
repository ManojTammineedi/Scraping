const express = require("express");
let chrome = {};
let puppeteer;

const app = express();

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.json());

if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  chrome = require("chrome-aws-lambda");
  puppeteer = require("puppeteer-core");
} else {
  puppeteer = require("puppeteer");
}

async function login(username) {
  let browser;
  let options = {};

  if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    options = {
      args: [
        ...chrome.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--hide-scrollbars",
        "--disable-web-security",
        "--disable-extensions",
      ],
      defaultViewport: chrome.defaultViewport,
      executablePath: await chrome.executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    };
  } else {
    options = {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ignoreDefaultArgs: ["--disable-extensions"],
    };
  }

  try {
    console.log("Launching browser...");
    browser = await puppeteer.launch(options);
    const page = await browser.newPage();

    console.log("Navigating to login page...");
    await page.goto("http://43.250.40.63/Login.aspx");

    console.log("Filling in username...");
    await page.waitForSelector("#txtUserName");
    await page.type("#txtUserName", username);

    console.log("Clicking next button...");
    await page.click("#btnNext");

    console.log("Filling in password...");
    await page.waitForSelector("#txtPassword");
    await page.type("#txtPassword", username);

    console.log("Submitting form...");
    await page.click("#btnSubmit");

    console.log("Waiting for main student page...");
    await page.waitForSelector("#ctl00_cpStud_lnkStudentMain");

    console.log("Clicking student main link...");
    await page.click("#ctl00_cpStud_lnkStudentMain");

    console.log("Waiting for student name...");
    await page.waitForSelector("#ctl00_cpHeader_ucStud_lblStudentName");
    const name = await page.$eval(
      "#ctl00_cpHeader_ucStud_lblStudentName",
      (el) => el.textContent
    );

    console.log("Waiting for total percentage...");
    await page.waitForSelector("#ctl00_cpStud_lblTotalPercentage");
    const data = await page.$eval(
      "#ctl00_cpStud_lblTotalPercentage",
      (el) => el.textContent
    );
    console.log("Scraping table data...");
    await page.waitForSelector("#ctl00_cpStud_grdSubject");
    const tableData = await page.$$eval(
      "#ctl00_cpStud_grdSubject tr",
      (rows) => {
        return rows.map((row) => {
          const cells = row.querySelectorAll("td");
          return Array.from(cells, (cell) => cell.innerText.trim());
        });
      }
    );
    console.log("Scraping table data...");
    const trackingtableData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#ctl00_cpStud_grdDaywise tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map(cell => cell.innerText.trim());
      });
    });
    console.log("Closing browser...");
    await browser.close();

    console.log("Scraping completed successfully.");
    return { name, data ,tableData,trackingtableData};
  } catch (e) {
    console.error("An error occurred during login:", e.message);
    if (browser) {
      await browser.close();
    }
    throw new Error(
      `Failed to scrape the data for username ${username}. Please check your credentials and try again. Error: ${e.message}`
    );
  }
}

app.get("/scrape", async (req, res) => {
  const { username = "21B91A05U4" } = req.query; // Set default values

  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }

  try {
    const { name, data ,tableData,trackingtableData} = await login(username);
    res.json({ name, total_percentage: data ,tableData,trackingtableData,});
  } catch (e) {
    console.error(
      "An error occurred while handling /scrape route:",
      e.message,
      username
    );
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
